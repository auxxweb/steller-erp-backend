import mongoose from 'mongoose';
import env from './env.js';

const connectDB = async () => {
  if (!env.mongodbUri) {
    throw new Error('MONGODB_URI is not defined in environment variables');
  }

  mongoose.set('strictQuery', true);

  const conn = await mongoose.connect(env.mongodbUri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10000,
  });

  console.log(`[db] MongoDB connected: ${conn.connection.host}`);

  mongoose.connection.on('error', (err) => {
    console.error('[db] Connection error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[db] Disconnected from MongoDB');
  });

  return conn;
};

export default connectDB;
