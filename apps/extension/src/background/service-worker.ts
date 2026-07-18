import type { MediaState, ServerMessage, VideoIdentity } from '@watchpair/protocol';

import { RoomConnection } from './room-connection.js';
import { loadSettings } from '../shared/settings.js';

let connection: RoomConnection | undefined;
let participantId = '';
let roomCode: string | undefined;
let connectionStatus = 'disconnected';
let lastVideo: VideoIdentity | undefined;
let lastMedia: MediaState | undefined;
let buffering = false;
let isRoomOwner = false;

void initialize();

async function initialize(): Promise<void> {
  const stored = (await chrome.storage.local.get([
    'participantId',
    'activeRoomCode',
    'isRoomOwner',
  ])) as {
    participantId?: unknown;
    activeRoomCode?: unknown;
    isRoomOwner?: unknown;
  };
  participantId =
    typeof stored.participantId === 'string'
      ? stored.participantId
      : `participant-${crypto.randomUUID()}`;
  await chrome.storage.local.set({ participantId });
  roomCode = typeof stored.activeRoomCode === 'string' ? stored.activeRoomCode : undefined;
  isRoomOwner = stored.isRoomOwner === true;
  connection = new RoomConnection({
    participantId,
    onMessage: handleServerMessage,
    onStatus: (status) => {
      connectionStatus = status;
      void broadcastToExtension({ type: 'connection-status', status });
    },
  });
  if (roomCode) connection.joinRoom((await loadSettings()).serverUrl, roomCode);
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, respond) => {
  void handleExtensionMessage(message).then(respond);
  return true;
});

async function handleExtensionMessage(message: unknown): Promise<unknown> {
  if (!connection) await initialize();
  if (!connection) return { ok: false, error: '初始化失败' };

  if (isRecord(message) && message.type === 'get-status') {
    return { ok: true, roomCode, connectionStatus, peerConnected: false };
  }
  if (isRecord(message) && message.type === 'create-room') {
    connection.createRoom((await loadSettings()).serverUrl);
    return { ok: true };
  }
  if (isRecord(message) && message.type === 'join-room' && typeof message.roomCode === 'string') {
    isRoomOwner = false;
    connection.joinRoom((await loadSettings()).serverUrl, message.roomCode.toUpperCase());
    return { ok: true };
  }
  if (isRecord(message) && message.type === 'leave-room') {
    connection.leave();
    roomCode = undefined;
    isRoomOwner = false;
    await chrome.storage.local.remove(['activeRoomCode', 'isRoomOwner']);
    return { ok: true };
  }
  if (!roomCode || !isRecord(message)) return { ok: false };

  if (message.type === 'local-media-operation' && hasMediaPayload(message)) {
    lastVideo = message.video;
    lastMedia = message.media;
    connection.send({
      type: 'media-operation',
      roomCode,
      participantId,
      operationId: crypto.randomUUID(),
      clientSentAt: Date.now(),
      video: message.video,
      media: message.media,
    });
    return { ok: true };
  }
  if (message.type === 'buffering-changed' && hasMediaPayload(message)) {
    buffering = message.buffering === true;
    lastVideo = message.video;
    lastMedia = message.media;
    return { ok: true };
  }
  if (message.type === 'video-ready' && hasMediaPayload(message)) {
    lastVideo = message.video;
    lastMedia = message.media;
    if (isRoomOwner) sendSnapshot();
    return { ok: true };
  }
  return { ok: false };
}

function handleServerMessage(message: ServerMessage): void {
  if (message.type === 'room-created' || message.type === 'room-joined') {
    roomCode = message.roomCode;
    if (message.type === 'room-created') isRoomOwner = true;
    void chrome.storage.local.set({ activeRoomCode: roomCode, isRoomOwner });
    if (isRoomOwner) sendSnapshot();
  }
  void broadcastToExtension(message);
}

function sendSnapshot(): void {
  if (!isRoomOwner || !connection || !roomCode || !lastVideo || !lastMedia) return;
  connection.send({
    type: 'state-snapshot',
    roomCode,
    participantId,
    clientSentAt: Date.now(),
    video: lastVideo,
    media: lastMedia,
    buffering,
  });
}

async function broadcastToExtension(message: unknown): Promise<void> {
  await chrome.runtime.sendMessage(message).catch(() => undefined);
  const tabs = await chrome.tabs.query({ url: 'https://www.bilibili.com/video/*' });
  await Promise.all(
    tabs.flatMap((tab) =>
      tab.id === undefined ? [] : [chrome.tabs.sendMessage(tab.id, message).catch(() => undefined)],
    ),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasMediaPayload(value: Record<string, unknown>): value is Record<string, unknown> & {
  video: VideoIdentity;
  media: MediaState;
} {
  return isRecord(value.video) && isRecord(value.media);
}
