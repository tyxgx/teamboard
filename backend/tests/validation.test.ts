// Zod validation on the real current routes. Also covers the two validation gaps closed
// alongside this test rewrite (see CODE_REVIEW.md H1 / M2): board name/join-code validation
// wasn't wired into the routes at all, and comment content had no max length.
import request from 'supertest';
import app from '../src/index';
import { loginAsNewUser } from './helpers/auth';

describe('🧪 Zod validation', () => {
  it('rejects Google login with no idToken', async () => {
    const res = await request(app).post('/api/auth/google').send({});
    expect(res.statusCode).toBe(400);
  });

  it('rejects board creation with a missing name', async () => {
    const { token } = await loginAsNewUser();
    const res = await request(app)
      .post('/api/boards')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.statusCode).toBe(400);
  });

  it('rejects board creation with an empty/whitespace-only name', async () => {
    const { token } = await loginAsNewUser();
    const res = await request(app)
      .post('/api/boards')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '   ' });
    expect(res.statusCode).toBe(400);
  });

  it('rejects joining a board with no code', async () => {
    const { token } = await loginAsNewUser();
    const res = await request(app)
      .post('/api/boards/join')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.statusCode).toBe(400);
  });

  it('rejects comment creation with empty content and a non-UUID boardId', async () => {
    const { token } = await loginAsNewUser();
    const res = await request(app)
      .post('/api/comments')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: '', visibility: 'EVERYONE', boardId: 'not-a-uuid' });
    expect(res.statusCode).toBe(400);
  });

  it('rejects comment creation over the 5000-character limit', async () => {
    const { token } = await loginAsNewUser();
    const board = await request(app)
      .post('/api/boards')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Validation Board' });

    const res = await request(app)
      .post('/api/comments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        content: 'x'.repeat(5001),
        visibility: 'EVERYONE',
        boardId: board.body.id,
      });
    expect(res.statusCode).toBe(400);
  });

  it('rejects comment creation with an invalid visibility value', async () => {
    const { token } = await loginAsNewUser();
    const board = await request(app)
      .post('/api/boards')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Validation Board 2' });

    const res = await request(app)
      .post('/api/comments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        content: 'hi',
        visibility: 'NOT_A_REAL_VALUE',
        boardId: board.body.id,
      });
    expect(res.statusCode).toBe(400);
  });
});
