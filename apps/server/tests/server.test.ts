import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';

import { createWatchPairServer, type WatchPairServer } from '../src/index.js';

const openServers: WatchPairServer[] = [];
const openSockets: WebSocket[] = [];

afterEach(async () => {
  for (const socket of openSockets.splice(0)) socket.close();
  for (const server of openServers.splice(0)) await server.close();
});

async function startServer(): Promise<{ server: WatchPairServer; baseUrl: string; wsUrl: string }> {
  const server = createWatchPairServer();
  openServers.push(server);
  await new Promise<void>((resolve) => server.httpServer.listen(0, '127.0.0.1', resolve));
  const address = server.httpServer.address() as AddressInfo;
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    wsUrl: `ws://127.0.0.1:${address.port}`,
  };
}

async function connect(url: string): Promise<WebSocket> {
  const socket = new WebSocket(url);
  openSockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  return socket;
}

function nextMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Timed out waiting for WebSocket message')),
      2_000,
    );
    socket.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()) as Record<string, unknown>);
    });
  });
}

describe('WatchPair server', () => {
  it('reports health over HTTP', async () => {
    const { baseUrl } = await startServer();
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('creates a room, joins a peer, and rejects a third participant', async () => {
    const { wsUrl } = await startServer();
    const alice = await connect(wsUrl);
    alice.send(JSON.stringify({ type: 'create-room', participantId: 'participant-alice' }));
    const created = await nextMessage(alice);
    const roomCode = created.roomCode as string;
    expect(created.type).toBe('room-created');

    const bob = await connect(wsUrl);
    bob.send(JSON.stringify({ type: 'join-room', roomCode, participantId: 'participant-bob' }));
    expect((await nextMessage(bob)).type).toBe('room-joined');
    expect(await nextMessage(alice)).toMatchObject({ type: 'presence', peerConnected: true });

    const charlie = await connect(wsUrl);
    charlie.send(
      JSON.stringify({ type: 'join-room', roomCode, participantId: 'participant-charlie' }),
    );
    expect(await nextMessage(charlie)).toMatchObject({ type: 'error', code: 'room-full' });
  });

  it('broadcasts accepted media operations to the peer', async () => {
    const { wsUrl } = await startServer();
    const alice = await connect(wsUrl);
    alice.send(JSON.stringify({ type: 'create-room', participantId: 'participant-alice' }));
    const roomCode = (await nextMessage(alice)).roomCode as string;

    const bob = await connect(wsUrl);
    bob.send(JSON.stringify({ type: 'join-room', roomCode, participantId: 'participant-bob' }));
    await nextMessage(bob);
    await nextMessage(alice);

    const operation = {
      type: 'media-operation',
      roomCode,
      participantId: 'participant-alice',
      operationId: 'operation-1',
      clientSentAt: 1_000,
      video: { bvid: 'BV1xx411c7mD', part: 1, duration: 120 },
      media: { paused: false, currentTime: 10, playbackRate: 1 },
    };
    alice.send(JSON.stringify(operation));

    expect(await nextMessage(bob)).toMatchObject({
      type: 'media-operation',
      revision: 1,
      participantId: 'participant-alice',
      video: operation.video,
      media: operation.media,
    });
  });

  it('rejects malformed messages and rate-limits repeated room guesses', async () => {
    const { wsUrl } = await startServer();
    const socket = await connect(wsUrl);

    socket.send('{not-json');
    expect(await nextMessage(socket)).toMatchObject({ type: 'error', code: 'invalid-message' });

    for (let index = 0; index < 20; index += 1) {
      socket.send(
        JSON.stringify({
          type: 'join-room',
          roomCode: 'AB3K7M',
          participantId: `participant-${String(index).padStart(8, '0')}`,
        }),
      );
      await nextMessage(socket);
    }
    socket.send(
      JSON.stringify({
        type: 'join-room',
        roomCode: 'AB3K7M',
        participantId: 'participant-over-limit',
      }),
    );
    expect(await nextMessage(socket)).toMatchObject({ type: 'error', code: 'rate-limited' });
  });
});
