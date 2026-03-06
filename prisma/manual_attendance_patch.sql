DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AttendanceStatus') THEN
    CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "attendance" (
  "id" TEXT NOT NULL,
  "coachingId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "classDate" TIMESTAMP(3) NOT NULL,
  "status" "AttendanceStatus" NOT NULL DEFAULT 'ABSENT',
  "markedBy" TEXT NOT NULL,
  "remarks" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "attendance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attendance_coachingId_fkey" FOREIGN KEY ("coachingId") REFERENCES "coaching_centres"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "attendance_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "attendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "attendance_markedBy_fkey" FOREIGN KEY ("markedBy") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_studentId_batchId_classDate_key"
  ON "attendance"("studentId", "batchId", "classDate");

CREATE INDEX IF NOT EXISTS "attendance_coachingId_classDate_idx"
  ON "attendance"("coachingId", "classDate");

CREATE INDEX IF NOT EXISTS "attendance_batchId_classDate_idx"
  ON "attendance"("batchId", "classDate");

CREATE INDEX IF NOT EXISTS "attendance_studentId_classDate_idx"
  ON "attendance"("studentId", "classDate");

CREATE INDEX IF NOT EXISTS "attendance_markedBy_idx"
  ON "attendance"("markedBy");
