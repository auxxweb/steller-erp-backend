import AuditLog from '../models/AuditLog.js';
import { AUDIT_ACTION } from '../models/constants/enums.js';
import { logAudit } from '../utils/auditLogger.js';

export { AUDIT_ACTION };

/**
 * Structured audit write — delegates to fire-and-forget logger.
 */
export const recordAudit = async (payload) => logAudit(payload);

export const listAuditLogs = async (actor, query = {}) => {
  const filter = {};
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
  const skip = (page - 1) * limit;

  if (query.entity) filter.entity = query.entity;
  if (query.entityId) filter.entityId = query.entityId;
  if (query.action) filter.action = query.action;
  if (query.user) filter.user = query.user;

  if (actor.branch && actor.role !== 'super_admin') {
    filter.branch = actor.branch;
  } else if (query.branch) {
    filter.branch = query.branch;
  }

  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }

  if (query.search?.trim()) {
    const regex = new RegExp(
      query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'i',
    );
    filter.$or = [{ summary: regex }, { entity: regex }];
  }

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name email role')
      .populate('branch', 'name code')
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  return {
    logs: logs.map((l) => ({
      id: l._id.toString(),
      action: l.action,
      entity: l.entity,
      entityId: l.entityId?.toString(),
      summary: l.summary,
      changes: l.changes,
      metadata: l.metadata,
      user: l.user
        ? { id: l.user._id?.toString(), name: l.user.name, email: l.user.email }
        : null,
      branch: l.branch
        ? { id: l.branch._id?.toString(), name: l.branch.name, code: l.branch.code }
        : null,
      createdAt: l.createdAt,
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  };
};
