# Coaching Management System - Backend

This is the backend for a multi-tenant coaching & school management system built with Node.js, Express, and PostgreSQL.

## Features

- **Multi-role Support**: Owner, Teacher, and Student roles
- **Multi-coaching Support**: Users can be associated with multiple coaching centers
- **Academic Management**: Batch management, tests, and results
- **Fee Tracking**: Comprehensive fee management system
- **Notice Management**: Communication system for coaching centers
- **Google Drive Integration**: File storage for notes (to be implemented)
- **JWT Authentication**: Secure authentication with role-based access control

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Authentication**: JWT
- **File Storage**: Google Drive API (planned)

## Installation

1. Clone the repository
2. Navigate to the backend directory
3. Install dependencies:

```bash
npm install
```

4. Set up environment variables in `.env` file:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/coaching_management"
JWT_SECRET="your-super-secret-jwt-key"
JWT_EXPIRES_IN="7d"
GOOGLE_DRIVE_CLIENT_ID="your-google-drive-client-id"
GOOGLE_DRIVE_CLIENT_SECRET="your-google-drive-client-secret"
GOOGLE_DRIVE_REDIRECT_URI="http://localhost:3000/auth/google/callback"
PORT=8000
NODE_ENV=development
```

For document uploads behind nginx, set `client_max_body_size` to match or exceed `DOCUMENT_MAX_FILE_SIZE_BYTES`; otherwise nginx may return `413 Request Entity Too Large` before the request reaches Express.

5. Set up the database:

```bash
npx prisma migrate dev
```

6. Start the server:

```bash
npm run dev
```

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/profile` - Get user profile
- `GET /api/auth/coaching-centers` - Get user's coaching centers

### Coaching Management

- `POST /api/coaching` - Create a new coaching center (Owner only)
- `GET /api/coaching/:coachingId` - Get coaching center by ID
- `GET /api/coaching` - Get all coaching centers for the authenticated user
- `POST /api/coaching/add-teacher` - Add a teacher to a coaching center (Owner only)
- `POST /api/coaching/add-student` - Add a student to a coaching center (Owner only)
- `GET /api/coaching/:coachingId/teachers` - Get all teachers for a coaching center
- `GET /api/coaching/:coachingId/students` - Get all students for a coaching center

### Batch Management

- `POST /api/batch` - Create a new batch
- `GET /api/batch/:batchId` - Get batch by ID
- `GET /api/batch/coaching/:coachingId` - Get all batches for a coaching center
- `POST /api/batch/assign-teacher` - Assign a teacher to a batch
- `POST /api/batch/remove-teacher` - Remove a teacher from a batch
- `POST /api/batch/assign-student` - Assign a student to a batch
- `POST /api/batch/remove-student` - Remove a student from a batch
- `GET /api/batch/:batchId/teachers` - Get all teachers assigned to a batch
- `GET /api/batch/:batchId/students` - Get all students in a batch

### Fee Management

- `POST /api/fees` - Create a new fee record
- `PATCH /api/fees/:feeId/paid-amount` - Update paid amount for a fee record
- `GET /api/fees/student/:studentId` - Get fee records for a student
- `GET /api/fees/coaching/:coachingId` - Get fee records for a coaching center
- `GET /api/fees/coaching/:coachingId/summary` - Get fee summary for a coaching center
- `GET /api/fees/:feeId` - Get fee record by ID
- `PUT /api/fees/:feeId` - Update fee record

### Test Management

- `POST /api/tests` - Create a new test
- `GET /api/tests/:testId` - Get test by ID
- `GET /api/tests/coaching/:coachingId` - Get all tests for a coaching center
- `GET /api/tests/batch/:batchId` - Get all tests for a batch
- `POST /api/tests/question` - Add a question to a test
- `GET /api/tests/:testId/questions` - Get all questions for a test
- `POST /api/tests/submit` - Submit test answers
- `GET /api/tests/results/student/:studentId` - Get test results for a student
- `GET /api/tests/:testId/results` - Get test results for a test

### Notice Management

- `POST /api/notices` - Create a new notice
- `GET /api/notices/:noticeId` - Get notice by ID
- `GET /api/notices/coaching/:coachingId` - Get all notices for a coaching center
- `GET /api/notices/student/:studentId` - Get all notices for a student
- `GET /api/notices/teacher/:teacherId` - Get all notices for a teacher
- `PUT /api/notices/:noticeId` - Update a notice
- `DELETE /api/notices/:noticeId` - Delete a notice

### User Management

- `GET /api/users/coaching/:coachingId` - Get all users for a coaching center
- `POST /api/users/assign-to-coaching` - Assign a user to a coaching center
- `POST /api/users/remove-from-coaching` - Remove a user from a coaching center
- `GET /api/users/:userId` - Get user by ID
- `PUT /api/users/:userId` - Update user profile

## Role-Based Access Control

- **Owner**: Full access to all features within their coaching centers
- **Teacher**: Can manage batches, create tests, view results, and manage notices for assigned batches
- **Student**: Can view their assigned batches, attend tests, view results, and see notices

## Database Schema

The database schema includes the following main entities:

- **User**: Stores user information and authentication details
- **CoachingCentre**: Represents a coaching center managed by an owner
- **CoachingUser**: Junction table linking users to coaching centers
- **Batch**: Groups students and teachers within a coaching center
- **BatchTeacher**: Junction table linking teachers to batches
- **StudentProfile**: Additional information for students
- **Fee**: Tracks fee payments and dues
- **Test**: Represents an exam or assessment
- **Question**: Questions for tests
- **Result**: Stores test results
- **Notice**: Announcements and communications

## Environment Variables

- `DATABASE_URL`: PostgreSQL database connection string
- `JWT_SECRET`: Secret key for JWT token generation
- `JWT_EXPIRES_IN`: JWT token expiration time
- `GOOGLE_DRIVE_CLIENT_ID`: Google Drive API client ID
- `GOOGLE_DRIVE_CLIENT_SECRET`: Google Drive API client secret
- `GOOGLE_DRIVE_REDIRECT_URI`: Google Drive API redirect URI
- `PORT`: Port number for the server
- `NODE_ENV`: Environment mode (development/production)

## Running in Production

For production deployment:

1. Update the `.env` file with production values
2. Run database migrations:

```bash
npx prisma migrate deploy
```

3. Start the server:

```bash
npm start
```

## License

This project is licensed under the MIT License.