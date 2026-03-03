-- Mock Data Insert Script for Coaching Management System
-- Run this with: psql -U postgres -h localhost -d coaching_management -f insert_mock_data.sql

-- ============================================
-- 1. INSERT USERS (Owner, Teacher, Student)
-- ============================================

-- Owner User
INSERT INTO users (id, email, password, "firstName", "lastName", phone, "isActive", "createdAt", "updatedAt")
VALUES (
  'aa67526f-2ecd-442b-a53c-589b47e19928',
  'subhrajyotisahoo08@gmail.com',
  'hashed_password_owner',
  'Subhra',
  'Owner',
  '+91-9876543210',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT (email) DO NOTHING;

-- Teacher User
INSERT INTO users (id, email, password, "firstName", "lastName", phone, "isActive", "createdAt", "updatedAt")
VALUES (
  '23ecaa7f-25c6-4ee8-ac93-89985e01a0c1',
  'itssubhra222@gmail.com',
  'hashed_password_teacher',
  'Rajesh',
  'Teacher',
  '+91-9876543211',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT (email) DO NOTHING;

-- Student User
INSERT INTO users (id, email, password, "firstName", "lastName", phone, "isActive", "createdAt", "updatedAt")
VALUES (
  'c00599ab-82ab-46a3-b26a-7b30e904162f',
  'jsubhra502@gmail.com',
  'hashed_password_student',
  'Arjun',
  'Student',
  '+91-9876543212',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT (email) DO NOTHING;

-- ============================================
-- 2. INSERT COACHING CENTRE
-- ============================================

INSERT INTO coaching_centres (id, name, description, "ownerId", "isActive", "createdAt", "updatedAt")
VALUES (
  '55b666b7-a9c5-4646-b7b5-482c3c9c2c7d',
  'Subhra Coaching Center',
  'Premium Mathematics and Science Coaching Institute',
  '12345678-1234-1234-1234-123456789001',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT DO NOTHING;

-- ============================================
-- 3. INSERT COACHING USERS (Memberships)
-- ============================================

-- Owner membership
INSERT INTO coaching_users (id, "userId", "coachingId", role, "assignedBy", "assignedAt")
VALUES (
  'cu-001-owner',
  'aa67526f-2ecd-442b-a53c-589b47e19928',
  '55b666b7-a9c5-4646-b7b5-482c3c9c2c7d',
  'OWNER',
  'aa67526f-2ecd-442b-a53c-589b47e19928',
  CURRENT_TIMESTAMP
) ON CONFLICT ("userId", "coachingId") DO NOTHING;

-- Teacher membership
INSERT INTO coaching_users (id, "userId", "coachingId", role, "assignedBy", "assignedAt")
VALUES (
  'cu-002-teacher',
  '23ecaa7f-25c6-4ee8-ac93-89985e01a0c1',
  '55b666b7-a9c5-4646-b7b5-482c3c9c2c7d',
  'TEACHER',
  'aa67526f-2ecd-442b-a53c-589b47e19928',
  CURRENT_TIMESTAMP
) ON CONFLICT ("userId", "coachingId") DO NOTHING;

-- Student membership
INSERT INTO coaching_users (id, "userId", "coachingId", role, "assignedBy", "assignedAt")
VALUES (
  'cu-003-student',
  'c00599ab-82ab-46a3-b26a-7b30e904162f',
  '55b666b7-a9c5-4646-b7b5-482c3c9c2c7d',
  'STUDENT',
  'aa67526f-2ecd-442b-a53c-589b47e19928',
  CURRENT_TIMESTAMP
) ON CONFLICT ("userId", "coachingId") DO NOTHING;

-- ============================================
-- 4. INSERT BATCHES
-- ============================================

-- Batch 1: Mathematics Class 10
INSERT INTO batches (id, name, "coachingId", description, "isActive", "createdAt", "updatedAt")
VALUES (
  'batch-001',
  'Mathematics - Class 10',
  '55b666b7-a9c5-4646-b7b5-482c3c9c2c7d',
  'Advanced mathematics for class 10 students covering algebra, geometry, trigonometry',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT DO NOTHING;

-- Batch 2: Science Class 10
INSERT INTO batches (id, name, "coachingId", description, "isActive", "createdAt", "updatedAt")
VALUES (
  'batch-002',
  'Science - Class 10',
  '55b666b7-a9c5-4646-b7b5-482c3c9c2c7d',
  'Physics, Chemistry, and Biology fundamentals for class 10',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT DO NOTHING;

-- Batch 3: English Language
INSERT INTO batches (id, name, "coachingId", description, "isActive", "createdAt", "updatedAt")
VALUES (
  'batch-003',
  'English Language - All Classes',
  '55b666b7-a9c5-4646-b7b5-482c3c9c2c7d',
  'Grammar, comprehension, and communication skills',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT DO NOTHING;

-- ============================================
-- 5. INSERT BATCH TEACHERS
-- ============================================

-- Teacher assigned to Mathematics batch
INSERT INTO batch_teachers (id, "teacherId", "batchId", "assignedBy", "assignedAt")
VALUES (
  'bt-001',
  '23ecaa7f-25c6-4ee8-ac93-89985e01a0c1',
  'batch-001',
  'aa67526f-2ecd-442b-a53c-589b47e19928',
  CURRENT_TIMESTAMP
) ON CONFLICT ("teacherId", "batchId") DO NOTHING;

-- Teacher assigned to Science batch
INSERT INTO batch_teachers (id, "teacherId", "batchId", "assignedBy", "assignedAt")
VALUES (
  'bt-002',
  '23ecaa7f-25c6-4ee8-ac93-89985e01a0c1',
  'batch-002',
  'aa67526f-2ecd-442b-a53c-589b47e19928',
  CURRENT_TIMESTAMP
) ON CONFLICT ("teacherId", "batchId") DO NOTHING;

-- Teacher assigned to English batch
INSERT INTO batch_teachers (id, "teacherId", "batchId", "assignedBy", "assignedAt")
VALUES (
  'bt-003',
  '23ecaa7f-25c6-4ee8-ac93-89985e01a0c1',
  'batch-003',
  'aa67526f-2ecd-442b-a53c-589b47e19928',
  CURRENT_TIMESTAMP
) ON CONFLICT ("teacherId", "batchId") DO NOTHING;

-- ============================================
-- 6. INSERT STUDENT PROFILE
-- ============================================

-- Student enrolled in Mathematics batch
INSERT INTO student_profiles (
  id, "userId", "coachingId", "batchId", 
  "parentName", "parentPhone", "parentEmail", "gradeLevel",
  "admissionDate", "createdAt", "updatedAt"
)
VALUES (
  'sp-001',
  'c00599ab-82ab-46a3-b26a-7b30e904162f',
  '55b666b7-a9c5-4646-b7b5-482c3c9c2c7d',
  'batch-001',
  'Rakesh Singh',
  '+91-9876543220',
  'rakesh.singh@email.com',
  'Class 10',
  CURRENT_DATE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT DO NOTHING;

-- Student enrolled in Science batch
INSERT INTO student_profiles (
  id, "userId", "coachingId", "batchId", 
  "parentName", "parentPhone", "parentEmail", "gradeLevel",
  "admissionDate", "createdAt", "updatedAt"
)
VALUES (
  'sp-002',
  'c00599ab-82ab-46a3-b26a-7b30e904162f',
  '55b666b7-a9c5-4646-b7b5-482c3c9c2c7d',
  'batch-002',
  'Rakesh Singh',
  '+91-9876543220',
  'rakesh.singh@email.com',
  'Class 10',
  CURRENT_DATE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT DO NOTHING;

-- ============================================
-- 7. INSERT SAMPLE FEES
-- ============================================

-- Monthly fee for Mathematics batch - Pending
INSERT INTO fees (
  id, "studentId", "coachingId", "batchId",
  amount, "feeType", "dueDate", status, "createdAt", "updatedAt"
)
VALUES (
  'fee-001',
  'c00599ab-82ab-46a3-b26a-7b30e904162f',
  '55b666b7-a9c5-4646-b7b5-482c3c9c2c7d',
  'batch-001',
  5000.00,
  'MONTHLY',
  '2026-03-15',
  'PENDING',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT DO NOTHING;

-- Monthly fee for Science batch - Paid
INSERT INTO fees (
  id, "studentId", "coachingId", "batchId",
  amount, "feeType", "dueDate", status, "createdAt", "updatedAt"
)
VALUES (
  'fee-002',
  'c00599ab-82ab-46a3-b26a-7b30e904162f',
  '55b666b7-a9c5-4646-b7b5-482c3c9c2c7d',
  'batch-002',
  5000.00,
  'MONTHLY',
  '2026-02-15',
  'PAID',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT DO NOTHING;

-- ============================================
-- 8. INSERT SAMPLE TESTS
-- ============================================

-- Test for Mathematics batch
INSERT INTO tests (
  id, "batchId", "createdBy", title, description, "totalMarks", "passingMarks", 
  "startTime", "endTime", status, "createdAt", "updatedAt"
)
VALUES (
  'test-001',
  'batch-001',
  '23ecaa7f-25c6-4ee8-ac93-89985e01a0c1',
  'Algebra Basics Quiz',
  'Test on algebra fundamentals including linear equations and polynomials',
  100,
  50,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP + INTERVAL '1 hour',
  'PUBLISHED',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT DO NOTHING;

-- Test for Science batch
INSERT INTO tests (
  id, "batchId", "createdBy", title, description, "totalMarks", "passingMarks", 
  "startTime", "endTime", status, "createdAt", "updatedAt"
)
VALUES (
  'test-002',
  'batch-002',
  '23ecaa7f-25c6-4ee8-ac93-89985e01a0c1',
  'Physics Motion Test',
  'Test on laws of motion and Newton principles',
  100,
  50,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP + INTERVAL '1 hour',
  'PUBLISHED',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT DO NOTHING;

-- ============================================
-- 9. INSERT SAMPLE QUESTIONS
-- ============================================

-- Question for Algebra test
INSERT INTO questions (
  id, "testId", "questionText", "optionA", "optionB", "optionC", "optionD", 
  "correctOption", "marks", "createdAt", "updatedAt"
)
VALUES (
  'q-001',
  'test-001',
  'What is the solution of x + 5 = 10?',
  'x = 5',
  'x = 15',
  'x = -5',
  'x = 0',
  'A',
  10,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT DO NOTHING;

-- Question for Physics test
INSERT INTO questions (
  id, "testId", "questionText", "optionA", "optionB", "optionC", "optionD", 
  "correctOption", "marks", "createdAt", "updatedAt"
)
VALUES (
  'q-002',
  'test-002',
  'Which is Newton''s first law of motion?',
  'Force = mass × acceleration',
  'An object in motion stays in motion unless acted upon',
  'Action and reaction are equal',
  'Objects fall at same speed',
  'B',
  10,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT DO NOTHING;

-- ============================================

-- View all users
SELECT '--- USERS ---' as info;
SELECT id, email, "firstName", "lastName", phone FROM users;

-- View all coaching centres
SELECT '--- COACHING CENTRES ---' as info;
SELECT id, name, description FROM coaching_centres;

-- View all coaching users (with details)
SELECT '--- COACHING USERS (Memberships) ---' as info;
SELECT 
  cu.id, 
  u.email as user_email,
  cu.role,
  c.name as coaching_name
FROM coaching_users cu
JOIN users u ON cu."userId" = u.id
JOIN coaching_centres c ON cu."coachingId" = c.id;

-- View all batches
SELECT '--- BATCHES ---' as info;
SELECT id, name, description FROM batches;

-- View batch teachers
SELECT '--- BATCH TEACHERS ---' as info;
SELECT 
  bt.id,
  u.email as teacher_email,
  b.name as batch_name
FROM batch_teachers bt
JOIN users u ON bt."teacherId" = u.id
JOIN batches b ON bt."batchId" = b.id;

-- View student profiles
SELECT '--- STUDENT PROFILES ---' as info;
SELECT 
  sp.id,
  u.email as student_email,
  b.name as batch_name,
  sp."parentName",
  sp."gradeLevel"
FROM student_profiles sp
JOIN users u ON sp."userId" = u.id
JOIN batches b ON sp."batchId" = b.id;

-- View fees
SELECT '--- FEES ---' as info;
SELECT 
  f.id,
  u.email as student_email,
  f.amount,
  f.status,
  f."dueDate"
FROM fees f
JOIN users u ON f."studentId" = u.id;
