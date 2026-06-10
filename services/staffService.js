import crypto from 'crypto';
import User from '../models/User.js';
import Shift from '../models/Shift.js';
import Branch from '../models/Branch.js';
import {
  ROLES,
  USER_STATUS,
} from '../models/constants/enums.js';
import AppError from '../utils/AppError.js';
import { validatePasswordStrength } from '../utils/password.js';
import { recordAudit } from './auditService.js';
import { decryptPasswordVault } from '../utils/passwordVault.js';

const generateStrongPassword = (length = 12) => {
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  const all = lower + upper + digits;

  const randChar = (chars) => chars[Math.floor(Math.random() * chars.length)];

  // Ensure at least one from each category
  let pwd = `${randChar(lower)}${randChar(upper)}${randChar(digits)}`;
  while (pwd.length < length) {
    pwd += randChar(all);
  }

  // Shuffle
  const arr = pwd.split('');
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  pwd = arr.join('');

  const errors = validatePasswordStrength(pwd);
  if (errors.length) return generateStrongPassword(length);

  return pwd;
};

export const createBranchStaff = async ({ payload, actor, documents = [] }) => {
  const isSuper = actor.role === ROLES.SUPER_ADMIN;
  const branchId = isSuper ? payload.branch : actor.branch;

  if (!branchId) throw new AppError('branch is required', 400);

  if (!payload.name?.trim()) throw new AppError('name is required', 400);
  if (!payload.email?.trim()) throw new AppError('email is required', 400);
  if (!payload.password) throw new AppError('password is required', 400);
  if (!payload.phone?.trim()) throw new AppError('phone is required', 400);
  if (!payload.address) throw new AppError('address is required', 400);
  if (
    typeof payload.address !== 'object' ||
    !payload.address.line1?.trim() ||
    !payload.address.city?.trim() ||
    !payload.address.state?.trim()
  ) {
    throw new AppError(
      'address.line1, address.city, and address.state are required',
      400,
    );
  }
  if (!documents?.length) throw new AppError('document images are required', 400);
  if (!payload.shiftIds?.length) throw new AppError('shiftIds are required', 400);

  const passwordErrors = validatePasswordStrength(payload.password);
  if (passwordErrors.length) {
    throw new AppError(passwordErrors[0], 400);
  }

  const email = payload.email.toLowerCase().trim();
  const exists = await User.findOne({ email }).select('_id').lean();
  if (exists) throw new AppError('Email already registered', 409);

  // Enforce shift branch integrity if shiftIds provided
  if (payload.shiftIds?.length) {
    const shifts = await Shift.find({
      _id: { $in: payload.shiftIds },
      branch: branchId,
      status: { $ne: 'inactive' },
    }).select('_id');
    if (shifts.length !== payload.shiftIds.length) {
      throw new AppError('One or more shifts are invalid for this branch', 400);
    }
  }

  const user = await User.create({
    name: payload.name.trim(),
    email,
    password: payload.password,
    role: ROLES.EMPLOYEE,
    branch: branchId,
    phone: payload.phone.trim(),
    address: payload.address,
    employeePosition: payload.employeePosition || 'sales_staff',
    shiftIds: payload.shiftIds || [],
    documents: documents.map((d) => ({
      name: d.name || 'document',
      url: d.url,
      publicId: d.publicId,
      mimeType: d.mimeType,
      uploadedAt: d.uploadedAt || new Date(),
    })),
    avatar: payload.avatar || null,
    employeeId: payload.employeeId || undefined,
    createdBy: actor._id,
  });

  await recordAudit({
    user: actor._id,
    branch: branchId,
    action: 'create',
    entity: 'Staff',
    entityId: user._id,
    summary: `Created staff ${user.name} (${user.email})`,
    changes: { after: user.toSafeJSON() },
    metadata: { employeePosition: user.employeePosition },
  });

  return user.toSafeJSON();
};

export const regeneratePassword = async ({ userId, actor, password }) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);

  if (actor.role === ROLES.BRANCH_ADMIN) {
    if (!actor.branch) throw new AppError('No branch assigned', 403);
    if (user.branch?.toString() !== actor.branch.toString()) {
      throw new AppError('You do not have access to this user', 403);
    }
  }

  const nextPassword = password || generateStrongPassword();
  const passwordErrors = validatePasswordStrength(nextPassword);
  if (passwordErrors.length) throw new AppError(passwordErrors[0], 400);

  user.password = nextPassword;
  user.updatedAt = new Date();
  await user.save();

  await recordAudit({
    user: actor._id,
    branch: user.branch,
    action: 'update',
    entity: 'Password',
    entityId: user._id,
    summary: `Password regenerated for staff ${user.email}`,
    changes: { after: { updated: true } },
  });

  return nextPassword; // plaintext returned to admin by design
};

export const updateStaffProfile = async ({ userId, payload, actor }) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);

  if (actor.role === ROLES.BRANCH_ADMIN) {
    if (!actor.branch) throw new AppError('No branch assigned', 403);
    if (user.branch?.toString() !== actor.branch.toString()) {
      throw new AppError('You do not have access to this user', 403);
    }
  }

  if (user.role === ROLES.SUPER_ADMIN && actor._id.toString() !== user._id.toString()) {
    throw new AppError('Cannot modify another super admin account', 403);
  }

  if (payload.name?.trim()) user.name = payload.name.trim();
  if (payload.phone !== undefined) user.phone = payload.phone?.trim() || '';

  if (payload.email?.trim()) {
    const email = payload.email.toLowerCase().trim();
    if (email !== user.email) {
      const exists = await User.findOne({ email, _id: { $ne: user._id } }).select('_id').lean();
      if (exists) throw new AppError('Email already registered', 409);
      user.email = email;
    }
  }

  if (payload.role && actor.role === ROLES.SUPER_ADMIN) {
    if (user.role === ROLES.SUPER_ADMIN && payload.role !== ROLES.SUPER_ADMIN) {
      throw new AppError('Cannot change super admin role', 403);
    }
    user.role = payload.role;
  }

  if (payload.branch !== undefined && actor.role === ROLES.SUPER_ADMIN) {
    user.branch = payload.branch || null;
  }

  if (payload.employeePosition && user.role === ROLES.EMPLOYEE) {
    user.employeePosition = payload.employeePosition;
  }

  if (payload.shiftIds !== undefined) {
    const branchId = user.branch?.toString?.() || null;
    const nextIds = payload.shiftIds || [];
    if (nextIds.length) {
      if (!branchId) throw new AppError('Assign a branch before setting shifts', 400);
      const shifts = await Shift.find({
        _id: { $in: nextIds },
        branch: branchId,
        status: { $ne: 'inactive' },
      }).select('_id');
      if (shifts.length !== nextIds.length) {
        throw new AppError('One or more shifts are invalid for this branch', 400);
      }
    }
    user.shiftIds = nextIds;
  }

  if (payload.address) {
    user.address = {
      line1: payload.address.line1?.trim() || user.address?.line1,
      line2: payload.address.line2?.trim() || user.address?.line2,
      city: payload.address.city?.trim() || user.address?.city,
      state: payload.address.state?.trim() || user.address?.state,
      postalCode: payload.address.postalCode?.trim() || user.address?.postalCode,
    };
  }

  if (payload.documents !== undefined) {
    user.documents = (payload.documents || []).map((d) => ({
      name: d.name || 'document',
      url: d.url,
      publicId: d.publicId,
      mimeType: d.mimeType,
      uploadedAt: d.uploadedAt ? new Date(d.uploadedAt) : new Date(),
    }));
  }

  user.updatedAt = new Date();
  await user.save();

  await recordAudit({
    user: actor._id,
    branch: user.branch,
    action: 'update',
    entity: 'Staff',
    entityId: user._id,
    summary: `Updated user ${user.email}`,
    changes: { after: user.toSafeJSON() },
  });

  return user.toSafeJSON();
};

export const viewPassword = async ({ userId, actor }) => {
  const user = await User.findById(userId).select(
    '+passwordVault.encryptedPassword +passwordVault.iv +passwordVault.tag +passwordVault.updatedAt',
  );

  if (!user) throw new AppError('User not found', 404);

  if (actor.role === ROLES.BRANCH_ADMIN) {
    if (!actor.branch) throw new AppError('No branch assigned', 403);
    if (user.branch?.toString() !== actor.branch.toString()) {
      throw new AppError('You do not have access to this user', 403);
    }
  }

  if (!user.passwordVault?.encryptedPassword) {
    throw new AppError('Password vault not available for this user', 400);
  }

  const plaintext = decryptPasswordVault(user.passwordVault);
  return plaintext;
};

