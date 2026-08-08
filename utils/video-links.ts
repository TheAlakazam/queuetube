export type VideoLinkClassification =
  | { type: 'watch'; videoId: string }
  | { type: 'shorts'; videoId: string }
  | { type: 'ignore' };

// Classifies an <a> href on youtube.com: watch links and Shorts links are
// interceptable (queueable); everything else (playlists, channels, watch
// links carrying a &list=, malformed URLs) passes through untouched.
export function classifyVideoLink(
  href: string,
  base = 'https://www.youtube.com'
): VideoLinkClassification {
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return { type: 'ignore' };
  }

  if (url.pathname === '/watch') {
    if (url.searchParams.has('list')) {
      return { type: 'ignore' };
    }
    const videoId = url.searchParams.get('v');
    return videoId ? { type: 'watch', videoId } : { type: 'ignore' };
  }

  const shortsMatch = /^\/shorts\/([^/?]+)/.exec(url.pathname);
  const shortsId = shortsMatch?.[1];
  if (shortsId) {
    return { type: 'shorts', videoId: shortsId };
  }

  return { type: 'ignore' };
}
