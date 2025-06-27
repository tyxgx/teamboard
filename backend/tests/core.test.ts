import request from 'supertest';
import app from '../src/index';
import prisma from '../src/db/client'; // 👈 Your Prisma client
import bcrypt from 'bcryptjs';

beforeAll(async () => {
  // 🧪 Seed a known test user for login test
  await prisma.user.upsert({
    where: { email: 'testuser@example.com' },
    update: {},
    create: {
      name: 'Seeded User',
      email: 'testuser@example.com',
      password: await bcrypt.hash('test123', 10),
      role: 'MEMBER',
    },
  });
});

describe('🔐 AUTH TESTS', () => {
  it('should signup a new user', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({
        name: 'Test User',
        email: `testuser${Date.now()}@example.com`, // ✅ Unique email
        password: 'test123',
        role: 'MEMBER',
      });
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('message');
  });

  it('should not allow signup with missing email', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      name: 'No Email User',
      password: 'test123',
      role: 'MEMBER',
    });
    expect(res.statusCode).toBe(400); // ✅ Zod should catch missing email
  });

  it('should login a user with valid credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'testuser@example.com',
      password: 'test123',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('token');
  });
});

describe('📋 BOARD TESTS', () => {
  it('should not allow creating board without token', async () => {
    const res = await request(app).post('/api/boards').send({ name: 'Project X' });
    expect(res.statusCode).toBe(401);
  });
});

describe('💬 COMMENT TESTS', () => {
  it('should reject comment creation without token', async () => {
    const res = await request(app).post('/api/comments').send({
      content: 'This is a comment',
      visibility: 'EVERYONE',
      boardId: 'some-board-id',
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('🛡️ MIDDLEWARE TESTS', () => {
  it('should reject requests with no token', async () => {
    const res = await request(app).get('/api/boards');
    expect(res.statusCode).toBe(401);
  });
});
