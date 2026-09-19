import { Request, Response, NextFunction } from 'express';

type Options = {
  /** Length of the window */
  windowMs: number;
  /** Requests allowed per window, per authenticated user (or per IP if there is none) */
  max: number;
  /** Identifies the limiter in the error message and keeps buckets separate */
  name: string;
};

/**
 * Small fixed-window limiter, per user. State is in memory, so it is per server instance:
 * fine for a single Render instance; swap the Map for Redis if the API is ever scaled out.
 * Must run after `authenticate` so req.user is set.
 */
export function rateLimit({ windowMs, max, name }: Options) {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
  }, windowMs);
  sweep.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.user?.id ?? req.ip ?? 'anonymous';
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.set('Retry-After', String(retryAfter));
      res.status(429).json({ message: `Too many ${name} requests. Try again in ${retryAfter}s.` });
      return;
    }
    next();
  };
}
