/**
 * Tests for Coaching API endpoints
 * Focus: Add Student/Teacher, Delete Student, Get Stats, Get Audit Logs
 */

const request = require('supertest');
const prisma = require('../config/database');
const { ROLES } = require('../config/constants');

// Mock server - in real setup, this would be your Express app
const server = 'http://localhost:3000';

describe('Coaching API Tests', () => {
  let testCoachingId, testOwnerId, testToken, testStudentId, testTeacherId;

  beforeAll(async () => {
    // Create test owner and coaching center
    const ownerUser = await prisma.user.create({
      data: {
        email: 'owner@test.local',
        firstName: 'Test',
        lastName: 'Owner',
        password: 'hashed',
        isActive: true
      }
    });
    testOwnerId = ownerUser.id;

    const coaching = await prisma.coachingCentre.create({
      data: {
        name: 'Test Coaching',
        ownerId: testOwnerId
      }
    });
    testCoachingId = coaching.id;

    await prisma.coachingUser.create({
      data: {
        userId: testOwnerId,
        coachingId: testCoachingId,
        role: ROLES.OWNER,
        assignedBy: testOwnerId
      }
    });

    // Generate mock JWT token (in real tests, use your auth mechanism)
    testToken = 'mock-jwt-token';
  });

  afterAll(async () => {
    await prisma.coachingUser.deleteMany({});
    await prisma.coachingCentre.deleteMany({});
    await prisma.user.deleteMany({});
  });

  describe('POST /api/coaching/add-student', () => {
    it('should add a new student successfully', async () => {
      const response = await request(server)
        .post('/api/coaching/add-student')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          email: 'student1@test.local',
          coachingId: testCoachingId,
          studentData: { firstName: 'John', lastName: 'Doe' }
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('success');
      expect(response.body.coachingUser).toBeDefined();
      expect(response.body.studentProfile).toBeDefined();

      testStudentId = response.body.coachingUser.userId;
    });

    it('should reject duplicate student add with DUPLICATE_MEMBER error', async () => {
      const response = await request(server)
        .post('/api/coaching/add-student')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          email: 'student1@test.local',
          coachingId: testCoachingId,
          studentData: { firstName: 'John', lastName: 'Doe' }
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('already added');
    });

    it('should validate required fields', async () => {
      const response = await request(server)
        .post('/api/coaching/add-student')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          coachingId: testCoachingId
          // missing email
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/coaching/add-teacher', () => {
    it('should add a new teacher successfully', async () => {
      const response = await request(server)
        .post('/api/coaching/add-teacher')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          email: 'teacher1@test.local',
          coachingId: testCoachingId,
          teacherData: { firstName: 'Jane', lastName: 'Smith' }
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('success');
      expect(response.body.assignment).toBeDefined();

      testTeacherId = response.body.assignment.userId;
    });

    it('should reject duplicate teacher add', async () => {
      const response = await request(server)
        .post('/api/coaching/add-teacher')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          email: 'teacher1@test.local',
          coachingId: testCoachingId,
          teacherData: { firstName: 'Jane', lastName: 'Smith' }
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('already added');
    });
  });

  describe('DELETE /api/coaching/:coachingId/students/:studentId', () => {
    it('should delete a student successfully', async () => {
      const response = await request(server)
        .delete(`/api/coaching/${testCoachingId}/students/${testStudentId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify student is removed
      const stillExists = await prisma.coachingUser.findFirst({
        where: { userId: testStudentId, coachingId: testCoachingId }
      });
      expect(stillExists).toBeNull();
    });

    it('should reject deletion of non-existent student', async () => {
      const response = await request(server)
        .delete(`/api/coaching/${testCoachingId}/students/invalid-id`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/coaching/:coachingId/stats', () => {
    it('should return coaching statistics', async () => {
      const response = await request(server)
        .get(`/api/coaching/${testCoachingId}/stats`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.stats).toBeDefined();
      expect(response.body.stats.studentCount).toBeGreaterThanOrEqual(0);
      expect(response.body.stats.teacherCount).toBeGreaterThanOrEqual(0);
      expect(response.body.stats.batchCount).toBeGreaterThanOrEqual(0);
    });

    it('should have correct counts after member operations', async () => {
      // Add another student
      await request(server)
        .post('/api/coaching/add-student')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          email: 'student2@test.local',
          coachingId: testCoachingId,
          studentData: { firstName: 'Alice', lastName: 'Green' }
        });

      const response = await request(server)
        .get(`/api/coaching/${testCoachingId}/stats`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.stats.studentCount).toBeGreaterThanOrEqual(1);
      expect(response.body.stats.teacherCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/coaching/:coachingId/audit-logs', () => {
    it('should return audit logs', async () => {
      const response = await request(server)
        .get(`/api/coaching/${testCoachingId}/audit-logs?limit=10`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.logs).toBeDefined();
      expect(Array.isArray(response.body.logs)).toBe(true);
    });

    it('should include onboarding actions in logs', async () => {
      const response = await request(server)
        .get(`/api/coaching/${testCoachingId}/audit-logs?limit=50`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      const actions = response.body.logs.map(log => log.action);
      expect(actions).toContain('ADD_STUDENT');
      expect(actions).toContain('ADD_TEACHER');
    });

    it('should respect limit parameter', async () => {
      const response = await request(server)
        .get(`/api/coaching/${testCoachingId}/audit-logs?limit=5`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.logs.length).toBeLessThanOrEqual(5);
    });

    it('should return logs with user information', async () => {
      const response = await request(server)
        .get(`/api/coaching/${testCoachingId}/audit-logs`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      if (response.body.logs.length > 0) {
        const log = response.body.logs[0];
        expect(log.action).toBeDefined();
        expect(log.createdAt).toBeDefined();
        expect(log.user).toBeDefined();
      }
    });
  });

  describe('Authorization Tests', () => {
    it('should require authentication for stats endpoint', async () => {
      const response = await request(server)
        .get(`/api/coaching/${testCoachingId}/stats`);

      expect([401, 403]).toContain(response.status);
    });

    it('should require authentication for audit-logs endpoint', async () => {
      const response = await request(server)
        .get(`/api/coaching/${testCoachingId}/audit-logs`);

      expect([401, 403]).toContain(response.status);
    });

    it('should require coaching access for stats', async () => {
      const invalidCoachingId = 'invalid-coaching-id';
      const response = await request(server)
        .get(`/api/coaching/${invalidCoachingId}/stats`)
        .set('Authorization', `Bearer ${testToken}`);

      expect([403, 404]).toContain(response.status);
    });
  });
});

module.exports = {};
