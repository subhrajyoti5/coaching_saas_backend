const crypto = require('crypto');
const prisma = require('../config/database');
const { ONBOARDING, JOIN_REQUEST_STATUS, ROLES } = require('../config/constants');
const { audit } = require('../utils/auditLogger');

const DEFAULT_CODE_LENGTH = 6;

const isMissingOnboardingTableError = (error) => {
  const message = String(error?.message || '');
  return (
    message.includes('does not exist in the current database')
    && (message.includes('public.join_requests') || message.includes('public.access_codes'))
  );
};

const throwIfMissingOnboardingTables = (error) => {
  const message = String(error?.message || '');
  if (message.includes('does not exist in the current database')
      && (message.includes('public.join_requests') || message.includes('public.access_codes'))) {
    throw new Error('Onboarding tables not yet initialized in database. Please contact support.');
  }
  throw error;
};

const withMissingTableFallback = async (operation, fallbackValue) => {
  try {
    return await operation();
  } catch (error) {
    if (isMissingOnboardingTableError(error)) {
      return fallbackValue;
    }
    throw error;
  }
};

const normalizeRole = (role) => String(role || '').trim().toUpperCase();

const isValidRole = (role) => {
  const normalized = normalizeRole(role);
  return normalized === ROLES.STUDENT || normalized === ROLES.TEACHER;
};

const calculateAgeHours = (date) => {
  const millis = Date.now() - new Date(date).getTime();
  return millis / (1000 * 60 * 60);
};

const toRequestPayload = (joinRequest) => {
  const ageHours = calculateAgeHours(joinRequest.created_at);
  const isStale = joinRequest.status === JOIN_REQUEST_STATUS.PENDING && ageHours >= ONBOARDING.STALE_REQUEST_HOURS;
  const isExpired = joinRequest.status === JOIN_REQUEST_STATUS.EXPIRED;

  return {
    id: joinRequest.id,
    name: joinRequest.name,
    email: joinRequest.email,
    role: joinRequest.role,
    coachingCenterId: joinRequest.coaching_center_id,
    status: joinRequest.status,
    createdAt: joinRequest.created_at,
    updatedAt: joinRequest.updated_at,
    expiresAt: joinRequest.expires_at,
    isStale,
    isExpired,
    ageHours: Number(ageHours.toFixed(2))
  };
};

const buildCode = (length = DEFAULT_CODE_LENGTH) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(length);
  let output = '';

  for (let i = 0; i < length; i += 1) {
    output += alphabet[bytes[i] % alphabet.length];
  }

  return output;
};

const generateAccessCode = async ({ ownerId, coachingId, role }) => {
  const normalizedRole = normalizeRole(role);
  if (!isValidRole(normalizedRole)) {
    throw new Error('Role must be STUDENT or TEACHER');
  }

  const numericCoachingId = Number(coachingId);
  if (!Number.isInteger(numericCoachingId) || numericCoachingId <= 0) {
    throw new Error('Valid coachingId is required');
  }

  const expiresAt = new Date(Date.now() + ONBOARDING.ACCESS_CODE_TTL_MINUTES * 60 * 1000);

  let createdCode;
  try {
    createdCode = await prisma.$transaction(async (tx) => {
      await tx.accessCode.updateMany({
        where: {
          coaching_center_id: numericCoachingId,
          role: normalizedRole,
          is_active: true
        },
        data: {
          is_active: false
        }
      });

      return tx.accessCode.create({
        data: {
          code: buildCode(),
          role: normalizedRole,
          coaching_center_id: numericCoachingId,
          expires_at: expiresAt,
          is_active: true
        }
      });
    });
  } catch (error) {
    throwIfMissingOnboardingTables(error);
  }

  await audit({
    userId: ownerId,
    action: 'GENERATE_ACCESS_CODE',
    entityType: 'ACCESS_CODE',
    entityId: createdCode.id,
    metadata: {
      coachingId: numericCoachingId,
      role: normalizedRole,
      expiresAt
    }
  });

  return {
    id: createdCode.id,
    code: createdCode.code,
    role: createdCode.role,
    coachingCenterId: createdCode.coaching_center_id,
    expiresAt: createdCode.expires_at,
    isActive: createdCode.is_active,
    createdAt: createdCode.created_at
  };
};

const getActiveAccessCodes = async ({ coachingId }) => {
  const numericCoachingId = Number(coachingId);
  const now = new Date();

  const codes = await withMissingTableFallback(
    () => prisma.accessCode.findMany({
      where: {
        coaching_center_id: numericCoachingId,
        is_active: true,
        expires_at: { gt: now }
      },
      orderBy: { created_at: 'desc' }
    }),
    []
  );

  return codes.map((code) => ({
    id: code.id,
    code: code.code,
    role: code.role,
    expiresAt: code.expires_at,
    createdAt: code.created_at
  }));
};

const deactivateAccessCode = async ({ ownerId, coachingId, codeId }) => {
  const updated = await prisma.accessCode.updateMany({
    where: {
      id: Number(codeId),
      coaching_center_id: Number(coachingId),
      is_active: true
    },
    data: {
      is_active: false
    }
  });

  if (!updated.count) {
    throw new Error('Active access code not found');
  }

  await audit({
    userId: ownerId,
    action: 'DEACTIVATE_ACCESS_CODE',
    entityType: 'ACCESS_CODE',
    entityId: Number(codeId),
    metadata: { coachingId: Number(coachingId) }
  });

  return { success: true };
};

const createJoinRequest = async ({ onboardingUser, role, code }) => {
  const normalizedRole = normalizeRole(role);
  if (!isValidRole(normalizedRole)) {
    throw new Error('Role must be STUDENT or TEACHER');
  }

  const email = String(onboardingUser.email || '').trim().toLowerCase();
  const name = String(onboardingUser.name || email).trim() || email;
  if (!email) {
    throw new Error('Onboarding token email is missing');
  }

  const now = new Date();
  let accessCode;
  try {
    accessCode = await prisma.accessCode.findFirst({
      where: {
        code: String(code || '').trim().toUpperCase(),
        role: normalizedRole,
        is_active: true,
        expires_at: { gt: now }
      }
    });
  } catch (error) {
    throwIfMissingOnboardingTables(error);
  }

  if (!accessCode) {
    throw new Error('Invalid, expired, or inactive access code');
  }

  let existing;
  try {
    existing = await prisma.joinRequest.findUnique({
      where: {
        email_coaching_center_id_role: {
          email,
          coaching_center_id: accessCode.coaching_center_id,
          role: normalizedRole
        }
      }
    });
  } catch (error) {
    throwIfMissingOnboardingTables(error);
  }

  if (existing) {
    if (existing.status === JOIN_REQUEST_STATUS.PENDING && existing.expires_at < now) {
      let forcedExpired;
      try {
        forcedExpired = await prisma.joinRequest.update({
          where: { id: existing.id },
          data: { status: JOIN_REQUEST_STATUS.EXPIRED }
        });
      } catch (error) {
        throwIfMissingOnboardingTables(error);
      }

      return {
        request: toRequestPayload(forcedExpired),
        messageKey: 'REQUEST_EXPIRED',
        requiresNewCode: true
      };
    }

    if (existing.status === JOIN_REQUEST_STATUS.PENDING) {
      const ageHours = calculateAgeHours(existing.created_at);
      const messageKey = ageHours < ONBOARDING.STALE_REQUEST_HOURS ? 'REQUEST_ALREADY_EXISTS' : 'REQUEST_REUSED_STALE';

      return {
        request: toRequestPayload(existing),
        messageKey,
        requiresNewCode: false
      };
    }

    let recreated;
    try {
      recreated = await prisma.joinRequest.update({
        where: { id: existing.id },
        data: {
          name,
          status: JOIN_REQUEST_STATUS.PENDING,
          created_at: now,
          expires_at: new Date(now.getTime() + ONBOARDING.JOIN_REQUEST_TTL_HOURS * 60 * 60 * 1000)
        }
      });
    } catch (error) {
      throwIfMissingOnboardingTables(error);
    }

    await audit({
      userId: null,
      action: 'RECREATE_JOIN_REQUEST',
      entityType: 'JOIN_REQUEST',
      entityId: recreated.id,
      metadata: { email, coachingId: recreated.coaching_center_id, role: recreated.role }
    });

    return {
      request: toRequestPayload(recreated),
      messageKey: 'REQUEST_CREATED',
      requiresNewCode: false
    };
  }

  let created;
  try {
    created = await prisma.joinRequest.create({
      data: {
        name,
        email,
        role: normalizedRole,
        coaching_center_id: accessCode.coaching_center_id,
        status: JOIN_REQUEST_STATUS.PENDING,
        expires_at: new Date(now.getTime() + ONBOARDING.JOIN_REQUEST_TTL_HOURS * 60 * 60 * 1000)
      }
    });
  } catch (error) {
    throwIfMissingOnboardingTables(error);
  }

  await audit({
    userId: null,
    action: 'CREATE_JOIN_REQUEST',
    entityType: 'JOIN_REQUEST',
    entityId: created.id,
    metadata: { email, coachingId: created.coaching_center_id, role: created.role }
  });

  return {
    request: toRequestPayload(created),
    messageKey: 'REQUEST_CREATED',
    requiresNewCode: false
  };
};

const getJoinRequestStatus = async ({ onboardingUser }) => {
  const email = String(onboardingUser.email || '').trim().toLowerCase();
  if (!email) {
    throw new Error('Onboarding token email is missing');
  }

  const requests = await withMissingTableFallback(
    () => prisma.joinRequest.findMany({
      where: { email },
      orderBy: { created_at: 'desc' }
    }),
    []
  );

  return requests.map(toRequestPayload);
};

const getPendingRequests = async ({ coachingId, role }) => {
  const normalizedRole = role ? normalizeRole(role) : undefined;

  const requests = await withMissingTableFallback(
    () => prisma.joinRequest.findMany({
      where: {
        coaching_center_id: Number(coachingId),
        status: JOIN_REQUEST_STATUS.PENDING,
        ...(normalizedRole ? { role: normalizedRole } : {})
      },
      orderBy: { created_at: 'asc' }
    }),
    []
  );

  return requests.map(toRequestPayload);
};

const approveJoinRequest = async ({ requestId, ownerId, coachingId }) => {
  const result = await prisma.$transaction(async (tx) => {
    const request = await tx.joinRequest.findUnique({ where: { id: Number(requestId) } });
    if (!request || request.coaching_center_id !== Number(coachingId)) {
      throw new Error('Join request not found for this coaching center');
    }

    if (request.status !== JOIN_REQUEST_STATUS.PENDING) {
      throw new Error(`Join request is ${request.status} and cannot be approved`);
    }

    if (request.expires_at < new Date()) {
      await tx.joinRequest.update({
        where: { id: request.id },
        data: { status: JOIN_REQUEST_STATUS.EXPIRED }
      });
      throw new Error('Join request expired. User must re-enter a valid code');
    }

    let user = await tx.user.findFirst({
      where: {
        email: request.email,
        coaching_center_id: request.coaching_center_id
      }
    });

    if (!user) {
      user = await tx.user.create({
        data: {
          name: request.name,
          email: request.email,
          role: request.role,
          coaching_center_id: request.coaching_center_id,
          is_active: true
        }
      });
    } else {
      user = await tx.user.update({
        where: { id: user.id },
        data: {
          name: request.name,
          role: request.role,
          is_active: true
        }
      });
    }

    const approvedRequest = await tx.joinRequest.update({
      where: { id: request.id },
      data: { status: JOIN_REQUEST_STATUS.APPROVED }
    });

    return { request: approvedRequest, user };
  });

  await audit({
    userId: ownerId,
    action: 'APPROVE_JOIN_REQUEST',
    entityType: 'JOIN_REQUEST',
    entityId: Number(requestId),
    metadata: { coachingId: Number(coachingId), approvedUserId: result.user.id }
  });

  return {
    request: toRequestPayload(result.request),
    user: {
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      role: result.user.role,
      coachingCenterId: result.user.coaching_center_id
    }
  };
};

const rejectJoinRequest = async ({ requestId, ownerId, coachingId }) => {
  const request = await prisma.joinRequest.findUnique({ where: { id: Number(requestId) } });

  if (!request || request.coaching_center_id !== Number(coachingId)) {
    throw new Error('Join request not found for this coaching center');
  }

  if (request.status !== JOIN_REQUEST_STATUS.PENDING) {
    throw new Error(`Join request is ${request.status} and cannot be rejected`);
  }

  const rejected = await prisma.joinRequest.update({
    where: { id: request.id },
    data: { status: JOIN_REQUEST_STATUS.REJECTED }
  });

  await audit({
    userId: ownerId,
    action: 'REJECT_JOIN_REQUEST',
    entityType: 'JOIN_REQUEST',
    entityId: Number(requestId),
    metadata: { coachingId: Number(coachingId) }
  });

  return toRequestPayload(rejected);
};

const approveStudentsBulk = async ({ ownerId, coachingId, requestIds, approveAll = false }) => {
  const numericCoachingId = Number(coachingId);

  const where = {
    coaching_center_id: numericCoachingId,
    role: ROLES.STUDENT,
    status: JOIN_REQUEST_STATUS.PENDING,
    expires_at: { gt: new Date() }
  };

  if (!approveAll) {
    const numericIds = (requestIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id));
    if (!numericIds.length) {
      throw new Error('requestIds are required for selected approval');
    }
    where.id = { in: numericIds };
  }

  const pendingStudents = await prisma.joinRequest.findMany({
    where,
    orderBy: { created_at: 'asc' }
  });

  if (!pendingStudents.length) {
    return { approvedCount: 0, skippedCount: 0 };
  }

  const approved = await prisma.$transaction(async (tx) => {
    let approvedCount = 0;

    for (const request of pendingStudents) {
      let user = await tx.user.findFirst({
        where: {
          email: request.email,
          coaching_center_id: request.coaching_center_id
        }
      });

      if (!user) {
        user = await tx.user.create({
          data: {
            name: request.name,
            email: request.email,
            role: request.role,
            coaching_center_id: request.coaching_center_id,
            is_active: true
          }
        });
      } else {
        user = await tx.user.update({
          where: { id: user.id },
          data: {
            name: request.name,
            role: request.role,
            is_active: true
          }
        });
      }

      await tx.joinRequest.update({
        where: { id: request.id },
        data: { status: JOIN_REQUEST_STATUS.APPROVED }
      });

      approvedCount += 1;
    }

    return approvedCount;
  });

  await audit({
    userId: ownerId,
    action: approveAll ? 'APPROVE_ALL_STUDENTS' : 'APPROVE_SELECTED_STUDENTS',
    entityType: 'JOIN_REQUEST',
    entityId: null,
    metadata: {
      coachingId: numericCoachingId,
      approvedCount: approved,
      selectedCount: pendingStudents.length
    }
  });

  return {
    approvedCount: approved,
    skippedCount: 0
  };
};

const expirePendingJoinRequests = async () => {
  const result = await withMissingTableFallback(
    () => prisma.joinRequest.updateMany({
      where: {
        status: JOIN_REQUEST_STATUS.PENDING,
        expires_at: { lt: new Date() }
      },
      data: {
        status: JOIN_REQUEST_STATUS.EXPIRED
      }
    }),
    { count: 0 }
  );

  return result.count;
};

module.exports = {
  generateAccessCode,
  getActiveAccessCodes,
  deactivateAccessCode,
  createJoinRequest,
  getJoinRequestStatus,
  getPendingRequests,
  approveJoinRequest,
  rejectJoinRequest,
  approveStudentsBulk,
  expirePendingJoinRequests
};
