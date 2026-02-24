# BayanSynth Studio

A Vocaloid-inspired Arabic TTS editor built with Electron + React + WaveSurfer.js.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Electron Shell (main.js)                       │
│  ┌───────────────────┐  ┌────────────────────┐  │
│  │  React Frontend   │  │  FastAPI Backend    │  │
│  │  (Vite + React)   │──│  (Python + TTS)    │  │
│  │  WaveSurfer.js    │  │  port 8910         │  │
│  │  port 5173 (dev)  │  └────────────────────┘  │
│  └───────────────────┘                          │
└─────────────────────────────────────────────────┘
```

## Features

- **Timeline Editor**: Drag-and-drop text nodes on a visual timeline
- **Properties Panel**: Per-node controls (voice, speed, fade in/out, pitch)
- **Auto-Tashkeel**: Automatic diacritization before synthesis
- **WaveSurfer Waveform**: Interactive audio visualization
- **Export**: Render full timeline to a single WAV file
- **Voice Library**: Select from saved voices or upload new ones

## Development

```bash
# Prerequisites: Node.js 18+, Python 3.10+, BayanSynth weights set up

# Install dependencies
cd demos/studio
npm install

# Start in development mode (launches backend + frontend + Electron)
npm run dev

# Or run components separately:
# Terminal 1: Backend
cd backend && python server.py

# Terminal 2: Frontend
cd frontend && npm run dev

# Terminal 3: Electron
npx electron .
```

## Building for Distribution

```bash
npm run build
# Output in dist/ (NSIS installer on Windows, DMG on Mac, AppImage on Linux)
```

## API Endpoints (Backend)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Health check |
| `/api/synthesize` | POST | Generate speech → WAV |
| `/api/tashkeel` | POST | Auto-diacritize text |
| `/api/voices` | GET | List available voices |
| `/api/voices/upload` | POST | Upload voice file |
| `/api/export` | POST | Render timeline → WAV |
