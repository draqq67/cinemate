import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import authRoutes from './routes/authRoutes.js';
import movieRoutes from './routes/movieRoutes.js';
import userRoutes from './routes/userRoutes.js';
import recommendationRoutes from './routes/recommendationRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import personRoutes from './routes/personRoutes.js';
import listRoutes from './routes/listRoutes.js';
import activityRoutes from './routes/activityRoutes.js';
import watchPartyRoutes from './routes/watchPartyRoutes.js';
import importRoutes from './routes/importRoutes.js';
import dmRoutes from './routes/dmRoutes.js';
import insightsRoutes from './routes/insightsRoutes.js';
import { register, metricsMiddleware } from './middleware/metrics.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const openApiSpec = JSON.parse(readFileSync(join(__dirname, 'swagger/openapi.json'), 'utf-8'));

dotenv.config();

const app = express();
app.set('trust proxy', 1);

// nginx handles X-Frame-Options, Referrer-Policy and CSP — disable those in helmet to avoid duplicate/conflicting headers
app.use(helmet({
  frameguard:            false,
  referrerPolicy:        false,
  contentSecurityPolicy: false,
}));
app.disable('x-powered-by');

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());
app.use(morgan('dev'));
app.use(metricsMiddleware);

// Scraped by Prometheus over the internal `monitoring` network — not proxied by nginx
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
app.use('/api/auth', authRoutes);
app.use('/api/movies', movieRoutes);
app.use('/api/users', userRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/people', personRoutes);
app.use('/api/lists', listRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/party', watchPartyRoutes);
app.use('/api/import', importRoutes);
app.use('/api/dm', dmRoutes);
app.use('/api/admin/insights', insightsRoutes);

export default app;
