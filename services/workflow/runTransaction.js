import mongoose from 'mongoose';

/**
 * Run a workflow callback inside a MongoDB transaction (replica set / Atlas).
 * Falls back to non-transactional execution when transactions are unavailable.
 */
export const runWorkflowTransaction = async (callback) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const result = await callback(session);
    await session.commitTransaction();
    return result;
  } catch (err) {
    await session.abortTransaction();
    if (err.message?.includes('Transaction numbers are only allowed')) {
      return callback(null);
    }
    throw err;
  } finally {
    session.endSession();
  }
};

export default runWorkflowTransaction;
