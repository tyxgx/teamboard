// The backend runs on a free Render instance that sleeps when idle (~40-60 s cold start).
// Ping /health as soon as the app loads so it is already awake by the time someone signs in.
import axios from 'axios';

const BACKEND = (import.meta.env.VITE_BACKEND_URL as string) || 'https://teamboard-gees.onrender.com';

let warmup: Promise<boolean> | null = null;

/** Fire-and-forget wake-up; resolves true once /health answers. Safe to call repeatedly. */
export function wakeBackend(): Promise<boolean> {
  if (!warmup) {
    warmup = axios
      .get(`${BACKEND}/health`, { timeout: 90_000 })
      .then(() => true)
      .catch(() => false);
  }
  return warmup;
}

/** POST that retries while the server is still waking (Render answers 502/503 or drops the connection). */
export async function postWithWakeRetry<T>(url: string, body: unknown, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await axios.post<T>(url, body, { timeout: 90_000 });
      return res.data;
    } catch (e) {
      lastErr = e;
      const status = axios.isAxiosError(e) ? e.response?.status : undefined;
      const transient = status === undefined || status === 502 || status === 503 || status === 504;
      if (!transient || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 4_000));
    }
  }
  throw lastErr;
}
