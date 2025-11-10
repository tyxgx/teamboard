Pre-flight

- Env flags default OFF:
  - In backend .env: RTM_ENABLED=false (or unset)
  - In frontend .env.local: VITE_RTM_ENABLED=false (or unset)
- DB safety:
  - Snapshot/backup noted with your infra tooling
  - Verify migration state:
    - pnpm -C backend prisma migrate status
- Working tree clean and on feature branch.

Local Gates

- Type-check:
  - pnpm -C backend tsc --noEmit
  - pnpm -C frontend tsc --noEmit
- Lint:
  - pnpm lint
- Build:
  - pnpm -C backend build
  - pnpm -C frontend build

DB Migration (idempotent, non-destructive)

- Apply after code review approval, before turning flags on:
  - pnpm -C backend prisma generate
  - pnpm -C backend prisma migrate dev -n "rtm_client_id_and_indexes"
- Verify:
  - Prisma adds Comment.clientId (nullable)
  - Indexes exist: idx_comment_board_created_id, uq_comment_board_client_id

Enable Canaries Only

- Backend: set RTM_ENABLED=true in your dev/staging env only
- Frontend: set VITE_RTM_ENABLED=true locally OR use per-session canary:
  - localStorage.setItem('tb.rtm', '1') // to enable for the browser session
- Reload the app

Smoke Tests

- Optimistic send:
  - Disable network; send a message; re-enable; expect bubble shows “sending…” then swaps to “sent” with server id/createdAt on ACK
- Duplicate prevention:
  - Verify no duplicates with same server id or client id
- Read receipts:
  - Emit read:upto and ensure no per-message spam, just batch cursor updates
- Cursor pagination:
  - Scroll up to load older; confirm hasMore toggles correctly; no duplicates; order stable
- Reconnect:
  - Kill socket; after reconnect, only messages since last seen cursor fetch; early room join occurs before fetching
- Cache warm boot:
  - Reload; expect instant sidebar+last 50 messages; background reconcile updates
- System messages:
  - Join/leave from another client; verify timeline “X joined/left”
- Media (disabled by default):
  - Ensure no UI regressions when media stubs are disabled

Performance Checks

- TTI unchanged:
  - Virtualized list active for >50 messages
  - IndexedDB cache read occurs before network
- Renders:
  - No excessive re-renders on socket tick (debounce where applicable)

Rollback

- Immediate:
  - Turn flags OFF:
    - Backend: RTM_ENABLED=false
    - Frontend: VITE_RTM_ENABLED=false and remove localStorage 'tb.rtm'
  - Legacy behavior resumes (receive-message/board-activity)
- DB:
  - No destructive changes made; leave columns and indexes
- Git:
  - Revert PR if needed; migration stays harmless

Launch Steps

1) Merge behind flags OFF
2) Apply migration in staging
3) Canary enablement (1-5% internal users via env/localStorage)
4) Monitor errors/logs; validate smoke tests
5) Ramp up flags
6) Production rollout complete; keep legacy paths for at least one cycle

Command Reference

```bash
# Types
pnpm -C backend tsc --noEmit
pnpm -C frontend tsc --noEmit

# Lint
pnpm lint

# Build
pnpm -C backend build
pnpm -C frontend build

# Prisma
pnpm -C backend prisma generate
pnpm -C backend prisma migrate dev -n "rtm_client_id_and_indexes"

# Optional: status
pnpm -C backend prisma migrate status
```


