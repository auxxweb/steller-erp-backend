/**
 * Seed the first super admin (if no users exist).
 * Usage: node scripts/seedSuperAdmin.js
 */
import dotenv from 'dotenv';
import connectDB from '../config/db.js';
import { User, ROLES, USER_STATUS } from '../models/index.js';

dotenv.config();

const seed = async () => {
  await connectDB();

  const count = await User.countDocuments();
  if (count > 0) {
    console.log('[seed] Users already exist — skipping');
    process.exit(0);
  }

  const user = await User.create({
    name: process.env.SEED_ADMIN_NAME || 'Super Admin',
    email: process.env.SEED_ADMIN_EMAIL || 'admin@stellar.com',
    password: process.env.SEED_ADMIN_PASSWORD || 'Stellar@123',
    role: ROLES.SUPER_ADMIN,
    status: USER_STATUS.ACTIVE,
  });

  console.log('[seed] Super admin created:', user.email);
  process.exit(0);
};

seed().catch((err) => {
  console.error('[seed] Failed:', err.message);
  process.exit(1);
});
