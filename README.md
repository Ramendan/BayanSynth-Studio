# BayanSynth Studio

A Vocaloid-inspired Arabic TTS workstation built with Electron 31, React 18 (react-konva Canvas timeline), and a FastAPI Python backend.

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  Electron 31 Shell — electron/main.js                          │
│  Spawns Python backend subprocess on startup                   │
│                                                                │
│  ┌──────────────────────────────┐  ┌─────────────────────────┐ │
│  │  React 18 Frontend           │  │  FastAPI Backend         │ │
│  │  Vite dev server :5173       │◄─►  Python :8910           │ │
│  │                              │  │                         │ │
│  │  react-konva Canvas timeline │  │  BayanSynthTTS          │ │
│  │  Multi-track DAW editor      │  │  (LoRA-injected model)  │ │
│  │  Web Audio API playback      │  │  librosa / torchcrepe   │ │
│  └──────────────────────────────┘  └─────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

---

## Features

| Feature | Details |
|---------|---------|
| Canvas timeline | Infinite horizontal scroll, Konva-based, 60 fps |
| Multi-track | Unlimited tracks with Mute / Solo / Volume |
| Piano-roll pitch | Drag nodes vertically to set pitch offset (semitones) |
| Node stretching | Drag right-edge handle to change playback speed |
| CREPE pitch contour | Upload a background track → F0 guideline drawn on canvas |
| Browser recording | Record mic directly via MediaRecorder API |
| Auto-Tashkeel | One-click Arabic diacritization before synthesis |
| Voice library | Upload or record new reference voices |
| Multi-track export | Full mix-down with mute/solo, fade, volume, pitch shift |
| Dark mode DAW UI | VS Code–inspired dark theme throughout |

### Keyboard / Mouse shortcuts

| Action | Gesture |
|--------|---------|
| Zoom in / out | Ctrl + Scroll wheel |
| Pan horizontal | Shift + Scroll wheel |
| Pan vertical | Scroll wheel |
| Pan (drag) | Middle-click drag or Stage drag |
| Select node | Click node |
| Move node | Drag node (X = time, Y = pitch) |
| Stretch node | Drag right-edge handle |

---

## Prerequisites

- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **Python 3.10+** with the project virtual environment set up (`pip install -r requirements.txt` from repo root)
- BayanSynth model weights placed under `bayansynth/exp/` (see top-level README)

---

## Running in Development

### Option A — One-click launcher (recommended)

Double-click `demos/studio/start_studio.bat`

Or from repo root: `start_studio.bat`

Both scripts activate the venv, add Node.js to PATH, and call `npm run dev` from `demos/studio/`.

### Option B — Manual (3 terminals)

```bash
# Terminal 1 — Python backend
cd demos/studio/backend
python server.py
# → Listening on http://127.0.0.1:8910

# Terminal 2 — Vite frontend
cd demos/studio/frontend
npm run dev
# → http://localhost:5173

# Terminal 3 — Electron
cd demos/studio
npx electron .
```

### First-time dependency install

```bash
cd demos/studio
npm install          # installs root + frontend deps via postinstall hook
```

---

## API Endpoints

All endpoints served at `http://localhost:8910`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/status` | Health check; reports whether TTS model is loaded |
| `POST` | `/api/synthesize` | Generate speech from text → WAV stream (`X-Duration`, `X-Generation-Time` headers) |
| `POST` | `/api/tashkeel` | Auto-diacritize Arabic text → `{original, diacritized, original_ratio, result_ratio}` |
| `GET` | `/api/voices` | List available voice files → `{voices: [...]}` |
| `POST` | `/api/voices/upload` | Upload audio; resampled to 24 kHz mono and peak-normalised → `{filename, path}` |
| `POST` | `/api/pitch_detect` | CREPE (torchcrepe) F0 extraction → `{pitch, hop_length, sr}` |
| `POST` | `/api/export` | Render full multi-track timeline → WAV (mute/solo/fade/pitch/volume applied) |

---

## Project Layout

```
demos/studio/
├── backend/
│   ├── server.py          FastAPI application
│   └── requirements.txt
├── electron/
│   ├── main.js            Electron main process + Python subprocess launcher
│   └── preload.js         contextBridge (saveFileDialog / openFileDialog)
├── frontend/
│   ├── src/
│   │   ├── App.jsx          Root component, track/node state management
│   │   ├── AudioEngine.js   Web Audio API playback engine (lazy AudioContext)
│   │   ├── api.js           REST client (proxied by Vite to :8910)
│   │   ├── styles.css       Dark-mode DAW theme (CSS variables)
│   │   └── components/
│   │       ├── Timeline.jsx         react-konva canvas timeline
│   │       ├── PropertiesPanel.jsx  Node properties + mic recording
│   │       └── WaveformViewer.jsx   WaveSurfer.js waveform widget
│   ├── vite.config.js
│   └── package.json
├── package.json           Electron + concurrently root scripts
├── start_studio.bat       One-click launcher (Windows)
└── README.md
```

---

## Building for Distribution

```bash
cd demos/studio
npm run build
# Output in dist/ — NSIS installer (Windows), DMG (Mac), AppImage (Linux)
```

> Note: production builds require a bundled Python interpreter. The `extraResources`
> config in `package.json` bundles `.py` files but not the interpreter itself.
> For self-contained distribution, use PyInstaller to bundle `server.py` first.


## API Endpoints (Backend)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Health check |
| `/api/synthesize` | POST | Generate speech → WAV |
| `/api/tashkeel` | POST | Auto-diacritize text |
| `/api/voices` | GET | List available voices |
| `/api/voices/upload` | POST | Upload voice file |
| `/api/export` | POST | Render timeline → WAV |
