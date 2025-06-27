// src/routes/user.routes.ts
import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.get('/profile', authenticate, (req, res) => {
  res.status(200).json({
    message: 'Protected route accessed!',
    user: req.user,
  });
});

export default router;