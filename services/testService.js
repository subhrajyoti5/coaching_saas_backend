const prisma = require('../config/database');
const { ROLES } = require('../config/constants');
const { audit } = require('../utils/auditLogger');

const toNumber = (value, name) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a valid positive number`);
  }
  return parsed;
};

const mapQuestionForClient = (question) => ({
  id: question.id,
  testId: question.test_id,
  questionText: question.question,
  optionA: question.option_a,
  optionB: question.option_b,
  optionC: question.option_c,
  optionD: question.option_d,
  correctAnswer: question.correct_option,
  marks: question.marks,
  durationSeconds: null
});

const mapQuestionForStudent = (question) => ({
  id: question.id,
  testId: question.test_id,
  questionText: question.question,
  optionA: question.option_a,
  optionB: question.option_b,
  optionC: question.option_c,
  optionD: question.option_d,
  marks: question.marks,
  durationSeconds: null
});

const mapTestForClient = (test) => {
  const maxScore = Array.isArray(test.test_questions)
    ? test.test_questions.reduce((sum, row) => sum + Number(row.question?.marks || 0), 0)
    : 0;

  return {
    id: test.id,
    title: test.title,
    coachingId: test.coaching_center_id,
    batchId: test.test_batches?.[0]?.batch_id || null,
    batchIds: (test.test_batches || []).map((tb) => tb.batch_id).filter(Boolean),
    duration: test.duration_minutes,
    startDate: test.start_time,
    endDate: test.end_time,
    maxScore,
    isPublished: Boolean(test.results_published),
    createdAt: test.created_at,
    coaching: test.coaching_center
      ? { id: test.coaching_center.id, name: test.coaching_center.name }
      : null,
    testBatches: (test.test_batches || []).map((tb) => ({
      id: tb.id,
      batchId: tb.batch_id,
      batch: tb.batch ? { id: tb.batch.id, name: tb.batch.name } : null
    }))
  };
};

const resolveStudentBatchIds = async (userId, coachingId) => {
  const memberships = await prisma.batchStudent.findMany({
    where: {
      student_id: Number(userId),
      batch: { coaching_center_id: Number(coachingId) }
    },
    select: { batch_id: true }
  });

  return memberships.map((m) => m.batch_id).filter(Boolean);
};

const resolveTeacherBatchIds = async (userId, coachingId) => {
  const rows = await prisma.batchSubject.findMany({
    where: {
      teacher_id: Number(userId),
      batch: { coaching_center_id: Number(coachingId) }
    },
    select: { batch_id: true },
    distinct: ['batch_id']
  });

  return rows.map((row) => row.batch_id).filter(Boolean);
};

const ensureBatchesBelongToCoaching = async (batchIds, coachingId) => {
  const batches = await prisma.batch.findMany({
    where: {
      id: { in: batchIds },
      coaching_center_id: Number(coachingId)
    },
    select: { id: true }
  });

  if (batches.length !== batchIds.length) {
    throw new Error('One or more selected batches do not belong to this coaching center');
  }
};

const ensureRequesterCanAccessBatchIds = async (batchIds, requester, coachingId) => {
  if (!requester || !requester.userId || !requester.role || !requester.coachingId) {
    throw new Error('Requester context is required');
  }

  if (Number(requester.coachingId) !== Number(coachingId)) {
    throw new Error('Unauthorized coaching access');
  }

  if (requester.role === ROLES.OWNER) {
    return;
  }

  if (requester.role !== ROLES.TEACHER) {
    throw new Error('Only owners and assigned teachers can manage tests');
  }

  const assignedBatchIds = await resolveTeacherBatchIds(requester.userId, coachingId);
  const assignedSet = new Set(assignedBatchIds.map((id) => Number(id)));
  const unauthorizedBatchIds = batchIds.filter((batchId) => !assignedSet.has(Number(batchId)));

  if (unauthorizedBatchIds.length > 0) {
    throw new Error('You can only access tests for batches assigned to you');
  }
};

const getAuthorizedTest = async (testId, requester) => {
  const test = await prisma.test.findUnique({
    where: { id: Number(testId) },
    include: {
      coaching_center: { select: { id: true, name: true } },
      test_batches: { include: { batch: { select: { id: true, name: true } } } },
      test_questions: { include: { question: true } }
    }
  });

  if (!test) {
    throw new Error('Test not found');
  }

  if (requester) {
    const batchIds = (test.test_batches || []).map((row) => row.batch_id).filter(Boolean);
    await ensureRequesterCanAccessBatchIds(batchIds, requester, test.coaching_center_id);
  }

  return test;
};

const createTest = async (testData, requester) => {
  const { title, coachingId, batchIds, duration, startDate, endDate } = testData;

  const numericCoachingId = toNumber(coachingId, 'coachingId');
  const uniqueBatchIds = [...new Set((Array.isArray(batchIds) ? batchIds : []).map((id) => Number(id)).filter(Boolean))];
  if (uniqueBatchIds.length === 0) {
    throw new Error('At least one batch must be selected');
  }

  await ensureBatchesBelongToCoaching(uniqueBatchIds, numericCoachingId);
  await ensureRequesterCanAccessBatchIds(uniqueBatchIds, requester, numericCoachingId);

  const [created] = await prisma.$transaction(async (tx) => {
    const test = await tx.test.create({
      data: {
        title: String(title || '').trim(),
        coaching_center_id: numericCoachingId,
        duration_minutes: Number(duration),
        start_time: new Date(startDate),
        end_time: new Date(endDate),
        created_by: Number(requester.userId),
        results_published: false
      }
    });

    await tx.testBatch.createMany({
      data: uniqueBatchIds.map((batchId) => ({ test_id: test.id, batch_id: batchId }))
    });

    return [test];
  });

  await audit({ userId: Number(requester.userId), action: 'CREATE_TEST', entityType: 'TEST', entityId: created.id });

  return getTestById(created.id, requester);
};

const getTestById = async (testId, requester = null) => {
  const test = await getAuthorizedTest(testId, requester);
  return mapTestForClient(test);
};

const getTestsByCoaching = async (coachingId, requester) => {
  const numericCoachingId = Number(coachingId);
  const where = { coaching_center_id: numericCoachingId };

  if (requester?.role === ROLES.TEACHER) {
    const assignedBatchIds = await resolveTeacherBatchIds(requester.userId, numericCoachingId);
    if (assignedBatchIds.length === 0) {
      return [];
    }

    where.test_batches = {
      some: {
        batch_id: { in: assignedBatchIds }
      }
    };
  }

  const tests = await prisma.test.findMany({
    where,
    include: {
      coaching_center: { select: { id: true, name: true } },
      test_batches: { include: { batch: { select: { id: true, name: true } } } },
      questions: true
    },
    orderBy: { start_time: 'asc' }
  });

  return tests.map(mapTestForClient);
};

const getTestsByBatch = async (batchId) => {
  const rows = await prisma.testBatch.findMany({
    where: { batch_id: Number(batchId) },
    include: {
      test: {
        include: {
          coaching_center: { select: { id: true, name: true } },
          test_batches: true,
          questions: true
        }
      }
    }
  });

  return rows.map((row) => mapTestForClient(row.test));
};

const getMyUpcomingTests = async (userId, coachingId) => {
  const batchIds = await resolveStudentBatchIds(userId, coachingId);
  if (batchIds.length === 0) return [];

  const rows = await prisma.testBatch.findMany({
    where: {
      batch_id: { in: batchIds },
      test: {
        coaching_center_id: Number(coachingId),
        results_published: true,
        end_time: { gte: new Date() }
      }
    },
    include: {
      test: {
        include: {
          coaching_center: { select: { id: true, name: true } },
          test_batches: true,
          questions: true
        }
      }
    }
  });

  const unique = new Map();
  for (const row of rows) {
    if (row.test && !unique.has(row.test.id)) {
      unique.set(row.test.id, mapTestForClient(row.test));
    }
  }
  return [...unique.values()].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
};

const addQuestionToTest = async (questionData, requester) => {
  const { testId, questionText, optionA, optionB, optionC, optionD, correctAnswer, marks } = questionData;

  await getAuthorizedTest(testId, requester);

  const count = await prisma.question.count({ where: { test_id: Number(testId) } });
  if (count >= 30) throw new Error('A test can have a maximum of 30 questions');

  const created = await prisma.question.create({
    data: {
      test_id: Number(testId),
      question: questionText,
      option_a: optionA,
      option_b: optionB,
      option_c: optionC,
      option_d: optionD,
      correct_option: String(correctAnswer || '').toUpperCase(),
      marks: Number(marks || 1)
    }
  });

  return mapQuestionForClient(created);
};

const getQuestionsByTest = async (testId, requester) => {
  await getAuthorizedTest(testId, requester);
  const questions = await prisma.question.findMany({
    where: { test_id: Number(testId) },
    orderBy: { id: 'asc' }
  });
  return questions.map(mapQuestionForClient);
};

const getAttemptQuestions = async (testId, studentId) => {
  await startAttempt(testId, studentId);

  const questions = await prisma.question.findMany({
    where: { test_id: Number(testId) },
    orderBy: { id: 'asc' }
  });

  return questions.map(mapQuestionForStudent);
};

const startAttempt = async (testId, studentId) => {
  const numericTestId = Number(testId);
  const numericStudentId = Number(studentId);

  const test = await prisma.test.findUnique({ where: { id: numericTestId } });
  if (!test) throw new Error('Test not found');

  const now = new Date();
  if (test.start_time && now < test.start_time) throw new Error('Test has not started yet');
  if (test.end_time && now > test.end_time) throw new Error('Test window has closed');
  if (!test.results_published) throw new Error('This test is not published yet');

  const batchIds = await resolveStudentBatchIds(numericStudentId, test.coaching_center_id);
  if (batchIds.length === 0) throw new Error('Student is not enrolled in any batch');

  const eligible = await prisma.testBatch.findFirst({
    where: { test_id: numericTestId, batch_id: { in: batchIds } }
  });
  if (!eligible) {
    throw new Error('You are not authorized to take this test. Your batch is not assigned to this test.');
  }

  const existing = await prisma.testAttempt.findUnique({
    where: { test_id_student_id: { test_id: numericTestId, student_id: numericStudentId } }
  });
  if (existing) return existing;

  return prisma.testAttempt.create({
    data: {
      test_id: numericTestId,
      student_id: numericStudentId,
      batch_id: eligible.batch_id,
      submitted_at: null,
      score: null
    }
  });
};

const submitTest = async ({ testId, answers }, userId) => {
  const numericTestId = Number(testId);
  const numericStudentId = Number(userId);

  const test = await prisma.test.findUnique({
    where: { id: numericTestId },
    include: { test_questions: { include: { question: true } } }
  });
  if (!test) throw new Error('Test not found');

  const now = new Date();
  if (test.start_time && now < test.start_time) throw new Error('Test has not started yet');
  if (test.end_time && now > test.end_time) throw new Error('Test window has closed');

  const attempt = await startAttempt(numericTestId, numericStudentId);
  const answerMap = answers && typeof answers === 'object' ? answers : {};

  let score = 0;
  const answerRows = [];

  for (const testQuestion of test.test_questions) {
    const question = testQuestion.question;
    const raw = answerMap[question.id] ?? answerMap[String(question.id)] ?? null;
    const selected = raw ? String(raw).toUpperCase() : null;
    const isCorrect = Boolean(selected && selected === question.correct_option);
    const awarded = isCorrect ? Number(question.marks || 0) : 0;
    score += awarded;

    answerRows.push({
      attempt_id: attempt.id,
      question_id: question.id,
      selected_option: selected,
      is_correct: isCorrect,
      marks_awarded: awarded
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.testAnswer.deleteMany({ where: { attempt_id: attempt.id } });
    if (answerRows.length > 0) {
      await tx.testAnswer.createMany({ data: answerRows });
    }
    await tx.testAttempt.update({
      where: { id: attempt.id },
      data: { score, submitted_at: new Date() }
    });
  });

  const totalMarks = test.test_questions.reduce((sum, row) => sum + Number(row.question?.marks || 0), 0);
  const percentage = totalMarks > 0 ? (score / totalMarks) * 100 : 0;
  const result = {
    testId: numericTestId,
    studentId: numericStudentId,
    score,
    totalMarks,
    percentage,
    passed: percentage >= 40
  };

  await audit({
    userId: numericStudentId,
    action: 'SUBMIT_TEST',
    entityType: 'TEST',
    entityId: numericTestId,
    metadata: { score }
  });

  return result;
};

const getTeacherLeaderboard = async (testId, coachingId, requester = null) => {
  const test = requester
    ? await getAuthorizedTest(testId, requester)
    : await prisma.test.findFirst({
        where: { id: Number(testId), coaching_center_id: Number(coachingId) },
        include: { test_questions: { include: { question: true } } }
      });
  if (!test) throw new Error('Test not found');

  const attempts = await prisma.testAttempt.findMany({
    where: { test_id: Number(testId), score: { not: null } },
    include: { student: { select: { id: true, name: true } } },
    orderBy: [{ score: 'desc' }, { submitted_at: 'asc' }]
  });

  const totalMarks = test.test_questions.reduce((sum, row) => sum + Number(row.question?.marks || 0), 0);
  const ranking = attempts.map((row, index) => ({
    rank: index + 1,
    studentId: row.student_id,
    studentName: row.student?.name || 'Unknown',
    score: Number(row.score || 0),
    totalMarks,
    percentage: totalMarks > 0 ? (Number(row.score || 0) / totalMarks) * 100 : 0,
    submittedAt: row.submitted_at
  }));

  return {
    test: { id: test.id, title: test.title },
    totalParticipants: ranking.length,
    ranking
  };
};

const getStudentLeaderboard = async (testId, userId, coachingId) => {
  const board = await getTeacherLeaderboard(testId, coachingId);
  const myIndex = board.ranking.findIndex((row) => row.studentId === Number(userId));

  return {
    test: board.test,
    totalParticipants: board.totalParticipants,
    top5: board.ranking.slice(0, 5).map(({ rank, score }) => ({ rank, score })),
    myStanding: myIndex === -1
      ? null
      : {
          rank: board.ranking[myIndex].rank,
          score: board.ranking[myIndex].score,
          submittedAt: board.ranking[myIndex].submittedAt
        }
  };
};

const getMyResults = async (userId, coachingId) => {
  const attempts = await prisma.testAttempt.findMany({
    where: { student_id: Number(userId), test: { coaching_center_id: Number(coachingId) } },
    include: {
      test: { include: { test_questions: { include: { question: true } } } }
    },
    orderBy: { submitted_at: 'desc' }
  });

  return attempts.map((attempt) => {
    const totalMarks = attempt.test.test_questions.reduce((sum, row) => sum + Number(row.question?.marks || 0), 0);
    const score = Number(attempt.score || 0);
    const percentage = totalMarks > 0 ? (score / totalMarks) * 100 : 0;
    return {
      id: attempt.id,
      testId: attempt.test_id,
      studentId: attempt.student_id,
      score,
      totalMarks,
      percentage,
      passed: percentage >= 40,
      submittedAt: attempt.submitted_at,
      test: {
        id: attempt.test.id,
        title: attempt.test.title,
        startDate: attempt.test.start_time
      }
    };
  });
};

const getStudentResults = async (studentId) => {
  const attempts = await prisma.testAttempt.findMany({
    where: { student_id: Number(studentId) },
    include: {
      test: { include: { test_questions: { include: { question: true } } } },
      student: { select: { id: true, name: true } }
    },
    orderBy: { submitted_at: 'desc' }
  });

  return attempts.map((attempt) => {
    const totalMarks = attempt.test.test_questions.reduce((sum, row) => sum + Number(row.question?.marks || 0), 0);
    const score = Number(attempt.score || 0);
    const percentage = totalMarks > 0 ? (score / totalMarks) * 100 : 0;
    return {
      id: attempt.id,
      testId: attempt.test_id,
      studentId: attempt.student_id,
      score,
      totalMarks,
      percentage,
      passed: percentage >= 40,
      submittedAt: attempt.submitted_at,
      student: { id: attempt.student?.id, name: attempt.student?.name || 'Unknown' },
      test: { id: attempt.test.id, title: attempt.test.title, startDate: attempt.test.start_time }
    };
  });
};

const getTestResults = async (testId, requester = null) => {
  await getAuthorizedTest(testId, requester);
  const attempts = await prisma.testAttempt.findMany({
    where: { test_id: Number(testId) },
    include: {
      test: { include: { test_questions: { include: { question: true } } } },
      student: { select: { id: true, name: true } }
    },
    orderBy: [{ score: 'desc' }, { submitted_at: 'asc' }]
  });

  return attempts.map((attempt) => {
    const totalMarks = attempt.test.test_questions.reduce((sum, row) => sum + Number(row.question?.marks || 0), 0);
    const score = Number(attempt.score || 0);
    const percentage = totalMarks > 0 ? (score / totalMarks) * 100 : 0;
    return {
      id: attempt.id,
      testId: attempt.test_id,
      studentId: attempt.student_id,
      score,
      totalMarks,
      percentage,
      passed: percentage >= 40,
      submittedAt: attempt.submitted_at,
      student: { id: attempt.student?.id, name: attempt.student?.name || 'Unknown' },
      test: { id: attempt.test.id, title: attempt.test.title }
    };
  });
};

const deactivateTest = async (testId, requester) => {
  await getAuthorizedTest(testId, requester);
  const test = await prisma.test.delete({ where: { id: Number(testId) } });
  await audit({ userId: Number(requester.userId), action: 'DEACTIVATE_TEST', entityType: 'TEST', entityId: Number(testId) });
  return test;
};

const publishTest = async (testId, requester) => {
  await getAuthorizedTest(testId, requester);
  const test = await prisma.test.update({
    where: { id: Number(testId) },
    data: { results_published: true }
  });
  await audit({ userId: Number(requester.userId), action: 'PUBLISH_TEST', entityType: 'TEST', entityId: Number(testId) });
  return mapTestForClient({ ...test, test_batches: [], test_questions: [], coaching_center: null });
};

// Get all student performance (test attempts) for a coaching center
const getCoachingStudentPerformance = async (coachingId) => {
  const attempts = await prisma.testAttempt.findMany({
    where: {
      test: {
        coaching_center_id: Number(coachingId)
      }
    },
    include: {
      test: { 
        select: { 
          id: true, 
          title: true, 
          start_time: true,
          test_questions: { include: { question: { select: { marks: true } } } }
        }
      },
      student: { select: { id: true, name: true, email: true } },
      batch: { select: { id: true, name: true } }
    },
    orderBy: [{ submitted_at: 'desc' }]
  });

  return attempts.map((attempt) => {
    const totalMarks = attempt.test.test_questions.reduce((sum, row) => sum + Number(row.question?.marks || 0), 0);
    const score = Number(attempt.score || 0);
    const percentage = totalMarks > 0 ? (score / totalMarks) * 100 : 0;
    
    return {
      id: attempt.id,
      testId: attempt.test_id,
      testTitle: attempt.test.title,
      studentId: attempt.student_id,
      studentName: attempt.student?.name || 'Unknown',
      studentEmail: attempt.student?.email,
      batchId: attempt.batch_id,
      batchName: attempt.batch?.name,
      score,
      totalMarks,
      percentage: Math.round(percentage * 10) / 10,
      passed: percentage >= 40,
      submittedAt: attempt.submitted_at
    };
  });
};

// Get all student performance (test attempts) for a coaching center
const getCoachingStudentPerformance = async (coachingId) => {
  const attempts = await prisma.testAttempt.findMany({
    where: {
      test: {
        coaching_center_id: Number(coachingId)
      }
    },
    include: {
      test: { 
        select: { 
          id: true, 
          title: true, 
          start_time: true,
          questions: { select: { marks: true } }
        }
      },
      student: { select: { id: true, name: true, email: true } },
      batch: { select: { id: true, name: true } }
    },
    orderBy: [{ submitted_at: 'desc' }]
  });

  return attempts.map((attempt) => {
    const totalMarks = attempt.test.questions.reduce((sum, q) => sum + Number(q.marks || 0), 0);
    const score = Number(attempt.score || 0);
    const percentage = totalMarks > 0 ? (score / totalMarks) * 100 : 0;
    
    return {
      id: attempt.id,
      testId: attempt.test_id,
      testTitle: attempt.test.title,
      studentId: attempt.student_id,
      studentName: attempt.student?.name || 'Unknown',
      studentEmail: attempt.student?.email,
      batchId: attempt.batch_id,
      batchName: attempt.batch?.name,
      score,
      totalMarks,
      percentage: Math.round(percentage * 10) / 10,
      passed: percentage >= 40,
      submittedAt: attempt.submitted_at
    };
  });
};

module.exports = {
  createTest,
  getTestById,
  getTestsByCoaching,
  getTestsByBatch,
  getMyUpcomingTests,
  addQuestionToTest,
  getQuestionsByTest,
  getAttemptQuestions,
  startAttempt,
  submitTest,
  getMyResults,
  getStudentResults,
  getTestResults,
  getTeacherLeaderboard,
  getStudentLeaderboard,
  deactivateTest,
  publishTest,
  getCoachingStudentPerformance
};
