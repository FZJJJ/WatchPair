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
let hasPublishedInitialSnapshot = false;
let receivedInvitation:
  { invitationId: string; url: string; video: VideoIdentity; media: MediaState } | undefined;
let pendingInvitation: { video: VideoIdentity; media: MediaState } | undefined;

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

chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  void handleExtensionMessage(message, sender).then(respond);
  return true;
});

async function handleExtensionMessage(
  message: unknown,
  sender?: chrome.runtime.MessageSender,
): Promise<unknown> {
  if (!connection) await initialize();
  if (!connection) return { ok: false, error: '初始化失败' };

  if (isRecord(message) && message.type === 'get-status') {
    return { ok: true, roomCode, connectionStatus, peerConnected: false };
  }
  if (isRecord(message) && message.type === 'create-room') {
    hasPublishedInitialSnapshot = false;
    connection.createRoom((await loadSettings()).serverUrl);
    return { ok: true };
  }
  if (isRecord(message) && message.type === 'join-room' && typeof message.roomCode === 'string') {
    isRoomOwner = false;
    hasPublishedInitialSnapshot = true;
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

  if (isRecord(message) && message.type === 'video-ready' && hasMediaPayload(message)) {
    lastVideo = message.video;
    lastMedia = message.media;
    if (roomCode && isRoomOwner && !hasPublishedInitialSnapshot) {
      sendSnapshot();
      hasPublishedInitialSnapshot = true;
    }
    if (roomCode && pendingInvitation && sender?.tab?.id !== undefined) {
      void chrome.tabs.sendMessage(sender.tab.id, {
        type: 'media-operation',
        roomCode,
        revision: 0,
        serverSentAt: Date.now(),
        participantId: 'invitation',
        video: pendingInvitation.video,
        media: pendingInvitation.media,
      });
      pendingInvitation = undefined;
    }
    return { ok: true };
  }
  if (!roomCode || !isRecord(message)) return { ok: false };

  if (message.type === 'send-video-invitation') {
    if (!lastVideo || !lastMedia) return { ok: false, error: '请先打开一个 B 站视频' };
    connection.send({
      type: 'video-invitation',
      roomCode,
      participantId,
      invitationId: crypto.randomUUID(),
      url: `https://www.bilibili.com/video/${lastVideo.bvid}/?p=${lastVideo.part}`,
      video: lastVideo,
      media: lastMedia,
    });
    return { ok: true };
  }

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
  return { ok: false };
}

function handleServerMessage(message: ServerMessage): void {
  if (message.type === 'video-invitation') {
    receivedInvitation = message;
    void chrome.notifications.create(message.invitationId, {
      type: 'basic',
      iconUrl: 'icon.svg',
      title: 'WatchPair：一起看视频',
      message: '对方想和你一起看一个 B 站视频',
      buttons: [{ title: '前往观看' }, { title: '暂不跳转' }],
      requireInteraction: true,
    });
    return;
  }
  if (message.type === 'room-created' || message.type === 'room-joined') {
    roomCode = message.roomCode;
    if (message.type === 'room-created') {
      isRoomOwner = true;
      hasPublishedInitialSnapshot = false;
    }
    void chrome.storage.local.set({ activeRoomCode: roomCode, isRoomOwner });
  }
  void broadcastToExtension(message);
}

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (buttonIndex !== 0 || receivedInvitation?.invitationId !== notificationId) return;
  const invitation = receivedInvitation;
  pendingInvitation = { video: invitation.video, media: invitation.media };
  void chrome.tabs.query({ active: true, lastFocusedWindow: true }).then((tabs) => {
    const tab = tabs[0];
    if (tab?.id !== undefined) return chrome.tabs.update(tab.id, { url: invitation.url });
    return undefined;
  });
  receivedInvitation = undefined;
  void chrome.notifications.clear(notificationId);
});

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
