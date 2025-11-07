// TASK 2.1: Cache service wrapper for IndexedDB operations
import { db } from './indexedDB';

// TTL constants (in milliseconds)
const BOARDS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const BOARD_DETAILS_CACHE_TTL = 2 * 60 * 1000; // 2 minutes
const MESSAGES_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const UNREAD_COUNTS_CACHE_TTL = 1 * 60 * 1000; // 1 minute

// Helper to check if cache entry is expired
const isExpired = (timestamp: number, ttl: number): boolean => {
  return Date.now() - timestamp > ttl;
};

// Boards cache
export const boardsCache = {
  async get(userId: string): Promise<any[] | null> {
    try {
      const cached = await db.boards.get(userId);
      if (!cached) return null;
      if (isExpired(cached.timestamp, BOARDS_CACHE_TTL)) {
        await db.boards.delete(userId);
        return null;
      }
      return cached.boards;
    } catch (error) {
      console.warn('[cache] Error reading boards cache:', error);
      return null;
    }
  },

  async set(userId: string, boards: any[]): Promise<void> {
    try {
      await db.boards.put({
        userId,
        boards,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.warn('[cache] Error writing boards cache:', error);
    }
  },

  async clear(userId?: string): Promise<void> {
    try {
      if (userId) {
        await db.boards.delete(userId);
      } else {
        await db.boards.clear();
      }
    } catch (error) {
      console.warn('[cache] Error clearing boards cache:', error);
    }
  },
};

// Board details cache
export const boardDetailsCache = {
  async get(boardCode: string): Promise<{ details: any; comments: any[] } | null> {
    try {
      const cached = await db.boardDetails.get(boardCode);
      if (!cached) return null;
      if (isExpired(cached.timestamp, BOARD_DETAILS_CACHE_TTL)) {
        await db.boardDetails.delete(boardCode);
        return null;
      }
      return {
        details: cached.details,
        comments: cached.comments,
      };
    } catch (error) {
      console.warn('[cache] Error reading board details cache:', error);
      return null;
    }
  },

  async set(boardCode: string, details: any, comments: any[]): Promise<void> {
    try {
      await db.boardDetails.put({
        boardCode,
        details,
        comments,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.warn('[cache] Error writing board details cache:', error);
    }
  },

  async clear(boardCode?: string): Promise<void> {
    try {
      if (boardCode) {
        await db.boardDetails.delete(boardCode);
      } else {
        await db.boardDetails.clear();
      }
    } catch (error) {
      console.warn('[cache] Error clearing board details cache:', error);
    }
  },
};

// Messages cache
export const messagesCache = {
  async get(boardId: string): Promise<any[] | null> {
    try {
      const cached = await db.messages.get(boardId);
      if (!cached) return null;
      if (isExpired(cached.timestamp, MESSAGES_CACHE_TTL)) {
        await db.messages.delete(boardId);
        return null;
      }
      return cached.messages;
    } catch (error) {
      console.warn('[cache] Error reading messages cache:', error);
      return null;
    }
  },

  async set(boardId: string, messages: any[]): Promise<void> {
    try {
      await db.messages.put({
        boardId,
        messages,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.warn('[cache] Error writing messages cache:', error);
    }
  },

  async clear(boardId?: string): Promise<void> {
    try {
      if (boardId) {
        await db.messages.delete(boardId);
      } else {
        await db.messages.clear();
      }
    } catch (error) {
      console.warn('[cache] Error clearing messages cache:', error);
    }
  },
};

// Unread counts cache
export const unreadCountsCache = {
  async get(userId: string): Promise<Record<string, number> | null> {
    try {
      const cached = await db.unreadCounts.get(userId);
      if (!cached) return null;
      if (isExpired(cached.timestamp, UNREAD_COUNTS_CACHE_TTL)) {
        await db.unreadCounts.delete(userId);
        return null;
      }
      return cached.counts;
    } catch (error) {
      console.warn('[cache] Error reading unread counts cache:', error);
      return null;
    }
  },

  async set(userId: string, counts: Record<string, number>): Promise<void> {
    try {
      await db.unreadCounts.put({
        userId,
        counts,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.warn('[cache] Error writing unread counts cache:', error);
    }
  },

  async clear(userId?: string): Promise<void> {
    try {
      if (userId) {
        await db.unreadCounts.delete(userId);
      } else {
        await db.unreadCounts.clear();
      }
    } catch (error) {
      console.warn('[cache] Error clearing unread counts cache:', error);
    }
  },
};

// Merge strategy: timestamp-based, last-write-wins for conflicts
export const mergeCacheData = <T extends { createdAt?: string; id?: string }>(
  cached: T[],
  fresh: T[]
): T[] => {
  const map = new Map<string, T>();
  
  // Add cached items first
  cached.forEach((item) => {
    const key = item.id ?? item.createdAt ?? Math.random().toString();
    map.set(key, item);
  });
  
  // Overwrite with fresh items (last-write-wins)
  fresh.forEach((item) => {
    const key = item.id ?? item.createdAt ?? Math.random().toString();
    map.set(key, item);
  });
  
  return Array.from(map.values());
};

