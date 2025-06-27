import express from 'express';
import { createBoard, getBoards, getBoardById, joinBoard } from '../controllers/board.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = express.Router();

// Create a new board (Only authenticated users can create, they become ADMIN by default)
router.post('/', authenticate, createBoard);

// Get all boards where user is a member
router.get('/', authenticate, getBoards);

// Get a specific board with filtered comments
router.get('/:id', authenticate, getBoardById);

router.post('/join', authenticate, joinBoard);

export default router;