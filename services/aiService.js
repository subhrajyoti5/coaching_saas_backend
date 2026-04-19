const prisma = require('../config/database');

/**
 * AI Service
 * Handles AI generation with retry logic and response validation
 */
class AiService {
  constructor() {
    this.maxRetries = 3;
    this.retryDelays = [2000, 5000, 10000]; // 2s, 5s, 10s
  }

  normalizeTopicName(topic = '') {
    return String(topic || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async getOrCreateTopic(coachingCenterId, topicName) {
    const normalizedName = this.normalizeTopicName(topicName);
    if (!normalizedName) return null;

    return prisma.topic.upsert({
      where: {
        coaching_center_id_normalized_name: {
          coaching_center_id: coachingCenterId,
          normalized_name: normalizedName,
        },
      },
      update: { name: topicName.trim() },
      create: {
        coaching_center_id: coachingCenterId,
        name: topicName.trim(),
        normalized_name: normalizedName,
      },
    });
  }

  getGeminiModelCandidates() {
    const configuredModels = String(process.env.GEMINI_MODEL || '')
      .split(',')
      .map((model) => model.trim())
      .filter(Boolean);

    const defaultModels = [
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-1.5-flash-latest',
      'gemini-1.5-flash',
    ];

    return [...new Set([...configuredModels, ...defaultModels])];
  }

  /**
   * Generate MCQ questions using AI
   * Includes retry logic with exponential backoff
   */
  async generateMcqQuestions(generationId, prompt, numQuestions, options = {}) {
    try {
      // Update status to IN_PROGRESS
      await prisma.aiGeneration.update({
        where: { id: generationId },
        data: { status: 'IN_PROGRESS', last_attempt_at: new Date() },
      });

      const questions = await this.callAiWithRetry(
        prompt,
        numQuestions,
        0
      );

      // Validate questions
      const validated = this.validateQuestions(questions, numQuestions);

      // Save questions to database
      const savedQuestions = await this.saveGeneratedQuestions(
        generationId,
        validated,
        options
      );

      // Update generation status
      await prisma.aiGeneration.update({
        where: { id: generationId },
        data: {
          status: 'SUCCESS',
          completed_at: new Date(),
          questions: {
            connect: savedQuestions.map((q) => ({ id: q.id })),
          },
        },
      });

      return savedQuestions;
    } catch (error) {
      console.error(`AI generation failed for ID ${generationId}:`, error);

      // Update generation status to FAILED
      await prisma.aiGeneration.update({
        where: { id: generationId },
        data: {
          status: 'FAILED',
          error_message: error.message,
        },
      });

      throw error;
    }
  }

  /**
   * Call AI API with retry logic
   */
  async callAiWithRetry(prompt, numQuestions, attemptNumber) {
    try {
      // TODO: Replace with actual AI API call
      // For now, this is a placeholder that would call Gemini/Llama/etc.
      const response = await this.callAiApi(prompt, numQuestions);
      return response;
    } catch (error) {
      if (attemptNumber < this.maxRetries - 1) {
        const delay = this.retryDelays[attemptNumber];
        console.log(
          `AI call failed (attempt ${attemptNumber + 1}/${this.maxRetries}). Retrying in ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.callAiWithRetry(prompt, numQuestions, attemptNumber + 1);
      }
      throw error;
    }
  }

  /**
   * Call actual AI API (placeholder)
   * In production, this would call Gemini API, Llama, or other provider
   */
  async callAiApi(prompt, numQuestions) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.warn('GEMINI_API_KEY is missing. Falling back to mock questions.');
      return this.generateMockQuestions(numQuestions);
    }

    const candidateModels = this.getGeminiModelCandidates();
    let lastError = null;

    for (const model of candidateModels) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              temperature: 0.4,
              responseMimeType: 'application/json',
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        const canTryNextModel =
          response.status === 404 || /NOT_FOUND|not found/i.test(errorText);

        if (canTryNextModel) {
          console.warn(
            `Gemini model unavailable: ${model}. Trying next candidate model.`
          );
          lastError = new Error(
            `Gemini API error (${response.status}) with model ${model}: ${errorText}`
          );
          continue;
        }

        throw new Error(
          `Gemini API error (${response.status}) with model ${model}: ${errorText}`
        );
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        throw new Error(`Gemini returned an empty response for model ${model}`);
      }

      const parsed = this.parseGeminiResponse(text);

      if (!Array.isArray(parsed)) {
        throw new Error('Gemini response must be a JSON array of questions');
      }

      return parsed;
    }

    if (lastError) {
      throw new Error(
        `No compatible Gemini model found. Tried: ${candidateModels.join(', ')}. Last error: ${lastError.message}`
      );
    }

    throw new Error('No Gemini model candidates were configured');
  }

  /**
   * Parse Gemini response content into JSON.
   */
  parseGeminiResponse(text) {
    const trimmed = text.trim();

    try {
      return JSON.parse(trimmed);
    } catch (error) {
      const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (codeBlockMatch) {
        return JSON.parse(codeBlockMatch[1].trim());
      }

      const arrayStart = trimmed.indexOf('[');
      const arrayEnd = trimmed.lastIndexOf(']');
      if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
        return JSON.parse(trimmed.slice(arrayStart, arrayEnd + 1));
      }

      throw new Error(`Unable to parse Gemini response as JSON: ${error.message}`);
    }
  }

  /**
   * Validate AI response contains required fields and correct count
   */
  validateQuestions(questions, expectedCount) {
    if (!Array.isArray(questions)) {
      throw new Error('AI response must be an array of questions');
    }

    if (questions.length !== expectedCount) {
      throw new Error(
        `Expected ${expectedCount} questions, got ${questions.length}`
      );
    }

    // Validate each question
    for (const q of questions) {
      if (!q.questionText || !q.options || q.options.length < 2) {
        throw new Error('Invalid question format from AI');
      }

      if (!q.correctOptionIds || q.correctOptionIds.length === 0) {
        throw new Error('Question missing correct answer(s)');
      }

      // Check that correct option IDs are valid
      for (const id of q.correctOptionIds) {
        if (id < 0 || id >= q.options.length) {
          throw new Error('Invalid correct option ID');
        }
      }
    }

    return questions;
  }

  /**
   * Save generated questions to database
   */
  async saveGeneratedQuestions(generationId, questions, options = {}) {
    const generation = await prisma.aiGeneration.findUnique({
      where: { id: generationId },
    });

    if (!generation) {
      throw new Error('Generation record not found');
    }

    const topicNames = Array.isArray(options.topicNames) ? options.topicNames : [];
    const topicRows = [];
    for (const topicName of topicNames) {
      const topic = await this.getOrCreateTopic(generation.coaching_center_id, topicName);
      if (topic) {
        topicRows.push(topic);
      }
    }

    const savedQuestions = [];

    for (const q of questions) {
      const topicRow = topicRows.length > 0
        ? topicRows[savedQuestions.length % topicRows.length]
        : null;

      const question = await prisma.question.create({
        data: {
          coaching_center_id: generation.coaching_center_id,
          created_by: generation.teacher_id,
          subject_id: null, // Could be inferred from syllabus
          syllabus_id: generation.syllabus_id,
          ai_generation_id: generation.id,
          topic_id: topicRow?.id || null,
          question_text: q.questionText,
          difficulty_level: q.difficultyLevel || 'MEDIUM',
          marks: q.marks || 1,
          negative_marks: q.negativeMarking || 0,
          explanation: q.explanation || null,
          source: 'AI_GENERATED',
          is_from_bank: true,
          options: {
            createMany: {
              data: q.options.map((opt, idx) => ({
                option_text: opt,
                order_index: idx,
              })),
            },
          },
        },
        include: {
          options: { orderBy: { order_index: 'asc' } },
          topic: true,
        },
      });

      savedQuestions.push(question);
    }

    return savedQuestions;
  }

  /**
   * Generate mock questions for testing
   * Remove this in production
   */
  generateMockQuestions(count) {
    const questions = [];

    for (let i = 1; i <= count; i++) {
      questions.push({
        questionText: `Sample Question ${i}: What is the correct answer?`,
        options: [
          'Option A - Incorrect',
          'Option B - Correct',
          'Option C - Incorrect',
          'Option D - Incorrect',
        ],
        correctOptionIds: [1],
        difficultyLevel: ['EASY', 'MEDIUM', 'HARD'][i % 3],
        marks: 1,
        negativeMarking: 0.25,
        explanation: `This is the explanation for question ${i}. The correct answer is Option B because...`,
      });
    }

    return questions;
  }

  /**
   * Build prompt for AI to generate questions
   */
  buildGenerationPrompt(syllabus, params) {
    const {
      numQuestions,
      difficultyDist,
      marksPerQ,
      negativeMarking,
      topics = [],
    } = params;

    const easyCount = Math.round(numQuestions * (difficultyDist?.EASY || 0.2));
    const mediumCount = Math.round(numQuestions * (difficultyDist?.MEDIUM || 0.6));
    const hardCount = numQuestions - easyCount - mediumCount;

     const prompt = `
  You are an expert educational content creator.

  Generate exactly ${numQuestions} multiple choice questions from the syllabus below.

  SYLLABUS CONTENT:
  ${syllabus}

  ${Array.isArray(topics) && topics.length > 0 ? `FOCUS TOPICS:\n${topics.map((topic, index) => `${index + 1}. ${topic}`).join('\n')}\n` : ''}

  OUTPUT RULES:
  1. Return ONLY a JSON array. No markdown, no code fences, no explanations.
  2. The array must contain exactly ${numQuestions} objects.
  3. Each object must have exactly these keys:
    - questionText: string
    - options: string[] with exactly 4 items
    - correctOptionIds: number[] using zero-based indexes only
    - difficultyLevel: one of "EASY", "MEDIUM", "HARD"
    - marks: integer
    - negativeMarking: number
    - explanation: string
  4. correctOptionIds must reference the options array using zero-based indexes.
    Example: if the second option is correct, correctOptionIds must be [1].
  5. Keep the questions clear, concise, and unambiguous.
  6. Make distractors plausible and avoid duplicate options.
  7. Match the difficulty distribution as closely as possible:
    - EASY: ${easyCount}
    - MEDIUM: ${mediumCount}
    - HARD: ${hardCount}
  8. Use marks = ${marksPerQ} and negativeMarking = ${negativeMarking} for every question unless the syllabus strongly requires variation.

  Return valid JSON only. The response must start with [ and end with ].
  `;

    return prompt;
  }
}

module.exports = new AiService();
