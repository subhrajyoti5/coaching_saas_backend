const { HTTP_STATUS } = require('../config/constants');
const { audit } = require('../utils/auditLogger');
const {
  createDriveConnectionAuthUrl,
  handleDriveOAuthCallback,
  getDriveConnectionStatus
} = require('../services/googleDriveService');

const getDriveConnectUrl = async (req, res) => {
  try {
    const { userId, coachingId } = req.user;
    const connectUrl = await createDriveConnectionAuthUrl({ userId, coachingId });
    return res.status(HTTP_STATUS.SUCCESS).json({ connectUrl });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to initialize Google Drive connection',
      message: error.message
    });
  }
};

const handleDriveCallback = async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Invalid callback request',
        message: 'code and state are required'
      });
    }

    const connection = await handleDriveOAuthCallback({ code, state });
    await audit({
      userId: connection.userId,
      action: 'CONNECT_GOOGLE_DRIVE',
      entityType: 'GOOGLE_DRIVE_CONNECTION',
      entityId: connection.id,
      metadata: { coachingId: connection.coachingId }
    });

    const successRedirect = process.env.FRONTEND_DRIVE_CONNECTED_REDIRECT;
    if (successRedirect) {
      return res.redirect(successRedirect);
    }

    return res.status(HTTP_STATUS.SUCCESS).json({
      message: 'Google Drive connected successfully',
      connected: true,
      googleAccountEmail: connection.googleAccountEmail
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Google Drive callback failed',
      message: error.message
    });
  }
};

const getDriveStatus = async (req, res) => {
  try {
    const { userId, coachingId } = req.user;
    const status = await getDriveConnectionStatus({ userId, coachingId });
    return res.status(HTTP_STATUS.SUCCESS).json(status);
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch Google Drive status',
      message: error.message
    });
  }
};

module.exports = {
  getDriveConnectUrl,
  handleDriveCallback,
  getDriveStatus
};
