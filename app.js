import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import env from './config/env.js';
import corsOptions from './config/cors.js';
import apiRoutes from './routes/index.js';
import notFound from './middleware/notFound.js';
import errorHandler from './middleware/errorHandler.js';

const app = express();

// Security & logging
app.use(helmet());
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(cors(corsOptions));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API routes
app.use('/api/v1', apiRoutes);

// Health at root for load balancers
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'stellar-erp-api' });
});

app.use(notFound);
app.use(errorHandler);

export default app;
