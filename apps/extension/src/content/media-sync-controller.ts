import {
  planCorrection,
  sameVideo,
  type MediaState,
  type VideoIdentity,
} from '@watchpair/protocol';

interface MediaSyncCallbacks {
  onOperation(video: VideoIdentity, media: MediaState): void;
  onBuffering(buffering: boolean, video: VideoIdentity, media: MediaState): void;
}

export class MediaSyncController {
  readonly #listeners: Array<[string, EventListener]> = [];
  #applyingRemote = false;
  #restoreTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly element: HTMLVideoElement,
    private readonly identity: VideoIdentity,
    private readonly callbacks: MediaSyncCallbacks,
  ) {
    for (const eventName of ['play', 'pause', 'seeked', 'ratechange']) {
      this.#listen(eventName, () => this.#publishOperation());
    }
    this.#listen('waiting', () => this.#publishBuffering(true));
    this.#listen('playing', () => this.#publishBuffering(false));
  }

  async applyRemote(
    video: VideoIdentity,
    media: MediaState,
  ): Promise<'applied' | 'video-mismatch'> {
    if (!sameVideo(this.identity, video)) return 'video-mismatch';

    await this.#withRemoteGuard(async () => {
      this.element.currentTime = media.currentTime;
      this.element.playbackRate = media.playbackRate;
      await this.#applyPaused(media.paused);
    });
    return 'applied';
  }

  async applyAuthoritative(
    video: VideoIdentity,
    media: MediaState,
  ): Promise<'applied' | 'video-mismatch'> {
    if (!sameVideo(this.identity, video)) return 'video-mismatch';

    await this.#withRemoteGuard(async () => {
      const correction = planCorrection({
        driftSeconds: media.currentTime - this.element.currentTime,
        roomRate: media.playbackRate,
      });

      if (correction.kind === 'seek') {
        this.element.currentTime = media.currentTime;
        this.element.playbackRate = media.playbackRate;
      } else if (correction.kind === 'nudge') {
        this.element.playbackRate = correction.playbackRate;
        if (this.#restoreTimer) clearTimeout(this.#restoreTimer);
        this.#restoreTimer = setTimeout(() => {
          this.#applyingRemote = true;
          this.element.playbackRate = media.playbackRate;
          this.#applyingRemote = false;
        }, 3_000);
      } else {
        this.element.playbackRate = media.playbackRate;
      }
      await this.#applyPaused(media.paused);
    });
    return 'applied';
  }

  destroy(): void {
    for (const [eventName, listener] of this.#listeners) {
      this.element.removeEventListener(eventName, listener);
    }
    if (this.#restoreTimer) clearTimeout(this.#restoreTimer);
  }

  #listen(eventName: string, listener: EventListener): void {
    this.element.addEventListener(eventName, listener);
    this.#listeners.push([eventName, listener]);
  }

  #publishOperation(): void {
    if (!this.#applyingRemote) this.callbacks.onOperation(this.identity, this.#mediaState());
  }

  #publishBuffering(buffering: boolean): void {
    if (!this.#applyingRemote) {
      this.callbacks.onBuffering(buffering, this.identity, this.#mediaState());
    }
  }

  #mediaState(): MediaState {
    return {
      paused: this.element.paused,
      currentTime: Math.max(0, this.element.currentTime),
      playbackRate: this.element.playbackRate,
    };
  }

  async #applyPaused(paused: boolean): Promise<void> {
    if (paused) {
      this.element.pause();
    } else {
      await this.element.play();
    }
  }

  async #withRemoteGuard(action: () => Promise<void>): Promise<void> {
    this.#applyingRemote = true;
    try {
      await action();
    } finally {
      this.#applyingRemote = false;
    }
  }
}
