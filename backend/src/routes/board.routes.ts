import express from 'express';
import {
  createBoard,
  getBoards,
  getBoardById,
  joinBoard,
  getBoardByCode,
  updateBoardAnonymous,
  updateBoardPin,
  leaveBoard,
  deleteBoard,
} from '../controllers/board.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate';
import { boardAnonymousSchema } from '../validators/boardAnonymous.schema';
import { boardPinSchema } from '../validators/boardPin.schema';

const router = express.Router();

// Create a new board (Only authenticated users can create, they become ADMIN by default)
router.post('/', authenticate, createBoard);

// Get all boards where user is a member
router.get('/', authenticate, getBoards);

// Lookup board by invite code (must be before :id route)
router.get('/by-code/:code', authenticate, getBoardByCode);

router.post('/join', authenticate, joinBoard);

router.patch('/:id/anonymous', authenticate, validate(boardAnonymousSchema), updateBoardAnonymous);

router.patch('/:id/pin', authenticate, validate(boardPinSchema), updateBoardPin);

router.delete('/:id/leave', authenticate, leaveBoard);

router.delete('/:id', authenticate, deleteBoard);

// Get a specific board with filtered comments
router.get('/:id', authenticate, getBoardById);

export default router;
