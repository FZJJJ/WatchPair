import { createServer, type Server } from 'node:http';
import { pathToFileURL } from 'node:url';

import { ClientMessageSchema } from '@watchpair/protocol';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';

import { JoinRateLimiter } from './rate-limiter.js';
import { RoomStore } from './room-store.js';

interface ClientContext {
  participantId?: string;
  roomCode?: string;
  networkKey: string;
}

export interface WatchPairServer {
  httpServer: Server;
  close(): Promise<void>;
}

export function createWatchPairServer(): WatchPairServer {
  const app = express();
  app.disable('x-powered-by');
  app.get('/health', (_request, response) => response.json({ status: 'ok' }));

  const httpServer = createServer(app);
  const wsServer = new WebSocketServer({ noServer: true, maxPayload: 16 * 1_024 });
  const contexts = new Map<WebSocket, ClientContext>();
  const rooms = new RoomStore();
  const limiter = new JoinRateLimiter();

  httpServer.on('upgrade', (request, socket, head) => {
    wsServer.handleUpgrade(request, socket, head, (webSocket) => {
      wsServer.emit('connection', webSocket, request);
    });
  });

  wsServer.on('connection', (socket, request) => {
    contexts.set(socket, { networkKey: request.socket.remoteAddress ?? 'unknown' });

    socket.on('message', (data) => {
      let raw: unknown;
      try {
        raw = JSON.parse(data.toString());
      } catch {
        sendError(socket, 'invalid-message', '消息不是有效的 JSON');
        return;
      }

      const parsed = ClientMessageSchema.safeParse(raw);
      if (!parsed.success) {
        sendError(socket, 'invalid-message', '消息结构无效');
        return;
      }

      const message = parsed.data;
      const context = contexts.get(socket);
      if (!context) return;

      if (message.type === 'ping') {
        send(socket, {
          type: 'pong',
          clientSentAt: message.clientSentAt,
          serverSentAt: Date.now(),
        });
        return;
      }

      if (message.type === 'create-room') {
        leaveCurrentRoom(socket, context);
        const created = rooms.create(message.participantId);
        context.participantId = message.participantId;
        context.roomCode = created.code;
        send(socket, {
          type: 'room-created',
          roomCode: created.code,
          revision: created.revision,
          serverSentAt: Date.now(),
        });
        return;
      }

      if (message.type === 'join-room') {
        if (!limiter.allow(context.networkKey)) {
          sendError(socket, 'rate-limited', '加入房间尝试过于频繁，请稍后再试');
          return;
        }
        const joined = rooms.join(message.roomCode, message.participantId);
        if (!joined.ok) {
          sendError(
            socket,
            joined.reason,
            joined.reason === 'room-full' ? '房间已满' : '房间不存在',
          );
          return;
        }
        leaveCurrentRoom(socket, context);
        context.participantId = message.participantId;
        context.roomCode = message.roomCode;
        send(socket, {
          type: 'room-joined',
          roomCode: message.roomCode,
          revision: joined.revision,
          serverSentAt: Date.now(),
        });
        broadcastPresence(message.roomCode, socket);
        return;
      }

      if (!matchesContext(context, message.roomCode, message.participantId)) {
        sendError(socket, 'not-in-room', '当前连接不属于该房间');
        return;
      }

      if (message.type === 'leave-room') {
        leaveCurrentRoom(socket, context);
        return;
      }

      if (message.type === 'request-snapshot') {
        const snapshot = rooms.getSnapshot(message.roomCode);
        if (!snapshot) {
          sendError(socket, 'room-not-found', '房间不存在');
          return;
        }
        send(socket, { type: 'room-state', ...snapshot, serverSentAt: Date.now() });
        return;
      }

      if (message.type === 'media-operation') {
        const applied = rooms.applyOperation(
          message.roomCode,
          message.participantId,
          message.operationId,
          message.video,
          message.media,
        );
        if (!applied.ok) {
          sendError(socket, applied.reason, '无法应用媒体操作');
          return;
        }
        if (!applied.duplicate) {
          broadcast(
            message.roomCode,
            {
              type: 'media-operation',
              roomCode: message.roomCode,
              revision: applied.revision,
              serverSentAt: Date.now(),
              participantId: message.participantId,
              video: message.video,
              media: message.media,
            },
            socket,
          );
        }
        return;
      }

      const applied = rooms.applySnapshot(
        message.roomCode,
        message.participantId,
        message.video,
        message.media,
        message.buffering,
      );
      if (!applied.ok) {
        sendError(socket, applied.reason, '无法更新房间状态');
        return;
      }
      const snapshot = rooms.getSnapshot(message.roomCode);
      if (snapshot) {
        broadcast(
          message.roomCode,
          { type: 'room-state', ...snapshot, serverSentAt: Date.now() },
          socket,
        );
      }
    });

    socket.on('close', () => {
      const context = contexts.get(socket);
      if (context) leaveCurrentRoom(socket, context);
      contexts.delete(socket);
    });
  });

  const sweepTimer = setInterval(() => rooms.sweepExpired(), 60_000);
  sweepTimer.unref();

  function leaveCurrentRoom(socket: WebSocket, context: ClientContext): void {
    const roomCode = context.roomCode;
    const participantId = context.participantId;
    if (!roomCode || !participantId) return;

    rooms.leave(roomCode, participantId);
    delete context.roomCode;
    delete context.participantId;
    broadcastPresence(roomCode, socket);
  }

  function broadcastPresence(roomCode: string, excluded?: WebSocket): void {
    const snapshot = rooms.getSnapshot(roomCode);
    if (!snapshot) return;
    broadcast(
      roomCode,
      {
        type: 'presence',
        roomCode,
        revision: snapshot.revision,
        serverSentAt: Date.now(),
        peerConnected: snapshot.peerConnected,
      },
      excluded,
    );
  }

  function broadcast(roomCode: string, message: unknown, excluded?: WebSocket): void {
    for (const [candidate, context] of contexts) {
      if (candidate !== excluded && context.roomCode === roomCode) send(candidate, message);
    }
  }

  return {
    httpServer,
    close: async () => {
      clearInterval(sweepTimer);
      for (const client of wsServer.clients) client.terminate();
      wsServer.close();
      if (!httpServer.listening) return;
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

function matchesContext(context: ClientContext, roomCode: string, participantId: string): boolean {
  return context.roomCode === roomCode && context.participantId === participantId;
}

function send(socket: WebSocket, message: unknown): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function sendError(
  socket: WebSocket,
  code:
    | 'invalid-message'
    | 'room-not-found'
    | 'room-full'
    | 'not-in-room'
    | 'rate-limited'
    | 'internal-error',
  message: string,
): void {
  send(socket, { type: 'error', code, message });
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  const server = createWatchPairServer();
  const port = Number(process.env.PORT ?? 3_000);
  server.httpServer.listen(port, '0.0.0.0', () => {
    console.log(`WatchPair server listening on port ${port}`);
  });
}
