  
CREATE TABLE plans (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    max_students INTEGER,
    max_batches INTEGER,
    max_teachers INTEGER
);
 

--- coaching_subscriptions

  
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

    provider TEXT DEFAULT 'revenuecat',
    revenuecat_app_user_id TEXT,
    entitlement_id TEXT,
    product_id TEXT,
    original_transaction_id TEXT,
    expires_at TIMESTAMP,

    last_event_type TEXT,
    last_event_at TIMESTAMP,
    metadata JSONB
);

--- subscription_events
  
CREATE TABLE subscription_events (
    id SERIAL PRIMARY KEY,
    coaching_center_id INTEGER REFERENCES coaching_centers(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    provider_event_id TEXT UNIQUE NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB,
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_subscription_events_center_processed
ON subscription_events(coaching_center_id, processed_at);
 


# **USERS & AUTH**

--- users

  
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
 

---

--- device_tokens

  
CREATE TABLE device_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    platform TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    app_version TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_device_tokens_user_active
ON device_tokens(user_id, is_active);

--- access_codes
 
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

--- join_requests
  
CREATE TABLE join_requests (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT CHECK (role IN ('STUDENT','TEACHER')) NOT NULL,
    coaching_center_id INTEGER REFERENCES coaching_centers(id) ON DELETE CASCADE,

    status TEXT CHECK (status IN ('PENDING','APPROVED','REJECTED','EXPIRED')) DEFAULT 'PENDING',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,

    UNIQUE(email, coaching_center_id, role)
);

CREATE INDEX idx_join_requests_status ON join_requests(status);
CREATE INDEX idx_join_requests_expires_at ON join_requests(expires_at);
CREATE INDEX idx_join_requests_owner_queue
ON join_requests(coaching_center_id, role, status, created_at);

# **ACADEMICS**

--- batches
  
CREATE TABLE batches (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    coaching_center_id INTEGER REFERENCES coaching_centers(id) ON DELETE CASCADE,
    price INTEGER DEFAULT 0,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_batches_center ON batches(coaching_center_id);

--- subjects
  
CREATE TABLE subjects (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    coaching_center_id INTEGER REFERENCES coaching_centers(id) ON DELETE CASCADE
);

CREATE INDEX idx_subjects_center ON subjects(coaching_center_id);

--- batch_subjects

CREATE TABLE batch_subjects (
    id SERIAL PRIMARY KEY,
    batch_id INTEGER REFERENCES batches(id) ON DELETE CASCADE,
    subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
    teacher_id INTEGER REFERENCES users(id)
);

--- batch_students
  
CREATE TABLE batch_students (
    id SERIAL PRIMARY KEY,
    batch_id INTEGER REFERENCES batches(id) ON DELETE CASCADE,
    student_id INTEGER REFERENCES users(id),
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_batch_students_batch ON batch_students(batch_id);

--- batch_schedule
  
CREATE TABLE batch_schedule (
    id SERIAL PRIMARY KEY,
    batch_id INTEGER REFERENCES batches(id) ON DELETE CASCADE,
    subject_id INTEGER REFERENCES subjects(id),
    teacher_id INTEGER REFERENCES users(id),
    day_of_week INTEGER,
    start_time TIME,
    end_time TIME
);

--- lectures + attendance
  
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

--- # **TEST SYSTEM (CORE + AI MERGED)**

--- tests

  
CREATE TABLE tests (
    id SERIAL PRIMARY KEY,
    title TEXT,
    subject_id INTEGER REFERENCES subjects(id),
    coaching_center_id INTEGER REFERENCES coaching_centers(id),

    duration_minutes INTEGER,
    start_time TIMESTAMP,
    end_time TIMESTAMP,

    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    results_published BOOLEAN DEFAULT FALSE,

    mode TEXT DEFAULT 'PRACTICE',
    total_marks INTEGER DEFAULT 100,
    negative_marking FLOAT DEFAULT 0,
    show_answers BOOLEAN DEFAULT TRUE
);
 

---

--- questions (final merged)

  
CREATE TABLE questions (
    id SERIAL PRIMARY KEY,
    test_id INTEGER REFERENCES tests(id) ON DELETE CASCADE,

    question TEXT NOT NULL,

    option_a TEXT,
    option_b TEXT,
    option_c TEXT,
    option_d TEXT,
    correct_option CHAR(1),

    marks INTEGER DEFAULT 1,

    coaching_center_id INTEGER REFERENCES coaching_centers(id),
    syllabus_id INTEGER,
    ai_generation_id INTEGER,
    topic_id INTEGER,
    subject_id INTEGER,
    created_by INTEGER,

    is_from_bank BOOLEAN DEFAULT FALSE,
    usage_count INTEGER DEFAULT 0,
    difficulty_rating TEXT DEFAULT 'MEDIUM',
    explanation TEXT,

    correct_option_ids INTEGER[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

--- test_attempts
  
CREATE TABLE test_attempts (
    id SERIAL PRIMARY KEY,
    test_id INTEGER REFERENCES tests(id) ON DELETE CASCADE,
    student_id INTEGER REFERENCES users(id),
    batch_id INTEGER REFERENCES batches(id),

    coaching_center_id INTEGER REFERENCES coaching_centers(id),

    score INTEGER,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    time_taken_seconds INTEGER,
    max_submissions INTEGER DEFAULT 1,
    submission_count INTEGER DEFAULT 1,
    results_published BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(test_id, student_id)
);


--- test_attempt_answers

  
CREATE TABLE test_attempt_answers (
    id SERIAL PRIMARY KEY,
    attempt_id INTEGER REFERENCES test_attempts(id) ON DELETE CASCADE,
    question_id INTEGER REFERENCES questions(id),

    selected_option_ids INTEGER[],
    correct_option_ids INTEGER[],

    is_correct BOOLEAN,
    marks_awarded FLOAT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
 

--- test_questions


CREATE TABLE test_questions (
    id SERIAL PRIMARY KEY,
    test_id INTEGER REFERENCES tests(id) ON DELETE CASCADE,
    question_id INTEGER REFERENCES questions(id) ON DELETE CASCADE,
    question_order INTEGER,
    marks INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


--- AI TEST STUDIO

----- syllabuses

CREATE TABLE syllabuses (
    id SERIAL PRIMARY KEY,
    coaching_center_id INTEGER REFERENCES coaching_centers(id) ON DELETE CASCADE,
    batch_id INTEGER,
    subject_id INTEGER,
    uploaded_by INTEGER REFERENCES users(id),

    name TEXT,
    version INTEGER DEFAULT 1,
    storage_urls JSONB,
    extracted_text TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


--- ai_generations

CREATE TABLE ai_generations (
    id SERIAL PRIMARY KEY,
    coaching_center_id INTEGER REFERENCES coaching_centers(id),
    teacher_id INTEGER REFERENCES users(id),
    syllabus_id INTEGER REFERENCES syllabuses(id),

    num_questions INTEGER,
    difficulty_dist JSONB,
    marks_per_q INTEGER,
    negative_marking FLOAT,

    status TEXT DEFAULT 'PENDING',
    attempt_count INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,

    last_attempt_at TIMESTAMP,
    error_message TEXT,
    raw_ai_response TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);


--- topics

CREATE TABLE topics (
    id SERIAL PRIMARY KEY,
    coaching_center_id INTEGER REFERENCES coaching_centers(id),
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    usage_count INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(coaching_center_id, normalized_name)
);


--- FINANCE
-------- fees + payments


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


--- payment_claims

CREATE TABLE payment_claims (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES users(id),
    batch_id INTEGER REFERENCES batches(id),
    coaching_center_id INTEGER REFERENCES coaching_centers(id),

    amount INTEGER,
    expected_amount INTEGER,

    status TEXT DEFAULT 'PENDING',

    note TEXT,
    proof_url TEXT,

    verified_by INTEGER,
    verified_at TIMESTAMP,
    approved_by INTEGER,
    approved_at TIMESTAMP,

    rejected_reason TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


--- COMMUNICATION + STORAGE

------------- notices

CREATE TABLE notices (
    id SERIAL PRIMARY KEY,
    title TEXT,
    content TEXT,
    coaching_center_id INTEGER,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


--------- documents ----------------


CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    title TEXT,

    storage_provider TEXT DEFAULT 'r2',
    storage_object_key TEXT,
    file_url TEXT,

    batch_id INTEGER,
    subject_id INTEGER,
    lecture_id INTEGER,
    test_id INTEGER,

    uploaded_by INTEGER,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


