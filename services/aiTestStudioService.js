const prisma = require('../config/database');

/**
 * AI Test Studio Service
 * Handles syllabus, AI generation, question bank, and test management for premium feature
 */
class AiTestStudioService {
  // ============ SYLLABUS OPERATIONS ============

  async uploadSyllabus(coachingCenterId, uploadedBy, data) {
    const { name, storageUrls, extractedText, batchId, subjectId } = data;

    if (!storageUrls || storageUrls.length === 0) {
      throw new Error('At least one syllabus file URL is required');
    }

    const syllabus = await prisma.syllabus.create({
      data: {
        coaching_center_id: coachingCenterId,
        uploaded_by: uploadedBy,
        name: name || `Syllabus - ${new Date().toLocaleDateString()}`,
        storage_urls: storageUrls,
        extracted_text: extractedText || null,
        batch_id: batchId || null,
        subject_id: subjectId || null,
      },
      include: {
        uploader: { select: { id: true, name: true, email: true } },
      },
    });

    return syllabus;
  }

  async getSyllabus(syllabusId, coachingCenterId) {
    const syllabus = await prisma.syllabus.findUnique({
      where: { id: syllabusId },
      include: {
        uploader: { select: { id: true, name: true } },
        batch: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
        questions: { 
          select: { 
            id: true, 
            question_text: true, 
            difficulty_level: true,
            marks: true,
          },
          orderBy: { created_at: 'desc' },
        },
        ai_generations: {
          select: {
            id: true,
            status: true,
            attempt_count: true,
            error_message: true,
            created_at: true,
          },
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!syllabus || syllabus.coaching_center_id !== coachingCenterId) {
      return null;
    }

    return syllabus;
  }

  // ============ AI GENERATION OPERATIONS ============

  async createAiGeneration(coachingCenterId, teacherId, syllabusId, generationParams) {
    const {
      numQuestions,
      difficultyDist,
      marksPerQ,
      negativeMarking,
    } = generationParams;

    if (!numQuestions || numQuestions < 1 || numQuestions > 100) {
      throw new Error('Number of questions must be between 1 and 100');
    }

    // Verify syllabus exists and belongs to coaching center
    const syllabus = await prisma.syllabus.findUnique({
      where: { id: syllabusId },
    });

    if (!syllabus || syllabus.coaching_center_id !== coachingCenterId) {
      throw new Error('Syllabus not found');
    }

    const generation = await prisma.aiGeneration.create({
      data: {
        coaching_center_id: coachingCenterId,
        teacher_id: teacherId,
        syllabus_id: syllabusId,
        num_questions: numQuestions,
        difficulty_dist: difficultyDist || { EASY: 0.2, MEDIUM: 0.6, HARD: 0.2 },
        marks_per_q: marksPerQ || 1,
        negative_marking: negativeMarking || 0,
        status: 'PENDING',
      },
    });

    return generation;
  }

  async getAiGenerationStatus(generationId, coachingCenterId) {
    const generation = await prisma.aiGeneration.findUnique({
      where: { id: generationId },
      include: {
        questions: {
          include: {
            options: { orderBy: { order_index: 'asc' } },
          },
        },
        teacher: { select: { id: true, name: true } },
        syllabus: { select: { id: true, name: true } },
      },
    });

    if (!generation || generation.coaching_center_id !== coachingCenterId) {
      return null;
    }

    return generation;
  }

  async updateAiGenerationStatus(generationId, status, questions = null, errorMessage = null) {
    const data = {
      status,
      last_attempt_at: new Date(),
    };

    if (status === 'SUCCESS' && questions) {
      data.completed_at = new Date();
    }

    if (status === 'FAILED') {
      data.error_message = errorMessage;
    }

    const generation = await prisma.aiGeneration.update({
      where: { id: generationId },
      data,
      include: {
        questions: { include: { options: { orderBy: { order_index: 'asc' } } } },
      },
    });

    return generation;
  }

  // ============ QUESTION OPERATIONS ============

  async createQuestion(coachingCenterId, createdBy, questionData) {
    const {
      questionText,
      options,
      correctOptionIds,
      difficultyLevel = 'MEDIUM',
      marks = 1,
      negativeMarks = 0,
      explanation,
      source = 'MANUAL',
      subjectId,
      syllabusId,
      aiGenerationId,
    } = questionData;

    if (!questionText || !options || options.length < 2) {
      throw new Error('Question must have text and at least 2 options');
    }

    const question = await prisma.question.create({
      data: {
        coaching_center_id: coachingCenterId,
        created_by: createdBy,
        question_text: questionText,
        difficulty_level: difficultyLevel,
        marks,
        negative_marks: negativeMarks,
        explanation: explanation || null,
        source,
        subject_id: subjectId || null,
        syllabus_id: syllabusId || null,
        ai_generation_id: aiGenerationId || null,
        is_from_bank: true,
        options: {
          createMany: {
            data: options.map((optionText, idx) => ({
              option_text: optionText,
              order_index: idx,
            })),
          },
        },
      },
      include: {
        options: { orderBy: { order_index: 'asc' } },
        creator: { select: { id: true, name: true } },
      },
    });

    return {
      ...question,
      correctOptionIds,
    };
  }

  async updateQuestion(questionId, coachingCenterId, updateData) {
    const question = await prisma.question.findUnique({
      where: { id: questionId },
    });

    if (!question || question.coaching_center_id !== coachingCenterId) {
      throw new Error('Question not found');
    }

    const { questionText, options, difficultyLevel, marks, explanation } = updateData;

    // Check if question is used in submitted attempts
    const attempts = await prisma.testAttempt.findFirst({
      where: {
        answers: {
          some: { question_id: questionId },
        },
        submitted_at: { not: null },
      },
    });

    if (attempts) {
      throw new Error('Cannot edit question that has submitted attempts');
    }

    // Delete old options if new ones provided
    if (options) {
      await prisma.questionOption.deleteMany({
        where: { question_id: questionId },
      });
    }

    const updated = await prisma.question.update({
      where: { id: questionId },
      data: {
        question_text: questionText || undefined,
        difficulty_level: difficultyLevel || undefined,
        marks: marks || undefined,
        explanation: explanation || undefined,
        ...(options && {
          options: {
            createMany: {
              data: options.map((optText, idx) => ({
                option_text: optText,
                order_index: idx,
              })),
            },
          },
        }),
      },
      include: {
        options: { orderBy: { order_index: 'asc' } },
      },
    });

    return updated;
  }

  async getQuestionBank(coachingCenterId, createdBy, filters = {}) {
    const { subjectId, difficultyLevel, skip = 0, limit = 20 } = filters;

    const where = {
      coaching_center_id: coachingCenterId,
      created_by: createdBy,
      is_from_bank: true,
      ...(subjectId && { subject_id: subjectId }),
      ...(difficultyLevel && { difficulty_level: difficultyLevel }),
    };

    const [questions, total] = await Promise.all([
      prisma.question.findMany({
        where,
        include: {
          options: { orderBy: { order_index: 'asc' } },
          analytics: true,
        },
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      prisma.question.count({ where }),
    ]);

    return { questions, total };
  }

  async deleteQuestion(questionId, coachingCenterId) {
    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: { test_questions: true },
    });

    if (!question || question.coaching_center_id !== coachingCenterId) {
      throw new Error('Question not found');
    }

    if (question.test_questions.length > 0) {
      throw new Error('Cannot delete question that is used in tests');
    }

    await prisma.question.delete({
      where: { id: questionId },
    });

    return true;
  }

  // ============ TEST OPERATIONS ============

  async createTest(coachingCenterId, createdBy, testData) {
    const {
      title,
      description,
      batchId,
      subjectId,
      mode = 'PRACTICE',
      durationMinutes,
      shuffleQuestions = false,
      shuffleOptions = false,
      showAnswersAfter = true,
      questionIds = [],
    } = testData;

    if (!title || !batchId) {
      throw new Error('Test title and batch are required');
    }

    const test = await prisma.test.create({
      data: {
        coaching_center_id: coachingCenterId,
        created_by: createdBy,
        batch_id: batchId,
        subject_id: subjectId || null,
        title,
        description: description || null,
        mode,
        duration_minutes: durationMinutes || null,
        shuffle_questions: shuffleQuestions,
        shuffle_options: shuffleOptions,
        show_answers_after: showAnswersAfter,
        test_batches: {
          create: { batch_id: batchId },
        },
      },
      include: {
        creator: { select: { id: true, name: true } },
        batch: { select: { id: true, name: true } },
      },
    });

    // Add questions if provided
    if (questionIds.length > 0) {
      await Promise.all(
        questionIds.map((qId, idx) =>
          prisma.testQuestion.create({
            data: {
              test_id: test.id,
              question_id: qId,
              order_index: idx,
            },
          })
        )
      );
    }

    return test;
  }

  async publishTest(testId, coachingCenterId, createdBy, publishData = {}) {
    const test = await prisma.test.findUnique({
      where: { id: testId },
    });

    if (!test || test.coaching_center_id !== coachingCenterId || test.created_by !== createdBy) {
      throw new Error('Test not found or unauthorized');
    }

    const { startTime, endTime } = publishData;

    const updated = await prisma.test.update({
      where: { id: testId },
      data: {
        published_at: new Date(),
        start_time: startTime ? new Date(startTime) : null,
        end_time: endTime ? new Date(endTime) : null,
      },
      include: {
        test_questions: {
          include: { question: { include: { options: { orderBy: { order_index: 'asc' } } } } },
          orderBy: { order_index: 'asc' },
        },
        batch: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
      },
    });

    return updated;
  }

  async getTestForStudent(testId, studentId, coachingCenterId) {
    const test = await prisma.test.findUnique({
      where: { id: testId },
      include: {
        test_questions: {
          include: {
            question: {
              include: { options: { orderBy: { order_index: 'asc' } } },
            },
          },
          orderBy: { order_index: 'asc' },
        },
        batch: { select: { id: true, name: true } },
      },
    });

    if (!test || test.coaching_center_id !== coachingCenterId) {
      throw new Error('Test not found');
    }

    // Check if test is published and within time window
    if (!test.published_at) {
      throw new Error('Test not published yet');
    }

    const now = new Date();
    if (test.start_time && now < test.start_time) {
      throw new Error('Test not yet available');
    }

    if (test.end_time && now > test.end_time) {
      throw new Error('Test deadline has passed');
    }

    // Check if student is in batch
    const batchStudent = await prisma.batchStudent.findFirst({
      where: {
        batch_id: test.batch_id,
        student_id: studentId,
      },
    });

    if (!batchStudent) {
      throw new Error('You are not enrolled in this batch');
    }

    return test;
  }

  async listTests(coachingCenterId, filters = {}) {
    const { batchId, createdBy, skip = 0, limit = 20 } = filters;

    const where = {
      coaching_center_id: coachingCenterId,
      ...(batchId && { batch_id: batchId }),
      ...(createdBy && { created_by: createdBy }),
      is_archived: false,
    };

    const [tests, total] = await Promise.all([
      prisma.test.findMany({
        where,
        include: {
          creator: { select: { id: true, name: true } },
          batch: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true } },
          test_questions: { select: { id: true } },
          attempts: { select: { id: true } },
          analytics: true,
        },
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      prisma.test.count({ where }),
    ]);

    return { tests, total };
  }

  // ============ TEST ATTEMPT OPERATIONS ============

  async startTestAttempt(testId, studentId, batchId, coachingCenterId) {
    // Check for existing attempt
    const existingAttempt = await prisma.testAttempt.findUnique({
      where: {
        test_id_student_id: {
          test_id: testId,
          student_id: studentId,
        },
      },
    });

    if (existingAttempt) {
      if (existingAttempt.submitted_at) {
        const test = await prisma.test.findUnique({ where: { id: testId } });
        if (test.mode === 'TEST') {
          throw new Error('You have already submitted this test');
        }
      }
      return existingAttempt;
    }

    // Get test
    const test = await prisma.test.findUnique({
      where: { id: testId },
    });

    if (!test || test.coaching_center_id !== coachingCenterId) {
      throw new Error('Test not found');
    }

    const maxSubmissions = test.mode === 'TEST' ? 1 : Number.MAX_SAFE_INTEGER;

    const attempt = await prisma.testAttempt.create({
      data: {
        test_id: testId,
        student_id: studentId,
        batch_id: batchId,
        coaching_center_id: coachingCenterId,
        max_submissions: maxSubmissions,
      },
    });

    return attempt;
  }

  async submitTestAttempt(attemptId, studentId, answers) {
    const attempt = await prisma.testAttempt.findUnique({
      where: { id: attemptId },
      include: { test: true },
    });

    if (!attempt || attempt.student_id !== studentId) {
      throw new Error('Attempt not found or unauthorized');
    }

    if (attempt.submitted_at && attempt.submission_count >= attempt.max_submissions) {
      throw new Error('Maximum submissions reached for this test');
    }

    // Get full test with questions
    const test = await prisma.test.findUnique({
      where: { id: attempt.test_id },
      include: {
        test_questions: {
          include: {
            question: {
              include: { options: { orderBy: { order_index: 'asc' } } },
            },
          },
          orderBy: { order_index: 'asc' },
        },
      },
    });

    // Grade answers
    let totalMarks = 0;
    let obtainedMarks = 0;
    const answerValidations = [];

    for (const answer of answers) {
      const testQuestion = test.test_questions.find((tq) => tq.question_id === answer.questionId);
      if (!testQuestion) continue;

      const question = testQuestion.question;
      totalMarks += question.marks;

      // Check correctness
      const isCorrect = JSON.stringify(answer.selectedOptionIds.sort()) === 
                       JSON.stringify(answer.correctOptionIds.sort());

      if (isCorrect) {
        obtainedMarks += question.marks;
      }

      answerValidations.push({
        question_id: answer.questionId,
        selected_option_ids: answer.selectedOptionIds,
        is_correct: isCorrect,
        marks_awarded: isCorrect ? question.marks : 0,
      });
    }

    const now = new Date();
    const timeTakenSecs = Math.floor((now - attempt.started_at) / 1000);

    const updated = await prisma.testAttempt.update({
      where: { id: attemptId },
      data: {
        submitted_at: now,
        time_taken_secs: timeTakenSecs,
        total_marks: totalMarks,
        obtained_marks: obtainedMarks,
        percentage: totalMarks > 0 ? (obtainedMarks / totalMarks) * 100 : 0,
        status: 'SUBMITTED',
        submission_count: attempt.submission_count + 1,
        answers: {
          createMany: { data: answerValidations },
        },
      },
      include: { answers: { include: { question: true } } },
    });

    // Update test and question analytics
    await this.updateTestAnalytics(attempt.test_id);
    await this.updateQuestionAnalytics(test.test_questions.map((tq) => tq.question_id));

    return updated;
  }

  async getAttemptResult(attemptId, userId, role, coachingCenterId) {
    const attempt = await prisma.testAttempt.findUnique({
      where: { id: attemptId },
      include: {
        test: {
          include: {
            test_questions: {
              include: {
                question: {
                  include: { options: { orderBy: { order_index: 'asc' } } },
                },
              },
              orderBy: { order_index: 'asc' },
            },
          },
        },
        student: { select: { id: true, name: true, email: true } },
        answers: { include: { question: true } },
      },
    });

    if (!attempt || attempt.coaching_center_id !== coachingCenterId) {
      throw new Error('Attempt not found');
    }

    // Permission check
    if (role === 'STUDENT' && attempt.student_id !== userId) {
      throw new Error('Unauthorized');
    }

    // Determine if answers should be shown
    const showAnswers =
      attempt.test.mode === 'PRACTICE' ||
      (attempt.test.mode === 'TEST' && attempt.test.results_published);

    const answerDetails = attempt.test.test_questions.map((tq) => {
      const answer = attempt.answers.find((a) => a.question_id === tq.question_id);
      const question = tq.question;

      return {
        question_id: question.id,
        question_text: question.question_text,
        options: question.options.map((o) => ({ id: o.id, text: o.option_text })),
        student_answer: answer ? answer.selected_option_ids : [],
        is_correct: answer?.is_correct || false,
        marks_awarded: answer?.marks_awarded || 0,
        explanation: showAnswers ? question.explanation : null,
      };
    });

    return {
      obtained_marks: attempt.obtained_marks,
      total_marks: attempt.total_marks,
      percentage: attempt.percentage,
      time_taken_seconds: attempt.time_taken_secs,
      answers: showAnswers ? answerDetails : [],
      show_answers: showAnswers,
    };
  }

  // ============ ANALYTICS OPERATIONS ============

  async updateTestAnalytics(testId) {
    const attempts = await prisma.testAttempt.findMany({
      where: { test_id: testId, submitted_at: { not: null } },
      select: { percentage: true },
    });

    if (attempts.length === 0) return;

    const avgScore = attempts.reduce((sum, a) => sum + (a.percentage || 0), 0) / attempts.length;
    const passCount = attempts.filter((a) => (a.percentage || 0) >= 50).length;

    await prisma.testAnalytic.upsert({
      where: { test_id: testId },
      update: {
        total_attempts: attempts.length,
        avg_score: avgScore,
        pass_count: passCount,
        last_updated_at: new Date(),
      },
      create: {
        test_id: testId,
        total_attempts: attempts.length,
        avg_score: avgScore,
        pass_count: passCount,
      },
    });
  }

  async updateQuestionAnalytics(questionIds) {
    for (const questionId of questionIds) {
      const answers = await prisma.testAttemptAnswer.findMany({
        where: { question_id: questionId },
        select: { is_correct: true, answered_at: true },
      });

      if (answers.length === 0) continue;

      const correctCount = answers.filter((a) => a.is_correct).length;
      const accuracyRate = correctCount / answers.length;

      await prisma.questionAnalytic.upsert({
        where: { question_id: questionId },
        update: {
          total_attempts: answers.length,
          correct_count: correctCount,
          incorrect_count: answers.length - correctCount,
          accuracy_rate: accuracyRate,
          last_updated_at: new Date(),
        },
        create: {
          question_id: questionId,
          total_attempts: answers.length,
          correct_count: correctCount,
          incorrect_count: answers.length - correctCount,
          accuracy_rate: accuracyRate,
        },
      });
    }
  }

  async getDashboardAnalytics(coachingCenterId, teacherId) {
    const [tests, questions, attempts] = await Promise.all([
      prisma.test.count({
        where: { coaching_center_id: coachingCenterId, created_by: teacherId },
      }),
      prisma.question.count({
        where: { coaching_center_id: coachingCenterId, created_by: teacherId, is_from_bank: true },
      }),
      prisma.testAttempt.findMany({
        where: {
          coaching_center_id: coachingCenterId,
          test: { created_by: teacherId },
        },
        select: { percentage: true },
      }),
    ]);

    const avgScore = attempts.length > 0 
      ? attempts.reduce((sum, a) => sum + (a.percentage || 0), 0) / attempts.length 
      : 0;

    return {
      total_tests_created: tests,
      total_questions_in_bank: questions,
      total_student_attempts: attempts.length,
      avg_student_score: Math.round(avgScore * 10) / 10,
    };
  }

  // ============ EXTENDED TEST MANAGEMENT (PHASE 2) ============

  async editTest(testId, coachingCenterId, teacherId, updateData) {
    const test = await prisma.test.findUnique({
      where: { id: testId },
      include: { test_attempts: true },
    });

    if (!test || test.coaching_center_id !== coachingCenterId) {
      throw new Error('Test not found or unauthorized');
    }

    if (test.created_by !== teacherId) {
      throw new Error('Only test creator can edit');
    }

    // Prevent editing if students have already attempted
    if (test.test_attempts.length > 0) {
      throw new Error('Cannot edit test after students have attempted it');
    }

    // Extract question IDs if provided
    let questionConnect = undefined;
    if (updateData.questionIds) {
      // Remove existing questions first
      await prisma.testQuestion.deleteMany({
        where: { test_id: testId },
      });

      // Add new questions
      questionConnect = {
        create: updateData.questionIds.map((qId, index) => ({
          question_id: qId,
          order_index: index,
        })),
      };
    }

    const updated = await prisma.test.update({
      where: { id: testId },
      data: {
        title: updateData.title || test.title,
        description: updateData.description || test.description,
        total_marks: updateData.totalMarks || test.total_marks,
        pass_marks: updateData.passMarks !== undefined ? updateData.passMarks : test.pass_marks,
        duration_minutes: updateData.durationMinutes || test.duration_minutes,
        mode: updateData.mode || test.mode,
        show_answers_after: updateData.showAnswersAfter || test.show_answers_after,
        updated_at: new Date(),
        ...(questionConnect && { test_questions: questionConnect }),
      },
      include: {
        test_questions: {
          include: { question: { include: { options: { orderBy: { order_index: 'asc' } } } } },
        },
      },
    });

    return updated;
  }

  async duplicateTest(testId, coachingCenterId, teacherId) {
    const test = await prisma.test.findUnique({
      where: { id: testId },
      include: {
        test_questions: true,
        batches: true,
      },
    });

    if (!test || test.coaching_center_id !== coachingCenterId) {
      throw new Error('Test not found or unauthorized');
    }

    if (test.created_by !== teacherId) {
      throw new Error('Only test creator can duplicate');
    }

    // Create duplicate test
    const duplicated = await prisma.test.create({
      data: {
        coaching_center_id: coachingCenterId,
        created_by: teacherId,
        title: `${test.title} (Copy)`,
        description: test.description,
        total_marks: test.total_marks,
        pass_marks: test.pass_marks,
        duration_minutes: test.duration_minutes,
        mode: test.mode,
        show_answers_after: test.show_answers_after,
        is_published: false,
        results_published: false,
        test_questions: {
          create: test.test_questions.map((tq) => ({
            question_id: tq.question_id,
            order_index: tq.order_index,
          })),
        },
        batches: {
          connect: test.batches.map((b) => ({ id: b.id })),
        },
      },
      include: {
        test_questions: {
          include: { question: { include: { options: { orderBy: { order_index: 'asc' } } } } },
        },
      },
    });

    return duplicated;
  }

  async deleteTest(testId, coachingCenterId, teacherId) {
    const test = await prisma.test.findUnique({
      where: { id: testId },
      include: { test_attempts: true },
    });

    if (!test || test.coaching_center_id !== coachingCenterId) {
      throw new Error('Test not found or unauthorized');
    }

    if (test.created_by !== teacherId) {
      throw new Error('Only test creator can delete');
    }

    // Prevent deletion if students have already attempted
    if (test.test_attempts.length > 0) {
      throw new Error('Cannot delete test after students have attempted it');
    }

    // Delete related records
    await prisma.testQuestion.deleteMany({
      where: { test_id: testId },
    });

    await prisma.testBatch.deleteMany({
      where: { test_id: testId },
    });

    await prisma.test.delete({
      where: { id: testId },
    });

    return { message: 'Test deleted successfully' };
  }

  // ============ PHASE 3: STUDENT TEST-TAKING FLOW ============

  async getTestForAttempt(testId, studentId, batchId, coachingCenterId) {
    // Validate test exists and is published
    const test = await prisma.test.findUnique({
      where: { id: testId },
      include: {
        batches: true,
        test_questions: {
          include: { question: { include: { options: { orderBy: { order_index: 'asc' } } } } },
          orderBy: { order_index: 'asc' },
        },
      },
    });

    if (!test || test.coaching_center_id !== coachingCenterId) {
      throw new Error('Test not found or unauthorized');
    }

    if (!test.is_published) {
      throw new Error('Test is not yet published');
    }

    // Validate batch enrollment
    const batchTest = test.batches.find((b) => b.id === batchId);
    if (!batchTest) {
      throw new Error('This test is not assigned to your batch');
    }

    // Check time window
    const now = new Date();
    if (test.start_time && now < new Date(test.start_time)) {
      throw new Error('Test has not started yet');
    }
    if (test.end_time && now > new Date(test.end_time)) {
      throw new Error('Test has ended');
    }

    // Format for student view (hide correct answers)
    return {
      id: test.id,
      title: test.title,
      description: test.description,
      duration_minutes: test.duration_minutes,
      total_marks: test.total_marks,
      mode: test.mode,
      questions: test.test_questions.map((tq) => ({
        id: tq.question_id,
        text: tq.question.question_text,
        marks: tq.question.marks,
        options: tq.question.options.map((opt) => ({
          id: opt.id,
          text: opt.option_text,
        })),
        order: tq.order_index,
      })),
    };
  }

  async validateSubmissionConstraints(testId, studentId, coachingCenterId) {
    const test = await prisma.test.findUnique({
      where: { id: testId },
    });

    if (!test || test.coaching_center_id !== coachingCenterId) {
      throw new Error('Test not found or unauthorized');
    }

    // Get existing attempts
    const attempts = await prisma.testAttempt.findMany({
      where: { test_id: testId, student_id: studentId },
    });

    // For TEST mode: max 1 submission
    if (test.mode === 'TEST' && attempts.length > 0) {
      const lastAttempt = attempts[attempts.length - 1];
      if (lastAttempt.submitted_at) {
        throw new Error('You have already submitted this test (TEST mode allows only 1 submission)');
      }
    }

    return test;
  }

  async gradeAnswers(testId, answers) {
    // answers: [{ questionId, selectedOptionIds }, ...]
    const test = await prisma.test.findUnique({
      where: { id: testId },
      include: { test_questions: { include: { question: { include: { options: true } } } } },
    });

    if (!test) {
      throw new Error('Test not found');
    }

    let totalMarks = 0;
    let obtainedMarks = 0;
    const gradedAnswers = [];

    for (const answer of answers) {
      const testQuestion = test.test_questions.find((tq) => tq.question_id === answer.questionId);
      if (!testQuestion) continue;

      const question = testQuestion.question;
      totalMarks += question.marks;

      const correctOptionIds = question.correct_option_ids || [];
      const selectedIds = answer.selectedOptionIds || [];

      // Check if answer is correct
      const isCorrect =
        selectedIds.length === correctOptionIds.length &&
        selectedIds.every((id) => correctOptionIds.includes(id));

      let marksAwarded = 0;
      if (isCorrect) {
        marksAwarded = question.marks;
      } else if (question.negative_marks && selectedIds.length > 0) {
        marksAwarded = -question.negative_marks;
      }

      obtainedMarks += marksAwarded;

      gradedAnswers.push({
        question_id: answer.questionId,
        selected_option_ids: selectedIds,
        is_correct: isCorrect,
        marks_awarded: marksAwarded,
      });
    }

    return {
      totalMarks,
      obtainedMarks: Math.max(0, obtainedMarks), // No negative total
      percentage: Math.round((obtainedMarks / totalMarks) * 100),
      gradedAnswers,
    };
  }

  async submitTestAttemptEnhanced(attemptId, studentId, answers, timeTakenSeconds, coachingCenterId) {
    const attempt = await prisma.testAttempt.findUnique({
      where: { id: attemptId },
    });

    if (!attempt || attempt.student_id !== studentId) {
      throw new Error('Attempt not found or unauthorized');
    }

    // Grade answers
    const grading = await this.gradeAnswers(attempt.test_id, answers);

    // Check submission count for TEST mode
    if (attempt.submission_count >= attempt.max_submissions) {
      throw new Error('Maximum submissions exceeded for this test');
    }

    // Update attempt with results
    const updated = await prisma.testAttempt.update({
      where: { id: attemptId },
      data: {
        obtained_marks: grading.obtainedMarks,
        percentage: grading.percentage,
        time_taken_secs: timeTakenSeconds,
        submission_count: attempt.submission_count + 1,
        submitted_at: new Date(),
        answers: {
          createMany: {
            data: grading.gradedAnswers,
          },
        },
      },
      include: {
        test: { select: { mode: true, results_published: true } },
      },
    });

    // Trigger analytics update
    await this.updateTestAnalytics(attempt.test_id);
    const questionIds = answers.map((a) => a.questionId);
    await this.updateQuestionAnalytics(questionIds);

    return updated;
  }

  async getStudentAttempts(testId, studentId, coachingCenterId) {
    const attempts = await prisma.testAttempt.findMany({
      where: { test_id: testId, student_id: studentId },
      select: {
        id: true,
        obtained_marks: true,
        percentage: true,
        submitted_at: true,
        created_at: true,
        submission_count: true,
        max_submissions: true,
      },
      orderBy: { created_at: 'desc' },
    });

    return attempts;
  }

  // ============ PHASE 4: ANALYTICS AGGREGATION ============

  async updateDifficultyRating(questionId) {
    const attempts = await prisma.testAttemptAnswer.findMany({
      where: { question_id: questionId },
      select: { is_correct: true },
    });

    if (attempts.length === 0) return;

    const correctCount = attempts.filter((a) => a.is_correct).length;
    const accuracyRate = correctCount / attempts.length;

    // Calculate difficulty rating based on accuracy
    // Higher accuracy = easier question
    let difficultyRating = 'MEDIUM';
    if (accuracyRate >= 0.75) {
      difficultyRating = 'EASY';
    } else if (accuracyRate <= 0.4) {
      difficultyRating = 'HARD';
    }

    await prisma.questionAnalytic.upsert({
      where: { question_id: questionId },
      update: {
        difficulty_rating: difficultyRating,
        last_updated_at: new Date(),
      },
      create: {
        question_id: questionId,
        difficulty_rating: difficultyRating,
      },
    });
  }

  async getTestAnalyticsSummary(testId, coachingCenterId) {
    const test = await prisma.test.findUnique({
      where: { id: testId },
    });

    if (!test || test.coaching_center_id !== coachingCenterId) {
      throw new Error('Test not found or unauthorized');
    }

    const analytic = await prisma.testAnalytic.findUnique({
      where: { test_id: testId },
    });

    if (!analytic) {
      return {
        test_id: testId,
        total_attempts: 0,
        avg_score: 0,
        pass_count: 0,
        pass_percentage: 0,
      };
    }

    const passPercentage = analytic.total_attempts > 0 
      ? Math.round((analytic.pass_count / analytic.total_attempts) * 100)
      : 0;

    return {
      test_id: testId,
      total_attempts: analytic.total_attempts,
      avg_score: Math.round(analytic.avg_score * 100) / 100,
      pass_count: analytic.pass_count,
      pass_percentage: passPercentage,
      last_updated: analytic.last_updated_at,
    };
  }

  async getQuestionAnalyticsSummary(questionId, coachingCenterId) {
    const question = await prisma.question.findUnique({
      where: { id: questionId },
    });

    if (!question || question.coaching_center_id !== coachingCenterId) {
      throw new Error('Question not found or unauthorized');
    }

    const analytic = await prisma.questionAnalytic.findUnique({
      where: { question_id: questionId },
    });

    if (!analytic) {
      return {
        question_id: questionId,
        total_attempts: 0,
        accuracy_rate: 0,
        difficulty_rating: question.difficulty_level,
      };
    }

    return {
      question_id: questionId,
      total_attempts: analytic.total_attempts,
      correct_count: analytic.correct_count,
      incorrect_count: analytic.incorrect_count,
      accuracy_rate: Math.round(analytic.accuracy_rate * 100) / 100,
      difficulty_rating: analytic.difficulty_rating,
      last_updated: analytic.last_updated_at,
    };
  }

  async getTeacherDashboard(coachingCenterId, teacherId) {
    const [tests, questions, attempts] = await Promise.all([
      prisma.test.findMany({
        where: { coaching_center_id: coachingCenterId, created_by: teacherId },
        include: { test_analytics: true },
      }),
      prisma.question.findMany({
        where: { coaching_center_id: coachingCenterId, created_by: teacherId, is_from_bank: true },
        include: { question_analytics: true },
      }),
      prisma.testAttempt.findMany({
        where: { test: { coaching_center_id: coachingCenterId, created_by: teacherId } },
      }),
    ]);

    const testStats = tests.map((t) => ({
      id: t.id,
      title: t.title,
      total_attempts: t.test_analytics?.[0]?.total_attempts || 0,
      avg_score: Math.round((t.test_analytics?.[0]?.avg_score || 0) * 100) / 100,
      pass_percentage: t.test_analytics?.[0]?.total_attempts 
        ? Math.round((t.test_analytics[0].pass_count / t.test_analytics[0].total_attempts) * 100)
        : 0,
    }));

    const totalTests = tests.length;
    const totalQuestions = questions.length;
    const totalStudentAttempts = attempts.length;
    const avgStudentScore = attempts.length > 0
      ? Math.round((attempts.reduce((sum, a) => sum + (a.percentage || 0), 0) / attempts.length) * 100) / 100
      : 0;

    return {
      total_tests_created: totalTests,
      total_questions_in_bank: totalQuestions,
      total_student_attempts: totalStudentAttempts,
      avg_student_score: avgStudentScore,
      test_statistics: testStats,
      question_difficulty_breakdown: {
        easy: questions.filter((q) => q.difficulty_level === 'EASY').length,
        medium: questions.filter((q) => q.difficulty_level === 'MEDIUM').length,
        hard: questions.filter((q) => q.difficulty_level === 'HARD').length,
      },
    };
  }

  async getStudentDashboard(coachingCenterId, studentId, batchId) {
    const attempts = await prisma.testAttempt.findMany({
      where: {
        student_id: studentId,
        test: {
          coaching_center_id: coachingCenterId,
          batches: { some: { id: batchId } },
        },
      },
      include: {
        test: { select: { id: true, title: true, mode: true } },
      },
      orderBy: { submitted_at: 'desc' },
    });

    const totalAttempts = attempts.length;
    const completedAttempts = attempts.filter((a) => a.submitted_at).length;
    const avgScore = completedAttempts > 0
      ? Math.round((attempts.reduce((sum, a) => sum + (a.percentage || 0), 0) / completedAttempts) * 100) / 100
      : 0;
    const passedCount = attempts.filter((a) => (a.percentage || 0) >= 50).length;

    return {
      total_tests_assigned: totalAttempts,
      completed_tests: completedAttempts,
      passed_tests: passedCount,
      avg_score: avgScore,
      recent_attempts: attempts.slice(0, 5).map((a) => ({
        test_id: a.test_id,
        test_title: a.test.title,
        score: a.percentage,
        submitted_at: a.submitted_at,
      })),
    };
  }

  // ============ PHASE 5: FLUTTER & RESPONSE FORMATTING ============

  async getTestResultForFlutter(attemptId, studentId, role, coachingCenterId) {
    const attempt = await prisma.testAttempt.findUnique({
      where: { id: attemptId },
      include: {
        test: {
          include: {
            test_questions: {
              include: { question: { include: { options: { orderBy: { order_index: 'asc' } } } } },
              orderBy: { order_index: 'asc' },
            },
          },
        },
        answers: true,
      },
    });

    if (!attempt) {
      throw new Error('Attempt not found');
    }

    if (role === 'STUDENT' && attempt.student_id !== studentId) {
      throw new Error('Unauthorized');
    }

    // Determine visibility based on mode and results_published
    const showAnswers =
      attempt.test.mode === 'PRACTICE' ||
      (attempt.test.mode === 'TEST' && attempt.test.results_published);

    const resultDetails = attempt.test.test_questions.map((tq) => {
      const answer = attempt.answers.find((a) => a.question_id === tq.question_id);
      const question = tq.question;

      return {
        question_id: question.id,
        question_text: question.question_text,
        question_marks: question.marks,
        selected_options: showAnswers ? answer?.selected_option_ids || [] : [],
        correct_options: showAnswers ? question.correct_option_ids || [] : [],
        is_correct: showAnswers ? answer?.is_correct : null,
        marks_awarded: showAnswers ? answer?.marks_awarded : null,
        explanation: showAnswers ? question.explanation : null,
        options: question.options.map((opt) => ({
          id: opt.id,
          text: opt.option_text,
          order: opt.order_index,
        })),
      };
    });

    return {
      attempt_id: attemptId,
      test: {
        id: attempt.test.id,
        title: attempt.test.title,
        mode: attempt.test.mode,
        total_marks: attempt.test.total_marks,
      },
      result: {
        obtained_marks: attempt.obtained_marks,
        total_marks: attempt.total_marks,
        percentage: attempt.percentage,
        passed: attempt.percentage >= (attempt.test.pass_marks || 50),
        time_taken_seconds: attempt.time_taken_secs,
      },
      show_answers: showAnswers,
      results_published: attempt.test.results_published,
      details: showAnswers ? resultDetails : [],
    };
  }

  async getTestsForStudentFlutter(batchId, coachingCenterId) {
    const tests = await prisma.test.findMany({
      where: {
        coaching_center_id: coachingCenterId,
        is_published: true,
        batches: { some: { id: batchId } },
      },
      include: {
        test_analytics: true,
        _count: { select: { test_attempts: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    return tests.map((test) => ({
      id: test.id,
      title: test.title,
      description: test.description,
      mode: test.mode,
      duration_minutes: test.duration_minutes,
      total_marks: test.total_marks,
      pass_marks: test.pass_marks,
      total_attempts: test._count.test_attempts,
      avg_score: Math.round((test.test_analytics?.[0]?.avg_score || 0) * 100) / 100,
      is_available: !test.end_time || new Date() <= new Date(test.end_time),
    }));
  }
}

module.exports = new AiTestStudioService();
