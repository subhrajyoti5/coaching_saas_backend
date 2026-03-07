/**
 * DEPRECATED: Teacher-level Google Drive authentication has been removed.
 * All documents are now uploaded to the centralized Developer Drive account.
 * See DEVELOPER_DRIVE_SETUP.md for configuration details.
 */

const { HTTP_STATUS } = require('../config/constants');

const deprecatedEndpoint = (req, res) => {
  return res.status(HTTP_STATUS.BAD_REQUEST).json({
    error: 'Teacher Drive authentication is deprecated',
    message: 'All documents are now uploaded to the centralized Developer Drive. No teacher authentication needed.'
  });
};

module.exports = {
  deprecatedEndpoint
};
