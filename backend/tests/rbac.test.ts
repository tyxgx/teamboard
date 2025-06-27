import request from 'supertest';
import app from '../src/index';

describe('🔐 RBAC TESTS', () => {
  let memberToken: string;
  let adminToken: string;

  const memberEmail = `member${Date.now()}@example.com`;
  const adminEmail = `admin${Date.now()}@example.com`;

  beforeAll(async () => {
    // Create MEMBER
    await request(app).post('/api/auth/signup').send({
      name: 'Member User',
      email: memberEmail,
      password: 'member123',
      role: 'MEMBER',
    });

    const memberLogin = await request(app).post('/api/auth/login').send({
      email: memberEmail,
      password: 'member123',
    });

    memberToken = memberLogin.body.token;

    // Create ADMIN
    await request(app).post('/api/auth/signup').send({
      name: 'Admin User',
      email: adminEmail,
      password: 'admin123',
      role: 'ADMIN',
    });

    const adminLogin = await request(app).post('/api/auth/login').send({
      email: adminEmail,
      password: 'admin123',
    });

    adminToken = adminLogin.body.token;
  });

  it('should block MEMBER from creating a board', async () => {
    const res = await request(app)
      .post('/api/boards')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ name: 'Unauthorized Board' });

    expect(res.statusCode).toBe(403);
  });

  it('should allow ADMIN to create a board', async () => {
    const res = await request(app)
      .post('/api/boards')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Admin Board' });

    expect(res.statusCode).toBe(201);
  });
});
