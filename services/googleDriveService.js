const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const getOAuthClient = () => {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google Drive OAuth environment variables are not configured');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
};

const getEncryptionKey = () => {
  const seed = process.env.DRIVE_TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET || 'change-this-secret';
  return crypto.createHash('sha256').update(seed).digest();
};

const encryptText = (plainText) => {
  const iv = crypto.randomBytes(12);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
};

const decryptText = (cipherText) => {
  const buffer = Buffer.from(cipherText, 'base64');
  const iv = buffer.subarray(0, 12);
  const authTag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
};

const signStateToken = (payload) => {
  const secret = process.env.DRIVE_STATE_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('DRIVE_STATE_SECRET or JWT_SECRET is required');
  }

  const stateTtl = process.env.DRIVE_STATE_TOKEN_TTL || '30m';

  return jwt.sign(payload, secret, { expiresIn: stateTtl });
};

const verifyStateToken = (token) => {
  const secret = process.env.DRIVE_STATE_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('DRIVE_STATE_SECRET or JWT_SECRET is required');
  }

  const clockToleranceSeconds = Number(process.env.DRIVE_STATE_CLOCK_TOLERANCE_SEC || 120);
  return jwt.verify(token, secret, { clockTolerance: clockToleranceSeconds });
};

const deprecatedTeacherDriveError = () => {
  throw new Error('Teacher-level Google Drive auth is deprecated. Use developer drive configuration only.');
};

const createDriveConnectionAuthUrl = async () => deprecatedTeacherDriveError();
const handleDriveOAuthCallback = async () => deprecatedTeacherDriveError();
const getDriveConnectionStatus = async () => ({ connected: false, deprecated: true });

const getDriveClientForTeacher = async () => {
  deprecatedTeacherDriveError();
};

const getDeveloperDriveClient = async () => {
  const refreshToken = process.env.DEVELOPER_DRIVE_REFRESH_TOKEN;

  if (!refreshToken) {
    throw new Error('DEVELOPER_DRIVE_REFRESH_TOKEN is not configured in environment variables');
  }

  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return google.drive({ version: 'v3', auth: oauth2Client });
};

const setDriveFilePermissions = async (drive, fileId) => {
  await drive.permissions.create({
    fileId,
    requestBody: {
      role: 'reader',
      type: 'anyone'
    }
  });
};

module.exports = {
  createDriveConnectionAuthUrl,
  handleDriveOAuthCallback,
  getDriveConnectionStatus,
  getDriveClientForTeacher,
  getDeveloperDriveClient,
  setDriveFilePermissions,
  encryptText,
  decryptText,
  signStateToken,
  verifyStateToken
};
