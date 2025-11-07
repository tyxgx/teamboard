import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import compression from 'compression';
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

const app = express();

// Restrict CORS via env; default to permissive for local dev
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';
app.use(
  cors({
    origin: FRONTEND_ORIGIN === '*' ? true : FRONTEND_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
  })
);
app.use(compression());
app.use(express.json());

// ✅ Health check
app.get('/', (req: Request, res: Response) => {
  res.send('TeamBoard API is running');
});

// ✅ Light caching for board list endpoint
app.get('/api/boards', (req: Request, res: Response, next: NextFunction) => {
  res.set('Cache-Control', 'private, max-age=15');
  next();
});

// ✅ Route registrations
app.use('/api/auth', authRoutes);
app.use('/api/boards', boardRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/user', userRoutes);
app.use(testRoutes); // ✅ ADD this line

// ✅ Swagger API docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 🛑 Global error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('💥 Server Error:', err.stack);
  res.status(500).json({ message: 'Something broke!' });
});

export default app;
