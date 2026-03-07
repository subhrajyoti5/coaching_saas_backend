const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
const prisma = require('../config/database');

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

  return jwt.sign(payload, secret, { expiresIn: '10m' });
};

const verifyStateToken = (token) => {
  const secret = process.env.DRIVE_STATE_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('DRIVE_STATE_SECRET or JWT_SECRET is required');
  }
  return jwt.verify(token, secret);
};

const createDriveConnectionAuthUrl = async ({ userId, coachingId }) => {
  const oauth2Client = getOAuthClient();
  const state = signStateToken({ userId, coachingId });

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [DRIVE_SCOPE, 'email', 'profile'],
    state,
    include_granted_scopes: true
  });

  return authUrl;
};

const handleDriveOAuthCallback = async ({ code, state }) => {
  const decoded = verifyStateToken(state);
  const { userId, coachingId } = decoded;

  const oauth2Client = getOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error('Google did not return a refresh token. Reconnect with consent prompt.');
  }

  oauth2Client.setCredentials({ access_token: tokens.access_token });
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const me = await oauth2.userinfo.get();
  const googleAccountEmail = (me.data.email || '').toLowerCase();

  if (!googleAccountEmail) {
    throw new Error('Unable to fetch Google account email from OAuth response');
  }

  const encryptedRefreshToken = encryptText(tokens.refresh_token);

  const connection = await prisma.googleDriveConnection.upsert({
    where: { userId_coachingId: { userId, coachingId } },
    update: {
      googleAccountEmail,
      encryptedRefreshToken,
      scope: tokens.scope || DRIVE_SCOPE,
      revokedAt: null
    },
    create: {
      userId,
      coachingId,
      googleAccountEmail,
      encryptedRefreshToken,
      scope: tokens.scope || DRIVE_SCOPE,
      revokedAt: null
    }
  });

  return connection;
};

const getDriveConnectionStatus = async ({ userId, coachingId }) => {
  const connection = await prisma.googleDriveConnection.findFirst({
    where: {
      userId,
      coachingId,
      revokedAt: null
    }
  });

  if (!connection) {
    return { connected: false };
  }

  return {
    connected: true,
    googleAccountEmail: connection.googleAccountEmail,
    connectedAt: connection.connectedAt
  };
};

const getDriveClientForTeacher = async ({ userId, coachingId }) => {
  const connection = await prisma.googleDriveConnection.findFirst({
    where: {
      userId,
      coachingId,
      revokedAt: null
    }
  });

  if (!connection) {
    throw new Error('Google Drive is not connected for this teacher');
  }

  const refreshToken = decryptText(connection.encryptedRefreshToken);
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return {
    drive: google.drive({ version: 'v3', auth: oauth2Client }),
    connection
  };
};

module.exports = {
  createDriveConnectionAuthUrl,
  handleDriveOAuthCallback,
  getDriveConnectionStatus,
  getDriveClientForTeacher
};
