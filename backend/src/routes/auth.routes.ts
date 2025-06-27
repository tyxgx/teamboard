// src/routes/auth.routes.ts
import express from 'express';
import { googleLogin } from '../controllers/auth.controller';

const router = express.Router();

/**
 * @swagger
 * /api/auth/google:
 *   post:
 *     summary: Login or signup with Google
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - idToken
 *             properties:
 *               idToken:
 *                 type: string
 *                 description: Google ID token
 *                 example: ya29.a0AfH6SMD7...
 *     responses:
 *       200:
 *         description: JWT and user data returned
 *       401:
 *         description: Invalid Google token
 */
router.post('/google', googleLogin as unknown as express.RequestHandler);

export default router;