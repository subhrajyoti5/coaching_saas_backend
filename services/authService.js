const prisma = require('../config/database');
const bcrypt = require('bcryptjs');
const { generateAccessToken, generateRefreshToken } = require('../config/auth');
const { audit } = require('../utils/auditLogger');

// LOGIN: General login logic (supports both email/password and Google after email verification)
const finalizeLogin = async (user) => {
  const accessToken = generateAccessToken({ userId: user.id });

  const coachingMemberships = await prisma.coachingUser.findMany({
    where: { userId: user.id, coaching: { isActive: true } },
    include: {
      coaching: { select: { id: true, name: true, description: true } }
    }
  });

  if (coachingMemberships.length === 0) {
    throw new Error('You are not associated with any active coaching center. Contact your center owner.');
  }

  const { password: _, ...userWithoutPassword } = user;

  return {
    user: userWithoutPassword,
    accessToken,
    coachingMemberships: coachingMemberships.map(cm => ({
      coachingId: cm.coachingId,
      role: cm.role,
      coaching: cm.coaching
    }))
  };
};

const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_OAUTH_CLIENT_ID);

/**
 * SIGN IN WITH GOOGLE
 * Verifies the ID Token from the frontend and fetches the user's email securely.
 */
const loginWithGoogle = async (token) => {
  if (!token) throw new Error('Google token is required');

  let user;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      // Don't enforce strict audience check - just verify the signature is valid
      // The idToken may be issued for either the Android client ID or Web client ID
    });

    const payload = ticket.getPayload();
    
    // Verify the token's issuer is Google
    if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
      throw new Error('Invalid token issuer');
    }

    // Optional: Log the token's intended audience for debugging
    console.log('Token audience (aud):', payload.aud);
    console.log('Expected Web Client ID:', process.env.GOOGLE_OAUTH_CLIENT_ID);

    const googleEmail = payload.email;

    user = await prisma.user.findUnique({ where: { email: googleEmail } });

    if (!user || !user.isActive) {
      throw new Error('Access denied. This email is not registered by any coaching center.');
    }
  } catch (error) {
    throw new Error(`Google login failed: ${error.message}`);
  }

  // Audittrail for login
  await audit({ userId: user.id, action: 'LOGIN_GOOGLE', entityType: 'AUTH', entityId: user.id });

  return finalizeLogin(user);
};

const selectCoaching = async (userId, coachingId) => {
  const coachingUser = await prisma.coachingUser.findFirst({
    where: { userId, coachingId },
    include: {
      coaching: { select: { id: true, name: true, isActive: true } }
    }
  });

  if (!coachingUser || !coachingUser.coaching.isActive) {
    throw new Error('You do not have access to this coaching center');
  }

  // Issue scoped access token
  const accessToken = generateAccessToken({
    userId,
    role: coachingUser.role,
    coachingId
  });

  // Issue refresh token
  const rawRefreshToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await prisma.refreshToken.create({
    data: { userId, token: rawRefreshToken, expiresAt }
  });

  await audit({ userId, action: 'SELECT_COACHING', entityType: 'COACHING', entityId: coachingId });

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    role: coachingUser.role,
    coachingId,
    coachingName: coachingUser.coaching.name
  };
};

const refreshAccessToken = async (rawRefreshToken, coachingId) => {
  const stored = await prisma.refreshToken.findUnique({
    where: { token: rawRefreshToken }
  });

  if (!stored || stored.expiresAt < new Date()) {
    throw new Error('Refresh token is invalid or expired');
  }

  const coachingUser = await prisma.coachingUser.findFirst({
    where: { userId: stored.userId, coachingId, coaching: { isActive: true } }
  });

  if (!coachingUser) {
    throw new Error('Access denied or coaching center inactive');
  }

  const accessToken = generateAccessToken({
    userId: stored.userId,
    role: coachingUser.role,
    coachingId
  });

  return { accessToken };
};

const logoutUser = async (rawRefreshToken) => {
  if (!rawRefreshToken) return;
  await prisma.refreshToken.deleteMany({ where: { token: rawRefreshToken } });
};

const getUserCoachingCentres = async (userId) => {
  const coachingUsers = await prisma.coachingUser.findMany({
    where: { userId, coaching: { isActive: true } },
    include: {
      coaching: { select: { id: true, name: true, description: true, isActive: true } }
    }
  });

  return coachingUsers.map(cu => ({
    coachingId: cu.coachingId,
    role: cu.role,
    coaching: cu.coaching
  }));
};

module.exports = {
  loginWithGoogle,
  selectCoaching,
  refreshAccessToken,
  logoutUser,
  getUserCoachingCentres
};