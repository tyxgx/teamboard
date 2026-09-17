// Core business flows: create a board, join it by invite code, post a comment, read it back.
// Also covers the same auth-required checks the old core.test.ts had, but against real routes
// (POST /api/boards, POST /api/comments) instead of a password-based signup/login flow that
// no longer exists (see CODE_REVIEW.md C3).
import request from 'supertest';
import app from '../src/index';
import { loginAsNewUser } from './helpers/auth';

describe('📋 Board lifecycle', () => {
  it('creates a board, joins it by invite code, and lists it for both members', async () => {
    const creator = await loginAsNewUser({ name: 'Creator' });
    const joiner = await loginAsNewUser({ name: 'Joiner' });

    const created = await request(app)
      .post('/api/boards')
      .set('Authorization', `Bearer ${creator.token}`)
      .send({ name: 'Core Flow Board' });
    expect(created.statusCode).toBe(201);
    const { code, id: boardId } = created.body;

    const joined = await request(app)
      .post('/api/boards/join')
      .set('Authorization', `Bearer ${joiner.token}`)
      .send({ code });
    expect(joined.statusCode).toBe(200);
    expect(joined.body.code).toBe(code);

    const creatorList = await request(app)
      .get('/api/boards')
      .set('Authorization', `Bearer ${creator.token}`);
    expect(creatorList.body.some((b: { id: string }) => b.id === boardId)).toBe(true);

    const joinerList = await request(app)
      .get('/api/boards')
      .set('Authorization', `Bearer ${joiner.token}`);
    expect(joinerList.body.some((b: { id: string }) => b.id === boardId)).toBe(true);
  });

  it('rejects joining with an invite code that does not exist', async () => {
    const { token } = await loginAsNewUser();
    const res = await request(app)
      .post('/api/boards/join')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'NOSUCHCODE' });
    expect(res.statusCode).toBe(404);
  });
});

describe('💬 Comments', () => {
  it('posts a comment on a board and reads it back', async () => {
    const { token } = await loginAsNewUser();
    const board = await request(app)
      .post('/api/boards')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Comment Flow Board' });

    const posted = await request(app)
      .post('/api/comments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        content: 'Hello from the test suite',
        visibility: 'EVERYONE',
        boardId: board.body.id,
      });
    expect(posted.statusCode).toBe(201);

    const fetched = await request(app)
      .get(`/api/comments/${board.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(fetched.statusCode).toBe(200);
  });

  it('rejects comment creation without a token', async () => {
    const res = await request(app).post('/api/comments').send({
      content: 'This is a comment',
      visibility: 'EVERYONE',
      boardId: '00000000-0000-0000-0000-000000000000',
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects creating a board without a token', async () => {
    const res = await request(app).post('/api/boards').send({ name: 'Should Fail' });
    expect(res.statusCode).toBe(401);
  });
});
