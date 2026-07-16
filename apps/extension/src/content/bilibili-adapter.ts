import type { VideoIdentity } from '@watchpair/protocol';

export function parseBilibiliIdentity(
  urlValue: string,
  duration: number,
): VideoIdentity | undefined {
  const url = new URL(urlValue);
  const match = url.pathname.match(/^\/video\/(BV[0-9A-Za-z]{10})\/?/);
  if (!match?.[1]) return undefined;

  const parsedPart = Number.parseInt(url.searchParams.get('p') ?? '1', 10);
  return {
    bvid: match[1],
    part: Number.isInteger(parsedPart) && parsedPart > 0 ? parsedPart : 1,
    duration: Math.max(0, Math.round(duration)),
  };
}

export function findActiveVideo(root: Document): HTMLVideoElement | undefined {
  return [...root.querySelectorAll('video')]
    .filter((video) => {
      const rect = video.getBoundingClientRect();
      return !video.hidden && rect.width > 0 && rect.height > 0;
    })
    .sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
    })[0];
}

export function observeActiveVideo(
  root: Document,
  onVideo: (video: HTMLVideoElement) => void,
): () => void {
  let current: HTMLVideoElement | undefined;

  const discover = (): void => {
    const next = findActiveVideo(root);
    if (next && next !== current) {
      current = next;
      onVideo(next);
    }
  };

  discover();
  const observer = new MutationObserver(discover);
  observer.observe(root.documentElement, { childList: true, subtree: true });
  return () => observer.disconnect();
}
