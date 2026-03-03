const noticeService = require('../services/noticeService');
const { HTTP_STATUS, SUCCESS_MESSAGES } = require('../config/constants');

const createNotice = async (req, res) => {
  try {
    const notice = await noticeService.createNotice(
      req.body,
      req.user.userId,
      req.user.role
    );

    return res.status(HTTP_STATUS.CREATED).json({
      message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
      notice
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to create notice',
      message: error.message
    });
  }
};

const getNotice = async (req, res) => {
  try {
    const { noticeId } = req.params;
    const notice = await noticeService.getNoticeById(noticeId);
    return res.status(HTTP_STATUS.SUCCESS).json({ notice });
  } catch (error) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      error: 'Notice not found',
      message: error.message
    });
  }
};

const getNoticesByCoaching = async (req, res) => {
  try {
    const coachingId = req.coachingId || req.params.coachingId;
    const { batchId } = req.query; // Optional batch filter
    const notices = await noticeService.getNoticesByCoaching(coachingId, batchId || null);

    return res.status(HTTP_STATUS.SUCCESS).json({ notices });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch notices',
      message: error.message
    });
  }
};

// GET /my-notices (Student identity from JWT)
const getMyNotices = async (req, res) => {
  try {
    const { userId, coachingId } = req.user;
    const notices = await noticeService.getMyNotices(userId, coachingId);
    return res.status(HTTP_STATUS.SUCCESS).json({ notices });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch notices for student',
      message: error.message
    });
  }
};

// GET /my-batch-notices (Teacher identity from JWT)
const getMyTeacherNotices = async (req, res) => {
  try {
    const { userId, coachingId } = req.user;
    const notices = await noticeService.getTeacherNotices(userId, coachingId);
    return res.status(HTTP_STATUS.SUCCESS).json({ notices });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch notices for teacher',
      message: error.message
    });
  }
};

const updateNotice = async (req, res) => {
  try {
    const { noticeId } = req.params;
    const notice = await noticeService.updateNotice(
      noticeId,
      req.body,
      req.user.userId,
      req.user.role
    );

    return res.status(HTTP_STATUS.SUCCESS).json({
      message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
      notice
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to update notice',
      message: error.message
    });
  }
};

const deleteNotice = async (req, res) => {
  try {
    const { noticeId } = req.params;
    const result = await noticeService.deleteNotice(
      noticeId,
      req.user.userId,
      req.user.role
    );
    return res.status(HTTP_STATUS.SUCCESS).json(result);
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to delete notice',
      message: error.message
    });
  }
};

module.exports = {
  createNotice,
  getNotice,
  getNoticesByCoaching,
  getMyNotices,
  getMyTeacherNotices,
  updateNotice,
  deleteNotice
};