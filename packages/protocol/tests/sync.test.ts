import { describe, expect, it } from 'vitest';

import { estimateTargetTime, planCorrection, sameVideo } from '../src/sync.js';

describe('planCorrection', () => {
  it('ignores drift below 300 ms', () => {
    expect(planCorrection({ driftSeconds: 0.2, roomRate: 1 })).toEqual({ kind: 'none' });
  });

  it('nudges forward and backward for medium drift', () => {
    expect(planCorrection({ driftSeconds: 0.8, roomRate: 1 })).toEqual({
      kind: 'nudge',
      playbackRate: 1.08,
    });
    expect(planCorrection({ driftSeconds: -0.8, roomRate: 1 })).toEqual({
      kind: 'nudge',
      playbackRate: 0.92,
    });
  });

  it('seeks for drift above 1.5 seconds', () => {
    expect(planCorrection({ driftSeconds: 2, roomRate: 1 })).toEqual({
      kind: 'seek',
      targetOffset: 2,
    });
  });
});

describe('estimateTargetTime', () => {
  it('advances a playing snapshot by elapsed time and half round-trip latency', () => {
    expect(
      estimateTargetTime({
        snapshotTime: 10,
        paused: false,
        playbackRate: 1.5,
        serverSentAt: 1_000,
        receivedAt: 2_000,
        roundTripMs: 200,
      }),
    ).toBeCloseTo(11.65);
  });

  it('does not advance a paused snapshot', () => {
    expect(
      estimateTargetTime({
        snapshotTime: 10,
        paused: true,
        playbackRate: 1,
        serverSentAt: 1_000,
        receivedAt: 2_000,
        roundTripMs: 200,
      }),
    ).toBe(10);
  });
});

describe('sameVideo', () => {
  it('requires matching BV, part, and duration within one second', () => {
    expect(
      sameVideo(
        { bvid: 'BV1xx411c7mD', part: 1, duration: 120 },
        { bvid: 'BV1xx411c7mD', part: 1, duration: 120.8 },
      ),
    ).toBe(true);
    expect(
      sameVideo(
        { bvid: 'BV1xx411c7mD', part: 1, duration: 120 },
        { bvid: 'BV1xx411c7mD', part: 2, duration: 120 },
      ),
    ).toBe(false);
  });
});
