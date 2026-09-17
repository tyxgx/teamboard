// Board-level RBAC. This app has no global admin/member roles gating actions (that's dead
// code — see CODE_REVIEW.md M1); authorization is per-board: whoever creates a board becomes
// its ADMIN member, everyone who joins afterward is a MEMBER. These tests specifically cover
// the delete-permission bug fixed in board.controller.ts (CODE_REVIEW.md C1): previously any
// member — not just an admin — could delete a shared board for everyone.
import request from 'supertest';
import app from '../src/index';
import { loginAsNewUser } from './helpers/auth';

async function createBoard(token: string, name: string) {
  const res = await request(app)
    .post('/api/boards')
    .set('Authorization', `Bearer ${token}`)
    .send({ name });
  return res;
}

describe('🔐 Board-level RBAC', () => {
  it('the creator of a board becomes its ADMIN', async () => {
    const { token } = await loginAsNewUser();
    const res = await createBoard(token, 'Admin-by-creation Board');

    expect(res.statusCode).toBe(201);
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0].role).toBe('ADMIN');
  });

  it('a regular MEMBER cannot delete a shared board (this is the bug from CODE_REVIEW.md C1)', async () => {
    const admin = await loginAsNewUser({ name: 'Board Admin' });
    const member = await loginAsNewUser({ name: 'Board Member' });

    const board = await createBoard(admin.token, 'Shared Board');
    const boardId = board.body.id;
    const boardCode = board.body.code;

    const joinRes = await request(app)
      .post('/api/boards/join')
      .set('Authorization', `Bearer ${member.token}`)
      .send({ code: boardCode });
    expect(joinRes.statusCode).toBe(200);

    const deleteRes = await request(app)
      .delete(`/api/boards/${boardId}`)
      .set('Authorization', `Bearer ${member.token}`);

    expect(deleteRes.statusCode).toBe(403);

    // Confirm the board genuinely still exists (this is the failure mode the bug caused —
    // deletion silently succeeding for a non-admin).
    const stillThere = await request(app)
      .get(`/api/boards/${boardId}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(stillThere.statusCode).toBe(200);
  });

  it('the board admin (creator) CAN delete the board', async () => {
    const admin = await loginAsNewUser({ name: 'Deleting Admin' });
    const board = await createBoard(admin.token, 'Board To Delete');

    const deleteRes = await request(app)
      .delete(`/api/boards/${board.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(deleteRes.statusCode).toBe(204);

    // deleteBoard cascades: it deletes BoardMembership rows before deleting the Board itself.
    // getBoardById checks membership before board existence, so a deleted board reads back as
    // 403 ("not a member"), not 404 — that's existing, intentional-enough behavior, not part
    // of the bug this test is otherwise guarding (see CODE_REVIEW.md C1).
    const afterDelete = await request(app)
      .get(`/api/boards/${board.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(afterDelete.statusCode).toBe(403);
  });

  it('a non-admin member cannot toggle anonymous mode', async () => {
    const admin = await loginAsNewUser();
    const member = await loginAsNewUser();

    const board = await createBoard(admin.token, 'Anonymous Toggle Board');
    await request(app)
      .post('/api/boards/join')
      .set('Authorization', `Bearer ${member.token}`)
      .send({ code: board.body.code });

    const res = await request(app)
      .patch(`/api/boards/${board.body.id}/anonymous`)
      .set('Authorization', `Bearer ${member.token}`)
      .send({ enabled: true });

    expect(res.statusCode).toBe(403);
  });
});
