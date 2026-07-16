import { describe, expect, it } from 'vitest';

import { ClientMessageSchema, ServerMessageSchema } from '../src/messages.js';

const video = { bvid: 'BV1xx411c7mD', part: 1, duration: 120 };
const media = { paused: false, currentTime: 10, playbackRate: 1 };

describe('ClientMessageSchema', () => {
  it('accepts every supported client message shape', () => {
    const messages = [
      { type: 'create-room', participantId: 'participant-12345678' },
      { type: 'join-room', roomCode: 'AB3K7M', participantId: 'participant-12345678' },
      {
        type: 'media-operation',
        roomCode: 'AB3K7M',
        participantId: 'participant-12345678',
        operationId: 'op-1',
        clientSentAt: 1_000,
        video,
        media,
      },
      {
        type: 'state-snapshot',
        roomCode: 'AB3K7M',
        participantId: 'participant-12345678',
        clientSentAt: 1_000,
        video,
        media,
        buffering: false,
      },
      { type: 'request-snapshot', roomCode: 'AB3K7M', participantId: 'participant-12345678' },
      { type: 'leave-room', roomCode: 'AB3K7M', participantId: 'participant-12345678' },
      { type: 'ping', clientSentAt: 1_000 },
    ];

    for (const message of messages) {
      expect(ClientMessageSchema.safeParse(message).success).toBe(true);
    }
  });

  it.each([
    [
      'ambiguous room code',
      { type: 'join-room', roomCode: 'ABCI10', participantId: 'participant-12345678' },
    ],
    ['missing participant', { type: 'create-room' }],
    [
      'invalid playback rate',
      {
        type: 'media-operation',
        roomCode: 'AB3K7M',
        participantId: 'participant-12345678',
        operationId: 'op-1',
        clientSentAt: 1_000,
        video,
        media: { ...media, playbackRate: 4 },
      },
    ],
    ['unknown type', { type: 'delete-everything' }],
    ['oversized identifier', { type: 'create-room', participantId: 'x'.repeat(200) }],
  ])('rejects %s', (_name, message) => {
    expect(ClientMessageSchema.safeParse(message).success).toBe(false);
  });
});

describe('ServerMessageSchema', () => {
  it('accepts authoritative room state', () => {
    expect(
      ServerMessageSchema.safeParse({
        type: 'room-state',
        roomCode: 'AB3K7M',
        revision: 2,
        serverSentAt: 1_100,
        peerConnected: true,
        buffering: false,
        video,
        media,
      }).success,
    ).toBe(true);
  });
});
