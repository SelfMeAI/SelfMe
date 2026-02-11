const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  getConfig: () => ipcRenderer.invoke('get-config'),
  openConfig: () => ipcRenderer.invoke('open-config')
});
