const prisma = require('../config/database');
const { generateAccessToken, generateRefreshToken, generateOnboardingToken } = require('../config/auth');
const { audit } = require('../utils/auditLogger');

const splitName = (name = '') => {
  const trimmed = String(name || '').trim();
  if (!trimmed) {
    return { firstName: '', lastName: '' };
  }

  const parts = trimmed.split(/\s+/);
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ')
  };
};

const mapUserForClient = (user) => {
  const { firstName, lastName } = splitName(user.name);
  return {
    id: user.id,
    email: user.email,
    phone: user.phone || null,
    role: user.role,
    coaching_center_id: user.coaching_center_id,
    firstName,
    lastName,
    name: user.name,
    isActive: user.is_active,
    createdAt: user.created_at,
    lastLogin: user.last_login
  };
};

// LOGIN: General login logic (supports both email/password and Google after email verification)
const finalizeLogin = async (user) => {
  const accessToken = generateAccessToken({ userId: user.id });

  let coachingMemberships = [];
  if (user.coaching_center_id != null) {
    const coaching = await prisma.coachingCenter.findUnique({
      where: { id: user.coaching_center_id },
      select: { id: true, name: true }
    });

    if (coaching) {
      coachingMemberships = [{
        coachingId: coaching.id,
        role: user.role,
        coaching
      }];
    }
  }

  return {
    user: mapUserForClient(user),
    accessToken,
    coachingMemberships
  };
};

const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client();

const getAllowedGoogleAudiences = () => {
  const fromList = String(process.env.GOOGLE_OAUTH_CLIENT_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const single = String(process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
  if (single) fromList.push(single);

  return Array.from(new Set(fromList));
};

/**
 * SIGN IN WITH GOOGLE
 * Verifies the ID Token from the frontend and fetches the user's email securely.
 */
const loginWithGoogle = async (token) => {
  if (!token) throw new Error('Google token is required');

  let user;
  try {
    const allowedAudiences = getAllowedGoogleAudiences();
    const verifyOptions = { idToken: token };
    if (allowedAudiences.length > 0) {
      verifyOptions.audience = allowedAudiences;
    }

    const ticket = await googleClient.verifyIdToken(verifyOptions);

    const payload = ticket.getPayload();
    
    // Verify the token's issuer is Google
    if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
      throw new Error('Invalid token issuer');
    }

    if (allowedAudiences.length > 0 && !allowedAudiences.includes(payload.aud)) {
      throw new Error('Token audience is not allowed for this application');
    }

    // Log token info for debugging
    console.log('✅ [Google Auth] Token verified successfully');
    console.log('📧 [Google Auth] Email:', payload.email);
    console.log('🆔 [Google Auth] Token audience (aud):', payload.aud);
    console.log('🔑 [Google Auth] Allowed client IDs:', allowedAudiences.length > 0 ? allowedAudiences.join(', ') : '(not configured)');

    const googleEmail = payload.email.toLowerCase().trim();

    user = await prisma.user.findFirst({
      where: {
        email: googleEmail,
        is_active: true
      }
    });

    if (!user) {
      const onboardingToken = generateOnboardingToken({
        email: googleEmail,
        name: payload.name || googleEmail,
        provider: 'google'
      });

      return {
        onboardingRequired: true,
        onboardingToken,
        profile: {
          email: googleEmail,
          name: payload.name || googleEmail,
          phone: payload.phone_number || null,
          firstName: splitName(payload.name || '').firstName,
          lastName: splitName(payload.name || '').lastName
        }
      };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { last_login: new Date() }
    });

    user = await prisma.user.findUnique({ where: { id: user.id } });
  } catch (error) {
    throw new Error(`Google login failed: ${error.message}`);
  }

  // Audittrail for login
  await audit({ userId: user.id, action: 'LOGIN_GOOGLE', entityType: 'AUTH', entityId: user.id });

  return finalizeLogin(user);
};

const selectCoaching = async (userId, coachingId) => {
  const numericCoachingId = Number(coachingId);
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user || !user.is_active || user.coaching_center_id !== numericCoachingId) {
    throw new Error('You do not have access to this coaching center');
  }

  const coaching = await prisma.coachingCenter.findUnique({
    where: { id: numericCoachingId },
    select: { id: true, name: true }
  });

  if (!coaching) {
    throw new Error('Coaching center not found');
  }

  // Issue scoped access token
  const accessToken = generateAccessToken({
    userId,
    role: user.role,
    coachingId: numericCoachingId
  });

  const rawRefreshToken = generateRefreshToken({
    userId,
    coachingId: numericCoachingId,
    role: user.role
  });

  await audit({ userId, action: 'SELECT_COACHING', entityType: 'COACHING', entityId: numericCoachingId, metadata: { coachingId: numericCoachingId } });

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    role: user.role,
    coachingId: numericCoachingId,
    coachingName: coaching.name
  };
};

const refreshAccessToken = async (rawRefreshToken, coachingId) => {
  const { verifyToken } = require('../config/auth');
  const decoded = verifyToken(rawRefreshToken);

  if (!decoded || decoded.tokenType !== 'refresh') {
    throw new Error('Refresh token is invalid or expired');
  }

  const numericCoachingId = Number(coachingId || decoded.coachingId);
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId }
  });

  if (!user || !user.is_active || user.coaching_center_id !== numericCoachingId) {
    throw new Error('Access denied or coaching center inactive');
  }

  const accessToken = generateAccessToken({
    userId: decoded.userId,
    role: user.role,
    coachingId: numericCoachingId
  });

  return { accessToken };
};

const logoutUser = async (rawRefreshToken) => {
  return !!rawRefreshToken;
};

const getUserCoachingCentres = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user || user.coaching_center_id == null) {
    return [];
  }

  const coaching = await prisma.coachingCenter.findUnique({
    where: { id: user.coaching_center_id },
    select: { id: true, name: true }
  });

  if (!coaching) {
    return [];
  }

  return [{
    coachingId: coaching.id,
    role: user.role,
    coaching
  }];
};

const getUserById = async (userId) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.is_active) {
    throw new Error('User not found');
  }

  return mapUserForClient(user);
};

module.exports = {
  loginWithGoogle,
  selectCoaching,
  refreshAccessToken,
  logoutUser,
  getUserCoachingCentres,
  getUserById
};