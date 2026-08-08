import { classifyVideoLink } from '../utils/video-links';
import { addToQueue, getKnownPlaylistId } from '../utils/queue-api';
import { addToQueueViaMenu } from '../utils/queue-menu';
import { addBackupEntry, watchForQueueConsumption } from '../utils/backup-mirror';

// Surfaces known to carry a video's "More actions"/"Action menu" button as
// a descendant. Not exhaustively verified on every surface (sidebar,
// channel pages, Shorts shelf) — see docs/PLAN.md open items.
const VIDEO_CONTAINER_SELECTOR = [
  'yt-lockup-view-model',
  'ytd-rich-item-renderer',
  'ytd-video-renderer',
  'ytd-compact-video-renderer',
  'ytd-grid-video-renderer',
  'ytd-playlist-video-renderer',
  'ytd-reel-item-renderer',
].join(', ');

// #movie_player carries a CSS state class (unstarted-mode / paused-mode /
// playing-mode / ...) reflecting the real player state, including ads and
// paused continue-watching sessions. "unstarted-mode" is the only state
// that means nothing has ever been loaded this session (verified live).
function isQueueActive(): boolean {
  const player = document.querySelector('#movie_player');
  return player !== null && !player.classList.contains('unstarted-mode');
}

function findVideoContainer(anchor: HTMLAnchorElement): Element | null {
  return anchor.closest(VIDEO_CONTAINER_SELECTOR);
}

function extractTitle(anchor: HTMLAnchorElement, container: Element | null): string {
  const ariaLabel = anchor.getAttribute('aria-label');
  if (ariaLabel) {
    return ariaLabel;
  }
  const titleEl = container?.querySelector('#video-title, h3');
  const text = titleEl?.textContent?.trim();
  return text || anchor.href;
}

function showToast(message: string): void {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = [
    'position: fixed',
    'bottom: 24px',
    'left: 50%',
    'transform: translateX(-50%)',
    'background: rgba(0, 0, 0, 0.85)',
    'color: #fff',
    'padding: 8px 16px',
    'border-radius: 4px',
    'font: 14px Roboto, Arial, sans-serif',
    'z-index: 2147483647',
    'pointer-events: none',
  ].join(';');
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 1500);
}

async function handleVideoLink(
  videoId: string,
  watchUrl: string,
  title: string,
  container: Element | null
): Promise<void> {
  if (!isQueueActive()) {
    window.location.href = watchUrl;
    return;
  }

  if (getKnownPlaylistId()) {
    try {
      await addToQueue(videoId);
      await addBackupEntry(videoId, title);
      showToast('Queued');
      return;
    } catch {
      // fall through to menu-sim fallback below
    }
  }

  if (container && (await addToQueueViaMenu(container))) {
    await addBackupEntry(videoId, title);
    showToast('Queued');
    return;
  }

  showToast('Could not queue');
}

function onPointerEvent(event: MouseEvent): void {
  const isMiddleClick = event.type === 'auxclick' && event.button === 1;
  const isCmdCtrlClick = event.type === 'click' && (event.metaKey || event.ctrlKey);
  if (!isMiddleClick && !isCmdCtrlClick) {
    return;
  }

  const anchor = event.composedPath().find((el): el is HTMLAnchorElement => el instanceof HTMLAnchorElement);
  if (!anchor) {
    return;
  }

  const classification = classifyVideoLink(anchor.href);
  if (classification.type === 'ignore') {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();

  const container = findVideoContainer(anchor);
  void handleVideoLink(classification.videoId, anchor.href, extractTitle(anchor, container), container);
}

export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  main() {
    document.addEventListener('click', onPointerEvent, true);
    document.addEventListener('auxclick', onPointerEvent, true);
    watchForQueueConsumption();
  },
});
