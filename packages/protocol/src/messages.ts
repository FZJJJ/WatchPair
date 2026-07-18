import { z } from 'zod';

const boundedId = z.string().min(8).max(64);
const timestamp = z.number().int().nonnegative();

export const RoomCodeSchema = z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/);

export const VideoIdentitySchema = z
  .object({
    bvid: z.string().regex(/^BV[0-9A-Za-z]{10}$/),
    part: z.number().int().positive(),
    duration: z.number().finite().nonnegative(),
  })
  .strict();

export const MediaStateSchema = z
  .object({
    paused: z.boolean(),
    currentTime: z.number().finite().nonnegative(),
    playbackRate: z.number().finite().min(0.25).max(3),
  })
  .strict();

const roomParticipant = {
  roomCode: RoomCodeSchema,
  participantId: boundedId,
};

const videoInvitation = {
  invitationId: z.string().uuid(),
  url: z
    .string()
    .url()
    .regex(/^https:\/\/www\.bilibili\.com\/video\/BV[0-9A-Za-z]{10}/),
  video: VideoIdentitySchema,
  media: MediaStateSchema,
};

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('create-room'), participantId: boundedId }).strict(),
  z.object({ type: z.literal('join-room'), ...roomParticipant }).strict(),
  z.object({ type: z.literal('leave-room'), ...roomParticipant }).strict(),
  z.object({ type: z.literal('request-snapshot'), ...roomParticipant }).strict(),
  z
    .object({ type: z.literal('video-invitation'), ...roomParticipant, ...videoInvitation })
    .strict(),
  z
    .object({
      type: z.literal('media-operation'),
      ...roomParticipant,
      operationId: z.string().min(1).max(64),
      clientSentAt: timestamp,
      video: VideoIdentitySchema,
      media: MediaStateSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('state-snapshot'),
      ...roomParticipant,
      clientSentAt: timestamp,
      video: VideoIdentitySchema,
      media: MediaStateSchema,
      buffering: z.boolean(),
    })
    .strict(),
  z.object({ type: z.literal('ping'), clientSentAt: timestamp }).strict(),
]);

const serverEnvelope = {
  roomCode: RoomCodeSchema,
  revision: z.number().int().nonnegative(),
  serverSentAt: timestamp,
};

export const ServerMessageSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('room-created'),
      roomCode: RoomCodeSchema,
      revision: z.number().int().nonnegative(),
      serverSentAt: timestamp,
    })
    .strict(),
  z
    .object({
      type: z.literal('room-joined'),
      ...serverEnvelope,
    })
    .strict(),
  z
    .object({
      type: z.literal('room-state'),
      ...serverEnvelope,
      peerConnected: z.boolean(),
      buffering: z.boolean(),
      video: VideoIdentitySchema.optional(),
      media: MediaStateSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('media-operation'),
      ...serverEnvelope,
      participantId: boundedId,
      video: VideoIdentitySchema,
      media: MediaStateSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('video-invitation'),
      ...serverEnvelope,
      participantId: boundedId,
      ...videoInvitation,
    })
    .strict(),
  z
    .object({
      type: z.literal('presence'),
      ...serverEnvelope,
      peerConnected: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal('error'),
      code: z.enum([
        'invalid-message',
        'room-not-found',
        'room-full',
        'not-in-room',
        'rate-limited',
        'internal-error',
      ]),
      message: z.string().min(1).max(200),
    })
    .strict(),
  z
    .object({
      type: z.literal('pong'),
      clientSentAt: timestamp,
      serverSentAt: timestamp,
    })
    .strict(),
]);

export type VideoIdentity = z.infer<typeof VideoIdentitySchema>;
export type MediaState = z.infer<typeof MediaStateSchema>;
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
