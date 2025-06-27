import request from 'supertest';
import app from '../src/index';

describe('🔐 JWT Token Auth Flow', () => {
  let token: string;

  beforeAll(async () => {
    const email = `jwtuser${Date.now()}@example.com`;

    await request(app).post('/api/auth/signup').send({
      name: 'JWT User',
      email,
      password: 'jwt123',
      role: 'MEMBER',
    });

    const res = await request(app).post('/api/auth/login').send({
      email,
      password: 'jwt123',
    });

    token = res.body.token;
  });

  it('should access protected route with valid token', async () => {
    const res = await request(app).get('/api/boards').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
  });

  it('should reject access with invalid token', async () => {
    const res = await request(app).get('/api/boards').set('Authorization', 'Bearer invalidtoken');

    expect(res.statusCode).toBe(401);
  });
});
