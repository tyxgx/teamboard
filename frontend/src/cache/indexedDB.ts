// TASK 2.1: IndexedDB database setup using Dexie.js for persistent local cache
import Dexie, { Table } from 'dexie';

// Import types from BoardRoomPage (we'll need to define these or import them)
// For now, using any to avoid circular dependencies - we'll type properly in cacheService

interface BoardCache {
  userId: string;
  boards: any[]; // BoardSummary[]
  timestamp: number;
}

interface BoardDetailsCache {
  boardCode: string;
  details: any; // BoardDetails
  comments: any[]; // ChatMessage[]
  timestamp: number;
}

interface MessagesCache {
  boardId: string;
  messages: any[]; // ChatMessage[]
  timestamp: number;
}

interface UnreadCountsCache {
  userId: string;
  counts: Record<string, number>;
  timestamp: number;
}

class TeamBoardDB extends Dexie {
  boards!: Table<BoardCache, string>;
  boardDetails!: Table<BoardDetailsCache, string>;
  messages!: Table<MessagesCache, string>;
  unreadCounts!: Table<UnreadCountsCache, string>;

  constructor() {
    super('TeamBoardDB');
    this.version(1).stores({
      boards: 'userId',
      boardDetails: 'boardCode',
      messages: 'boardId',
      unreadCounts: 'userId',
    });
  }
}

export const db = new TeamBoardDB();

