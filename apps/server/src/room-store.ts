import type { MediaState, VideoIdentity } from '@watchpair/protocol';

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_TTL_MS = 10 * 60 * 1_000;

type FailureReason = 'room-not-found' | 'room-full' | 'not-in-room';
type Failure = { ok: false; reason: FailureReason };

interface Room {
  code: string;
  members: Set<string>;
  connected: Set<string>;
  revision: number;
  buffering: boolean;
  operationIds: Set<string>;
  emptySince?: number;
  video?: VideoIdentity;
  media?: MediaState;
}

export interface RoomSnapshot {
  roomCode: string;
  revision: number;
  peerConnected: boolean;
  buffering: boolean;
  video?: VideoIdentity;
  media?: MediaState;
}

export class RoomStore {
  readonly #rooms = new Map<string, Room>();
  readonly #now: () => number;
  readonly #random: () => number;

  constructor(options: { now?: () => number; random?: () => number } = {}) {
    this.#now = options.now ?? Date.now;
    this.#random = options.random ?? Math.random;
  }

  create(participantId: string): { code: string; revision: number } {
    const code = this.#generateUniqueCode();
    this.#rooms.set(code, {
      code,
      members: new Set([participantId]),
      connected: new Set([participantId]),
      revision: 0,
      buffering: false,
      operationIds: new Set(),
    });
    return { code, revision: 0 };
  }

  join(code: string, participantId: string): { ok: true; revision: number } | Failure {
    const room = this.#rooms.get(code);
    if (!room) return { ok: false, reason: 'room-not-found' };
    if (!room.members.has(participantId) && room.members.size >= 2) {
      return { ok: false, reason: 'room-full' };
    }

    room.members.add(participantId);
    room.connected.add(participantId);
    delete room.emptySince;
    return { ok: true, revision: room.revision };
  }

  leave(code: string, participantId: string): void {
    const room = this.#rooms.get(code);
    if (!room) return;

    room.connected.delete(participantId);
    if (room.connected.size === 0 && room.emptySince === undefined) {
      room.emptySince = this.#now();
    }
  }

  applyOperation(
    code: string,
    participantId: string,
    operationId: string,
    video: VideoIdentity,
    media: MediaState,
  ):
    | { ok: true; revision: number; duplicate: boolean }
    | { ok: false; reason: 'room-not-found' | 'not-in-room' } {
    const room = this.#rooms.get(code);
    if (!room) return { ok: false, reason: 'room-not-found' };
    if (!room.members.has(participantId)) return { ok: false, reason: 'not-in-room' };
    if (room.operationIds.has(operationId)) {
      return { ok: true, revision: room.revision, duplicate: true };
    }

    room.operationIds.add(operationId);
    room.revision += 1;
    room.video = video;
    room.media = media;
    this.#trimOperationIds(room);
    return { ok: true, revision: room.revision, duplicate: false };
  }

  applySnapshot(
    code: string,
    participantId: string,
    video: VideoIdentity,
    media: MediaState,
    buffering: boolean,
  ): { ok: true; revision: number } | Failure {
    const room = this.#rooms.get(code);
    if (!room) return { ok: false, reason: 'room-not-found' };
    if (!room.members.has(participantId)) return { ok: false, reason: 'not-in-room' };

    room.revision += 1;
    room.video = video;
    room.media = media;
    room.buffering = buffering;
    return { ok: true, revision: room.revision };
  }

  getSnapshot(code: string): RoomSnapshot | undefined {
    const room = this.#rooms.get(code);
    if (!room) return undefined;

    return {
      roomCode: room.code,
      revision: room.revision,
      peerConnected: room.connected.size >= 2,
      buffering: room.buffering,
      ...(room.video ? { video: room.video } : {}),
      ...(room.media ? { media: room.media } : {}),
    };
  }

  has(code: string): boolean {
    return this.#rooms.has(code);
  }

  sweepExpired(): void {
    const now = this.#now();
    for (const [code, room] of this.#rooms) {
      if (room.emptySince !== undefined && now - room.emptySince >= ROOM_TTL_MS) {
        this.#rooms.delete(code);
      }
    }
  }

  #generateUniqueCode(): string {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      let code = '';
      for (let index = 0; index < 6; index += 1) {
        const position = Math.min(
          ROOM_ALPHABET.length - 1,
          Math.floor(this.#random() * ROOM_ALPHABET.length),
        );
        code += ROOM_ALPHABET[position];
      }
      if (!this.#rooms.has(code)) return code;
    }
    throw new Error('Unable to allocate a room code');
  }

  #trimOperationIds(room: Room): void {
    if (room.operationIds.size <= 100) return;
    const oldest = room.operationIds.values().next().value as string | undefined;
    if (oldest) room.operationIds.delete(oldest);
  }
}
