import AuditLog from '../models/AuditLog.js';

/**
 * Persist an audit log entry (non-blocking on failure).
 */
export const logAudit = async ({
  user,
  branch,
  action,
  entity,
  entityId,
  summary,
  changes,
  metadata,
  ipAddress,
  userAgent,
  requestId,
}) => {
  try {
    await AuditLog.create({
      user,
      branch,
      action,
      entity,
      entityId,
      summary,
      changes,
      metadata,
      ipAddress,
      userAgent,
      requestId,
    });
  } catch (err) {
    console.error('[audit] Failed to write log:', err.message);
  }
};

export default logAudit;
