import mongoose from 'mongoose';

const refreshTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    replacedByToken: {
      type: String,
      default: null,
    },
    userAgent: { type: String },
    ipAddress: { type: String },
  },
  { timestamps: true },
);

refreshTokenSchema.index({ user: 1, revokedAt: 1 });

refreshTokenSchema.methods.isValid = function isValid() {
  return !this.revokedAt && this.expiresAt > new Date();
};

const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);

export default RefreshToken;
