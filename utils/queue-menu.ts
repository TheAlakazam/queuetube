// Fallback path: simulates the real "More actions" -> "Add to queue" click
// sequence via DOM. Only used when queue-api.ts has no known playlistId for
// an already-active queue (see docs/PLAN.md section 2, Spike 1 + Spike 2).

// Locale-safe: match the "Add to queue" menu item by its icon's SVG path,
// not by text. Verified against 7 sibling menu items, no collisions.
const ADD_TO_QUEUE_ICON_PATH =
  'M2 2.864v6.277a.5.5 0 00.748.434L9 6.002 2.748 2.43A.5.5 0 002 2.864ZM21 5h-9a1 1 0 100 2h9a1 1 0 100-2Zm0 6H9a1 1 0 000 2h12a1 1 0 000-2Zm0 6H9a1 1 0 000 2h12a1 1 0 000-2Z';

// "More actions" = current lockupViewModel/Lit surfaces (home grid, etc).
// "Action menu" = legacy ytd-video-renderer surfaces (search results).
const MENU_BUTTON_SELECTOR = 'button[aria-label="More actions"], button[aria-label="Action menu"]';

const MENU_ITEM_SELECTOR = 'yt-list-item-view-model, ytd-menu-service-item-renderer, tp-yt-paper-item';

function findMenuButton(container: Element): HTMLElement | null {
  return container.querySelector<HTMLElement>(MENU_BUTTON_SELECTOR);
}

function findAddToQueueItem(): HTMLElement | null {
  const paths = document.querySelectorAll<SVGPathElement>(`path[d="${ADD_TO_QUEUE_ICON_PATH}"]`);
  for (const path of paths) {
    const item = path.closest<HTMLElement>(MENU_ITEM_SELECTOR);
    if (item) {
      return item;
    }
  }
  return null;
}

// The popup menu renders async into a portal outside `container`, so poll
// for it rather than assuming it's present right after the button click.
async function waitFor<T>(find: () => T | null, timeoutMs: number, intervalMs = 50): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = find();
    if (result) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

function closeAnyOpenMenu(): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

// Given a video renderer/container element, opens its "More actions" menu
// and clicks "Add to queue". Returns whether the sequence succeeded.
export async function addToQueueViaMenu(container: Element): Promise<boolean> {
  const menuButton = findMenuButton(container);
  if (!menuButton) {
    return false;
  }
  menuButton.click();

  const addToQueueItem = await waitFor(findAddToQueueItem, 2000);
  if (!addToQueueItem) {
    closeAnyOpenMenu();
    return false;
  }

  addToQueueItem.click();
  return true;
}
