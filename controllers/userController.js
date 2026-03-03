const userService = require('../services/userService');
const { HTTP_STATUS, SUCCESS_MESSAGES } = require('../config/constants');

const getUsersByCoaching = async (req, res) => {
  try {
    const { coachingId } = req.params;
    const users = await userService.getUsersByCoaching(coachingId);
    return res.status(HTTP_STATUS.SUCCESS).json({ users });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch users',
      message: error.message
    });
  }
};

const assignUserToCoaching = async (req, res) => {
  try {
    const { userId, coachingId } = req.body;
    const assignedBy = req.user.userId;
    const assignment = await userService.assignUserToCoaching(userId, coachingId, assignedBy);
    return res.status(HTTP_STATUS.SUCCESS).json({
      message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
      assignment
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to assign user to coaching',
      message: error.message
    });
  }
};

const removeUserFromCoaching = async (req, res) => {
  try {
    const { userId, coachingId } = req.body;
    const result = await userService.removeUserFromCoaching(userId, coachingId, req.user.userId);
    return res.status(HTTP_STATUS.SUCCESS).json(result);
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to remove user from coaching',
      message: error.message
    });
  }
};

const getUserById = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await userService.getUserWithCoachingInfo(userId);
    return res.status(HTTP_STATUS.SUCCESS).json({ user });
  } catch (error) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      error: 'User not found',
      message: error.message
    });
  }
};

const updateUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const updateData = { ...req.body };

    // Prevent sensitive updates
    delete updateData.role;
    delete updateData.email;
    delete updateData.id;

    const updatedUser = await userService.updateUserProfile(userId, updateData, req.user.userId);
    return res.status(HTTP_STATUS.SUCCESS).json({
      message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
      user: updatedUser
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to update user profile',
      message: error.message
    });
  }
};

const deactivateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    await userService.deactivateUser(userId, req.user.userId);
    return res.status(HTTP_STATUS.SUCCESS).json({
      message: 'User deactivated successfully'
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to deactivate user',
      message: error.message
    });
  }
};

module.exports = {
  getUsersByCoaching,
  assignUserToCoaching,
  removeUserFromCoaching,
  getUserById,
  updateUserProfile,
  deactivateUser
};