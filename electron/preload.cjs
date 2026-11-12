/**
 * Tiger Game.Com SM8521 Emulator — Native Windows Preload Bridge
 * Exposes safe native desktop APIs (window.gamecomDesktop) to the emulator frontend.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gamecomDesktop', {
  isWindowsApp: true,
  defaultScreenOnly: true,
  getInfo: () => ipcRenderer.invoke('desktop:get-info'),
  openRomDialog: (slot = 1) => ipcRenderer.invoke('desktop:open-rom-dialog', slot),
  saveNvramNative: (bytesArray) => ipcRenderer.invoke('desktop:save-nvram-native', bytesArray),
  loadNvramNative: () => ipcRenderer.invoke('desktop:load-nvram-native'),
  toggleFullscreen: () => ipcRenderer.invoke('desktop:toggle-fullscreen'),
  onMenuAction: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('desktop:menu-action', listener);
    return () => ipcRenderer.removeListener('desktop:menu-action', listener);
  },
  onRomLoaded: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('desktop:rom-loaded', listener);
    return () => ipcRenderer.removeListener('desktop:rom-loaded', listener);
  }
});
