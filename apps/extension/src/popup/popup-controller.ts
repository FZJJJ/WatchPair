interface PopupDependencies {
  send(message: unknown): Promise<unknown>;
  loadServerUrl?: () => Promise<string>;
  saveServerUrl?: (url: string) => Promise<void>;
}

export interface PopupController {
  handleMessage(message: unknown): void;
}

export function renderPopup(root: HTMLElement, dependencies: PopupDependencies): PopupController {
  root.innerHTML = `
    <header><span class="eyebrow">WATCH TOGETHER</span><h1>WatchPair</h1><p>相隔很远，也在同一帧。</p></header>
    <section class="card" aria-labelledby="room-title">
      <div class="status-row"><span class="status-dot"></span><span data-status>未连接</span></div>
      <h2 id="room-title">一起看</h2>
      <div class="room-code" data-room-code>------</div>
      <button class="primary" data-action="create">创建房间</button>
      <div class="divider"><span>或加入对方</span></div>
      <label for="room-code">六位房间码</label>
      <div class="join-row"><input id="room-code" name="roomCode" maxlength="6" autocomplete="off" placeholder="AB3K7M"><button data-action="join">加入</button></div>
      <button class="text-button" data-action="leave">离开房间</button>
      <p class="peer" data-peer>等待对方加入</p>
      <p class="error" role="alert"></p>
    </section>
    <details class="settings"><summary>服务器设置</summary><label for="server-url">WebSocket 地址</label><input id="server-url" name="serverUrl" type="url"><button data-action="save-server">保存地址</button></details>
  `;

  const status = root.querySelector<HTMLElement>('[data-status]')!;
  const room = root.querySelector<HTMLElement>('[data-room-code]')!;
  const peer = root.querySelector<HTMLElement>('[data-peer]')!;
  const error = root.querySelector<HTMLElement>('[role="alert"]')!;
  const codeInput = root.querySelector<HTMLInputElement>('[name="roomCode"]')!;
  const serverInput = root.querySelector<HTMLInputElement>('[name="serverUrl"]')!;
  const syncButton = document.createElement('button');
  syncButton.className = 'text-button';
  syncButton.textContent = '同步视频';
  syncButton.addEventListener('click', () => {
    void dependencies.send({ type: 'send-video-invitation' });
  });
  root.querySelector('.card')!.append(syncButton);

  dependencies
    .loadServerUrl?.()
    .then((url) => (serverInput.value = url))
    .catch(() => undefined);

  root.querySelector('[data-action="create"]')!.addEventListener('click', () => {
    error.textContent = '';
    status.textContent = '正在连接服务器…';
    void dependencies.send({ type: 'create-room' });
  });
  root.querySelector('[data-action="join"]')!.addEventListener('click', () => {
    const roomCode = codeInput.value.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(roomCode)) {
      error.textContent = '请输入有效的六位房间码';
      return;
    }
    error.textContent = '';
    status.textContent = '正在加入房间…';
    void dependencies.send({ type: 'join-room', roomCode });
  });
  root.querySelector('[data-action="leave"]')!.addEventListener('click', () => {
    void dependencies.send({ type: 'leave-room' });
    room.textContent = '------';
    status.textContent = '未连接';
    peer.textContent = '等待对方加入';
  });
  root.querySelector('[data-action="save-server"]')!.addEventListener('click', () => {
    if (!dependencies.saveServerUrl) return;
    dependencies.saveServerUrl(serverInput.value).then(
      () => (status.textContent = '服务器地址已保存'),
      (reason: unknown) =>
        (error.textContent = reason instanceof Error ? reason.message : '保存失败'),
    );
  });

  return {
    handleMessage(message: unknown): void {
      if (!isRecord(message) || typeof message.type !== 'string') return;
      if (
        (message.type === 'room-created' || message.type === 'room-joined') &&
        typeof message.roomCode === 'string'
      ) {
        room.textContent = message.roomCode;
        status.textContent = '已进入房间';
      } else if (message.type === 'presence') {
        peer.textContent = message.peerConnected === true ? '对方已加入 · 同步中' : '等待对方加入';
      } else if (message.type === 'connection-status' && typeof message.status === 'string') {
        status.textContent = statusText(message.status);
      } else if (message.type === 'error') {
        error.textContent = typeof message.message === 'string' ? message.message : '连接出现问题';
      } else if (message.type === 'room-state' && message.buffering === true) {
        peer.textContent = '对方正在缓冲…';
      }
    },
  };
}

function statusText(value: string): string {
  return (
    (
      {
        connecting: '正在连接服务器…',
        connected: '服务器已连接',
        reconnecting: '连接中断，正在重连…',
        disconnected: '未连接',
      } as Record<string, string>
    )[value] ?? value
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
