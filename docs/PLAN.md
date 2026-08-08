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
  content.ts        # ISOLATED world: click interception, queue-add dispatch, storage mirror
  background.ts     # service worker: MAIN-world ytcfg reads for content script (scripting perm)
  popup/            # minimal popup: show backup list, Restore / Clear
utils/
  video-links.ts    # link classification: watch / shorts / ignore
  queue-api.ts       # PRIMARY: direct fetch-replay of YouTube's internal queue endpoints
  queue-menu.ts      # FALLBACK: find "More actions" button + icon-fingerprint match for "Add to queue"
```

Note: the originally planned `injected.ts` (MAIN-world page-context script) is dropped, but for a narrower reason than first thought — see queuetube-6k5 below. `chrome.scripting.executeScript({world:'MAIN', func: ...})` is used ad hoc where page-context reads are needed (e.g. `window.ytcfg`), no standing injected script file required.

### 1. Click interception (content script, ISOLATED world)
- Capture-phase listeners on `document` for `click` (cmd/ctrl+click) and `auxclick` (middle-click, button === 1). Capture phase + `stopImmediatePropagation` + `preventDefault` beats YouTube's own handlers and stops tab creation.
- Walk `event.composedPath()` to find nearest `<a>`; classify href via `utils/video-links.ts`:
  - `/watch?v=ID` → intercept
  - `/shorts/ID` → intercept (queue as watch video)
  - anything else (or `&list=` present) → let through untouched
- Plain left-click never intercepted — normal navigation preserved.
- On intercept: dispatch queue-add via `queue-api.ts` (primary) or `queue-menu.ts` (fallback) per the decision table in section 2; show small toast ("Queued ✓") for feedback.

### 2. Native Add to Queue

**Spike 1 (queuetube-ets, 2026-08-05): primary command-dispatch approach rejected, menu-simulation validated as a fallback.**

- Investigated live youtube.com in Chrome. `document.querySelector('ytd-app').resolveCommand` does exist, but the current YouTube frontend has moved off the old Polymer `videoRenderer`/`menuServiceItemRenderer` model. Video cards now render as `lockupViewModel` objects behind a Lit "signals" layer (`rawProps.data` is a signal *function*, not a plain object; menu items are `yt-list-item-view-model` whose `onTap` is an internal Symbol, not inspectable data). Reading the command object client-side this way is a dead end.
- **Menu-simulation, validated end-to-end on youtube.com home grid:**
  1. Find the video's "More actions" button: `button[aria-label="More actions"]` scoped to the video's renderer container.
  2. Click it to open the popup menu.
  3. Match the "Add to queue" item **by its icon's SVG `<path d>` fingerprint, not by text** (locale-safe): `M2 2.864v6.277a.5.5 0 00.748.434L9 6.002 2.748 2.43A.5.5 0 002 2.864ZM21 5h-9a1 1 0 100 2h9a1 1 0 100-2Zm0 6H9a1 1 0 000 2h12a1 1 0 000-2Zm0 6H9a1 1 0 000 2h12a1 1 0 000-2Z` (verified against 7 sibling items, no collisions).
  4. Click the matched item; verified in the queue panel that the video lands below whatever was already playing.
  5. Known UX cost: briefly opens/closes YouTube's own popup menu, visibly.
- **Verified (queuetube-tz0, 2026-08-08):** implemented `utils/queue-menu.ts` and live-tested end-to-end on both surfaces — home grid (`yt-lockup-view-model`, `button[aria-label="More actions"]`) and search results (`ytd-video-renderer`, `button[aria-label="Action menu"]`) — both located the menu button, opened it, matched "Add to queue" by icon fingerprint, and clicked it successfully. Sidebar/channel/Shorts shelf surfaces not separately spot-checked but use the same two underlying DOM families, so covered by the same selectors.

**Spike 2 (queuetube-6k5, 2026-08-05): the click has a real, replayable network payload — direct fetch-replay promoted to primary, menu-sim demoted to conditional fallback.**

Captured "Add to queue" via network layer (not JS-object introspection) in a real logged-out browser session. YouTube's own click handler calls one of two plain internal-API endpoints, gzip-compressing the body client-side before sending:

- **Queue doesn't exist yet** — `POST /youtubei/v1/playlist/create?prettyPrint=false`
  ```json
  { "context": {...}, "title": "Queue", "videoIds": ["<VIDEO_ID>"], "params": "CAQ=" }
  ```
  Response includes the new `playlistId` (format `TLPQ...`).
- **Queue already exists** — `POST /youtubei/v1/browse/edit_playlist?prettyPrint=false`
  ```json
  { "context": {...}, "actions": [{"addedVideoId": "<VIDEO_ID>", "action": "ACTION_ADD_VIDEO"}], "playlistId": "<TLPQ...>" }
  ```
- `context` is boilerplate obtainable from the page's `window.ytcfg.get('INNERTUBE_CONTEXT')` (plus optional `adSignalsInfo`, not required for the call to succeed). Auth is ambient session cookies (`fetch` same-origin sends them automatically) — works even signed out, no extra token.
- **Content script gotcha:** ISOLATED-world content scripts do NOT see `window.ytcfg` — the page's `window` and the content script's `window` are different JS objects, only the DOM is shared. Read it via `chrome.scripting.executeScript({world: 'MAIN', func: () => window.ytcfg.get('INNERTUBE_CONTEXT')})` from the background/content script — no injected.ts file, no postMessage plumbing needed.
- **Critical limitation — direct fetch bypasses YouTube's own UI entirely.** A raw `fetch` reaches the server but never tells YouTube's page JS to react (that only happens because *YouTube's own* click handler dispatches the response into its Redux-like state). Consequences:
  - Queue already active (something playing) → fine. `edit_playlist` fetch works; actual auto-advance is resolved server-side via `playlistId` when the current video ends, regardless of whether the on-screen queue-count badge refreshes instantly.
  - Nothing playing / no queue yet → fetch-only is a silent no-op on screen (no miniplayer mounts, nothing visibly starts). Decision: **do not use fetch-replay for this case** — navigate the tab to the watch URL instead (unchanged from original plan; user confirmed 2026-08-05 this is fine even though it differs mechanically from native "auto-plays via its own create+mount").
- **Open problem, not yet solved:** reading the `playlistId` of a queue that already exists but that *we* didn't create this session (e.g., user queued something via native right-click before touching our extension). Checked and ruled out: `player.getPlaylistId()` (returns `null`), DOM attrs on `ytd-miniplayer`, and the Redux-like store exposed on `ytd-playlist-panel-renderer` via `.getState()` (`state.mainAppWatch.hasPlaylist` stayed `false` and no `TLPQ` appeared in `state.entities` despite an active queue). Likely resolution: track `playlistId` ourselves in extension state from the response of whichever call (create/edit) we last issued, rather than trying to read it back from YouTube's internals — but if the user's queue predates our extension's involvement this session, we have no known `playlistId` and must fall back to menu-simulation for that one add. Deferred to its own spike/bead.
- **Tested (queuetube-cyi, 2026-08-06):** server does not require gzip — plain uncompressed JSON bodies work for both `playlist/create` and `browse/edit_playlist` (verified live: both returned 200, `edit_playlist` succeeded against a `playlistId` returned by `create`). Implementation uses plain JSON, no compression.

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
- `storage` + `scripting` permissions. `host_permissions` limited to `*://www.youtube.com/*` (required for `chrome.scripting.executeScript` MAIN-world reads of `ytcfg`, done from a small `background.ts` service worker on message from the content script). Content script matches `*://www.youtube.com/*`. No `tabs` permission. (Privacy-first, minimal surface — the one addition beyond the original `storage`-only plan is scoped exactly to youtube.com.)

## Build order
0. `bd init` (beads issue tracker, bd 1.1.2 installed) — create one bead per step below (spike, link util, interception, mirror, popup) with dependencies; work tracked through beads from there.
1. ✅ Scaffold WXT project (`pnpm dlx wxt@latest init` equivalent, TS template), commit. (queuetube-r1d)
2. ✅ **Spike:** validated menu-simulation approach for Add-to-Queue on youtube.com home grid; see findings above. (queuetube-ets)
3. ✅ **Spike 2:** captured + decoded the real `playlist/create` / `browse/edit_playlist` network payloads; direct fetch-replay promoted to primary. (queuetube-6k5)
4. ✅ `utils/queue-api.ts` — direct fetch-replay implementation (primary path): build `context` via MAIN-world `ytcfg` read (through a new `entrypoints/background.ts` service worker), call `playlist/create` or `browse/edit_playlist` as appropriate, track returned `playlistId` in module state for reuse. Plain JSON confirmed sufficient (no gzip). (queuetube-cyi)
5. ✅ `utils/queue-menu.ts` — menu-simulation (fallback path, used only when we have no known `playlistId` for an already-active queue). Live-verified on both home-grid and search-results DOM. (queuetube-tz0)
6. ✅ Link classification util + tests (vitest) for URL parsing (watch, shorts, list, edge cases). (queuetube-u9e)
7. Click interception wiring (cmd-click + middle-click) → queue-api primary / queue-menu fallback / navigate-tab for empty queue; toast feedback.
8. Backup mirror in storage + consumption cleanup.
9. Popup with Restore/Clear.

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
