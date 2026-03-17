const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config({ override: true });

const app = express();
const { startJoinRequestExpiryJob, stopJoinRequestExpiryJob } = require('./services/joinRequestExpiryJob');

// Trust proxy - required when behind reverse proxy (Nginx, load balancer, etc)
// This tells Express to trust X-Forwarded-For header from the proxy
app.set('trust proxy', 1);

// Import database connection
const prisma = require('./config/database');

// Security Middleware
app.use(helmet()); // Security headers

// CORS restriction: only allow from specific origins in production
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000', 'http://localhost:8000'];
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  credentials: true
}));

// Global Rate Limiter: protect from basic DoS/brute force
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: "Too many requests", message: "Please try again later" },
  standardHeaders: true,
  legacyHeaders: false
});
app.use(globalLimiter);

// Payload size limit (especially for exams/assignments)
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/onboarding', require('./routes/onboardingRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/coaching', require('./routes/coachingRoutes'));
app.use('/api/batch', require('./routes/batchRoutes'));
app.use('/api/fees', require('./routes/feeRoutes'));
app.use('/api/tests', require('./routes/testRoutes'));
app.use('/api/notices', require('./routes/noticeRoutes'));
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/drive', require('./routes/driveRoutes'));
app.use('/api/documents', require('./routes/documentRoutes'));

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Coaching Management System API is running!',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', message: 'The requested resource does not exist' });
});

// Global Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  stopJoinRequestExpiryJob();
  await prisma.$disconnect();
  process.exit(0);
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  startJoinRequestExpiryJob();
});

module.exports = app;