const MAX_DELAY_MS = 30_000;

export function reconnectDelayMs(attempt: number, random: () => number = Math.random): number {
  const exponential = Math.min(MAX_DELAY_MS, 1_000 * 2 ** Math.max(0, attempt));
  const jitter = Math.min(1, Math.max(0.5, random()));
  return Math.round(exponential * jitter);
}
