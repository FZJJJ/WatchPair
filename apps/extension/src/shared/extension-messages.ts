import type { MediaState, ServerMessage, VideoIdentity } from '@watchpair/protocol';

export type PopupCommand =
  | { type: 'create-room' }
  | { type: 'join-room'; roomCode: string }
  | { type: 'leave-room' }
  | { type: 'get-status' };

export type ContentMessage =
  | { type: 'video-ready'; video: VideoIdentity; media: MediaState }
  | { type: 'local-media-operation'; video: VideoIdentity; media: MediaState }
  | { type: 'buffering-changed'; buffering: boolean; video: VideoIdentity; media: MediaState };

export type BackgroundMessage = ServerMessage | { type: 'connection-status'; status: string };
