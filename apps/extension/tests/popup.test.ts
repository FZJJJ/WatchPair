// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { renderPopup } from '../src/popup/popup-controller.js';

describe('WatchPair popup', () => {
  it('creates a room and displays the returned room code', async () => {
    document.body.innerHTML = '<main id="app"></main>';
    const send = vi.fn().mockResolvedValue({ ok: true });
    const popup = renderPopup(document.querySelector('#app')!, { send });

    document.querySelector<HTMLButtonElement>('[data-action="create"]')!.click();
    await Promise.resolve();
    expect(send).toHaveBeenCalledWith({ type: 'create-room' });

    popup.handleMessage({ type: 'room-created', roomCode: 'AB3K7M' });
    expect(document.querySelector('[data-room-code]')?.textContent).toBe('AB3K7M');
  });

  it('normalizes valid room codes and rejects incomplete ones', async () => {
    document.body.innerHTML = '<main id="app"></main>';
    const send = vi.fn().mockResolvedValue({ ok: true });
    renderPopup(document.querySelector('#app')!, { send });
    const input = document.querySelector<HTMLInputElement>('[name="roomCode"]')!;

    input.value = 'ab3k7m';
    document.querySelector<HTMLButtonElement>('[data-action="join"]')!.click();
    await Promise.resolve();
    expect(send).toHaveBeenCalledWith({ type: 'join-room', roomCode: 'AB3K7M' });

    input.value = 'ABC';
    document.querySelector<HTMLButtonElement>('[data-action="join"]')!.click();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('六位');
  });
});
