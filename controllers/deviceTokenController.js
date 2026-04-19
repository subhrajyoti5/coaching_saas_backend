const prisma = require('../config/database');
const { HTTP_STATUS } = require('../config/constants');
const notificationService = require('../services/notificationService');

const registerDeviceToken = async (req, res) => {
  try {
    const { token, platform, appVersion } = req.body;
    if (!token || !platform) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Invalid payload',
        message: 'token and platform are required'
      });
    }

    const userId = Number(req.user.userId);

    const existing = await prisma.deviceToken.findUnique({ where: { token } });

    if (existing) {
      const updated = await prisma.deviceToken.update({
        where: { token },
        data: {
          user_id: userId,
          platform: String(platform).toLowerCase(),
          app_version: appVersion || null,
          is_active: true,
          last_seen_at: new Date(),
          updated_at: new Date()
        }
      });

      return res.status(HTTP_STATUS.SUCCESS).json({
        message: 'Device token updated',
        deviceToken: updated
      });
    }

    const created = await prisma.deviceToken.create({
      data: {
        user_id: userId,
        token,
        platform: String(platform).toLowerCase(),
        app_version: appVersion || null,
        is_active: true,
        last_seen_at: new Date()
      }
    });

    return res.status(HTTP_STATUS.CREATED).json({
      message: 'Device token registered',
      deviceToken: created
    });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to register device token',
      message: error.message
    });
  }
};

const deactivateDeviceToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Invalid payload',
        message: 'token is required'
      });
    }

    await prisma.deviceToken.updateMany({
      where: {
        token,
        user_id: Number(req.user.userId)
      },
      data: {
        is_active: false,
        updated_at: new Date()
      }
    });

    return res.status(HTTP_STATUS.SUCCESS).json({
      message: 'Device token deactivated'
    });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to deactivate device token',
      message: error.message
    });
  }
};

const getNotificationDiagnostics = async (req, res) => {
  try {
    const coachingId = req.coachingId || req.user?.coachingId;
    const diagnostics = await notificationService.getNotificationDiagnostics({ coachingId });

    return res.status(HTTP_STATUS.SUCCESS).json({
      message: 'Notification diagnostics retrieved',
      diagnostics
    });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to retrieve notification diagnostics',
      message: error.message
    });
  }
};

const sendTestPush = async (req, res) => {
  try {
    const requestedUserId = Number(req.body?.userId);
    const fallbackUserId = Number(req.user?.userId);
    const targetUserId = requestedUserId || fallbackUserId;

    if (!targetUserId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Invalid payload',
        message: 'userId is required'
      });
    }

    const pushResult = await notificationService.sendPushToUsers({
      userIds: [targetUserId],
      title: 'Shixa Test Notification',
      body: 'This is a delivery test from backend diagnostics.',
      data: {
        type: 'diagnostic_test',
        userId: targetUserId,
        triggeredBy: Number(req.user?.userId) || '',
        timestamp: new Date().toISOString()
      },
      androidTag: `diagnostic_${targetUserId}`
    });

    return res.status(HTTP_STATUS.SUCCESS).json({
      message: 'Test push attempted',
      targetUserId,
      result: pushResult
    });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to send test push',
      message: error.message
    });
  }
};

module.exports = {
  registerDeviceToken,
  deactivateDeviceToken,
  getNotificationDiagnostics,
  sendTestPush
};
