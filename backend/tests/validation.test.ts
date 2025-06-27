import request from 'supertest';
import app from '../src/index';
import prisma from '../src/db/client';
import bcrypt from 'bcryptjs';

let token = '';

beforeAll(async () => {
  // Seed known user
  await prisma.user.upsert({
    where: { email: 'valid@example.com' },
    update: {},
    create: {
      name: 'Seeded User',
      email: 'valid@example.com',
      password: await bcrypt.hash('test123', 10),
      role: 'ADMIN',
    },
  });

  // Login to get token
  const loginRes = await request(app).post('/api/auth/login').send({
    email: 'valid@example.com',
    password: 'test123',
  });

  token = `Bearer ${loginRes.body.token}`;
});

describe('🧪 Zod Validation Errors', () => {
  it('should fail signup with missing fields', async () => {
    const res = await request(app).post('/api/auth/signup').send({ name: 'Only Name' });
    expect(res.statusCode).toBe(400);
  });

  it('should fail board creation with missing name', async () => {
    const res = await request(app).post('/api/boards').set('Authorization', token).send({});
    expect(res.statusCode).toBe(400);
  });

  it('should fail comment creation with empty content & invalid boardId', async () => {
    const res = await request(app).post('/api/comments').set('Authorization', token).send({
      content: '',
      visibility: 'EVERYONE',
      boardId: '123',
    });
    expect(res.statusCode).toBe(400);
  });
});
