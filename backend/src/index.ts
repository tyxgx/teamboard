import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import compression from 'compression';
import helmet from 'helmet';
// no fs logging of envs in production
import { swaggerUi, swaggerSpec } from './swagger';
import testRoutes from './routes/test'; // ✅ ADD this line

dotenv.config();

// Avoid logging secrets or raw .env in any environment
if (!process.env.JWT_SECRET) {
  console.warn('⚠️ JWT_SECRET is not defined. Authentication will fail.');
}

import authRoutes from './routes/auth.routes';
import boardRoutes from './routes/board.routes'; // ✅ Only once
import commentRoutes from './routes/comment.routes';
import userRoutes from './routes/user.routes';
import engagementRoutes from './routes/engagement.routes';
import prisma from './db/client';
import { rateLimit } from './middlewares/rateLimit';

const app = express();

// Render (and most hosts) terminate TLS at a proxy; without this every client looks like one IP
// and per-IP rate limiting would throttle everybody together.
app.set('trust proxy', 1);

// Restrict CORS via env; default to permissive for local dev
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';
app.use(
  cors({
    origin: FRONTEND_ORIGIN === '*' ? true : FRONTEND_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
  })
);
// crossOriginResourcePolicy must allow cross-origin: the frontend loads avatars/attachments from this API.
// CSP is left off: this is a JSON API (the only HTML is the Swagger UI, which needs inline scripts).
app.use(
  helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false })
);
app.use(compression());
app.use(express.json());

// ✅ Health check
app.get('/', (req: Request, res: Response) => {
  res.send('TeamBoard API is running');
});

// Health check that also touches the database. Supabase's free tier pauses a project after ~7 days
// without activity, so the keep-alive workflow pings this route to keep the DB awake too.
app.get('/health', async (req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res
      .set('Cache-Control', 'no-store')
      .json({ status: 'ok', db: 'up', uptime: Math.round(process.uptime()) });
  } catch {
    res.status(503).set('Cache-Control', 'no-store').json({ status: 'error', db: 'down' });
  }
});

// TASK 3.3: Enhanced HTTP caching for various endpoints
// Board list - short cache (15s) since it changes frequently
app.get('/api/boards', (req: Request, res: Response, next: NextFunction) => {
  res.set('Cache-Control', 'private, max-age=15, stale-while-revalidate=30');
  next();
});

// Board details - medium cache (30s) with stale-while-revalidate
app.get('/api/boards/by-code/:code', (req: Request, res: Response, next: NextFunction) => {
  res.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=60');
  next();
});

// Comments - short cache (10s) since they update frequently
app.get('/api/comments/:boardId', (req: Request, res: Response, next: NextFunction) => {
  res.set('Cache-Control', 'private, max-age=10, stale-while-revalidate=20');
  next();
});

app.get('/api/comments/by-code/:boardCode', (req: Request, res: Response, next: NextFunction) => {
  res.set('Cache-Control', 'private, max-age=10, stale-while-revalidate=20');
  next();
});

// ✅ Route registrations
// Login is the only unauthenticated write endpoint: cap it per IP to blunt token-guessing/abuse.
app.use(
  '/api/auth',
  rateLimit({
    windowMs: 60_000,
    max: Number(process.env.AUTH_RATE_LIMIT_MAX) || (process.env.NODE_ENV === 'test' ? 10_000 : 30),
    name: 'login',
  }),
  authRoutes
);
app.use('/api/boards', boardRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/user', userRoutes);
app.use('/api', engagementRoutes);
app.use(testRoutes); // ✅ ADD this line

// ✅ Swagger API docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 🛑 Global error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('💥 Server Error:', err.stack);
  res.status(500).json({ message: 'Something broke!' });
});

export default app;
