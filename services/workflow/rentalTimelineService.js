import RentalTimeline from '../../models/RentalTimeline.js';

export const logRentalTimeline = async ({
  rentalId,
  branchId,
  event,
  fromStatus = null,
  toStatus = null,
  summary,
  metadata = {},
  performedBy = null,
  session = null,
}) => {
  const opts = session ? { session } : {};
  const [entry] = await RentalTimeline.create(
    [
      {
        rental: rentalId,
        branch: branchId,
        event,
        fromStatus,
        toStatus,
        summary,
        metadata,
        performedBy,
      },
    ],
    opts,
  );
  return entry;
};

export const listRentalTimeline = async (rentalId, { limit = 50 } = {}) => {
  const entries = await RentalTimeline.find({ rental: rentalId })
    .sort({ createdAt: -1 })
    .limit(Math.min(200, limit))
    .populate('performedBy', 'name email role')
    .lean();

  return entries.map((e) => ({
    id: e._id.toString(),
    event: e.event,
    fromStatus: e.fromStatus,
    toStatus: e.toStatus,
    summary: e.summary,
    metadata: e.metadata,
    performedBy: e.performedBy
      ? {
          id: e.performedBy._id?.toString(),
          name: e.performedBy.name,
          email: e.performedBy.email,
          role: e.performedBy.role,
        }
      : null,
    createdAt: e.createdAt,
  }));
};
