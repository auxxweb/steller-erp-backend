import dotenv from 'dotenv';

dotenv.config();

const required = ['MONGODB_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];

const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0 && process.env.NODE_ENV !== 'test') {
  console.warn(`[env] Missing recommended variables: ${missing.join(', ')}`);
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  mongodbUri: process.env.MONGODB_URI,
  appUrl: process.env.APP_URL || 'http://localhost:5173',

  jwtSecret: process.env.JWT_SECRET || 'dev-only-access-secret-change-me',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-only-refresh-secret-change-me',
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  jwtResetExpiresIn: process.env.JWT_RESET_EXPIRES_IN || '1h',

  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 12,

  passwordResetExpiresMs: Number(process.env.PASSWORD_RESET_EXPIRES_MS) || 60 * 60 * 1000,

  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME,
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY,
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET,
};

export default env;
