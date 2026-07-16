// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { MediaSyncController } from '../src/content/media-sync-controller.js';

const identity = { bvid: 'BV1xx411c7mD', part: 1, duration: 120 };

afterEach(() => vi.useRealTimers());

describe('MediaSyncController', () => {
  it('publishes local media and buffering events', () => {
    const video = createVideo();
    video.currentTime = 12;
    video.playbackRate = 1.25;
    const onOperation = vi.fn();
    const onBuffering = vi.fn();
    const controller = new MediaSyncController(video, identity, { onOperation, onBuffering });

    video.dispatchEvent(new Event('play'));
    video.dispatchEvent(new Event('seeked'));
    video.dispatchEvent(new Event('ratechange'));
    video.dispatchEvent(new Event('waiting'));
    video.dispatchEvent(new Event('playing'));

    expect(onOperation).toHaveBeenCalledTimes(3);
    expect(onOperation).toHaveBeenLastCalledWith(identity, {
      paused: false,
      currentTime: 12,
      playbackRate: 1.25,
    });
    expect(onBuffering).toHaveBeenNthCalledWith(1, true, identity, expect.any(Object));
    expect(onBuffering).toHaveBeenNthCalledWith(2, false, identity, expect.any(Object));
    controller.destroy();
  });

  it('does not rebroadcast events caused by a remote operation', async () => {
    const video = createVideo();
    const onOperation = vi.fn();
    const controller = new MediaSyncController(video, identity, {
      onOperation,
      onBuffering: vi.fn(),
    });

    await controller.applyRemote(identity, {
      paused: true,
      currentTime: 30,
      playbackRate: 1.5,
    });
    expect(video.currentTime).toBe(30);
    expect(video.playbackRate).toBe(1.5);
    expect(onOperation).not.toHaveBeenCalled();
    controller.destroy();
  });

  it('nudges medium drift and seeks large drift', async () => {
    vi.useFakeTimers();
    const video = createVideo();
    const controller = new MediaSyncController(video, identity, {
      onOperation: vi.fn(),
      onBuffering: vi.fn(),
    });

    video.currentTime = 10;
    await controller.applyAuthoritative(identity, {
      paused: false,
      currentTime: 10.8,
      playbackRate: 1,
    });
    expect(video.playbackRate).toBe(1.08);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(video.playbackRate).toBe(1);

    video.currentTime = 10;
    await controller.applyAuthoritative(identity, {
      paused: false,
      currentTime: 12,
      playbackRate: 1,
    });
    expect(video.currentTime).toBe(12);
    controller.destroy();
  });

  it('refuses commands for a different video', async () => {
    const controller = new MediaSyncController(createVideo(), identity, {
      onOperation: vi.fn(),
      onBuffering: vi.fn(),
    });

    await expect(
      controller.applyRemote(
        { ...identity, part: 2 },
        {
          paused: true,
          currentTime: 1,
          playbackRate: 1,
        },
      ),
    ).resolves.toBe('video-mismatch');
    controller.destroy();
  });
});

function createVideo(): HTMLVideoElement {
  const video = document.createElement('video');
  Object.defineProperty(video, 'paused', { configurable: true, value: false });
  vi.spyOn(video, 'play').mockResolvedValue();
  vi.spyOn(video, 'pause').mockImplementation(() => undefined);
  return video;
}
