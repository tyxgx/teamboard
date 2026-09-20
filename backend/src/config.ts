/**
 * Startup configuration checks. Kept separate from index.ts so tests can call it directly.
 * In production a missing secret is a hard failure: a server that boots without JWT_SECRET
 * cannot authenticate anyone and would only fail later, confusingly, on the first login.
 */
export type ConfigReport = { errors: string[]; warnings: string[] };

export function checkConfig(env: NodeJS.ProcessEnv = process.env): ConfigReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProd = env.NODE_ENV === 'production';

  if (!env.DATABASE_URL) errors.push('DATABASE_URL is not set');

  if (!env.JWT_SECRET) {
    (isProd ? errors : warnings).push('JWT_SECRET is not set; authentication will fail');
  } else if (isProd && env.JWT_SECRET.length < 16) {
    errors.push('JWT_SECRET is too short for production (need at least 16 characters)');
  }

  const origin = env.FRONTEND_ORIGIN;
  if (!origin || origin === '*') {
    (isProd ? warnings : []).push(
      'FRONTEND_ORIGIN is not set; CORS accepts every origin. Set it to the frontend URL.'
    );
  }

  return { errors, warnings };
}
