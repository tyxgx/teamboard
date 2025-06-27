import { Router, Request, Response } from 'express';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.get('/api/test-auth', authenticate, (req: any, res: Response) => {
  console.log('✅ Authenticated User:', req.user);
  res.json({ message: 'You are authenticated', user: req.user });
});

export default router;