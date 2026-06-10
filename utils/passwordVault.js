import crypto from 'crypto';
import env from '../config/env.js';

const secret =
  env.passwordVaultSecret ||
  env.jwtRefreshSecret ||
  env.jwtSecret ||
  'dev-only-vault-secret-change-me';

const key = crypto.createHash('sha256').update(String(secret)).digest(); // 32 bytes

export const encryptPasswordVault = (plainPassword = '') => {
  const iv = crypto.randomBytes(12); // recommended for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(String(plainPassword), 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return {
    encryptedPassword: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    updatedAt: new Date(),
  };
};

export const decryptPasswordVault = (vault = {}) => {
  const { encryptedPassword, iv, tag } = vault;
  if (!encryptedPassword || !iv || !tag) {
    throw new Error('Password vault not available for this user');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(String(iv), 'base64'),
  );
  decipher.setAuthTag(Buffer.from(String(tag), 'base64'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(String(encryptedPassword), 'base64')),
    decipher.final(),
  ]).toString('utf8');

  return plaintext;
};

