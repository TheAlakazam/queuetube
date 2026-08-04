# QueueTube — Phase 1 Plan (Chrome)

## Context

On youtube.com, cmd-click / middle-click on a video opens a new tab, bypassing YouTube's native queue. Goal: intercept those clicks **within youtube.com only** and instead do exactly what right-click → "Add to Queue" does — push into YouTube's **native** queue. No custom queue UI, no custom auto-advance (YouTube's native queue already handles ordering + advancing).

Decisions made with user:
- Intercept **watch links + Shorts** only (`/watch?v=`, `/shorts/`). Playlist links, channels, everything else opens normally. Links from outside YouTube untouched (content script only runs on youtube.com).
- If nothing is playing and queue empty → **play immediately** (navigate current tab).
- Queue = **native YouTube queue**, plus a **backup mirror** of queued video IDs in `chrome.storage.local` so the queue is restorable after tab close / crash.
- Tooling: **WXT + TypeScript + Vite** (cross-browser manifests for later Firefox/Safari phases).
- Phase 1 = Chrome only. Firefox/Safari later, per original phased plan.

## Repo state

Empty repo (`/Users/piyushjaipuriyar/Projects/queuetube`, no commits). Greenfield.

## Architecture

```
wxt.config.ts
entrypoints/
  content.ts        # ISOLATED world: click interception on youtube.com, storage mirror
  injected.ts       # MAIN world (page context): triggers native Add to Queue
  popup/            # minimal popup: show backup list, Restore / Clear
utils/
  video-links.ts    # link classification: watch / shorts / ignore
  messages.ts       # typed messages between content <-> injected <-> popup
```

### 1. Click interception (content script, ISOLATED world)
- Capture-phase listeners on `document` for `click` (cmd/ctrl+click) and `auxclick` (middle-click, button === 1). Capture phase + `stopImmediatePropagation` + `preventDefault` beats YouTube's own handlers and stops tab creation.
- Walk `event.composedPath()` to find nearest `<a>`; classify href via `utils/video-links.ts`:
  - `/watch?v=ID` → intercept
  - `/shorts/ID` → intercept (queue as watch video)
  - anything else (or `&list=` present) → let through untouched
- Plain left-click never intercepted — normal navigation preserved.
- On intercept: send video ID to injected script; show small toast ("Queued ✓") for feedback.

### 2. Native Add to Queue (injected script, MAIN world)
Biggest technical risk — spike this first:
- **Primary approach:** page-context command dispatch. YouTube's `ytd-app` element resolves internal commands; "Add to queue" is a `signalServiceEndpoint` carrying `addToPlaylistCommand` with `listType: PLAYLIST_EDIT_LIST_TYPE_QUEUE` and the video ID. Dispatch via `document.querySelector('ytd-app').resolveCommand(...)` (or equivalent `yt-action` event). No visible UI flash, works from any page.
- **Fallback approach:** simulate the 3-dot menu — find the video's renderer element, click its menu button, wait for the popup menu, click the "Add to queue" item (match by endpoint/icon, not text — locale-safe), dismiss menu. Fragile but known-working.
- Spike step validates primary; if it fails, plan continues with fallback.
- "Play immediately" case: if no video playing and native queue empty (no miniplayer queue), navigate current tab to the watch URL instead of queueing.

### 3. Backup mirror (content script + storage)
- Every successful queue-add appends `{videoId, title, queuedAt}` to `chrome.storage.local`.
- Listen for queue consumption (video navigations from queue) — best-effort: on `yt-navigate-finish` to a watch page whose ID is in the backup list, remove it. Mirror is advisory, not authoritative.
- Cap list (e.g. 100 entries).

### 4. Popup (minimal)
- Lists backup entries (title + thumbnail via `i.ytimg.com/vi/ID/default.jpg`).
- **Restore**: re-adds each entry to native queue in the active YouTube tab (message → content script → injected).
- **Clear** button.
- No drag-reorder, no settings in v1.

## Manifest / permissions
- `storage` permission only. Content script matches `*://www.youtube.com/*`. No `tabs`, no host permissions beyond youtube.com. (Privacy-first, minimal surface.)

## Build order
0. `bd init` (beads issue tracker, bd 1.1.2 installed) — create one bead per step below (spike, link util, interception, mirror, popup) with dependencies; work tracked through beads from there.
1. Scaffold WXT project (`pnpm dlx wxt@latest init` equivalent, TS template), commit.
2. **Spike:** injected MAIN-world script + primary Add-to-Queue command on a hardcoded video ID; verify in Chrome. Fall back to menu simulation if needed.
3. Link classification util + tests (vitest) for URL parsing (watch, shorts, list, edge cases).
4. Click interception wiring (cmd-click + middle-click) → native queue; toast feedback.
5. Backup mirror in storage + consumption cleanup.
6. Popup with Restore/Clear.

## Verification
- `pnpm test` — vitest for `video-links.ts` classification.
- Manual in Chrome (`pnpm dev` → WXT loads unpacked extension):
  - cmd-click + middle-click on home-page thumbnail, search result, sidebar recommendation, channel page, Shorts shelf → no new tab, video appears in native queue (check miniplayer queue panel).
  - cmd-click channel link / playlist link → opens new tab normally.
  - Plain click → normal navigation.
  - Queue while nothing playing → navigates current tab.
  - Kill tab, reopen YouTube, popup → Restore repopulates native queue.
- Chrome browser automation (claude-in-chrome) can drive the manual checks where practical.

## Later phases (not this plan)
Firefox port (WXT handles manifest), Safari port via Xcode converter (click-time interception already the design, so no rework), settings/shortcuts/sync.
