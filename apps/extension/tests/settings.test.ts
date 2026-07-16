import { describe, expect, it } from 'vitest';

import { DEFAULT_SERVER_URL, normalizeServerUrl } from '../src/shared/settings.js';

describe('normalizeServerUrl', () => {
  it('accepts secure WebSocket URLs and removes trailing slashes', () => {
    expect(normalizeServerUrl('wss://watchpair.onrender.com/')).toBe(
      'wss://watchpair.onrender.com',
    );
  });

  it('allows insecure WebSocket only for local development', () => {
    expect(normalizeServerUrl('ws://localhost:3000')).toBe('ws://localhost:3000');
    expect(normalizeServerUrl('ws://127.0.0.1:3000')).toBe('ws://127.0.0.1:3000');
    expect(() => normalizeServerUrl('ws://example.com')).toThrow('安全');
  });

  it('rejects non-WebSocket protocols', () => {
    expect(() => normalizeServerUrl('https://example.com')).toThrow('WebSocket');
  });

  it('provides a Render placeholder that must be configured before use', () => {
    expect(DEFAULT_SERVER_URL).toBe('wss://watchpair-placeholder.onrender.com');
  });
});
