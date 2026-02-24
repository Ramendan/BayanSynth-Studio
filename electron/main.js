// BayanSynth Studio — Electron main process
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

const isDev = !app.isPackaged;
let mainWindow;
let backendProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'BayanSynth Studio',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startBackend() {
  const pythonPath = isDev
    ? path.join(__dirname, '..', '..', '..', '.venv', 'Scripts', 'python.exe')
    : path.join(process.resourcesPath, 'backend', 'python.exe');

  const serverScript = isDev
    ? path.join(__dirname, '..', 'backend', 'server.py')
    : path.join(process.resourcesPath, 'backend', 'server.py');

  console.log(`[Studio] Starting backend: ${pythonPath} ${serverScript}`);

  backendProcess = spawn(pythonPath, [serverScript], {
    cwd: isDev ? path.join(__dirname, '..', '..', '..') : process.resourcesPath,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  backendProcess.stdout.on('data', (data) => {
    console.log(`[Backend] ${data.toString().trim()}`);
  });

  backendProcess.stderr.on('data', (data) => {
    console.error(`[Backend] ${data.toString().trim()}`);
  });

  backendProcess.on('close', (code) => {
    console.log(`[Backend] exited with code ${code}`);
  });
}

// ── IPC Handlers ────────────────────────────────────────────────────
ipcMain.handle('save-file-dialog', async (event, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Audio',
    defaultPath: defaultName || 'output.wav',
    filters: [
      { name: 'WAV Audio', extensions: ['wav'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  return result.filePath;
});

ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Audio',
    filters: [
      { name: 'Audio Files', extensions: ['wav', 'mp3', 'flac', 'ogg'] },
    ],
    properties: ['openFile'],
  });
  return result.filePaths[0];
});

// ── App Lifecycle ───────────────────────────────────────────────────
app.whenReady().then(() => {
  startBackend();
  // Give backend a moment to start
  setTimeout(createWindow, 2000);
});

app.on('window-all-closed', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
  app.quit();
});

app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
});
