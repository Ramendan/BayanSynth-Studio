// BayanSynth Studio — Electron main process
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const isDev = !app.isPackaged;
let mainWindow;
let backendProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 750,
    title: 'BayanSynth Studio',
    backgroundColor: '#0b0b0b',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (isDev) {
    // Show a minimal loading page immediately so Electron isn't a black screen
    // while Vite is still starting up.
    mainWindow.loadURL('data:text/html,<style>body{background:#0b0b0b;color:#00f0ff;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}p{font-size:14px;letter-spacing:2px;}</style><p>⏳ BAYANSYNTH STUDIO — STARTING...</p>');

    // Try to load the Vite dev server, retrying until it's ready.
    const DEV_PORTS = [5177, 5178, 5179, 5180];
    let tryIndex = 0;
    let loaded = false;

    const tryLoad = () => {
      if (loaded) return;
      const url = `http://localhost:${DEV_PORTS[tryIndex % DEV_PORTS.length]}`;
      mainWindow.webContents.loadURL(url).then(() => {
        loaded = true;
      }).catch(() => {
        // Not ready yet; try same port again (Vite may still be booting)
        tryIndex++;
        // After exhausting all ports, restart from 5177 — Vite may have just needed more time
        setTimeout(tryLoad, 1200);
      });
    };

    // Start trying after a short grace period for Vite to spin up
    setTimeout(tryLoad, 2000);

    // Also open DevTools
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
  }

  // Grant microphone / media permissions required for voice cloning.
  // Without this handler Electron silently denies getUserMedia in the renderer.
  mainWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      // Allow media-related permissions; deny everything else for security.
      const ALLOWED = ['media', 'microphone', 'audioCapture', 'mediaKeySystem'];
      callback(ALLOWED.includes(permission));
    }
  );

  // Also grant device-permission checks (Electron 20+)
  mainWindow.webContents.session.setPermissionCheckHandler(
    (_webContents, permission) => {
      const ALLOWED = ['media', 'microphone', 'audioCapture'];
      return ALLOWED.includes(permission);
    }
  );

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Walk upward from a starting directory looking for a .venv with python.exe.
 * Returns the python.exe path or null.
 */
function findVenvPython(startDir, maxLevels = 8) {
  let dir = startDir;
  for (let i = 0; i < maxLevels; i++) {
    const candidate = path.join(dir, '.venv', 'Scripts', 'python.exe');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached root
    dir = parent;
  }
  return null;
}

function startBackend() {
  const studioRoot = path.join(__dirname, '..');

  let pythonPath;
  if (isDev) {
    // 1. Studio-local venv (created by setup.bat)
    const localVenv = path.join(studioRoot, '.venv', 'Scripts', 'python.exe');
    // 2. Repo-level venv (default in-repo layout)
    const repoVenv  = path.join(studioRoot, '..', '..', '.venv', 'Scripts', 'python.exe');
    pythonPath = fs.existsSync(localVenv) ? localVenv : repoVenv;
  } else {
    // Packaged app: try several locations for a working Python.
    const bundled   = path.join(process.resourcesPath, 'backend', 'python.exe');
    const venvPy    = path.join(process.resourcesPath, 'backend', '.venv', 'Scripts', 'python.exe');

    if (fs.existsSync(bundled)) {
      pythonPath = bundled;
    } else if (fs.existsSync(venvPy)) {
      pythonPath = venvPy;
    } else {
      // Walk upward from the exe looking for a .venv (e.g. when the build
      // output lives inside the CosyVoice repo at demos/studio/dist/).
      const walked = findVenvPython(process.resourcesPath);
      if (walked) {
        pythonPath = walked;
      } else {
        // Last resort: system Python on PATH
        pythonPath = process.platform === 'win32' ? 'python' : 'python3';
      }
    }
  }

  const serverScript = isDev
    ? path.join(studioRoot, 'backend', 'server.py')
    : path.join(process.resourcesPath, 'backend', 'server.py');

  console.log(`[Studio] Starting backend: ${pythonPath} ${serverScript}`);

  backendProcess = spawn(pythonPath, [serverScript], {
    cwd: isDev ? studioRoot : process.resourcesPath,
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      // In the packaged app there is no BayanSynthTTS/ folder on the PATH -
      // tell the backend to use the standard userData directory so models
      // persist across updates and are always in a writable location.
      // In dev mode we let server.py walk up and find BayanSynthTTS/ itself.
      ...(!isDev ? { BAYANSYNTH_ROOT: app.getPath('userData') } : {}),
    },
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

// Save file dialog (for WAV export)
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

// Open file dialog (for import)
ipcMain.handle('open-file-dialog', async (event, options = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: options.title || 'Open File',
    filters: options.filters || [
      { name: 'Audio Files', extensions: ['wav', 'mp3', 'flac', 'ogg'] },
    ],
    properties: ['openFile'],
  });
  return result.filePaths[0];
});

// Save project file (.bayan)
ipcMain.handle('save-project-dialog', async (event, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Project',
    defaultPath: defaultName || 'project.bayan',
    filters: [
      { name: 'BayanSynth Project', extensions: ['bayan'] },
      { name: 'JSON', extensions: ['json'] },
    ],
  });
  return result.filePath;
});

// Open project file (.bayan)
ipcMain.handle('open-project-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Project',
    filters: [
      { name: 'BayanSynth Project', extensions: ['bayan', 'json'] },
    ],
    properties: ['openFile'],
  });
  return result.filePaths[0];
});

// Write file to disk
ipcMain.handle('write-file', async (event, filePath, data) => {
  try {
    fs.writeFileSync(filePath, data, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Write binary file to disk (base64 encoded — for WAV export)
ipcMain.handle('write-binary-file', async (event, filePath, base64Data) => {
  try {
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filePath, buffer);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Read file from disk
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Get app path
ipcMain.handle('get-app-path', async () => {
  return app.getPath('userData');
});

// Open the voices folder in the system file manager
ipcMain.handle('open-voices-folder', async () => {
  const studioRoot = path.join(__dirname, '..');
  const voicesDir = path.join(studioRoot, 'voices');
  if (!fs.existsSync(voicesDir)) fs.mkdirSync(voicesDir, { recursive: true });
  await shell.openPath(voicesDir);
  return { opened: true, path: voicesDir };
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
