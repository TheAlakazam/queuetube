// Advisory shadow copy of the native queue in chrome.storage.local. The
// native queue is the source of truth while the tab's alive; this just
// makes it restorable after tab close / crash (see docs/PLAN.md section 3).

export interface BackupEntry {
  videoId: string;
  title: string;
  queuedAt: number;
}

const STORAGE_KEY = 'queuetube:backup';
const MAX_ENTRIES = 100;

export async function getBackupEntries(): Promise<BackupEntry[]> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  return (stored[STORAGE_KEY] as BackupEntry[] | undefined) ?? [];
}

async function setBackupEntries(entries: BackupEntry[]): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: entries });
}

// Re-queuing a video already in the list moves it to the end with a fresh
// timestamp rather than creating a duplicate entry.
export async function addBackupEntry(videoId: string, title: string): Promise<void> {
  const entries = await getBackupEntries();
  const deduped = entries.filter((entry) => entry.videoId !== videoId);
  deduped.push({ videoId, title, queuedAt: Date.now() });
  await setBackupEntries(deduped.slice(-MAX_ENTRIES));
}

export async function removeBackupEntry(videoId: string): Promise<void> {
  const entries = await getBackupEntries();
  await setBackupEntries(entries.filter((entry) => entry.videoId !== videoId));
}

export async function clearBackupEntries(): Promise<void> {
  await setBackupEntries([]);
}

// Best-effort consumption tracking: when the SPA navigates to a watch page
// for a video that's in the backup list, assume the native queue advanced
// to it and drop it. Not authoritative — the native queue is.
export function watchForQueueConsumption(): void {
  window.addEventListener('yt-navigate-finish', () => {
    const videoId = new URLSearchParams(window.location.search).get('v');
    if (videoId) {
      void removeBackupEntry(videoId);
    }
  });
}
