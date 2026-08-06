// Direct fetch-replay of YouTube's internal queue endpoints (Innertube).
// See docs/PLAN.md section 2, Spike 2 (queuetube-6k5) for how these were found.
// Plain JSON works — YouTube's own client gzips its bodies, but the server
// accepts uncompressed requests too (verified live).

export interface QueueResult {
  ok: true;
  playlistId: string;
}

let cachedPlaylistId: string | null = null;

export function getKnownPlaylistId(): string | null {
  return cachedPlaylistId;
}

async function getContext(): Promise<unknown> {
  const response = await browser.runtime.sendMessage({ type: 'get-innertube-context' });
  if (!response?.ok || !response.context) {
    throw new Error('QueueTube: could not read INNERTUBE_CONTEXT');
  }
  return response.context;
}

async function callInnertube(endpoint: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`/youtubei/v1/${endpoint}?prettyPrint=false`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`QueueTube: ${endpoint} failed (${res.status})`);
  }
  return res.json();
}

async function createQueue(context: unknown, videoId: string): Promise<string> {
  const json = await callInnertube('playlist/create', {
    context,
    title: 'Queue',
    videoIds: [videoId],
    params: 'CAQ=',
  });
  return json.playlistId as string;
}

async function editQueue(context: unknown, videoId: string, playlistId: string): Promise<void> {
  await callInnertube('browse/edit_playlist', {
    context,
    actions: [{ addedVideoId: videoId, action: 'ACTION_ADD_VIDEO' }],
    playlistId,
  });
}

// Adds videoId to the queue, creating it first if we don't have a known
// playlistId. If our cached playlistId turns out stale (queue was cleared
// or fully consumed), recreates the queue once and retries.
export async function addToQueue(videoId: string): Promise<QueueResult> {
  const context = await getContext();

  if (cachedPlaylistId) {
    try {
      await editQueue(context, videoId, cachedPlaylistId);
      return { ok: true, playlistId: cachedPlaylistId };
    } catch {
      cachedPlaylistId = null;
    }
  }

  cachedPlaylistId = await createQueue(context, videoId);
  return { ok: true, playlistId: cachedPlaylistId };
}
