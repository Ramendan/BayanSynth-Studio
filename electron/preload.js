// BayanSynth Studio — Preload script
// Exposes safe IPC bridge to renderer (contextIsolation: true)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // File dialogs
  saveFileDialog: (defaultName) => ipcRenderer.invoke('save-file-dialog', defaultName),
  openFileDialog: (options) => ipcRenderer.invoke('open-file-dialog', options),

  // Project file dialogs
  saveProjectDialog: (defaultName) => ipcRenderer.invoke('save-project-dialog', defaultName),
  openProjectDialog: () => ipcRenderer.invoke('open-project-dialog'),

  // File I/O
  writeFile: (filePath, data) => ipcRenderer.invoke('write-file', filePath, data),
  writeBinaryFile: (filePath, base64Data) => ipcRenderer.invoke('write-binary-file', filePath, base64Data),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),

  // App info
  getAppPath: () => ipcRenderer.invoke('get-app-path'),

  // Voice folder
  openVoicesFolder: () => ipcRenderer.invoke('open-voices-folder'),
});
