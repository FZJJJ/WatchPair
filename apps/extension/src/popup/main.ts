import { renderPopup } from './popup-controller.js';
import { loadSettings, saveSettings } from '../shared/settings.js';
import './styles.css';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing popup root');

const popup = renderPopup(root, {
  send: (message) => chrome.runtime.sendMessage(message),
  loadServerUrl: async () => (await loadSettings()).serverUrl,
  saveServerUrl: async (serverUrl) => saveSettings({ serverUrl }),
});

chrome.runtime.onMessage.addListener((message: unknown) => popup.handleMessage(message));
void chrome.runtime.sendMessage({ type: 'get-status' }).then((response) => {
  if (response?.roomCode) popup.handleMessage({ type: 'room-joined', roomCode: response.roomCode });
  popup.handleMessage({
    type: 'connection-status',
    status: response?.connectionStatus ?? 'disconnected',
  });
});
