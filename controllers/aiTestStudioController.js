const aiTestStudioService = require('../services/aiTestStudioService');
const aiService = require('../services/aiService');
const { HTTP_STATUS, SUCCESS_MESSAGES } = require('../config/constants');
const { audit } = require('../utils/auditLogger');

class AiTestStudioController {
  // ============ SYLLABUS ENDPOINTS ============

  static async uploadSyllabus(req, res) {
    try {
      const { coachingId } = req.params;
      const userId = req.user.userId;
      const { name, storageUrls, extractedText, batchId, subjectId } = req.body;

      if (!storageUrls || storageUrls.length === 0) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: 'Validation error',
          message: 'At least one file URL is required',
        });
      }

      const syllabus = await aiTestStudioService.uploadSyllabus(
        parseInt(coachingId),
        userId,
        { name, storageUrls, extractedText, batchId: batchId ? parseInt(batchId) : null, subjectId: subjectId ? parseInt(subjectId) : null }
      );

      await audit('SYLLABUS_UPLOADED', userId, { syllabusId: syllabus.id, coachingId });

      return res.status(HTTP_STATUS.CREATED).json({
        message: 'Syllabus uploaded successfully',
        syllabus,
      });
    } catch (error) {
      console.error('Upload syllabus error:', error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Failed to upload syllabus',
        message: error.message,
      });
    }
  }

  static async getSyllabus(req, res) {
    try {
      const { coachingId, syllabusId } = req.params;

      const syllabus = await aiTestStudioService.getSyllabus(
        parseInt(syllabusId),
        parseInt(coachingId)
      );

      if (!syllabus) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          error: 'Not found',
          message: 'Syllabus not found',
        });
      }

      return res.status(HTTP_STATUS.SUCCESS).json({
        message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
        syllabus,
      });
    } catch (error) {
      console.error('Get syllabus error:', error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Failed to retrieve syllabus',
        message: error.message,
      });
    }
  }

  // ============ AI GENERATION ENDPOINTS ============

  static async triggerAiGeneration(req, res) {
    try {
      const { coachingId } = req.params;
      const userId = req.user.userId;
      const {
        syllabusId,
        numQuestions = 10,
        difficultyDist,
        marksPerQ,
        negativeMarking,
        prompt = '',
        context = '',
        attachments = [],
        batchId,
        subjectId,
        title,
      } = req.body;

      let syllabus = null;

      if (syllabusId) {
        syllabus = await aiTestStudioService.getSyllabus(
          parseInt(syllabusId),
          parseInt(coachingId)
        );

        if (!syllabus) {
          return res.status(HTTP_STATUS.NOT_FOUND).json({
            error: 'Not found',
            message: 'Syllabus not found',
          });
        }
      } else {
        const attachmentSummary = Array.isArray(attachments)
          ? attachments
              .map((attachment) => {
                if (typeof attachment === 'string') return attachment;
                if (attachment && typeof attachment === 'object') {
                  return attachment.name || attachment.path || '';
                }
                return '';
              })
              .filter(Boolean)
              .join('\n')
          : '';

        const extractedText = [prompt, context, attachmentSummary]
          .map((value) => (value || '').toString().trim())
          .filter(Boolean)
          .join('\n\n');

        syllabus = await aiTestStudioService.uploadSyllabus(
          parseInt(coachingId),
          userId,
          {
            name:
              title ||
              (prompt
                ? `Chat Prompt - ${new Date().toLocaleDateString()}`
                : `Chat Draft - ${new Date().toLocaleDateString()}`),
            storageUrls:
              Array.isArray(attachments) && attachments.length > 0
                ? attachments
                    .map((attachment) =>
                      typeof attachment === 'string'
                        ? attachment
                        : attachment?.name || attachment?.path || ''
                    )
                    .filter(Boolean)
                : ['chat://prompt'],
            extractedText,
            batchId: batchId ? parseInt(batchId) : null,
            subjectId: subjectId ? parseInt(subjectId) : null,
          }
        );
      }

      const generation = await aiTestStudioService.createAiGeneration(
        parseInt(coachingId),
        userId,
        syllabus.id,
        { numQuestions: Number(numQuestions), difficultyDist, marksPerQ, negativeMarking }
      );

      await audit('AI_GENERATION_STARTED', userId, { generationId: generation.id });

      const promptText = aiService.buildGenerationPrompt(
        `${syllabus.extracted_text || syllabus.name || 'No syllabus text provided.'}`,
        {
          numQuestions: Number(numQuestions),
          difficultyDist,
          marksPerQ: Number(marksPerQ || 1),
          negativeMarking: Number(negativeMarking || 0),
        }
      );

      const generatedQuestions = await aiService.generateMcqQuestions(
        generation.id,
        promptText,
        Number(numQuestions)
      );

      return res.status(HTTP_STATUS.CREATED).json({
        message: 'AI questions generated successfully',
        generation,
        questions: generatedQuestions,
        syllabus,
      });
    } catch (error) {
      console.error('Trigger AI generation error:', error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Failed to trigger AI generation',
        message: error.message,
      });
    }
  }

  static async getAiGenerationStatus(req, res) {
    try {
      const { coachingId, generationId } = req.params;

      const generation = await aiTestStudioService.getAiGenerationStatus(
        parseInt(generationId),
        parseInt(coachingId)
      );

      if (!generation) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          error: 'Not found',
          message: 'Generation not found',
        });
      }

      return res.status(HTTP_STATUS.SUCCESS).json({
        message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
        generation,
      });
    } catch (error) {
      console.error('Get AI generation status error:', error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Failed to retrieve generation status',
        message: error.message,
      });
    }
  }

  // ============ QUESTION ENDPOINTS ============

  static async createQuestion(req, res) {
    try {
      const { coachingId } = req.params;
      const userId = req.user.userId;
      const questionData = req.body;

      const question = await aiTestStudioService.createQuestion(
        parseInt(coachingId),
        userId,
        questionData
      );

      await audit('QUESTION_CREATED', userId, { questionId: question.id });

      return res.status(HTTP_STATUS.CREATED).json({
        message: 'Question created successfully',
        question,
      });
    } catch (error) {
      console.error('Create question error:', error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Failed to create question',
        message: error.message,
      });
    }
  }

  static async updateQuestion(req, res) {
    try {
      const { coachingId, questionId } = req.params;
      const updateData = req.body;

      const question = await aiTestStudioService.updateQuestion(
        parseInt(questionId),
        parseInt(coachingId),
        updateData
      );

      await audit('QUESTION_UPDATED', req.user.userId, { questionId });

      return res.status(HTTP_STATUS.SUCCESS).json({
        message: 'Question updated successfully',
        question,
      });
    } catch (error) {
      console.error('Update question error:', error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Failed to update question',
        message: error.message,
      });
    }
  }

  static async getQuestionBank(req, res) {
    try {
      const { coachingId } = req.params;
      const userId = req.user.userId;
      const { subjectId, difficultyLevel, skip, limit } = req.query;

      const { questions, total } = await aiTestStudioService.getQuestionBank(
        parseInt(coachingId),
        userId,
        {
          subjectId: subjectId ? parseInt(subjectId) : null,
          difficultyLevel,
          skip: skip ? parseInt(skip) : 0,
          limit: limit ? parseInt(limit) : 20,
        }
      );

      return res.status(HTTP_STATUS.SUCCESS).json({
        message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
        questions,
        total,
        skip: skip ? parseInt(skip) : 0,
        limit: limit ? parseInt(limit) : 20,
      });
    } catch (error) {
      console.error('Get question bank error:', error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Failed to retrieve question bank',
        message: error.message,
      });
    }
  }

  static async deleteQuestion(req, res) {
    try {
      const { coachingId, questionId } = req.params;

      await aiTestStudioService.deleteQuestion(
        parseInt(questionId),
        parseInt(coachingId)
      );

      await audit('QUESTION_DELETED', req.user.userId, { questionId });

      return res.status(HTTP_STATUS.SUCCESS).json({
        message: 'Question deleted successfully',
      });
    } catch (error) {
      console.error('Delete question error:', error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Failed to delete question',
        message: error.message,
      });
    }
  }

  // ============ TEST ENDPOINTS ============

  static async createTest(req, res) {
    try {
      const { coachingId } = req.params;
      const userId = req.user.userId;
      const testData = req.body;

      const test = await aiTestStudioService.createTest(
        parseInt(coachingId),
        userId,
        {
          ...testData,
          batchId: testData.batchId ? parseInt(testData.batchId) : null,
          subjectId: testData.subjectId ? parseInt(testData.subjectId) : null,
          questionIds: testData.questionIds ? testData.questionIds.map(Number) : [],
        }
      );

      await audit('TEST_CREATED', userId, { testId: test.id });

      return res.status(HTTP_STATUS.CREATED).json({
        message: 'Test created successfully',
        test,
      });
    } catch (error) {
      console.error('Create test error:', error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Failed to create test',
        message: error.message,
      });
    }
  }

  static async publishTest(req, res) {
    try {
      const { coachingId, testId } = req.params;
      const userId = req.user.userId;
      const { startTime, endTime } = req.body;

      const test = await aiTestStudioService.publishTest(
        parseInt(testId),
        parseInt(coachingId),
        userId,
        { startTime, endTime }
      );

      await audit('TEST_PUBLISHED', userId, { testId });

      return res.status(HTTP_STATUS.SUCCESS).json({
        message: 'Test published successfully',
        test,
      });
    } catch (error) {
      console.error('Publish test error:', error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Failed to publish test',
        message: error.message,
      });
    }
  }

  static async listTests(req, res) {
    try {
      const { coachingId } = req.params;
      const userId = req.user.userId;
      const { batchId, skip, limit } = req.query;

      const { tests, total } = await aiTestStudioService.listTests(
        parseInt(coachingId),
        {
          batchId: batchId ? parseInt(batchId) : null,
          createdBy: userId,
          skip: skip ? parseInt(skip) : 0,
          limit: limit ? parseInt(limit) : 20,
        }
      );

      return res.status(HTTP_STATUS.SUCCESS).json({
        message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
        tests,
        total,
      });
    } catch (error) {
      console.error('List tests error:', error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Failed to retrieve tests',
        message: error.message,
      });
    }
  }

  static async editTest(req, res) {
    try {
      const { coachingId, testId } = req.params;
      const userId = req.user.userId;
      const updateData = req.body;

      const test = await aiTestStudioService.editTest(
        parseInt(testId),
        parseInt(coachingId),
        userId,
        updateData
      );

      await audit('TEST_EDITED', userId, { testId });

      return res.status(HTTP_STATUS.SUCCESS).json({
        message: 'Test updated successfully',
        test,
      });
    } catch (error) {
      console.error('Edit test error:', error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Failed to update test',
        message: error.message,
      });
    }
  }

  static async duplicateTest(req, res) {
    try {
      const { coachingId, testId } = req.params;
      const userId = req.user.userId;

      const test = await aiTestStudioService.duplicateTest(
        parseInt(testId),
        parseInt(coachingId),
        userId
      );

      await audit('TEST_DUPLICATED', userId, { originalTestId: testId, newTestId: test.id });

      return res.status(HTTP_STATUS.SUCCESS).json({
        message: 'Test duplicated successfully',
        test,
      });
    } catch (error) {
      console.error('Duplicate test error:', error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Failed to duplicate test',
        message: error.message,
      });
    }
  }

  static async deleteTest(req, res) {
    try {
      const { coachingId, testId } = req.params;
      const userId = req.user.userId;

      await aiTestStudioService.deleteTest(
        parseInt(testId),
        parseInt(coachingId),
        userId
      );

      await audit('TEST_DELETED', userId, { testId });

      return res.status(HTTP_STATUS.SUCCESS).json({
        message: 'Test deleted successfully',
      });
    } catch (error) {
      console.error('Delete test error:', error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Failed to delete test',
        message: error.message,
      });
    }
  }

  // ============ ANALYTICS ENDPOINTS ============

  static async startTestAttempt(req, res) {
    try {
      const { coachingId, testId } = req.params;
      const userId = req.user.userId;
      const { batchId } = req.body;

      const attempt = await aiTestStudioService.startTestAttempt(
        parseInt(testId),
        userId,
        parseInt(batchId),
        parseInt(coachingId)
      );

      return res.status(HTTP_STATUS.SUCCESS).json({
        message: 'Test attempt started',
        attempt,
      });
    } catch (error) {
      console.error('Start test attempt error:', error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Failed to start test attempt',
        message: error.message,
      });
    }
  }

  static async submitTestAttempt(req, res) {
    try {
      const { coachingId, testId, attemptId } = req.params;
      const userId = req.user.userId;
      const { answers } = req.body;

      const attempt = await aiTestStudioService.submitTestAttempt(
        parseInt(attemptId),
        userId,
        answers
      );

      await audit('TEST_SUBMITTED', userId, { testId, attemptId });

      // Get result for immediate response
      const result = await aiTestStudioService.getAttemptResult(
        parseInt(attemptId),
        userId,
        'STUDENT',
        parseInt(coachingId)
      );

      return res.status(HTTP_STATUS.SUCCESS).json({
        message: 'Test submitted successfully',
        attempt,
        result,
      });
    } catch (error) {
      console.error('Submit test attempt error:', error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Failed to submit test',
        message: error.message,
      });
    }
  }

  static async getAttemptResult(req, res) {
    try {
      const { coachingId, attemptId } = req.params;
      const userId = req.user.userId;
      const role = req.user.role;

      const result = await aiTestStudioService.getAttemptResult(
        parseInt(attemptId),
        userId,
        role,
        parseInt(coachingId)
      );

      return res.status(HTTP_STATUS.SUCCESS).json({
        message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
        result,
      });
    } catch (error) {
      console.error('Get attempt result error:', error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Failed to retrieve attempt result',
        message: error.message,
      });
    }
  }

  // ============ ANALYTICS ENDPOINTS ============

  static async getDashboardAnalytics(req, res) {
    try {
      const { coachingId } = req.params;
      const userId = req.user.userId;

      const analytics = await aiTestStudioService.getDashboardAnalytics(
        parseInt(coachingId),
        userId
      );

      return res.status(HTTP_STATUS.SUCCESS).json({
        message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
        analytics,
      });
    } catch (error) {
      console.error('Get dashboard analytics error:', error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Failed to retrieve analytics',
        message: error.message,
      });
    }
  }

  // ============ PHASE 3: STUDENT TEST-TAKING ENDPOINTS ============

  static async getTestForAttempt(req, res) {
    try {
      const { coachingId, testId } = req.params;
      const { batchId } = req.query;
      const userId = req.user.userId;

      const test = await aiTestStudioService.getTestForAttempt(
        parseInt(testId),
        userId,
        parseInt(batchId),
        parseInt(coachingId)
      );

      return res.status(HTTP_STATUS.SUCCESS).json({
        message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
        test,
      });
    } catch (error) {
      console.error('Get test for attempt error:', error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Failed to retrieve test',
        message: error.message,
      });
    }
  }

  static async submitTestAttemptEnhanced(req, res) {
    try {
      const { coachingId, testId, attemptId } = req.params;
      const userId = req.user.userId;
      const { answers, timeTakenSeconds } = req.body;

      if (!answers || !Array.isArray(answers)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: 'Validation error',
          message: 'Answers array is required',
        });
      }

      const attempt = await aiTestStudioService.submitTestAttemptEnhanced(
        parseInt(attemptId),
        userId,
        answers,
        timeTakenSeconds || 0,
        parseInt(coachingId)
      );

      await audit('TEST_ATTEMPT_SUBMITTED', userId, { testId, attemptId });

      // Get result for response
      const result = await aiTestStudioService.getTestResultForFlutter(
        parseInt(attemptId),
        userId,
        'STUDENT',
        parseInt(coachingId)
      );

      return res.status(HTTP_STATUS.SUCCESS).json({
        message: 'Test submitted successfully',
        result,
      });
    } catch (error) {
      console.error('Submit test attempt enhanced error:', error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Failed to submit test',
        message: error.message,
      });
    }
  }

  static async getStudentAttempts(req, res) {
    try {
      const { coachingId, testId } = req.params;
      const userId = req.user.userId;

      const attempts = await aiTestStudioService.getStudentAttempts(
        parseInt(testId),
        userId,
        parseInt(coachingId)
      );

      return res.status(HTTP_STATUS.SUCCESS).json({
        message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
        attempts,
      });
    } catch (error) {
      console.error('Get student attempts error:', error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Failed to retrieve attempts',
        message: error.message,
      });
    }
  }

  // ============ PHASE 4: ANALYTICS ENDPOINTS ============

  static async getTestAnalytics(req, res) {
    try {
      const { coachingId, testId } = req.params;

      const analytics = await aiTestStudioService.getTestAnalyticsSummary(
        parseInt(testId),
        parseInt(coachingId)
      );

      return res.status(HTTP_STATUS.SUCCESS).json({
        message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
        analytics,
      });
    } catch (error) {
      console.error('Get test analytics error:', error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Failed to retrieve test analytics',
        message: error.message,
      });
    }
  }

  static async getQuestionAnalytics(req, res) {
    try {
      const { coachingId, questionId } = req.params;

      const analytics = await aiTestStudioService.getQuestionAnalyticsSummary(
        parseInt(questionId),
        parseInt(coachingId)
      );

      return res.status(HTTP_STATUS.SUCCESS).json({
        message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
        analytics,
      });
    } catch (error) {
      console.error('Get question analytics error:', error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Failed to retrieve question analytics',
        message: error.message,
      });
    }
  }

  static async getTeacherDashboard(req, res) {
    try {
      const { coachingId } = req.params;
      const userId = req.user.userId;

      const dashboard = await aiTestStudioService.getTeacherDashboard(
        parseInt(coachingId),
        userId
      );

      return res.status(HTTP_STATUS.SUCCESS).json({
        message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
        dashboard,
      });
    } catch (error) {
      console.error('Get teacher dashboard error:', error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Failed to retrieve dashboard',
        message: error.message,
      });
    }
  }

  static async getStudentDashboard(req, res) {
    try {
      const { coachingId } = req.params;
      const userId = req.user.userId;
      const { batchId } = req.query;

      const dashboard = await aiTestStudioService.getStudentDashboard(
        parseInt(coachingId),
        userId,
        parseInt(batchId)
      );

      return res.status(HTTP_STATUS.SUCCESS).json({
        message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
        dashboard,
      });
    } catch (error) {
      console.error('Get student dashboard error:', error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Failed to retrieve dashboard',
        message: error.message,
      });
    }
  }

  // ============ PHASE 5: FLUTTER-SPECIFIC ENDPOINTS ============

  static async getTestResultForFlutter(req, res) {
    try {
      const { coachingId, attemptId } = req.params;
      const userId = req.user.userId;
      const role = req.user.role;

      const result = await aiTestStudioService.getTestResultForFlutter(
        parseInt(attemptId),
        userId,
        role,
        parseInt(coachingId)
      );

      return res.status(HTTP_STATUS.SUCCESS).json({
        message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
        result,
      });
    } catch (error) {
      console.error('Get test result for Flutter error:', error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Failed to retrieve result',
        message: error.message,
      });
    }
  }

  static async getTestsForStudentFlutter(req, res) {
    try {
      const { coachingId } = req.params;
      const userId = req.user.userId;
      const { batchId } = req.query;

      const tests = await aiTestStudioService.getTestsForStudentFlutter(
        parseInt(batchId),
        parseInt(coachingId)
      );

      return res.status(HTTP_STATUS.SUCCESS).json({
        message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
        tests,
      });
    } catch (error) {
      console.error('Get tests for student Flutter error:', error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Failed to retrieve tests',
        message: error.message,
      });
    }
  }
}

module.exports = AiTestStudioController;
