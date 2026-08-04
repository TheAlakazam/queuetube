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
  content.ts        # ISOLATED world: click interception, menu-simulation queue-add, storage mirror
  popup/            # minimal popup: show backup list, Restore / Clear
utils/
  video-links.ts    # link classification: watch / shorts / ignore
  queue-menu.ts      # find "More actions" button + icon-fingerprint match for "Add to queue"
```

Note: the originally planned `injected.ts` (MAIN-world page-context script) is dropped per the spike finding below — menu-simulation is plain DOM manipulation (clicking real buttons), so it runs entirely from the ISOLATED-world content script with no need to touch page JS internals.

### 1. Click interception (content script, ISOLATED world)
- Capture-phase listeners on `document` for `click` (cmd/ctrl+click) and `auxclick` (middle-click, button === 1). Capture phase + `stopImmediatePropagation` + `preventDefault` beats YouTube's own handlers and stops tab creation.
- Walk `event.composedPath()` to find nearest `<a>`; classify href via `utils/video-links.ts`:
  - `/watch?v=ID` → intercept
  - `/shorts/ID` → intercept (queue as watch video)
  - anything else (or `&list=` present) → let through untouched
- Plain left-click never intercepted — normal navigation preserved.
- On intercept: run the menu-simulation queue-add (see below) for that video's renderer element; show small toast ("Queued ✓") for feedback.

### 2. Native Add to Queue (injected script, MAIN world)

**Spike result (queuetube-ets, 2026-08-05): primary command-dispatch approach rejected, menu-simulation is the implementation.**

- Investigated live youtube.com in Chrome. `document.querySelector('ytd-app').resolveCommand` does exist, but the current YouTube frontend has moved off the old Polymer `videoRenderer`/`menuServiceItemRenderer` model. Video cards now render as `lockupViewModel` objects behind a Lit "signals" layer (`rawProps.data` is a signal *function*, not a plain object; menu items are `yt-list-item-view-model` whose `onTap` is an internal Symbol, not inspectable data). The actual `addToPlaylistCommand`/queue endpoint is not reachable as plain enumerable data from outside the component — extracting it would mean reverse-engineering Lit internals that are undocumented and change with every YouTube redesign. Rejected as too fragile for a spike-validated approach.
- **Chosen approach: simulate the 3-dot menu**, validated end-to-end on youtube.com home grid:
  1. Find the video's "More actions" button: `button[aria-label="More actions"]` scoped to the video's renderer container.
  2. Click it to open the popup menu.
  3. Match the "Add to queue" item **by its icon's SVG `<path d>` fingerprint, not by text** (locale-safe, per original plan intent). Confirmed value for this action:
     `M2 2.864v6.277a.5.5 0 00.748.434L9 6.002 2.748 2.43A.5.5 0 002 2.864ZM21 5h-9a1 1 0 100 2h9a1 1 0 100-2Zm0 6H9a1 1 0 000 2h12a1 1 0 000-2Zm0 6H9a1 1 0 000 2h12a1 1 0 000-2Z`
     Each menu item has a visually/geometrically distinct path (verified against 7 sibling items — Watch later, Save to playlist, Download, Share, Not interested, Don't recommend channel, Report — no collisions).
  4. Click the matched item.
  5. Verified in the queue panel (miniplayer expand arrow) that the video actually appears queued below whatever was already playing.
- **Known UX cost:** this approach visibly (briefly) opens and closes YouTube's own popup menu — there is no way to do it invisibly like the rejected command-dispatch idea would have. Acceptable for v1; note for i4h.
- **Known nuance for "play immediately" logic:** YouTube can have an active "Continue watching" miniplayer session even when the user hasn't manually started anything on the current page load. "Nothing is playing" cannot be inferred just from being on a non-watch page — i4h must check for an active miniplayer/queue before deciding to navigate directly vs. append to queue.
- **Not yet verified (defer to i4h/wmz):** whether the same button/menu-item selectors hold on other surfaces — sidebar recommendations, search results, channel pages, Shorts shelf — some of these may still use the legacy `ytd-video-renderer` DOM (which, if present, exposes menu data as plain Polymer `.data` and would actually be *easier* to match). Verify per-surface during implementation.

### 3. Backup mirror (content script + storage)
- Every successful queue-add appends `{videoId, title, queuedAt}` to `chrome.storage.local`.
- Listen for queue consumption (video navigations from queue) — best-effort: on `yt-navigate-finish` to a watch page whose ID is in the backup list, remove it. Mirror is advisory, not authoritative.
- Cap list (e.g. 100 entries).

### 4. Popup (minimal)
- Lists backup entries (title + thumbnail via `i.ytimg.com/vi/ID/default.jpg`).
- **Restore**: re-adds each entry to native queue in the active YouTube tab (message → content script runs menu-simulation queue-add for each; requires the video's card to be present/loadable on the current page — see open question below).
- **Clear** button.
- No drag-reorder, no settings in v1.
- **Open question for k3d:** menu-simulation only works on a video renderer already present in the DOM. Restoring an arbitrary backed-up video ID may require navigating its watch page first (watch pages have their own "More actions"/queue affordance) rather than clicking a card on whatever page the user happens to be on. Resolve during k3d implementation.

## Manifest / permissions
- `storage` permission only. Content script matches `*://www.youtube.com/*`. No `tabs`, no host permissions beyond youtube.com. (Privacy-first, minimal surface.)

## Build order
0. `bd init` (beads issue tracker, bd 1.1.2 installed) — create one bead per step below (spike, link util, interception, mirror, popup) with dependencies; work tracked through beads from there.
1. ✅ Scaffold WXT project (`pnpm dlx wxt@latest init` equivalent, TS template), commit. (queuetube-r1d)
2. ✅ **Spike:** validated menu-simulation approach for Add-to-Queue on youtube.com home grid; see findings above. (queuetube-ets)
3. Link classification util + tests (vitest) for URL parsing (watch, shorts, list, edge cases).
4. Click interception wiring (cmd-click + middle-click) → native queue via menu-simulation; toast feedback.
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
