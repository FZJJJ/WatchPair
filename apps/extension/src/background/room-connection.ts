import {
  reconnectDelayMs,
  ServerMessageSchema,
  type ClientMessage,
  type ServerMessage,
} from '@watchpair/protocol';

export interface SocketLike extends EventTarget {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
}

interface RoomConnectionOptions {
  participantId: string;
  createSocket?: (url: string) => SocketLike;
  onMessage: (message: ServerMessage) => void;
  onStatus: (status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected') => void;
  random?: () => number;
}

export class RoomConnection {
  readonly #participantId: string;
  readonly #createSocket: (url: string) => SocketLike;
  readonly #onMessage: (message: ServerMessage) => void;
  readonly #onStatus: RoomConnectionOptions['onStatus'];
  readonly #random: () => number;
  #socket?: SocketLike;
  #serverUrl?: string;
  #desiredRoomCode: string | undefined;
  #creating = false;
  #closedByUser = false;
  #attempt = 0;

  constructor(options: RoomConnectionOptions) {
    this.#participantId = options.participantId;
    this.#createSocket = options.createSocket ?? ((url) => new WebSocket(url));
    this.#onMessage = options.onMessage;
    this.#onStatus = options.onStatus;
    this.#random = options.random ?? Math.random;
  }

  createRoom(serverUrl: string): void {
    this.#creating = true;
    this.#desiredRoomCode = undefined;
    this.#connect(serverUrl);
  }

  joinRoom(serverUrl: string, roomCode: string): void {
    this.#creating = false;
    this.#desiredRoomCode = roomCode;
    this.#connect(serverUrl);
  }

  send(message: ClientMessage): void {
    if (this.#socket?.readyState === WebSocket.OPEN) {
      this.#socket.send(JSON.stringify(message));
    }
  }

  leave(): void {
    if (this.#desiredRoomCode) {
      this.send({
        type: 'leave-room',
        roomCode: this.#desiredRoomCode,
        participantId: this.#participantId,
      });
    }
    this.#closedByUser = true;
    this.#desiredRoomCode = undefined;
    this.#socket?.close();
    this.#onStatus('disconnected');
  }

  #connect(serverUrl: string): void {
    this.#closedByUser = false;
    this.#serverUrl = serverUrl;
    this.#onStatus(this.#attempt === 0 ? 'connecting' : 'reconnecting');
    const socket = this.#createSocket(serverUrl);
    this.#socket = socket;

    socket.addEventListener('open', () => {
      this.#attempt = 0;
      this.#onStatus('connected');
      if (this.#creating) {
        this.send({ type: 'create-room', participantId: this.#participantId });
      } else if (this.#desiredRoomCode) {
        this.send({
          type: 'join-room',
          roomCode: this.#desiredRoomCode,
          participantId: this.#participantId,
        });
      }
    });

    socket.addEventListener('message', (event) => {
      const parsedJson = safeJson((event as MessageEvent).data);
      const parsed = ServerMessageSchema.safeParse(parsedJson);
      if (!parsed.success) return;
      if (parsed.data.type === 'room-created' || parsed.data.type === 'room-joined') {
        this.#desiredRoomCode = parsed.data.roomCode;
        this.#creating = false;
      }
      this.#onMessage(parsed.data);
    });

    socket.addEventListener('close', () => {
      if (this.#closedByUser || !this.#serverUrl || (!this.#creating && !this.#desiredRoomCode)) {
        this.#onStatus('disconnected');
        return;
      }
      const delay = reconnectDelayMs(this.#attempt, this.#random);
      this.#attempt += 1;
      this.#onStatus('reconnecting');
      setTimeout(() => this.#connect(this.#serverUrl!), delay);
    });
  }
}

function safeJson(value: unknown): unknown {
  try {
    return JSON.parse(String(value));
  } catch {
    return undefined;
  }
}
