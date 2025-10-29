import express from 'express';
import { createBoard, getBoards, getBoardById, joinBoard, getBoardByCode } from '../controllers/board.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = express.Router();

// Create a new board (Only authenticated users can create, they become ADMIN by default)
router.post('/', authenticate, createBoard);

// Get all boards where user is a member
router.get('/', authenticate, getBoards);

// Get a specific board with filtered comments
// Lookup board by invite code (must be before :id route)
router.get('/by-code/:code', authenticate, getBoardByCode);

router.get('/:id', authenticate, getBoardById);

router.post('/join', authenticate, joinBoard);

export default router;
