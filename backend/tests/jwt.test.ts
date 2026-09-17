// Auth flow: Google OAuth login (the only auth method the app has — see CODE_REVIEW.md C3,
// these tests previously exercised a password-based signup/login system that no longer
// exists) and the JWT that gates every protected route afterward.
import request from 'supertest';
import app from '../src/index';
import { loginAsNewUser } from './helpers/auth';

describe('🔐 Auth (Google OAuth) + JWT', () => {
  it('logs in via /api/auth/google and returns a token + user', async () => {
    const { token, user, email } = await loginAsNewUser({ name: 'JWT User' });

    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    expect(user.email).toBe(email);
    expect(user.name).toBe('JWT User');
  });

  it('rejects /api/auth/google with no idToken', async () => {
    const res = await request(app).post('/api/auth/google').send({});
    expect(res.statusCode).toBe(400);
  });

  it('allows a protected route with a valid token', async () => {
    const { token } = await loginAsNewUser();
    const res = await request(app).get('/api/boards').set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
  });

  it('rejects a protected route with an invalid token', async () => {
    const res = await request(app).get('/api/boards').set('Authorization', 'Bearer invalidtoken');
    expect(res.statusCode).toBe(401);
  });

  it('rejects a protected route with no token at all', async () => {
    const res = await request(app).get('/api/boards');
    expect(res.statusCode).toBe(401);
  });
});
