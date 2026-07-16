import type { ServerMessage } from '@watchpair/protocol';

import { findActiveVideo, observeActiveVideo, parseBilibiliIdentity } from './bilibili-adapter.js';
import { MediaSyncController } from './media-sync-controller.js';

let controller: MediaSyncController | undefined;
let currentUrl = location.href;

function bindVideo(video: HTMLVideoElement): void {
  const identity = parseBilibiliIdentity(location.href, video.duration);
  if (!identity || !Number.isFinite(video.duration) || video.duration <= 0) {
    video.addEventListener('loadedmetadata', () => bindVideo(video), { once: true });
    return;
  }

  controller?.destroy();
  controller = new MediaSyncController(video, identity, {
    onOperation: (currentVideo, media) => {
      void chrome.runtime.sendMessage({
        type: 'local-media-operation',
        video: currentVideo,
        media,
      });
    },
    onBuffering: (isBuffering, currentVideo, media) => {
      void chrome.runtime.sendMessage({
        type: 'buffering-changed',
        buffering: isBuffering,
        video: currentVideo,
        media,
      });
    },
  });
  void chrome.runtime.sendMessage({
    type: 'video-ready',
    identity,
    video: identity,
    media: {
      paused: video.paused,
      currentTime: video.currentTime,
      playbackRate: video.playbackRate,
    },
  });
}

observeActiveVideo(document, bindVideo);
setInterval(() => {
  if (location.href !== currentUrl) {
    currentUrl = location.href;
    const video = findActiveVideo(document);
    if (video) bindVideo(video);
  }
}, 1_000);

chrome.runtime.onMessage.addListener((message: ServerMessage) => {
  if (!controller) return;
  if (message.type === 'media-operation') {
    void controller.applyRemote(message.video, message.media);
  } else if (message.type === 'room-state' && message.video && message.media) {
    void controller.applyAuthoritative(message.video, message.media);
  }
});
