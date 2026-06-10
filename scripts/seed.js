/**
 * Seed demo branches and user accounts for all roles.
 * Idempotent: safe to re-run (upserts by email / branch code).
 *
 * Usage: npm run seed
 */
import dotenv from 'dotenv';
import connectDB from '../config/db.js';
import { User, Branch, ROLES, USER_STATUS, BRANCH_STATUS } from '../models/index.js';

dotenv.config();

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || '123456';

const BRANCHES = [
  {
    code: 'MUM',
    name: 'Stellar Mumbai',
    email: 'mumbai@stellar.demo',
    phone: '+919876543210',
    address: {
      line1: '12 Linking Road',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400050',
      country: 'India',
    },
  },
  {
    code: 'DEL',
    name: 'Stellar Delhi',
    email: 'delhi@stellar.demo',
    phone: '+919876543211',
    address: {
      line1: '45 Connaught Place',
      city: 'New Delhi',
      state: 'Delhi',
      pincode: '110001',
      country: 'India',
    },
  },
];

const USERS = [
  {
    name: 'Demo Super Admin',
    email: 'admin@stellar.demo',
    role: ROLES.SUPER_ADMIN,
    branchCode: null,
    employeeId: 'SA001',
    phone: '+919800000001',
  },
  {
    name: 'Mumbai Branch Admin',
    email: 'mumbai.admin@stellar.demo',
    role: ROLES.BRANCH_ADMIN,
    branchCode: 'MUM',
    employeeId: 'MUM-ADM',
    phone: '+919800000010',
  },
  {
    name: 'Delhi Branch Admin',
    email: 'delhi.admin@stellar.demo',
    role: ROLES.BRANCH_ADMIN,
    branchCode: 'DEL',
    employeeId: 'DEL-ADM',
    phone: '+919800000020',
  },
  {
    name: 'Mumbai Employee One',
    email: 'mumbai.employee1@stellar.demo',
    role: ROLES.EMPLOYEE,
    branchCode: 'MUM',
    employeeId: 'MUM-E01',
    phone: '+919800000011',
  },
  {
    name: 'Mumbai Employee Two',
    email: 'mumbai.employee2@stellar.demo',
    role: ROLES.EMPLOYEE,
    branchCode: 'MUM',
    employeeId: 'MUM-E02',
    phone: '+919800000012',
  },
  {
    name: 'Delhi Employee One',
    email: 'delhi.employee1@stellar.demo',
    role: ROLES.EMPLOYEE,
    branchCode: 'DEL',
    employeeId: 'DEL-E01',
    phone: '+919800000021',
  },
  {
    name: 'Mumbai Delivery',
    email: 'mumbai.delivery@stellar.demo',
    role: ROLES.DELIVERY_STAFF,
    branchCode: 'MUM',
    employeeId: 'MUM-DLV',
    phone: '+919800000013',
  },
  {
    name: 'Delhi Delivery',
    email: 'delhi.delivery@stellar.demo',
    role: ROLES.DELIVERY_STAFF,
    branchCode: 'DEL',
    employeeId: 'DEL-DLV',
    phone: '+919800000022',
  },
];

async function upsertBranch(def) {
  let branch = await Branch.findOne({ code: def.code });
  if (branch) {
    branch.name = def.name;
    branch.email = def.email;
    branch.phone = def.phone;
    branch.address = def.address;
    branch.status = BRANCH_STATUS.ACTIVE;
    await branch.save();
    return { branch, created: false };
  }

  branch = await Branch.create({
    ...def,
    status: BRANCH_STATUS.ACTIVE,
  });
  return { branch, created: true };
}

async function upsertUser(def, branchId) {
  const email = def.email.toLowerCase().trim();
  let user = await User.findOne({ email }).select('+password');

  if (user) {
    user.name = def.name;
    user.role = def.role;
    user.branch = branchId;
    user.status = USER_STATUS.ACTIVE;
    user.phone = def.phone;
    user.employeeId = def.employeeId;
    user.password = DEMO_PASSWORD;
    await user.save({ validateBeforeSave: false });
    return { user, created: false };
  }

  user = new User({
    name: def.name,
    email,
    role: def.role,
    branch: branchId,
    status: USER_STATUS.ACTIVE,
    phone: def.phone,
    employeeId: def.employeeId,
  });
  user.password = DEMO_PASSWORD;
  await user.save({ validateBeforeSave: false });
  return { user, created: true };
}

function printCredentialsTable(rows) {
  const col = (s, w) => String(s).padEnd(w);
  const wRole = 18;
  const wEmail = 32;
  const wBranch = 8;

  console.log('\n┌─ Demo login credentials (password for all accounts below) ─┐');
  console.log(`│  Password: ${DEMO_PASSWORD.padEnd(47)}│`);
  console.log('└──────────────────────────────────────────────────────────┘\n');

  console.log(
    col('Role', wRole) +
      col('Email', wEmail) +
      col('Branch', wBranch) +
      'Login path',
  );
  console.log('-'.repeat(72));

  for (const row of rows) {
    console.log(
      col(row.role, wRole) +
        col(row.email, wEmail) +
        col(row.branch, wBranch) +
        row.path,
    );
  }
  console.log('');
}

const LOGIN_PATHS = {
  [ROLES.SUPER_ADMIN]: '/admin',
  [ROLES.BRANCH_ADMIN]: '/branch',
  [ROLES.EMPLOYEE]: '/employee',
  [ROLES.DELIVERY_STAFF]: '/delivery',
};

const seed = async () => {
  await connectDB();

  const branchMap = new Map();

  console.log('[seed] Branches…');
  for (const def of BRANCHES) {
    const { branch, created } = await upsertBranch(def);
    branchMap.set(def.code, branch);
    console.log(`  ${created ? '+' : '~'} ${branch.code} — ${branch.name}`);
  }

  console.log('[seed] Users…');
  const credentialRows = [];

  for (const def of USERS) {
    const branchId = def.branchCode ? branchMap.get(def.branchCode)?._id : null;

    if (def.branchCode && !branchId) {
      throw new Error(`Branch not found: ${def.branchCode}`);
    }

    if (def.role !== ROLES.SUPER_ADMIN && !branchId) {
      throw new Error(`Branch required for ${def.email}`);
    }

    const { user, created } = await upsertUser(def, branchId);
    console.log(`  ${created ? '+' : '~'} ${user.email} (${user.role})`);

    credentialRows.push({
      role: user.role,
      email: user.email,
      branch: def.branchCode || '—',
      path: LOGIN_PATHS[user.role] || '/',
    });

    if (user.role === ROLES.BRANCH_ADMIN && branchId) {
      await Branch.findByIdAndUpdate(branchId, { manager: user._id });
    }
  }

  printCredentialsTable(credentialRows);
  console.log('[seed] Done. Re-run anytime to reset demo passwords and sync fields.');
  process.exit(0);
};

seed().catch((err) => {
  console.error('[seed] Failed:', err.message);
  process.exit(1);
});
