const prisma = require('../config/database');
const { audit } = require('../utils/auditLogger');

const createTest = async (testData, requesterId) => {
  const { title, coachingId, batchId, duration, startDate, endDate, maxScore } = testData;
  const test = await prisma.test.create({
    data: { title, coachingId, batchId, duration, startDate, endDate, maxScore }
  });
  await audit({ userId: requesterId, action: 'CREATE_TEST', entityType: 'TEST', entityId: test.id });
  return test;
};

const getTestById = async (testId) => {
  const test = await prisma.test.findFirst({
    where: { id: testId, isActive: true },
    include: {
      coaching: { select: { id: true, name: true } },
      batch: { select: { id: true, name: true } }
    }
  });
  if (!test) throw new Error('Test not found');
  return test;
};

const getTestsByCoaching = async (coachingId) => {
  return prisma.test.findMany({
    where: { coachingId, isActive: true },
    include: {
      coaching: { select: { id: true, name: true } },
      batch: { select: { id: true, name: true } }
    }
  });
};

const getTestsByBatch = async (batchId) => {
  return prisma.test.findMany({
    where: { batchId, isActive: true },
    include: {
      coaching: { select: { id: true, name: true } },
      batch: { select: { id: true, name: true } }
    }
  });
};

const getMyUpcomingTests = async (userId, coachingId) => {
  const studentProfile = await prisma.studentProfile.findFirst({
    where: { userId, coachingId, isActive: true }
  });

  if (!studentProfile || !studentProfile.batchId) {
    return [];
  }

  return prisma.test.findMany({
    where: {
      coachingId,
      batchId: studentProfile.batchId,
      isActive: true,
      startDate: { gte: new Date() }
    },
    include: {
      coaching: { select: { id: true, name: true } },
      batch: { select: { id: true, name: true } }
    },
    orderBy: { startDate: 'asc' }
  });
};

const addQuestionToTest = async (questionData) => {
  const { testId, questionText, optionA, optionB, optionC, optionD, correctAnswer, marks } = questionData;

  const test = await prisma.test.findFirst({ where: { id: testId, isActive: true } });
  if (!test) throw new Error('Test not found');

  return prisma.question.create({
    data: { testId, questionText, optionA, optionB, optionC, optionD, correctAnswer, marks: marks || 1 }
  });
};

const getQuestionsByTest = async (testId) => {
  return prisma.question.findMany({ where: { testId } });
};

// Start an attempt — idempotent (returns existing if already started)
const startAttempt = async (testId, studentProfileId) => {
  const existing = await prisma.testAttempt.findUnique({
    where: { testId_studentId: { testId, studentId: studentProfileId } }
  });

  if (existing && existing.status === 'SUBMITTED') {
    throw new Error('Test already submitted. Resubmission is not allowed.');
  }

  if (existing) return existing;

  const test = await prisma.test.findFirst({ where: { id: testId, isActive: true } });
  if (!test) throw new Error('Test not found or inactive');

  const now = new Date();
  if (now < test.startDate) throw new Error('Test has not started yet');
  if (now > test.endDate) throw new Error('Test window has closed');

  return prisma.testAttempt.create({
    data: { testId, studentId: studentProfileId, status: 'STARTED' }
  });
};

// Submit — locked against resubmission; studentId derived from JWT profile
const submitTest = async ({ testId, answers }, userId) => {
  // Resolve the student profile from the JWT userId + coachingId stored on profile
  const test = await prisma.test.findFirst({
    where: { id: testId, isActive: true },
    include: { questions: true }
  });
  if (!test) throw new Error('Test not found');

  const studentProfile = await prisma.studentProfile.findFirst({
    where: { userId, coachingId: test.coachingId }
  });
  if (!studentProfile) throw new Error('Student profile not found for this coaching center');
  if (studentProfile.batchId !== test.batchId) throw new Error('Student is not enrolled in the batch for this test');

  const studentProfileId = studentProfile.id;

  // Check or create the attempt — will throw if already submitted
  const attempt = await startAttempt(testId, studentProfileId);

  // Mark as submitted in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Double-check attempt is still open (race condition guard)
    const freshAttempt = await tx.testAttempt.findUnique({
      where: { testId_studentId: { testId, studentId: studentProfileId } }
    });
    if (freshAttempt.status === 'SUBMITTED') {
      throw new Error('Test already submitted. Resubmission is not allowed.');
    }

    // Score the answers
    let score = 0;
    for (const question of test.questions) {
      const submitted = answers[question.id];
      if (submitted && submitted.toUpperCase() === question.correctAnswer) {
        score += question.marks;
      }
    }

    const percentage = (score / test.maxScore) * 100;
    const passed = percentage >= 40;

    const newResult = await tx.result.create({
      data: { testId, studentId: studentProfileId, score, totalMarks: test.maxScore, percentage, passed }
    });

    await tx.testAttempt.update({
      where: { testId_studentId: { testId, studentId: studentProfileId } },
      data: { status: 'SUBMITTED', submittedAt: new Date() }
    });

    return newResult;
  });

  await audit({ userId, action: 'SUBMIT_TEST', entityType: 'TEST', entityId: testId, metadata: { score: result.score } });
  return result;
};

// Students fetch their own results — userId comes from JWT
const getMyResults = async (userId, coachingId) => {
  const studentProfile = await prisma.studentProfile.findFirst({
    where: { userId, coachingId }
  });
  if (!studentProfile) throw new Error('Student profile not found');

  return prisma.result.findMany({
    where: { studentId: studentProfile.id },
    include: {
      test: { select: { id: true, title: true, startDate: true } }
    },
    orderBy: { submittedAt: 'desc' }
  });
};

// Teachers/Owners can query a student's results by studentProfileId
const getStudentResults = async (studentId) => {
  return prisma.result.findMany({
    where: { studentId },
    include: {
      test: { select: { id: true, title: true, startDate: true } },
      student: { include: { user: { select: { firstName: true, lastName: true } } } }
    }
  });
};

const getTestResults = async (testId) => {
  return prisma.result.findMany({
    where: { testId },
    include: {
      test: { select: { id: true, title: true } },
      student: { include: { user: { select: { firstName: true, lastName: true } } } }
    }
  });
};

// Soft delete a test
const deactivateTest = async (testId, requesterId) => {
  const test = await prisma.test.update({
    where: { id: testId },
    data: { isActive: false, deletedAt: new Date() }
  });
  await audit({ userId: requesterId, action: 'DEACTIVATE_TEST', entityType: 'TEST', entityId: testId });
  return test;
};

module.exports = {
  createTest,
  getTestById,
  getTestsByCoaching,
  getTestsByBatch,
  getMyUpcomingTests,
  addQuestionToTest,
  getQuestionsByTest,
  startAttempt,
  submitTest,
  getMyResults,
  getStudentResults,
  getTestResults,
  deactivateTest
};