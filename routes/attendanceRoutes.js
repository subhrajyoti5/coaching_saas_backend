const express = require('express');
const router = express.Router();

const {
  getMyTeacherBatches,
  markBatchAttendance,
  getBatchAttendanceByDate,
  updateAttendance,
  getMyAttendance,
  getCoachingAttendanceSummary,
} = require('../controllers/attendanceController');
const { authenticateToken } = require('../middleware/auth');
const { ownerOnly, teacherOrOwner, studentOnly } = require('../middleware/roles');
const {
  validateMarkBatchAttendance,
  validateUpdateAttendance,
} = require('../middleware/validation');

router.get('/my-batches', authenticateToken, teacherOrOwner, getMyTeacherBatches);
router.post('/mark-batch', authenticateToken, teacherOrOwner, validateMarkBatchAttendance, markBatchAttendance);
router.get('/batch/:batchId', authenticateToken, teacherOrOwner, getBatchAttendanceByDate);
router.put('/:attendanceId', authenticateToken, teacherOrOwner, validateUpdateAttendance, updateAttendance);

router.get('/my-attendance', authenticateToken, studentOnly, getMyAttendance);
router.get('/coaching-summary', authenticateToken, ownerOnly, getCoachingAttendanceSummary);

module.exports = router;
