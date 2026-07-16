import { describe, expect, it } from 'vitest';

import { RoomStore } from '../src/room-store.js';

const video = { bvid: 'BV1xx411c7mD', part: 1, duration: 120 };
const media = { paused: false, currentTime: 12, playbackRate: 1 };

describe('RoomStore', () => {
  it('creates a valid room and reserves two participant slots', () => {
    const store = new RoomStore({ now: () => 1_000, random: () => 0.1 });
    const created = store.create('participant-alice');

    expect(created.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(store.join(created.code, 'participant-bob')).toEqual({ ok: true, revision: 0 });
    expect(store.join(created.code, 'participant-charlie')).toEqual({
      ok: false,
      reason: 'room-full',
    });
  });

  it('allows an existing participant to reconnect', () => {
    const store = new RoomStore({ now: () => 1_000, random: () => 0.2 });
    const { code } = store.create('participant-alice');
    store.leave(code, 'participant-alice');

    expect(store.join(code, 'participant-alice')).toEqual({ ok: true, revision: 0 });
  });

  it('orders operations and ignores duplicate operation identifiers', () => {
    const store = new RoomStore({ now: () => 1_000, random: () => 0.3 });
    const { code } = store.create('participant-alice');

    expect(store.applyOperation(code, 'participant-alice', 'operation-1', video, media)).toEqual({
      ok: true,
      revision: 1,
      duplicate: false,
    });
    expect(store.applyOperation(code, 'participant-alice', 'operation-1', video, media)).toEqual({
      ok: true,
      revision: 1,
      duplicate: true,
    });
    expect(store.getSnapshot(code)).toMatchObject({
      revision: 1,
      video,
      media,
      peerConnected: false,
    });
  });

  it('tracks buffering snapshots without replacing video state unexpectedly', () => {
    const store = new RoomStore({ now: () => 1_000, random: () => 0.4 });
    const { code } = store.create('participant-alice');
    store.applyOperation(code, 'participant-alice', 'operation-1', video, media);

    expect(store.applySnapshot(code, 'participant-alice', video, media, true)).toEqual({
      ok: true,
      revision: 2,
    });
    expect(store.getSnapshot(code)).toMatchObject({ buffering: true, revision: 2 });
  });

  it('expires a room ten minutes after every participant disconnects', () => {
    let now = 1_000;
    const store = new RoomStore({ now: () => now, random: () => 0.5 });
    const { code } = store.create('participant-alice');
    store.join(code, 'participant-bob');
    store.leave(code, 'participant-alice');
    store.leave(code, 'participant-bob');

    now += 10 * 60 * 1_000 - 1;
    store.sweepExpired();
    expect(store.has(code)).toBe(true);

    now += 1;
    store.sweepExpired();
    expect(store.has(code)).toBe(false);
  });

  it('rejects operations from unknown rooms or participants', () => {
    const store = new RoomStore({ now: () => 1_000, random: () => 0.6 });
    const { code } = store.create('participant-alice');

    expect(store.join('AB3K7M', 'participant-bob')).toEqual({
      ok: false,
      reason: 'room-not-found',
    });
    expect(store.applyOperation(code, 'participant-bob', 'operation-1', video, media)).toEqual({
      ok: false,
      reason: 'not-in-room',
    });
  });
});
