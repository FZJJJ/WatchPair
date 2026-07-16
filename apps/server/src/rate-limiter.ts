export class JoinRateLimiter {
  readonly #attempts = new Map<string, number[]>();

  constructor(
    private readonly limit = 20,
    private readonly windowMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  allow(key: string): boolean {
    const threshold = this.now() - this.windowMs;
    const recent = (this.#attempts.get(key) ?? []).filter((time) => time > threshold);
    if (recent.length >= this.limit) {
      this.#attempts.set(key, recent);
      return false;
    }

    recent.push(this.now());
    this.#attempts.set(key, recent);
    return true;
  }
}
