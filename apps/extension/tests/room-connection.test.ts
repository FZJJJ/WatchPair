import { describe, expect, it, vi } from 'vitest';

import { RoomConnection, type SocketLike } from '../src/background/room-connection.js';

class FakeSocket extends EventTarget implements SocketLike {
  static readonly OPEN = 1;
  readyState = FakeSocket.OPEN;
  sent: string[] = [];

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.dispatchEvent(new Event('close'));
  }

  receive(data: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data) }));
  }
}

describe('RoomConnection', () => {
  it('sends a pending create command when the socket opens', () => {
    const socket = new FakeSocket();
    const connection = new RoomConnection({
      participantId: 'participant-alice',
      createSocket: () => socket,
      onMessage: vi.fn(),
      onStatus: vi.fn(),
    });

    connection.createRoom('ws://localhost:3000');
    socket.dispatchEvent(new Event('open'));

    expect(JSON.parse(socket.sent[0]!)).toEqual({
      type: 'create-room',
      participantId: 'participant-alice',
    });
  });

  it('tracks the room and requests a snapshot after reconnecting', () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const connection = new RoomConnection({
      participantId: 'participant-alice',
      createSocket: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      onMessage: vi.fn(),
      onStatus: vi.fn(),
      random: () => 0.5,
    });

    connection.joinRoom('ws://localhost:3000', 'AB3K7M');
    sockets[0]!.dispatchEvent(new Event('open'));
    sockets[0]!.receive({
      type: 'room-joined',
      roomCode: 'AB3K7M',
      revision: 0,
      serverSentAt: 1_000,
    });
    sockets[0]!.close();
    vi.advanceTimersByTime(500);
    sockets[1]!.dispatchEvent(new Event('open'));

    expect(JSON.parse(sockets[1]!.sent[0]!)).toEqual({
      type: 'join-room',
      roomCode: 'AB3K7M',
      participantId: 'participant-alice',
    });
    vi.useRealTimers();
  });
});
