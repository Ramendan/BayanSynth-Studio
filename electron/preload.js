// Preload script — exposes safe IPC bridge to renderer
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveFileDialog: (defaultName) => ipcRenderer.invoke('save-file-dialog', defaultName),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
});
