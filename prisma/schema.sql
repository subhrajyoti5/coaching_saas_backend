-- Create Database Schema for Coaching Management System
-- Execute with: psql -U postgres -h localhost -d coaching_management -f schema.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create ENUM types
CREATE TYPE "CoachingRole" AS ENUM ('OWNER', 'TEACHER', 'STUDENT');
CREATE TYPE "FeeStatus" AS ENUM ('PAID', 'PARTIAL', 'PENDING');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'OTHER');
CREATE TYPE "AttemptStatus" AS ENUM ('STARTED', 'SUBMITTED');

-- Users table
CREATE TABLE IF NOT EXISTS "users" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "email" VARCHAR(255) UNIQUE NOT NULL,
  "password" VARCHAR(255) NOT NULL,
  "firstName" VARCHAR(100) NOT NULL,
  "lastName" VARCHAR(100) NOT NULL,
  "phone" VARCHAR(20),
  "isActive" BOOLEAN DEFAULT true,
  "deletedAt" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Refresh Tokens table
CREATE TABLE IF NOT EXISTS "refresh_tokens" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token" VARCHAR(500) UNIQUE NOT NULL,
  "expiresAt" TIMESTAMP NOT NULL,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Coaching Centers table
CREATE TABLE IF NOT EXISTS "coaching_centres" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "ownerId" UUID NOT NULL REFERENCES "users"("id"),
  "isActive" BOOLEAN DEFAULT true,
  "deletedAt" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Coaching Users (Memberships) table
CREATE TABLE IF NOT EXISTS "coaching_users" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "coachingId" UUID NOT NULL REFERENCES "coaching_centres"("id") ON DELETE CASCADE,
  "role" "CoachingRole" NOT NULL,
  "assignedBy" VARCHAR(255),
  "assignedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("userId", "coachingId")
);

-- Batches table
CREATE TABLE IF NOT EXISTS "batches" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "name" VARCHAR(255) NOT NULL,
  "coachingId" UUID NOT NULL REFERENCES "coaching_centres"("id") ON DELETE CASCADE,
  "description" TEXT,
  "isActive" BOOLEAN DEFAULT true,
  "deletedAt" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Batch Teachers table
CREATE TABLE IF NOT EXISTS "batch_teachers" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "teacherId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "batchId" UUID NOT NULL REFERENCES "batches"("id") ON DELETE CASCADE,
  "assignedBy" VARCHAR(255),
  "assignedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("teacherId", "batchId")
);

-- Student Profiles table
CREATE TABLE IF NOT EXISTS "student_profiles" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "coachingId" UUID NOT NULL REFERENCES "coaching_centres"("id") ON DELETE CASCADE,
  "batchId" UUID REFERENCES "batches"("id") ON DELETE SET NULL,
  "parentName" VARCHAR(100),
  "parentPhone" VARCHAR(20),
  "parentEmail" VARCHAR(100),
  "gradeLevel" VARCHAR(20),
  "admissionDate" DATE,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("userId", "coachingId")
);

CREATE INDEX idx_student_profiles_user ON "student_profiles"("userId");

-- Fees table
CREATE TABLE IF NOT EXISTS "fees" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "studentId" UUID NOT NULL REFERENCES "student_profiles"("id") ON DELETE CASCADE,
  "coachingId" UUID NOT NULL REFERENCES "coaching_centres"("id") ON DELETE CASCADE,
  "batchId" UUID REFERENCES "batches"("id"),
  "amount" NUMERIC(10,2) NOT NULL,
  "paidAmount" NUMERIC(10,2) DEFAULT 0,
  "feeType" VARCHAR(50),
  "dueDate" DATE,
  "status" "FeeStatus" DEFAULT 'PENDING',
  "notes" TEXT,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Fee Transactions table
CREATE TABLE IF NOT EXISTS "fee_transactions" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "feeId" UUID NOT NULL REFERENCES "fees"("id") ON DELETE CASCADE,
  "amount" NUMERIC(10,2) NOT NULL,
  "paymentMethod" "PaymentMethod" DEFAULT 'CASH',
  "referenceId" VARCHAR(100),
  "notes" TEXT,
  "recordedBy" VARCHAR(255),
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tests table
CREATE TABLE IF NOT EXISTS "tests" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "title" VARCHAR(255) NOT NULL,
  "coachingId" UUID NOT NULL REFERENCES "coaching_centres"("id") ON DELETE CASCADE,
  "batchId" UUID NOT NULL REFERENCES "batches"("id") ON DELETE CASCADE,
  "duration" INTEGER,
  "isActive" BOOLEAN DEFAULT true,
  "deletedAt" TIMESTAMP,
  "startDate" TIMESTAMP,
  "endDate" TIMESTAMP,
  "maxScore" NUMERIC(10,2),
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Questions table
CREATE TABLE IF NOT EXISTS "questions" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "testId" UUID NOT NULL REFERENCES "tests"("id") ON DELETE CASCADE,
  "questionText" TEXT NOT NULL,
  "optionA" VARCHAR(500),
  "optionB" VARCHAR(500),
  "optionC" VARCHAR(500),
  "optionD" VARCHAR(500),
  "correctAnswer" VARCHAR(1),
  "marks" NUMERIC(5,2) DEFAULT 1,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Test Attempts table
CREATE TABLE IF NOT EXISTS "test_attempts" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "testId" UUID NOT NULL REFERENCES "tests"("id") ON DELETE CASCADE,
  "studentId" UUID NOT NULL REFERENCES "student_profiles"("id") ON DELETE CASCADE,
  "status" "AttemptStatus" DEFAULT 'STARTED',
  "startedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "submittedAt" TIMESTAMP,
  UNIQUE("testId", "studentId")
);

-- Results table
CREATE TABLE IF NOT EXISTS "results" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "testId" UUID NOT NULL REFERENCES "tests"("id") ON DELETE CASCADE,
  "studentId" UUID NOT NULL REFERENCES "student_profiles"("id") ON DELETE CASCADE,
  "score" NUMERIC(10,2),
  "totalMarks" NUMERIC(10,2),
  "percentage" NUMERIC(5,2),
  "passed" BOOLEAN,
  "submittedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("testId", "studentId")
);

-- Notices table
CREATE TABLE IF NOT EXISTS "notices" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "coachingId" UUID NOT NULL REFERENCES "coaching_centres"("id") ON DELETE CASCADE,
  "batchId" UUID REFERENCES "batches"("id") ON DELETE SET NULL,
  "title" VARCHAR(255) NOT NULL,
  "content" TEXT,
  "createdBy" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "createdByRole" "CoachingRole",
  "expiresAt" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit Logs table
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "action" VARCHAR(255),
  "entityType" VARCHAR(100),
  "entityId" VARCHAR(100),
  "metadata" JSONB,
  "ipAddress" VARCHAR(45),
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX idx_coaching_users_user ON "coaching_users"("userId");
CREATE INDEX idx_coaching_users_coaching ON "coaching_users"("coachingId");
CREATE INDEX idx_batch_teachers_teacher ON "batch_teachers"("teacherId");
CREATE INDEX idx_batch_teachers_batch ON "batch_teachers"("batchId");
CREATE INDEX idx_fees_student ON "fees"("studentId");
CREATE INDEX idx_fees_coaching ON "fees"("coachingId");
CREATE INDEX idx_tests_coaching ON "tests"("coachingId");
CREATE INDEX idx_tests_batch ON "tests"("batchId");
CREATE INDEX idx_results_test ON "results"("testId");
CREATE INDEX idx_results_student ON "results"("studentId");
CREATE INDEX idx_notices_coaching ON "notices"("coachingId");
