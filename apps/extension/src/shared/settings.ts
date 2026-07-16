export const DEFAULT_SERVER_URL = 'wss://watchpair-placeholder.onrender.com';

export interface ExtensionSettings {
  serverUrl: string;
}

export function normalizeServerUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('请输入有效的 WebSocket 地址');
  }

  if (url.protocol !== 'wss:' && url.protocol !== 'ws:') {
    throw new Error('服务地址必须使用 WebSocket 协议');
  }
  if (url.protocol === 'ws:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('非本地服务必须使用安全的 wss:// 地址');
  }

  return url.toString().replace(/\/$/, '');
}

export async function loadSettings(): Promise<ExtensionSettings> {
  const stored = (await chrome.storage.local.get('serverUrl')) as { serverUrl?: unknown };
  const serverUrl =
    typeof stored.serverUrl === 'string'
      ? normalizeServerUrl(stored.serverUrl)
      : DEFAULT_SERVER_URL;
  return { serverUrl };
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({ serverUrl: normalizeServerUrl(settings.serverUrl) });
}
