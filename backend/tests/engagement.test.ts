// Reactions, replies, search, read receipts and image attachments. The point of most of these
// tests is the permission model: admin-only messages and anonymous identities must not leak
// through any of the new endpoints (see CODE_REVIEW.md C1/C2).
import http from 'http';
import request from 'supertest';
import app from '../src/index';
import { setupSocket } from '../src/sockets/socket';
import { loginAsNewUser, type TestUser } from './helpers/auth';

// The realtime create path broadcasts over Socket.io, so the server must be initialised (server.ts does this in prod).
beforeAll(() => {
  setupSocket(http.createServer());
});

const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });

async function setup() {
  const admin = await loginAsNewUser({ name: 'Alice Admin' });
  const member = await loginAsNewUser({ name: 'Mo Member' });
  const outsider = await loginAsNewUser({ name: 'Olly Outsider' });
  const board = await request(app).post('/api/boards').set(auth(admin)).send({ name: 'Eng Board' });
  const join = await request(app).post('/api/boards/join').set(auth(member)).send({ code: board.body.code });
  expect(join.statusCode).toBe(200);
  return { admin, member, outsider, boardId: board.body.id as string, code: board.body.code as string };
}

const post = (u: TestUser, body: Record<string, unknown>) =>
  request(app).post('/api/comments').set(auth(u)).send(body);

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);

describe('reactions', () => {
  it('toggles on and off, and only counts, never who, is broadcast-safe', async () => {
    const { admin, member, boardId } = await setup();
    const msg = await post(admin, { content: 'hello', visibility: 'EVERYONE', boardId });
    expect(msg.statusCode).toBe(201);

    const on = await request(app).post(`/api/messages/${msg.body.id}/reactions`).set(auth(member)).send({ emoji: '👍' });
    expect(on.statusCode).toBe(200);
    expect(on.body.reactions).toEqual([{ emoji: '👍', count: 1, mine: true }]);

    const seenByAdmin = await request(app).get(`/api/boards/${boardId}/reactions?ids=${msg.body.id}`).set(auth(admin));
    expect(seenByAdmin.body.reactions[msg.body.id]).toEqual([{ emoji: '👍', count: 1, mine: false }]);

    const off = await request(app).post(`/api/messages/${msg.body.id}/reactions`).set(auth(member)).send({ emoji: '👍' });
    expect(off.body.reactions).toEqual([]);
  });

  it('rejects emoji outside the allowed set', async () => {
    const { admin, boardId } = await setup();
    const msg = await post(admin, { content: 'hi', visibility: 'EVERYONE', boardId });
    const res = await request(app).post(`/api/messages/${msg.body.id}/reactions`).set(auth(admin)).send({ emoji: '💩' });
    expect(res.statusCode).toBe(400);
  });

  it('a member cannot react to (or even confirm the existence of) an admin-only message they cannot see', async () => {
    const { admin, member, boardId } = await setup();
    const hidden = await post(admin, { content: 'secret', visibility: 'ADMIN_ONLY', boardId });
    const res = await request(app).post(`/api/messages/${hidden.body.id}/reactions`).set(auth(member)).send({ emoji: '👍' });
    expect(res.statusCode).toBe(404);
    const list = await request(app).get(`/api/boards/${boardId}/reactions?ids=${hidden.body.id}`).set(auth(member));
    expect(list.body.reactions).toEqual({});
  });

  it('non-members are rejected', async () => {
    const { admin, outsider, boardId } = await setup();
    const msg = await post(admin, { content: 'hi', visibility: 'EVERYONE', boardId });
    const res = await request(app).post(`/api/messages/${msg.body.id}/reactions`).set(auth(outsider)).send({ emoji: '👍' });
    expect(res.statusCode).toBe(403);
  });
});

describe('replies', () => {
  it('a reply carries a quote of its parent and shows up in the list', async () => {
    const { admin, member, boardId, code } = await setup();
    const parent = await post(admin, { content: 'original question', visibility: 'EVERYONE', boardId });
    const reply = await post(member, { content: 'my answer', visibility: 'EVERYONE', boardId, parentId: parent.body.id });
    expect(reply.statusCode).toBe(201);
    expect(reply.body.replyTo).toMatchObject({ id: parent.body.id, sender: 'Alice Admin', snippet: 'original question' });

    const list = await request(app).get(`/api/comments/by-code/${code}`).set(auth(member));
    const found = list.body.comments.find((c: any) => c.id === reply.body.id);
    expect(found.replyTo.snippet).toBe('original question');
  });

  it('does not reveal an anonymous parent author to a member', async () => {
    const { admin, member, boardId, code } = await setup();
    const parent = await post(admin, { content: 'anon thought', visibility: 'EVERYONE', boardId, anonymous: true });
    const reply = await post(member, { content: 'agree', visibility: 'EVERYONE', boardId, parentId: parent.body.id });
    expect(reply.body.replyTo.sender).toBe('Anonymous');
    const list = await request(app).get(`/api/comments/by-code/${code}`).set(auth(member));
    const found = list.body.comments.find((c: any) => c.id === reply.body.id);
    expect(found.replyTo.sender).toBe('Anonymous');
    expect(JSON.stringify(list.body)).not.toContain('Alice Admin');
  });

  it('a reply to an admin-only message is forced admin-only, even if sent as EVERYONE', async () => {
    const { admin, member, boardId, code } = await setup();
    const parent = await post(member, { content: 'private ask', visibility: 'ADMIN_ONLY', boardId });
    const reply = await post(admin, { content: 'private answer', visibility: 'EVERYONE', boardId, parentId: parent.body.id });
    expect(reply.body.visibility).toBe('ADMIN_ONLY');
    // A different member must not see either
    const other = await loginAsNewUser({ name: 'Other' });
    await request(app).post('/api/boards/join').set(auth(other)).send({ code });
    const list = await request(app).get(`/api/comments/by-code/${code}`).set(auth(other));
    expect(list.body.comments.map((c: any) => c.id)).not.toContain(reply.body.id);
  });

  it('cannot reply to a message that is hidden from you or on another board', async () => {
    const { admin, member, boardId } = await setup();
    const hidden = await post(admin, { content: 'admin only', visibility: 'ADMIN_ONLY', boardId });
    const r1 = await post(member, { content: 'peek', visibility: 'EVERYONE', boardId, parentId: hidden.body.id });
    expect(r1.statusCode).toBe(404);

    const other = await request(app).post('/api/boards').set(auth(admin)).send({ name: 'Other board' });
    const r2 = await post(admin, { content: 'cross', visibility: 'EVERYONE', boardId: other.body.id, parentId: hidden.body.id });
    expect(r2.statusCode).toBe(404);
  });
});

describe('search', () => {
  it('finds visible messages only and masks anonymous senders for non-admins', async () => {
    const { admin, member, boardId } = await setup();
    await post(admin, { content: 'roadmap planning notes', visibility: 'EVERYONE', boardId });
    await post(admin, { content: 'roadmap salary secrets', visibility: 'ADMIN_ONLY', boardId });
    await post(admin, { content: 'roadmap anon gripe', visibility: 'EVERYONE', boardId, anonymous: true });

    const asMember = await request(app).get(`/api/boards/${boardId}/search?q=roadmap`).set(auth(member));
    expect(asMember.statusCode).toBe(200);
    const texts = asMember.body.results.map((r: any) => r.message);
    expect(texts).toContain('roadmap planning notes');
    expect(texts).not.toContain('roadmap salary secrets');
    const anon = asMember.body.results.find((r: any) => r.message === 'roadmap anon gripe');
    expect(anon.sender).toBe('Anonymous');

    const asAdmin = await request(app).get(`/api/boards/${boardId}/search?q=roadmap`).set(auth(admin));
    expect(asAdmin.body.results.map((r: any) => r.message)).toContain('roadmap salary secrets');
  });

  it('validates the query and rejects non-members', async () => {
    const { admin, outsider, boardId } = await setup();
    expect((await request(app).get(`/api/boards/${boardId}/search?q=a`).set(auth(admin))).statusCode).toBe(400);
    expect((await request(app).get(`/api/boards/${boardId}/search?q=hello`).set(auth(outsider))).statusCode).toBe(403);
  });
});

describe('read receipts', () => {
  it('records when a member caught up and reports it to others only', async () => {
    const { admin, member, boardId } = await setup();
    const put = await request(app).put(`/api/boards/${boardId}/read`).set(auth(member));
    expect(put.statusCode).toBe(200);
    const asAdmin = await request(app).get(`/api/boards/${boardId}/reads`).set(auth(admin));
    expect(asAdmin.body.reads).toHaveLength(1);
    expect(asAdmin.body.reads[0].name).toBe('Mo Member');
    const asMember = await request(app).get(`/api/boards/${boardId}/reads`).set(auth(member));
    expect(asMember.body.reads).toHaveLength(0); // never lists yourself
  });

  it('non-members cannot read or write read state', async () => {
    const { outsider, boardId } = await setup();
    expect((await request(app).put(`/api/boards/${boardId}/read`).set(auth(outsider))).statusCode).toBe(403);
    expect((await request(app).get(`/api/boards/${boardId}/reads`).set(auth(outsider))).statusCode).toBe(403);
  });
});

describe('image attachments', () => {
  const upload = (u: TestUser, boardId: string, body: Buffer, type = 'image/png') =>
    request(app).post(`/api/boards/${boardId}/attachments`).set(auth(u)).set('Content-Type', type).send(body);

  it('uploads a real PNG, attaches it to a message, and serves the same bytes back', async () => {
    const { admin, member, boardId } = await setup();
    const up = await upload(member, boardId, PNG);
    expect(up.statusCode).toBe(201);
    expect(up.body.mime).toBe('image/png');

    const msg = await post(member, { content: '', visibility: 'EVERYONE', boardId, attachmentId: up.body.id });
    expect(msg.statusCode).toBe(201);
    expect(msg.body.attachment.id).toBe(up.body.id);

    const got = await request(app).get(`/api/attachments/${up.body.id}`).set(auth(admin)).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(got.statusCode).toBe(200);
    expect(got.headers['content-type']).toContain('image/png');
    expect(got.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(got.body as Buffer, PNG)).toBe(0);
  });

  it('rejects files that are not really images, whatever the header claims (incl. SVG/HTML)', async () => {
    const { member, boardId } = await setup();
    const fake = await upload(member, boardId, Buffer.from('<svg onload="alert(1)"></svg>'), 'image/png');
    expect(fake.statusCode).toBe(415);
  });

  it('rejects uploads over the size cap', async () => {
    const { member, boardId } = await setup();
    const big = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024 + 10, 2)]);
    const res = await upload(member, boardId, big);
    expect(res.statusCode).toBe(413);
  });

  it('non-members cannot upload or fetch, and an unsent upload is private to its uploader', async () => {
    const { admin, member, outsider, boardId } = await setup();
    expect((await upload(outsider, boardId, PNG)).statusCode).toBe(403);
    const up = await upload(member, boardId, PNG);
    expect((await request(app).get(`/api/attachments/${up.body.id}`).set(auth(admin))).statusCode).toBe(404);
    expect((await request(app).get(`/api/attachments/${up.body.id}`).set(auth(member))).statusCode).toBe(200);
    expect((await request(app).get(`/api/attachments/${up.body.id}`).set(auth(outsider))).statusCode).toBe(404);
  });

  it('an image on an admin-only message is hidden from other members', async () => {
    const { member, boardId, code } = await setup();
    const other = await loginAsNewUser({ name: 'Other' });
    await request(app).post('/api/boards/join').set(auth(other)).send({ code });
    const up = await upload(member, boardId, PNG);
    await post(member, { content: 'for admins', visibility: 'ADMIN_ONLY', boardId, attachmentId: up.body.id });
    expect((await request(app).get(`/api/attachments/${up.body.id}`).set(auth(other))).statusCode).toBe(404);
  });

  it("cannot attach someone else's upload", async () => {
    const { admin, member, boardId } = await setup();
    const up = await upload(member, boardId, PNG);
    const res = await post(admin, { content: 'steal', visibility: 'EVERYONE', boardId, attachmentId: up.body.id });
    expect(res.statusCode).toBe(400);
  });
});

describe('edit and delete', () => {
  const patch = (u: TestUser, id: string, content: string) =>
    request(app).patch(`/api/messages/${id}`).set(auth(u)).send({ content });
  const del = (u: TestUser, id: string) => request(app).delete(`/api/messages/${id}`).set(auth(u));

  it('the author can edit; the text and editedAt come back in the list', async () => {
    const { member, boardId, code } = await setup();
    const msg = await post(member, { content: 'typo hre', visibility: 'EVERYONE', boardId });
    const res = await patch(member, msg.body.id, 'typo here');
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('typo here');
    const list = await request(app).get(`/api/comments/by-code/${code}`).set(auth(member));
    const found = list.body.comments.find((c: any) => c.id === msg.body.id);
    expect(found.message).toBe('typo here');
    expect(found.editedAt).toBeTruthy();
  });

  it("nobody else can edit someone's message, not even an admin", async () => {
    const { admin, member, boardId } = await setup();
    const msg = await post(member, { content: 'mine', visibility: 'EVERYONE', boardId });
    expect((await patch(admin, msg.body.id, 'hijack')).statusCode).toBe(403);
  });

  it('cannot blank out a text-only message', async () => {
    const { member, boardId } = await setup();
    const msg = await post(member, { content: 'x', visibility: 'EVERYONE', boardId });
    expect((await patch(member, msg.body.id, '   ')).statusCode).toBe(400);
  });

  it('the author can delete their own message; a plain member cannot delete others', async () => {
    const { admin, member, boardId } = await setup();
    const a = await post(admin, { content: "admin's", visibility: 'EVERYONE', boardId });
    expect((await del(member, a.body.id)).statusCode).toBe(403);
    const m = await post(member, { content: "member's", visibility: 'EVERYONE', boardId });
    expect((await del(member, m.body.id)).statusCode).toBe(204);
    expect((await patch(member, m.body.id, 'gone')).statusCode).toBe(404);
  });

  it('an admin can moderate (delete) any message they can see', async () => {
    const { admin, member, boardId } = await setup();
    const m = await post(member, { content: 'spam', visibility: 'EVERYONE', boardId });
    expect((await del(admin, m.body.id)).statusCode).toBe(204);
  });

  it('cannot edit or delete an admin-only message you cannot see, and outsiders are rejected', async () => {
    const { admin, member, outsider, boardId } = await setup();
    const hidden = await post(admin, { content: 'secret', visibility: 'ADMIN_ONLY', boardId });
    expect((await patch(member, hidden.body.id, 'x')).statusCode).toBe(404);
    expect((await del(member, hidden.body.id)).statusCode).toBe(404);
    const open = await post(admin, { content: 'open', visibility: 'EVERYONE', boardId });
    expect((await del(outsider, open.body.id)).statusCode).toBe(404);
  });

  it('deleting a parent keeps the reply and clears its quote', async () => {
    const { admin, member, boardId, code } = await setup();
    const parent = await post(admin, { content: 'question', visibility: 'EVERYONE', boardId });
    const reply = await post(member, { content: 'answer', visibility: 'EVERYONE', boardId, parentId: parent.body.id });
    expect((await del(admin, parent.body.id)).statusCode).toBe(204);
    const list = await request(app).get(`/api/comments/by-code/${code}`).set(auth(member));
    const found = list.body.comments.find((c: any) => c.id === reply.body.id);
    expect(found).toBeTruthy();
    expect(found.replyTo).toBeNull();
  });
});

describe('board preview after edit/delete', () => {
  it('does not leave removed or old text behind in the board list preview', async () => {
    const { member, boardId } = await setup();
    const msg = await post(member, { content: 'first version', visibility: 'EVERYONE', boardId });
    await request(app).patch(`/api/messages/${msg.body.id}`).set(auth(member)).send({ content: 'second version' });
    let boards = await request(app).get('/api/boards').set(auth(member));
    expect(boards.body.find((b: any) => b.id === boardId).lastCommentPreview).toBe('second version');

    await request(app).delete(`/api/messages/${msg.body.id}`).set(auth(member));
    boards = await request(app).get('/api/boards').set(auth(member));
    const b = boards.body.find((x: any) => x.id === boardId);
    expect(b.lastCommentPreview ?? null).toBeNull();
  });
});

describe('rate limiting', () => {
  it('answers 429 with Retry-After once a user floods message sends, without affecting other users', async () => {
    const { admin, member, boardId } = await setup();
    let limited: any = null;
    for (let i = 0; i < 45 && !limited; i++) {
      const res = await post(member, { content: `spam ${i}`, visibility: 'EVERYONE', boardId });
      if (res.statusCode === 429) limited = res;
    }
    expect(limited).not.toBeNull();
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    // A different user is unaffected
    expect((await post(admin, { content: 'still fine', visibility: 'EVERYONE', boardId })).statusCode).toBe(201);
  });
});
