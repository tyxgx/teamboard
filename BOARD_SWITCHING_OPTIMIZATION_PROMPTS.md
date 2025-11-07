# Instant Board Switching - Agent Prompts

## Overview
These prompts target making board switching feel instant (like WhatsApp) by implementing immediate UI feedback, preloading, and optimistic rendering.

---

## Prompt 1: `frontend/src/BoardRoomPage.tsx` - Instant Title Update & Optimistic Board State

**File:** `frontend/src/BoardRoomPage.tsx`

**Why:** The board title in ChatHeader only updates after `boardDetails` state changes, which happens after network request. We need immediate title update from the boards list on click.

**Agent Instructions:**
1. In `handleSelectBoard`, immediately update a new state `optimisticBoardName` with the board name from the `boards` array (find by code).
2. Pass `optimisticBoardName ?? boardDetails?.name ?? "TeamBoard"` to ChatHeader instead of just `boardDetails?.name`.
3. When `boardDetails` loads, it will override the optimistic name (no flicker if they match).
4. Ensure the title update happens synchronously in `handleSelectBoard` (before `navigate` call).
5. Add a ref or state to track the optimistic board name per board code.

**Output:** Show diff hunks only. Preserve all existing functionality.

**Acceptance Criteria:**
- Board title updates instantly (<16ms) when clicking any board in sidebar
- Title shows correct board name even before network request completes
- No flicker when real boardDetails loads (if name matches)
- Works for both cached and uncached boards

---

## Prompt 2: `frontend/src/BoardRoomPage.tsx` - Preload All Board Details After Sign-In

**File:** `frontend/src/BoardRoomPage.tsx`

**Why:** Currently boards are only loaded when selected. Preloading all board details + first page of messages after sign-in makes switching instant.

**Agent Instructions:**
1. After boards list is loaded in the bootstrap effect, add a new effect that preloads board details for all boards.
2. Use `Promise.allSettled` to preload all boards in parallel (don't block UI).
3. For each board, fetch: `GET /api/boards/by-code/{code}` and `GET /api/comments/{boardId}?limit=100`.
4. Store results in `boardCacheRef` with current timestamp.
5. Preloading should happen in background (non-blocking) after boards list is shown.
6. Add a limit (e.g., preload max 20 boards) to avoid overwhelming the API.
7. Preload should be silent (no loading indicators, no errors shown to user).

**Output:** Show diff hunks only. Preserve existing cache logic.

**Acceptance Criteria:**
- All boards are preloaded within 2-3 seconds after sign-in
- Board switching is instant for preloaded boards (no network delay visible)
- Preloading doesn't block UI or slow down initial render
- Cache is properly populated for all boards

---

## Prompt 3: `frontend/src/BoardRoomPage.tsx` - Optimistic Board Details State

**File:** `frontend/src/BoardRoomPage.tsx`

**Why:** When switching boards, we should show optimistic board details (from cache or boards list) immediately, then update with fresh data.

**Agent Instructions:**
1. In `handleSelectBoard`, before navigating, check cache for board details.
2. If cached data exists, immediately set `boardDetails` state with cached data (optimistic update).
3. Also immediately set `messages` state with cached comments.
4. This makes the UI show content instantly while fresh data loads in background.
5. The existing `loadBoardDetails` will still run and update with fresh data when ready.
6. Ensure optimistic state doesn't cause duplicate messages or UI flicker.

**Output:** Show diff hunks only. Ensure cache check happens synchronously.

**Acceptance Criteria:**
- Board details and messages appear instantly from cache on click
- Fresh data loads in background and updates seamlessly
- No duplicate messages or flicker
- Works even if cache is stale (shows instantly, refreshes in background)

---

## Prompt 4: `frontend/src/BoardRoomPage.tsx` - Immediate Skeleton on Board Switch

**File:** `frontend/src/BoardRoomPage.tsx`

**Why:** When switching to a board without cache, we need to show skeleton immediately, not wait for network request.

**Agent Instructions:**
1. In `handleSelectBoard`, if no cached data exists, immediately set `switchingBoard` state to the board code.
2. Ensure `switchingBoard` state triggers skeleton in MessageList (already implemented, verify it works).
3. Also set a minimal optimistic `boardDetails` state with just `{ code, name }` from boards list so ChatHeader shows title.
4. Clear this optimistic state when real `boardDetails` loads.
5. Ensure skeleton shows within 16ms of click.

**Output:** Show diff hunks only. Preserve existing skeleton logic.

**Acceptance Criteria:**
- Skeleton appears instantly (<16ms) when switching to uncached board
- Board title shows immediately even for uncached boards
- No blank/empty states during board switch
- Smooth transition from skeleton to real content

---

## Prompt 5: `frontend/src/components/chat/ChatHeader.tsx` - Accept Optimistic Title

**File:** `frontend/src/components/chat/ChatHeader.tsx`

**Why:** ChatHeader currently only receives `boardDetails?.name`. We need it to accept and display optimistic title immediately.

**Agent Instructions:**
1. No changes needed if BoardRoomPage passes the correct title (optimistic or real).
2. Verify that ChatHeader can handle title changes smoothly (no layout shift).
3. Ensure title updates are smooth (use CSS transition if needed, but keep it subtle).

**Output:** Show diff hunks only if changes needed. Otherwise, note "No changes required - component already supports dynamic title prop."

**Acceptance Criteria:**
- Title updates smoothly without layout shift
- No flicker when title changes
- Component handles rapid title changes gracefully

---

## Prompt 6: `frontend/src/BoardRoomPage.tsx` - Prevent Message List Flash on Switch

**File:** `frontend/src/BoardRoomPage.tsx`

**Why:** When switching boards, messages might clear and then reload, causing a flash. We should show cached messages immediately or skeleton, never a blank state.

**Agent Instructions:**
1. In `handleSelectBoard`, don't clear `messages` state immediately if cached messages exist.
2. If cached messages exist, set them immediately (optimistic).
3. Only clear messages if no cache exists (then show skeleton).
4. Ensure message list doesn't flash between boards.
5. Use `switchingBoard` state to show skeleton only when truly loading (no cache).

**Output:** Show diff hunks only. Preserve message deduplication logic.

**Acceptance Criteria:**
- No flash of empty message list when switching boards
- Cached messages show instantly
- Skeleton shows only when no cache exists
- Smooth transition between boards

---

## Prompt 7: `frontend/src/BoardRoomPage.tsx` - Batch Preload After Boards Load

**File:** `frontend/src/BoardRoomPage.tsx`

**Why:** Preloading should happen efficiently in batches to avoid API rate limits while still being fast.

**Agent Instructions:**
1. Create a `preloadAllBoards` function that takes the boards array.
2. Preload boards in batches of 5 (to avoid overwhelming API).
3. Use `Promise.allSettled` for each batch, then proceed to next batch.
4. Start preloading immediately after boards list is loaded.
5. Prioritize pinned boards first, then active boards, then left boards.
6. Add a small delay (100ms) between batches to avoid rate limiting.
7. Store all results in cache as they complete.

**Output:** Show diff hunks only. Make preloading non-blocking and silent.

**Acceptance Criteria:**
- All boards preloaded within 5-10 seconds after sign-in
- Pinned boards preload first (instant switching)
- No API rate limit errors
- Preloading doesn't impact UI responsiveness

---

## Implementation Order

1. **Prompt 1** (Instant Title) - Critical for immediate feedback
2. **Prompt 3** (Optimistic Details) - Shows content instantly from cache
3. **Prompt 4** (Immediate Skeleton) - Handles uncached boards
4. **Prompt 6** (Prevent Flash) - Smooth message transitions
5. **Prompt 2/7** (Preload All) - Background optimization for future switches
6. **Prompt 5** (ChatHeader) - Verify/optimize if needed

---

## Success Metrics

- Board title updates within 16ms of click
- Cached boards switch instantly (0ms perceived delay)
- Uncached boards show skeleton within 16ms
- All boards preloaded within 10 seconds of sign-in
- No blank states or UI flashes during switching
- Smooth, WhatsApp-like transitions

---

## Notes

- Cache TTL is 30 seconds (already implemented)
- Preloading should be silent (no user-visible loading states)
- Optimistic updates should never cause data inconsistencies
- All changes must preserve existing functionality

