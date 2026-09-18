// Seeds two users (an admin who creates the board, and a member) and a fresh board for the
// Playwright suite, then writes their JWTs to the path given as argv[2]. Run after `prisma migrate`.
// The app only supports Google sign-in, so the E2E tests authenticate with tokens signed by the
// same JWT_SECRET the API verifies with (identical to what /api/auth/google would issue).
require('dotenv').config();
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

const out = process.argv[2];
if (!out) throw new Error('usage: node scripts/e2e-seed.js <output.json>');
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be set');

(async () => {
  const prisma = new PrismaClient();
  const stamp = Date.now().toString(36);
  const mk = async (name, key) => {
    const user = await prisma.user.upsert({
      where: { email: `${key}@e2e.test` },
      update: { name },
      create: { name, email: `${key}@e2e.test` },
    });
    return { user, token: jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' }) };
  };
  const alice = await mk('Alice Admin', 'alice');
  const mo = await mk('Mo Member', 'mo');
  const code = `E2E${stamp}`.toUpperCase().slice(0, 10);
  const board = await prisma.board.create({
    data: { name: `E2E Board ${stamp}`, code, createdBy: alice.user.id },
  });
  await prisma.boardMembership.create({ data: { userId: alice.user.id, boardId: board.id, role: 'ADMIN' } });
  await prisma.boardMembership.create({ data: { userId: mo.user.id, boardId: board.id, role: 'MEMBER' } });
  fs.writeFileSync(
    out,
    JSON.stringify({ alice: { token: alice.token, name: alice.user.name }, mo: { token: mo.token, name: mo.user.name }, code, boardId: board.id, boardName: board.name })
  );
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
