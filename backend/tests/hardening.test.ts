import request from 'supertest';
import type { Express } from 'express';
import { checkConfig } from '../src/config';

describe('checkConfig', () => {
  const ok = {
    DATABASE_URL: 'postgres://x',
    JWT_SECRET: 'a-long-enough-secret',
    FRONTEND_ORIGIN: 'https://app.example',
  };

  it('passes a complete production config', () => {
    const r = checkConfig({ ...ok, NODE_ENV: 'production' });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('fails production without a JWT secret, or with a short one', () => {
    expect(checkConfig({ ...ok, NODE_ENV: 'production', JWT_SECRET: '' }).errors.join()).toMatch(
      /JWT_SECRET/
    );
    expect(
      checkConfig({ ...ok, NODE_ENV: 'production', JWT_SECRET: 'short' }).errors.join()
    ).toMatch(/too short/);
  });

  it('only warns about a missing JWT secret outside production', () => {
    const r = checkConfig({ DATABASE_URL: 'postgres://x', NODE_ENV: 'development' });
    expect(r.errors).toEqual([]);
    expect(r.warnings.join()).toMatch(/JWT_SECRET/);
  });

  it('always requires DATABASE_URL and warns about wildcard CORS in production', () => {
    expect(checkConfig({ NODE_ENV: 'development', JWT_SECRET: 'x' }).errors.join()).toMatch(
      /DATABASE_URL/
    );
    expect(
      checkConfig({ ...ok, NODE_ENV: 'production', FRONTEND_ORIGIN: '*' }).warnings.join()
    ).toMatch(/CORS/);
  });
});

// The app reads AUTH_RATE_LIMIT_MAX when it is imported, so set it first and load the app lazily.
let app: Express;
beforeAll(() => {
  process.env.AUTH_RATE_LIMIT_MAX = '30';
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  app = require('../src/index').default;
});

describe('HTTP hardening', () => {
  it('/health reports database status and is never cached', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'up' });
    expect(typeof res.body.uptime).toBe('number');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('sends security headers and does not advertise Express', async () => {
    const res = await request(app).get('/');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('rate-limits the login endpoint per IP', async () => {
    let last = 0;
    for (let i = 0; i < 31; i++) {
      last = (await request(app).post('/api/auth/google').send({})).status;
    }
    expect(last).toBe(429);
  });
});
