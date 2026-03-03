const prisma = require('../config/database');

const audit = async ({ userId, action, entityType, entityId = null, metadata = null, ipAddress = null }) => {
    try {
        await prisma.auditLog.create({
            data: {
                userId: userId || null,
                action,
                entityType,
                entityId: entityId || null,
                metadata: metadata || undefined,
                ipAddress: ipAddress || null
            }
        });
    } catch (err) {
        // Audit failure must never crash the main flow
        console.error('Audit log error:', err.message);
    }
};

module.exports = { audit };
