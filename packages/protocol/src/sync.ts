import type { VideoIdentity } from './messages.js';

export type CorrectionPlan =
  | { kind: 'none' }
  | { kind: 'nudge'; playbackRate: number }
  | { kind: 'seek'; targetOffset: number };

export function planCorrection(input: { driftSeconds: number; roomRate: number }): CorrectionPlan {
  const magnitude = Math.abs(input.driftSeconds);

  if (magnitude < 0.3) return { kind: 'none' };
  if (magnitude > 1.5) return { kind: 'seek', targetOffset: input.driftSeconds };

  const factor = input.driftSeconds > 0 ? 1.08 : 0.92;
  return {
    kind: 'nudge',
    playbackRate: Math.min(3, Math.max(0.25, input.roomRate * factor)),
  };
}

export function estimateTargetTime(input: {
  snapshotTime: number;
  paused: boolean;
  playbackRate: number;
  serverSentAt: number;
  receivedAt: number;
  roundTripMs: number;
}): number {
  if (input.paused) return input.snapshotTime;

  const transitMs = Math.max(0, input.receivedAt - input.serverSentAt) + input.roundTripMs / 2;
  return input.snapshotTime + (transitMs / 1_000) * input.playbackRate;
}

export function sameVideo(left: VideoIdentity, right: VideoIdentity): boolean {
  return (
    left.bvid === right.bvid &&
    left.part === right.part &&
    Math.abs(left.duration - right.duration) <= 1
  );
}
