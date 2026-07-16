import { describe, expect, it } from 'vitest';

import { reconnectDelayMs } from '../src/reconnect.js';

describe('reconnectDelayMs', () => {
  it('uses capped exponential backoff with jitter', () => {
    expect(reconnectDelayMs(0, () => 0.5)).toBe(500);
    expect(reconnectDelayMs(1, () => 0.5)).toBe(1_000);
    expect(reconnectDelayMs(20, () => 0.5)).toBe(15_000);
    expect(reconnectDelayMs(20, () => 1)).toBe(30_000);
  });
});
