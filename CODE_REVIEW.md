# TeamBoard — Code Review (Industry-Standards / Customer-Usability Audit)

Reviewed 2026-09-17. Backend: Node.js/Express/Prisma/PostgreSQL/Socket.io. Frontend:
React/Vite/TypeScript. Scope: all backend `src/`, all frontend `src/`, Prisma schema +
migrations, test suite, CI workflow.

## Summary verdict

**Not yet at industry standard, and not safely customer-usable in its current state.**
The core real-time architecture (optimistic UI, message dedup, cursor pagination, DB
indexing) is genuinely well thought out — better than most portfolio projects. But there
are three bugs that would fail any real code review outright: a broken authorization check
that lets any member delete a shared board for everyone, a Socket.io layer with zero
membership checks that leaks "anonymous" senders' real identities and admin-only messages
to every client in real time, and a backend test suite that no longer matches the app at
all (references a password-based auth system that was fully replaced by Google OAuth,
would fail to compile/run if `npm test` were actually executed in CI). None of these are
hard to fix, but as shipped, a stranger using this today could have a board deleted out
from under them by another member, or have their "anonymous" admin-only message
de-anonymized to every other member in the room in real time.

## Strengths (genuine, worth keeping in the story)

- **Prisma schema is well-designed**: composite indexes actually match query patterns
  (`boardId+createdAt+id`, `boardId+visibility+createdAt`), correct unique constraints
  (`userId_boardId`, `boardId+clientId` for idempotent message dedup). This is real schema
  design, not default scaffolding.
- **Optimistic UI + exactly-once message delivery is correctly implemented**: client-generated
  `clientId` + a unique DB constraint + catching Prisma's `P2002` conflict and re-fetching
  the existing row (`comment.controller.ts` `realtimeCreateComment`) is a legitimately
  correct pattern for retries under flaky networks — above tutorial level.
- **Cursor-based pagination** for comments (`cursor`/`before`/`cursorId` composite cursor,
  not naive offset-only) is the right approach for a chat-style feed.
- **Production instincts are present**: graceful `SIGTERM` shutdown, `unhandledRejection`/
  `uncaughtException` handlers that log instead of silently crashing, DB connection failure
  that doesn't kill the process (`server.ts`).
- **Real CI pipeline scaffolding** exists (lint + prettier + `tsc --noEmit` + tests against
  an actual Postgres service container) — most solo portfolio projects have none at all.
- **Two real production bugs already found and fixed** independently (Google Sign-In
  synthetic-click issue, cross-region Supabase DB mismatch) — documented, genuine debugging,
  not just feature-building.
- Per-endpoint HTTP caching (`Cache-Control` + `stale-while-revalidate`) tuned to each
  endpoint's actual update frequency — real performance thinking, not copy-pasted defaults.

## Problems by severity

### Critical

**✅ RESOLVED (2026-09-17)** — C1, C2, and C3 below were fixed in this pass. See the end of
this document for a summary of exactly what changed and how it was verified. Not committed
yet — awaiting Uttkarsh's review since this is a live portfolio project.

**C1 — Any board member can permanently delete the entire board for everyone.**
`backend/src/controllers/board.controller.ts`, `deleteBoard()` (line ~528) and
`bulkDeleteBoards()` (line ~644). The authorization check only verifies
`getBoardMembership(...)` returns *any* membership (`if (!membership) { 403 }`) — it never
checks `membership.role === 'ADMIN'` or `board.createdBy === userId`. Contrast with
`updateBoardAnonymous()` (line ~408), which does this check correctly. **Failure scenario**:
a regular MEMBER (not admin) on a shared team board calls `DELETE /api/boards/:id` and
wipes the board, all its comments, and all memberships for every other member — no
recovery. The code comment even says "Allow deletion if user has any membership (ACTIVE or
LEFT)", suggesting this was an intentional-but-wrong design decision, not an oversight in
one line.

**C2 — Socket.io real-time layer has zero authorization and leaks anonymous senders' real
identities + admin-only messages to every connected client.**
`backend/src/sockets/socket.ts`, the `join-board` handler (line ~56):
`socket.on("join-board", ({ boardCode, name }) => { socket.join(boardCode); ... })` — no
JWT check, no membership lookup, nothing stops any socket connection from joining any
board's room by boardCode alone. Worse: `comment.controller.ts` broadcasts
`io.to(room).emit('receive-message', { ..., actualSender, ... })` and the equivalent
`message:new` event to **the entire room** with `actualSender` (the real name behind an
"anonymous" message) included whenever the sender is anonymous — there is no per-socket
filtering by role. The REST fetch path (`respondWithRealtimeComments`) correctly hides
`actualSender` from non-admins, but the socket broadcast path does not. **Failure
scenario**: (a) anyone who obtains a board's 8-character invite code — shared by design,
since it's how people join — can connect a socket and silently listen to every live message
in that board, including ones marked `ADMIN_ONLY`, without ever being a member; (b) even a
legitimate non-admin MEMBER who is properly in the room receives the real name behind every
"anonymous" message the instant it's sent, completely defeating the anonymity feature the
README advertises as a core capability, for anyone who has the client open.

**C3 — The entire backend test suite tests an app that no longer exists.**
`backend/tests/rbac.test.ts`, `core.test.ts`, `jwt.test.ts`, `validation.test.ts`, and
`tests/setup.ts` all call `POST /api/auth/signup` and `POST /api/auth/login` with an
email/password, and seed users via `prisma.user.create({ ..., password: await
bcrypt.hash(...) })`. **None of this exists anymore**: `auth.routes.ts` only exposes
`POST /api/auth/google` (Google OAuth), and the current `schema.prisma` `User` model has no
`password` field at all. This means: `prisma.user.upsert(...)`/`.create(...)` calls in every
test file reference a field that doesn't exist on the Prisma-generated type (a TypeScript
compile error under `ts-jest`), and even if that were bypassed, every request to
`/api/auth/signup`/`/api/auth/login` would 404. `backend/.github/workflows/ci.yml` runs
`npm test` on every push to `main` and every PR. Either this CI is failing on every run
right now, or the workflow/tests were never re-verified after the auth system was rewritten
to Google OAuth. **This is the finding most likely to be caught immediately by anyone doing
a real technical review** — checking the Actions tab or trying to run `npm test` locally
surfaces it in under a minute.

### High

**✅ RESOLVED (2026-09-17) — H1 and H2 below were fixed in the same pass as the Critical
items above.**

**H1 — Board creation and joining have zero input validation despite a schema existing for
exactly this.** `backend/src/validators/board.schema.ts` defines `boardSchema` (name must
be a non-empty string) but it is **never imported anywhere** (confirmed via repo-wide
grep). `createBoard()` and `joinBoard()` in `board.controller.ts` read `req.body.name` /
`req.body.code` directly with no `validate()` middleware, unlike every other mutating route
in the same file. A board can be created with an empty/whitespace name or an arbitrarily
long one.

**H2 — Frontend IndexedDB cache leaks data across users on a shared device; never cleared
on logout.** `frontend/src/cache/cacheService.ts`: `boardDetailsCache` is keyed by
`boardCode` and `messagesCache` by `boardId` — **not by user**. The logout flow in
`BoardRoomPage.tsx` (line ~2292) only does `localStorage.removeItem("token"/...)` — there is
no call to `boardsCache.clear()`, `boardDetailsCache.clear()`, or `messagesCache.clear()`
anywhere in the codebase (confirmed via grep across `App.tsx`/`BoardRoomPage.tsx`).
**Failure scenario**: on a shared/public computer, User A uses TeamBoard, logs out; User B
logs in on the same browser. Before (or if offline, indefinitely instead of) a fresh network
fetch overwrites it, User B's UI can render User A's cached board list and message history
straight from IndexedDB, because the cache-first architecture the README markets as a
feature reads local cache before checking who's asking.

**H3 — In-memory per-instance user cache breaks role updates and horizontal scaling.**
`backend/src/middlewares/auth.middleware.ts`: a module-level `Map` caches the full `User`
row for 5 minutes per userId. A role change (promote to ADMIN, etc.) won't take effect for
up to 5 minutes on that server process. More importantly, this cache is **per-process** —
the moment this app runs on more than one server instance (Render can auto-scale), each
instance has its own inconsistent cache with no shared invalidation, silently reintroducing
stale-permission bugs under load.

**H4 — No rate limiting, no `helmet`, anywhere.** Confirmed via `package.json` (no
`express-rate-limit`, `helmet`, or equivalent in dependencies) and a repo-wide grep. The
Google-login endpoint, comment creation, and every other route are open to unlimited
request volume from a single client — not itself catastrophic given Google verifies the ID
token, but a real gap for a production-facing API.

**H5 — `BoardRoomPage.tsx` is a 2,658-line single component.** It owns routing effects,
socket lifecycle, caching, optimistic-message reconciliation, and most of the UI in one
file. This is the kind of file an interviewer would open, see the line count, and stop
reading favorably — it's a strong signal of "grew organically without refactoring," not
planned architecture, regardless of whether the logic inside is individually correct.

**H6 — No `ErrorBoundary` anywhere in the React app.** Confirmed via grep for
`ErrorBoundary`/`componentDidCatch` across the whole frontend — zero matches.
`App.tsx` wraps `BoardRoomPage` in `<Suspense>` for the lazy-load loading state, but nothing
catches a render-time exception. **Failure scenario**: any unhandled exception thrown during
render (in that 2,658-line component, there are many chances) shows the user a permanent
blank white screen with no recovery path and no error message.

### Medium

**M1 — `rbac.middleware.ts` is entirely dead code.** `isAdmin`, `isMember`, `checkRole` are
exported but never imported into any route file (confirmed via grep). Real authorization is
duplicated inline per-controller instead — which is exactly how C1 (the board-delete bug)
went unnoticed: there's no single reusable, testable authorization gate to audit.

**✅ RESOLVED (2026-09-17)**

**M2 — Comment content has no maximum length.** `validators/comment.schema.ts`:
`content: z.string().min(1, ...)` — no `.max(...)`. Stored in Postgres as an unbounded
`String` and broadcast in full to every socket in the room. A single very large message is
both a minor storage/bandwidth concern and a real-time payload-size concern for every
connected client.

**M3 — Type safety is significantly eroded for a TypeScript-first project.** 10 explicit
`: any` annotations in backend `src/` (controllers/middlewares/routes), 61 `any`/`as any`
occurrences in frontend `src/`. The README markets "TypeScript for type-safe UI
development" and "type-safe database operations" as headline features; the actual `any`
density undercuts that claim in several of the exact files handling auth and board data.

**M4 — No structured logging.** 63 raw `console.log`/`console.warn`/`console.error` calls
across the backend, no `winston`/`pino`/equivalent, no consistent log levels beyond ad hoc
`NODE_ENV` checks scattered per-file. Fine for local dev, not fine for debugging a live
production incident (Render logs become an unstructured wall of emoji-prefixed strings).

**M5 — A debug/echo route ships to production with no environment gate.**
`backend/src/routes/test.ts` mounts `GET /api/test-auth` (behind auth, but with no
`NODE_ENV` check) directly on the app root with no path prefix in `index.ts`
(`app.use(testRoutes)`). Low actual risk (it only echoes the decoded JWT user back), but a
debug endpoint with no gate shouldn't exist in a shipped API at all.

### Low

**L1 — `User.role` is a plain string, not the `Role` enum already defined and used for
`BoardMembership.role`.** `schema.prisma`: `role String @default("MEMBER")` vs. the
`enum Role { ADMIN; MEMBER }` used elsewhere. Nothing at the DB or Prisma type level stops
an arbitrary string being persisted as a user's role — inconsistent modeling within the same
schema file.

**L2 — Migration history suggests reactive, not planned, schema evolution.** 11 migrations
for what's presented as a single project, including two separately-named "perf_indexes"
migrations and one literally named "optimization" — consistent with iterating live against
production rather than designing the schema up front. Not wrong for a personal project;
worth being honest about if this comes up in an interview ("I iterated on indexing based on
real query patterns" is a fine, true story — just don't imply it was planned from day one).

## Prioritized fix list

1. Fix C1: require `board.createdBy === userId || membership.role === 'ADMIN'` in
   `deleteBoard` and `bulkDeleteBoards`, matching the pattern already used correctly in
   `updateBoardAnonymous`.
2. Fix C2: add a JWT check to the `join-board` socket handler (verify the token, look up
   real membership before `socket.join`), and strip `actualSender` from the room-wide
   broadcast — only include it in a targeted emit to sockets belonging to verified admins,
   or drop it from the socket payload entirely and let admins fetch it via the
   already-correct REST path.
3. Fix C3: either delete the four stale test files and `tests/setup.ts` and write new ones
   against the real Google-OAuth flow (can mock `OAuth2Client.prototype.verifyIdToken`), or
   at minimum confirm current CI status and stop claiming test coverage that doesn't run.
4. Wire `boardSchema` into `POST /api/boards` and add a body-validated schema for
   `POST /api/boards/join` (H1).
5. Namespace `boardDetailsCache`/`messagesCache` by user ID and call `.clear()` on all four
   caches during logout (H2).
6. Add `express-rate-limit` (at minimum on `/api/auth/google`) and `helmet` (H4).
7. Split `BoardRoomPage.tsx` into logical pieces (socket lifecycle hook, cache/data hook,
   layout components) — even 3-4 files would meaningfully improve reviewability (H5).
8. Add a top-level `ErrorBoundary` around the app (H6).
9. Move the in-memory user cache in `auth.middleware.ts` to something that either doesn't
   cache role (cheap enough to just query every time) or invalidates on role change, and
   accept this needs revisiting if/when this ever runs on >1 instance (H3).

## Changelog — fixes applied 2026-09-17 (not yet committed)

**C1 fixed** — `board.controller.ts`: `deleteBoard` and `bulkDeleteBoards` now require
`isAdmin(userId, board, membership)` (creator or ADMIN membership role), reusing the helper
already used correctly by `updateBoardAnonymous`. A regular member now gets `403`.

**C2 fixed** — two parts:
- `sockets/socket.ts`: `join-board` now requires a valid JWT (sent by the frontend as
  `auth: { token }`, read from `socket.handshake.auth.token`) AND an ACTIVE `BoardMembership`
  for that board before calling `socket.join`. Verified admins additionally join a
  `${boardCode}:admin` room. Anyone failing either check gets a `join-error` event instead of
  silently joining.
- `comment.controller.ts`: both comment-creation paths now route their socket broadcasts
  through one new `broadcastNewComment()` helper. It (a) never puts `actualSender` on any
  socket payload — admins still see the real name behind an anonymous comment via the
  already-correct REST fetch, just not over the live socket — and (b) routes `ADMIN_ONLY`
  comments (`board-activity`/`receive-message`/`message:new`) to the `${boardCode}:admin`
  room only, never the general room.
- `frontend/src/socket.ts`: sends the JWT from `localStorage` as a socket.io `auth` callback
  (re-evaluated on every reconnect, so it picks up login/logout without recreating the socket)
  and logs a `join-error` to the console if the server rejects a join.

**C3 fixed** — the four test files no longer touch password auth at all:
- Deleted `tests/setup.ts` (an orphaned seed script — grep confirmed it was never imported by
  jest.config.ts or any test file, so it never actually ran as part of `npm test`; it only
  seeded a `password` field that doesn't exist on the current schema).
- Added `tests/helpers/auth.ts`: `loginAsNewUser()` mocks
  `OAuth2Client.prototype.verifyIdToken` (the one network call in the real Google-login flow)
  and drives everything else — JWT issuance, Postgres user creation — through the actual app
  code.
- Rewrote `jwt.test.ts` (Google login + JWT-gated route access), `rbac.test.ts` (board-level
  RBAC: creator becomes ADMIN; a non-admin member can't delete a board or toggle anonymous
  mode — this directly regression-tests the C1 fix; an admin can delete), `core.test.ts`
  (create/join-by-code/list boards, post/read a comment, auth-required checks), and
  `validation.test.ts` (Zod validation on board name, join code, comment content/length/
  visibility — regression-tests the H1/M2 fixes below).
- **A separate, unrelated pre-existing bug had to be fixed for the suite to even compile**:
  `req.params` destructuring (e.g. `const { id } = req.params`) inferred as `string | string[]`
  under the currently-installed `@types/express-serve-static-core@5.1.3`, which cascaded into
  ~15 Prisma type errors across `board.controller.ts` and `comment.controller.ts`. Fixed with
  `req.params as { id: string }`-style casts at each site — a type-only change, no behavior
  difference for a normal single-segment route param. **This means `npx tsc --noEmit` and
  therefore all of CI was broken by this too, independent of the C3 auth-test problem** —
  worth knowing in case it comes up.
- Verified locally (Postgres 17 via Homebrew, not Docker — Docker Desktop wasn't running):
  `npx prisma migrate deploy` clean, `npx tsc --noEmit` clean, `npm test` → **4 suites, 21
  tests, all passing**, `npm run lint` → 0 errors (20 pre-existing `any`/unused-var warnings,
  not failures). `npm run format-check` still fails, but only on 11 files this pass never
  touched (`auth.controller.ts`, `db/client.ts`, `auth.middleware.ts`, `auth.routes.ts`,
  `comment.routes.ts`, `routes/test.ts`, `user.routes.ts`, `server.ts`,
  `test-db-connection.js`, `README.md`, `pnpm-lock.yaml`) — pre-existing drift, not something
  this pass caused or fixed. Every file this pass *did* touch was run through
  `prettier --write` and is clean.

**H1 fixed** — `validators/board.schema.ts`: `boardSchema` now trims and caps board names at
200 chars; added `joinBoardSchema` (non-empty `code`). Both wired into `board.routes.ts` via
the existing `validate()` middleware (`POST /`, `POST /join`).

**H2 partially fixed** — `BoardRoomPage.tsx`'s `handleLogout` now calls `.clear()` on all four
IndexedDB caches (`boardsCache`, `boardDetailsCache`, `messagesCache`, `unreadCountsCache`),
closing the actual leak scenario (User A logs out → cache wiped → User B logs in clean).
**Not done**: namespacing the caches by user ID, which the original fix-list entry also
suggested as defense-in-depth. Clearing on logout is the load-bearing fix; namespacing would
still be worth doing if this cache layer grows, but is a larger change (touches every
cache read/write call site) that felt out of scope for this pass.

**M2 fixed** (bonus, touched anyway while fixing H1) — `validators/comment.schema.ts`:
`content` now has `.max(5000, ...)`.

**Not attempted, still open** (explicitly out of scope for this pass): H3 (in-memory
per-process user-role cache), H4 (no rate limiting/`helmet`), H5 (2,658-line
`BoardRoomPage.tsx`), H6 (no `ErrorBoundary`), M1/M3/M4/M5, L1/L2. See the sections above for
each.

**Files changed** (all uncommitted — sitting in the working tree):
`backend/src/controllers/board.controller.ts`, `backend/src/controllers/comment.controller.ts`,
`backend/src/sockets/socket.ts`, `backend/src/validators/board.schema.ts`,
`backend/src/validators/comment.schema.ts`, `backend/src/routes/board.routes.ts`,
`backend/tests/jwt.test.ts`, `backend/tests/rbac.test.ts`, `backend/tests/core.test.ts`,
`backend/tests/validation.test.ts`, `backend/tests/helpers/auth.ts` (new),
`backend/tests/setup.ts` (deleted), `frontend/src/socket.ts`, `frontend/src/BoardRoomPage.tsx`.
