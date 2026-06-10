import Branch from '../models/Branch.js';
import { ROLES } from '../models/constants/enums.js';
import AppError from '../utils/AppError.js';
import * as authService from './authService.js';
import { getMyBranch } from './branchService.js';

const mergeBranchSettings = (branch, payload) => {
  const current = branch.settings?.toObject?.() || branch.settings || {};
  const nextSettings = { ...current, ...payload.settings };
  if (payload.settings?.invoice) {
    nextSettings.invoice = { ...(current.invoice || {}), ...payload.settings.invoice };
  }
  branch.settings = nextSettings;

  if (payload.timezone !== undefined) branch.timezone = payload.timezone?.trim() || 'Asia/Kolkata';
  if (payload.currency !== undefined) branch.currency = payload.currency?.trim()?.toUpperCase() || 'INR';
};

export const getWorkspaceSettings = async (actor) => {
  const user = await authService.getUserProfile(actor._id);
  const result = {
    user: user.toSafeJSON(),
    features: {
      branchSettings: false,
      workspaceLinks: false,
    },
    branch: null,
  };

  if (actor.role === ROLES.SUPER_ADMIN) {
    result.features.workspaceLinks = true;
    return result;
  }

  if ([ROLES.BRANCH_ADMIN, ROLES.EMPLOYEE, ROLES.DELIVERY_STAFF].includes(actor.role)) {
    if (!actor.branch) throw new AppError('No branch assigned to your account', 403);
    const branch = await getMyBranch(actor);
    result.branch = branch.toPublicJSON();
    if (actor.role === ROLES.BRANCH_ADMIN) {
      result.features.branchSettings = true;
    }
  }

  return result;
};

export const updateBranchSettings = async (actor, payload) => {
  if (actor.role !== ROLES.BRANCH_ADMIN) {
    throw new AppError('Only branch admins can update branch settings here', 403);
  }
  if (!actor.branch) throw new AppError('No branch assigned to your account', 403);

  const branch = await Branch.findById(actor.branch);
  if (!branch) throw new AppError('Branch not found', 404);

  mergeBranchSettings(branch, payload);
  await branch.save();

  return branch.toPublicJSON();
};
