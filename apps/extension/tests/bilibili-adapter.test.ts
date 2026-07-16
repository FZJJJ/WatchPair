// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import {
  findActiveVideo,
  observeActiveVideo,
  parseBilibiliIdentity,
} from '../src/content/bilibili-adapter.js';

describe('parseBilibiliIdentity', () => {
  it('reads BV number, part, and duration from a Bilibili video URL', () => {
    expect(parseBilibiliIdentity('https://www.bilibili.com/video/BV1xx411c7mD?p=2', 120.4)).toEqual(
      {
        bvid: 'BV1xx411c7mD',
        part: 2,
        duration: 120,
      },
    );
    expect(parseBilibiliIdentity('https://www.bilibili.com/video/BV1xx411c7mD', 90)).toEqual({
      bvid: 'BV1xx411c7mD',
      part: 1,
      duration: 90,
    });
  });

  it('returns undefined outside a supported video page', () => {
    expect(parseBilibiliIdentity('https://www.bilibili.com/', 90)).toBeUndefined();
  });
});

describe('findActiveVideo', () => {
  it('selects the largest visible video element', () => {
    document.body.innerHTML = '<video id="small"></video><video id="large"></video>';
    const small = document.querySelector<HTMLVideoElement>('#small')!;
    const large = document.querySelector<HTMLVideoElement>('#large')!;
    vi.spyOn(small, 'getBoundingClientRect').mockReturnValue(rect(320, 180));
    vi.spyOn(large, 'getBoundingClientRect').mockReturnValue(rect(1280, 720));

    expect(findActiveVideo(document)).toBe(large);
  });
});

describe('observeActiveVideo', () => {
  it('reports a video element added after single-page navigation', async () => {
    document.body.innerHTML = '';
    const callback = vi.fn();
    const stop = observeActiveVideo(document, callback);
    const video = document.createElement('video');
    vi.spyOn(video, 'getBoundingClientRect').mockReturnValue(rect(1280, 720));

    document.body.append(video);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(callback).toHaveBeenCalledWith(video);
    stop();
  });
});

function rect(width: number, height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    width,
    height,
    top: 0,
    right: width,
    bottom: height,
    left: 0,
    toJSON: () => ({}),
  };
}
