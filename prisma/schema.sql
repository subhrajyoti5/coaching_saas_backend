-- FK-ordered schema for Coaching Institute Management Platform

CREATE TABLE coaching_centers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    owner_user_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE plans (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    max_students INTEGER,
    max_batches INTEGER,
    max_teachers INTEGER
);

CREATE TABLE coaching_subscriptions (
    id SERIAL PRIMARY KEY,
    coaching_center_id INTEGER REFERENCES coaching_centers(id) ON DELETE CASCADE,
    plan_id INTEGER REFERENCES plans(id),
    start_date DATE,
    end_date DATE,
    status TEXT,
    razorpay_subscription_id TEXT UNIQUE,
    razorpay_plan_id TEXT,
    razorpay_customer_id TEXT,
    current_start TIMESTAMP,
    current_end TIMESTAMP,
    grace_end TIMESTAMP,
    cancel_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    payment_fail_count INTEGER DEFAULT 0,
    metadata JSONB
);

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    role TEXT CHECK (role IN ('OWNER','TEACHER','STUDENT')) NOT NULL,
    coaching_center_id INTEGER REFERENCES coaching_centers(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    trial_active BOOLEAN DEFAULT FALSE,
    trial_end TIMESTAMP,
    subscription_status TEXT DEFAULT 'inactive',
    subscription_id TEXT,
    current_period_end TIMESTAMP,
    grace_period_end TIMESTAMP,
    plan_type TEXT DEFAULT 'basic'
);

CREATE INDEX idx_users_center ON users(coaching_center_id);
CREATE UNIQUE INDEX uniq_users_email_center ON users(email, coaching_center_id);

CREATE TABLE device_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    platform TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    app_version TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_device_tokens_user_active ON device_tokens(user_id, is_active);

CREATE TABLE access_codes (
    id SERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    role TEXT CHECK (role IN ('STUDENT','TEACHER')) NOT NULL,
    coaching_center_id INTEGER REFERENCES coaching_centers(id) ON DELETE CASCADE,
    expires_at TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_access_codes_center_role_active_expiry
ON access_codes(coaching_center_id, role, is_active, expires_at);

CREATE TABLE join_requests (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT CHECK (role IN ('STUDENT','TEACHER')) NOT NULL,
    coaching_center_id INTEGER REFERENCES coaching_centers(id) ON DELETE CASCADE,
    status TEXT CHECK (status IN ('PENDING','APPROVED','REJECTED','EXPIRED')) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    UNIQUE(email, coaching_center_id, role)
);

CREATE INDEX idx_join_requests_status ON join_requests(status);
CREATE INDEX idx_join_requests_expires_at ON join_requests(expires_at);
CREATE INDEX idx_join_requests_owner_queue
ON join_requests(coaching_center_id, role, status, created_at);

CREATE TABLE batches (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    coaching_center_id INTEGER REFERENCES coaching_centers(id) ON DELETE CASCADE,
    price INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE subjects (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    coaching_center_id INTEGER REFERENCES coaching_centers(id) ON DELETE CASCADE
);

CREATE TABLE batch_subjects (
    id SERIAL PRIMARY KEY,
    batch_id INTEGER REFERENCES batches(id) ON DELETE CASCADE,
    subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
    teacher_id INTEGER REFERENCES users(id)
);

CREATE TABLE batch_students (
    id SERIAL PRIMARY KEY,
    batch_id INTEGER REFERENCES batches(id) ON DELETE CASCADE,
    student_id INTEGER REFERENCES users(id),
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_batch_students_batch ON batch_students(batch_id);

CREATE TABLE batch_schedule (
    id SERIAL PRIMARY KEY,
    batch_id INTEGER REFERENCES batches(id) ON DELETE CASCADE,
    subject_id INTEGER REFERENCES subjects(id),
    teacher_id INTEGER REFERENCES users(id),
    day_of_week INTEGER,
    start_time TIME,
    end_time TIME
);

CREATE TABLE lectures (
    id SERIAL PRIMARY KEY,
    batch_id INTEGER REFERENCES batches(id) ON DELETE CASCADE,
    subject_id INTEGER REFERENCES subjects(id),
    teacher_id INTEGER REFERENCES users(id),
    lecture_date DATE,
    start_time TIME,
    end_time TIME,
    topic TEXT
);

CREATE TABLE attendance (
    id SERIAL PRIMARY KEY,
    lecture_id INTEGER REFERENCES lectures(id) ON DELETE CASCADE,
    student_id INTEGER REFERENCES users(id),
    status TEXT CHECK (status IN ('PRESENT','ABSENT','LATE')),
    marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_attendance_lecture ON attendance(lecture_id);

CREATE TABLE tests (
    id SERIAL PRIMARY KEY,
    title TEXT,
    subject_id INTEGER REFERENCES subjects(id),
    coaching_center_id INTEGER REFERENCES coaching_centers(id),
    duration_minutes INTEGER,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    results_published BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE test_batches (
    id SERIAL PRIMARY KEY,
    test_id INTEGER REFERENCES tests(id) ON DELETE CASCADE,
    batch_id INTEGER REFERENCES batches(id) ON DELETE CASCADE
);

CREATE TABLE questions (
    id SERIAL PRIMARY KEY,
    test_id INTEGER REFERENCES tests(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    option_a TEXT,
    option_b TEXT,
    option_c TEXT,
    option_d TEXT,
    correct_option CHAR(1),
    marks INTEGER DEFAULT 1
);

CREATE TABLE test_attempts (
    id SERIAL PRIMARY KEY,
    test_id INTEGER REFERENCES tests(id) ON DELETE CASCADE,
    student_id INTEGER REFERENCES users(id),
    batch_id INTEGER REFERENCES batches(id),
    score INTEGER,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(test_id, student_id)
);

CREATE INDEX idx_test_score ON test_attempts(test_id, score DESC);

CREATE TABLE test_answers (
    id SERIAL PRIMARY KEY,
    attempt_id INTEGER REFERENCES test_attempts(id) ON DELETE CASCADE,
    question_id INTEGER REFERENCES questions(id),
    selected_option CHAR(1),
    is_correct BOOLEAN,
    marks_awarded INTEGER
);

CREATE TABLE fees (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES users(id),
    batch_id INTEGER REFERENCES batches(id),
    total_fee INTEGER,
    due_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    fee_id INTEGER REFERENCES fees(id) ON DELETE CASCADE,
    amount INTEGER,
    paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    recorded_by INTEGER REFERENCES users(id)
);

CREATE TABLE payment_claims (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(id),
    batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    coaching_center_id INTEGER NOT NULL REFERENCES coaching_centers(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    expected_amount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    note TEXT,
    proof_url TEXT,
    verified_by INTEGER REFERENCES users(id),
    verified_at TIMESTAMP,
    approved_by INTEGER REFERENCES users(id),
    approved_at TIMESTAMP,
    rejected_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notices (
    id SERIAL PRIMARY KEY,
    title TEXT,
    content TEXT,
    coaching_center_id INTEGER REFERENCES coaching_centers(id),
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notice_targets (
    id SERIAL PRIMARY KEY,
    notice_id INTEGER REFERENCES notices(id) ON DELETE CASCADE,
    batch_id INTEGER REFERENCES batches(id) ON DELETE CASCADE
);

CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    title TEXT,
    drive_file_id TEXT,
    batch_id INTEGER REFERENCES batches(id),
    subject_id INTEGER REFERENCES subjects(id),
    lecture_id INTEGER REFERENCES lectures(id),
    test_id INTEGER REFERENCES tests(id),
    uploaded_by INTEGER REFERENCES users(id),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_batches_center ON batches(coaching_center_id);
CREATE INDEX idx_subjects_center ON subjects(coaching_center_id);
CREATE INDEX idx_tests_subject ON tests(subject_id);
CREATE INDEX idx_test_answers_attempt ON test_answers(attempt_id);
CREATE INDEX idx_payments_fee ON payments(fee_id);
CREATE INDEX idx_payment_claims_student ON payment_claims(student_id);
CREATE INDEX idx_payment_claims_coaching_status ON payment_claims(coaching_center_id, status);
CREATE INDEX idx_payment_claims_batch ON payment_claims(batch_id);
CREATE INDEX idx_payment_claims_student_status_created ON payment_claims(student_id, status, created_at);
CREATE INDEX idx_payment_claims_student_created ON payment_claims(student_id, created_at);

-- ------------------------------------------------------------
-- Incremental patch for already-running databases
-- (safe to run even if table/index already exists)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS device_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    platform TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    app_version TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user_active
ON device_tokens(user_id, is_active);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE INDEX IF NOT EXISTS idx_payment_claims_student_status_created
ON payment_claims(student_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_payment_claims_student_created
ON payment_claims(student_id, created_at);
