import http from 'http';
import app from './app.js';
import env from './config/env.js';
import connectDB from './config/db.js';
import { configureCloudinary, isCloudinaryConfigured } from './config/cloudinary.js';
import './models/index.js';

const startServer = async () => {
  await connectDB();

  if (isCloudinaryConfigured()) {
    configureCloudinary();
    console.log('[cloudinary] Upload service ready');
  } else {
    console.warn('[cloudinary] Not configured — file uploads disabled');
  }

  const server = http.createServer(app);

  server.listen(env.port, () => {
    console.log(`[server] Stellar ERP API running on port ${env.port} (${env.nodeEnv})`);
  });

  const shutdown = (signal) => {
    console.log(`[server] ${signal} received — shutting down`);
    server.close(() => process.exit(0));
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

startServer().catch((err) => {
  console.error('[server] Failed to start:', err.message);
  process.exit(1);
});
