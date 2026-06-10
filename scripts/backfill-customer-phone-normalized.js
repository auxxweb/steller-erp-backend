/**
 * Backfill phoneNormalized for existing customers (run once after deploy).
 * Usage: node scripts/backfill-customer-phone-normalized.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Customer from '../models/Customer.js';
import { normalizePhone } from '../utils/customerIdentity.js';

dotenv.config();

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const customers = await Customer.find({});
  let updated = 0;
  for (const c of customers) {
    const norm = normalizePhone(c.phone);
    if (norm && c.phoneNormalized !== norm) {
      c.phoneNormalized = norm;
      await c.save();
      updated += 1;
    }
  }
  console.log(`Updated ${updated} of ${customers.length} customers`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
