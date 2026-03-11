# BayanSynth Studio

Vocaloid-style Arabic TTS editor. Draw notes on a piano roll, type your Arabic text, pick a voice, and the AI model generates the audio.

Built on Electron, React 18, FastAPI, CosyVoice 3, and the BayanSynthTTS Arabic LoRA. Runs fully offline once the models are downloaded.

---

## Quickstart

Download the latest release from the [Releases](https://github.com/Ramendan/BayanSynth-Studio/releases) page.

### Option A: Full package (recommended)

Download **`BayanSynth-Studio-1.0.0-win-x64.7z.001`** (and `.002`, `.003`, `.004` parts) from the release assets.

This bundles **everything**: Electron app, embedded Python 3.11, PyTorch (CUDA 12.8), and all model weights. No Python installation required. No internet needed after extraction.

1. Download **all** `.7z.001` through `.7z.004` parts into the **same folder**
2. Extract the **`.7z.001`** part with [7-Zip](https://7-zip.org) — it will auto-join the remaining parts
3. Run **`BayanSynth Studio.exe`** from the extracted folder
4. Everything is included — no downloads needed, opens straight to the editor

### Option B: Lightweight exe (for developers)

Download **`BayanSynth Studio 1.0.0.exe`** (~68 MB).

This is just the Electron shell. It requires a Python 3.11 environment set up separately. See [Installation from source](#installation-from-source) below.

---

## What is this?

BayanSynth Studio is a desktop app for creating Arabic speech and song. You work on a timeline like Vocaloid or Synthesizer V: draw notes, type text into them, and hit play. You can use the built-in voices or record your own. Export to WAV when you're done.

No subscription. No cloud. Everything runs on your machine.

---

## Requirements

| Item | What you need |
|------|---------------|
| **OS** | Windows 10 or 11 (64-bit) |
| **Python** | 3.11 - [python.org/downloads](https://www.python.org/downloads/) (tick **"Add Python to PATH"**) |
| **GPU** | NVIDIA GPU recommended (CPU works but synthesis takes ~30 s per note) |
| **Disk** | ~12 GB free (AI models ~9 GB + Python environment + Node modules ~3 GB) |

---

## Installation from source

Only needed if you want to modify the code or build the app yourself.

### Step 1 - Prerequisites

- Python 3.11 - [python.org/downloads](https://www.python.org/downloads/) (tick **"Add Python to PATH"**)
- Node.js 20 LTS - [nodejs.org](https://nodejs.org)
- Git - [git-scm.com](https://git-scm.com)

### Step 2 - Get the code

Both repos are needed: `BayanSynth-Studio` is the app and `CosyVoice-Arabic` supplies the AI engine code that gets bundled during setup:

```bat
git clone https://github.com/Ramendan/BayanSynth-Studio.git
git clone https://github.com/Ramendan/CosyVoice-Arabic.git
cd BayanSynth-Studio
```

The two folders must sit **side by side** (same parent folder). The `CosyVoice-Arabic` repo contains `cosyvoice/`, `matcha/`, and `BayanSynthTTS/` which are needed by the engine.

### Step 3 - Run setup

Double-click **`setup.bat`** (or type it in the terminal).

This does the following in one go:
1. Creates a Python virtual environment
2. Installs all Python and Node.js dependencies
3. Bundles the AI engine code from the sibling `BayanSynthTTS` folder into `backend\lib\`
4. Downloads the AI model weights (~9 GB total, needs a good internet connection)

Running `setup.bat` again is safe and skips anything already installed.

### Step 4 - Launch

Double-click **`start_studio.bat`**.

Since `setup.bat` already downloaded the models, the studio opens straight to the editor. If the models are missing (e.g. you used `--skip-download`), a download screen will appear. Click the button and it will fetch them automatically.

---

## Where are the models stored?

Model storage depends on how you're running the app:

### Full package / packaged exe

Models are stored in your Windows AppData folder:

```
%APPDATA%\BayanSynth Studio\
  pretrained_models\
    CosyVoice3\               <- base model (~7 GB)
  checkpoints\
    llm\
      epoch_28_whole.pt        <- Arabic LoRA (~1.9 GB)
```

Open this folder by typing `%APPDATA%\BayanSynth Studio` in the Windows Explorer address bar.

### Dev mode (running from source)

Models are stored inside the BayanSynthTTS repo that the server auto-discovers:

```
BayanSynthTTS\
  pretrained_models\
    CosyVoice3\               <- base model (~7 GB)
  checkpoints\
    llm\
      epoch_28_whole.pt        <- Arabic LoRA (~1.9 GB)
```

To re-download models, delete those folders and re-launch the studio. The setup screen will appear automatically.

---

## Where are voices stored?

Saved voices (from voice cloning) go into the `voices/` folder inside the studio project:

```
BayanSynth-Studio\voices\     <- your saved voices (24 kHz WAV)
```

The app also loads built-in reference voices from the BayanSynthTTS library (`default.wav`, `muffled-talking.wav`). These appear in the voice list automatically.

### Daily use

Double-click **`start_studio.bat`** every time. The model download only runs the first time.

---

## Using the studio

| What you want to do | How |
|---------------------|-----|
| Draw a note | Choose the **Draw** tool (B key), click and drag on the piano roll |
| Type text into a note | Double-click the note |
| Change the voice | Click the voice dropdown on the left of each track |
| Clone your own voice | Click the microphone icon in the toolbar, record ~10 seconds, save |
| Open voices folder | In the Voice Cloning panel, click **Open Folder** to reveal the `voices/` directory |
| Delete a voice | In the Voice Cloning panel, click the trash icon next to any voice |
| Play back | Press **Space** |
| Export to WAV | **File > Export WAV** or the export icon in the toolbar |
| Save project | **Ctrl+S** |
| Open project | **Ctrl+O** |

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `V` | Select tool |
| `B` | Draw tool |
| `C` | Scissors (cut) tool |
| `D` | Delete tool |
| `Space` | Play / Pause |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `?` | Help panel |

---

## Settings

Open **Settings** (gear icon):

| Setting | What it does |
|---------|-------------|
| **Playback Quality** | Low = least delay. Balanced = best for most machines. High = smoothest, slight extra delay. |
| **Default Voice** | Voice pre-selected when you add a new track. |
| **Auto-tashkeel** | Adds Arabic diacritics automatically. Turn off if you're supplying fully diacritized text. |
| **Default BPM** | Starting tempo for new projects. |
| **Confirm before delete** | Shows a confirmation dialog before deleting a note. |
| **Auto-Save** | Saves the project automatically every N minutes. |
| **Language** | English (`en`) or Arabic (`ar`). |
| **Theme** | Dark (default) or Light. |
| **Export prefix** | String prepended to exported WAV filenames. |
| **Voice Library folder** | Extra folder for `.wav`/`.mp3` voice reference files. |

---

## Voice cloning

BayanSynth Studio supports zero-shot voice cloning: record a few seconds of any speaker and the AI will synthesize Arabic speech in that voice.

### How it works

1. Click the **microphone** icon in the toolbar to open the Voice Cloning panel.
2. **Record** 5-15 seconds of clear speech (any language), or **Upload** an existing audio file.
3. **Preview** the recording to make sure it sounds clean.
4. Enter a name and click **Save Voice** to add it to the library.
5. Optionally click **Test Synthesize** to hear a sample in the new voice.
6. Click **Apply** to assign the voice to the selected note on the timeline.

All voices are stored as 24 kHz mono WAV files in the `voices/` folder inside the project. Click the **Open Folder** button in the Voice Library to reveal this directory in Windows Explorer. You can also drop `.wav` files directly into this folder and they will appear in the voice list after a refresh.

### Managing voices

| Action | How |
|--------|-----|
| Record a new voice | Voice Cloning panel > **Start Recording** |
| Upload an audio file | Voice Cloning panel > **Upload File**, or the upload button in the Properties panel |
| Preview a voice | Click the play icon next to any voice in the library |
| Delete a voice | Click the trash icon next to any voice in the library |
| Open voices folder | Click **Open Folder** in the Voice Library header |
| Apply to a note | Select a note, then click **Apply** next to the voice |

> **Tip:** The model extracts speaker characteristics from the reference audio, not the words. You can record in English, French, or any language and it will still synthesize in Arabic. Cleaner recordings produce better clones.

---

## Building the .exe yourself

From the repo root:

### Lightweight build (no bundled Python)

```bat
npm run build
```

Produces a portable exe (~68 MB) that needs a separate Python environment.

### Full build (bundled Python, standalone)

```bat
bundle_python.bat          &:: downloads Python 3.11 embeddable + all deps (~5 GB)
bundle_deps.bat            &:: copies cosyvoice, matcha, bayansynthtts into backend\lib\
npm run build:frontend     &:: builds the React frontend
npx electron-builder --win --dir   &:: builds the unpacked Electron app
```

Then compress `dist\win-unpacked\` with 7-Zip:

```bat
"C:\Program Files\7-Zip\7z.exe" a -t7z -mx=5 dist\BayanSynth-Studio.7z dist\win-unpacked\*
```

> **Tip:** Use `bundle_python.bat --cpu` for a smaller build without CUDA (~1.5 GB smaller). Synthesis will be slower.

Outputs to `dist/`:

| File | What it is |
|------|------------|
| `BayanSynth-Studio-*.7z` | Full package with bundled Python (CUDA) |
| `BayanSynth Studio *.exe` | Portable exe (lightweight, no Python) |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `python` is not recognized | Re-install Python and tick **"Add Python to PATH"** |
| `node` is not recognized | Re-install Node.js |
| `git` is not recognized | Install Git from [git-scm.com](https://git-scm.com) |
| Setup stops at model download | Check your connection; re-run `setup.bat` to resume |
| Studio opens but no audio | Check that another app is not using your audio device |
| Synthesis is very slow | You're running on CPU. An NVIDIA GPU speeds things up a lot |
| Light theme looks wrong | Clear `localStorage` in DevTools (F12 > Application > Local Storage > Clear) |
| Port 8910 already in use | Close any other BayanSynth Studio window, then retry |

---

## Building from source

### 1. Clone

Both repos are needed: the Studio app and the CosyVoice-Arabic repo that supplies the AI engine code:

```bat
git clone https://github.com/Ramendan/BayanSynth-Studio.git
git clone https://github.com/Ramendan/CosyVoice-Arabic.git
cd BayanSynth-Studio
```

The two folders must sit **side by side** (same parent folder).

### 2. Python environment

```bat
python -m venv .venv
call .venv\Scripts\activate.bat
pip install -r backend\requirements.txt
```

### 3. Node dependencies

```bat
npm install
```

### 4. Run in dev mode

```bat
REM Terminal 1 - backend
call .venv\Scripts\activate.bat
python backend\server.py

REM Terminal 2 - frontend  (from frontend\)
cd frontend
npm run dev
```

The app opens at `http://localhost:5177`.

### 5. Build the packaged app

```bat
npm run build
```

Outputs an installer and portable `.exe` to `dist/`.

### Project layout

```
BayanSynth-Studio/
├── setup.bat              <- First-time setup (Python venv + Node + models)
├── start_studio.bat       <- Daily launcher
├── bundle_python.bat      <- Bundle embedded Python for standalone distribution
├── bundle_deps.bat        <- Bundle cosyvoice/matcha/bayansynthtts into backend/lib/
├── package.json           <- Electron + electron-builder config
│
├── backend/
│   ├── server.py          <- FastAPI on port 8910
│   ├── download_models.py <- Model downloader (base + LoRA)
│   ├── requirements.txt
│   ├── lib/               <- Populated by bundle_deps.bat (gitignored)
│   └── python_embed/      <- Populated by bundle_python.bat (gitignored)
│
├── frontend/              <- React 18 + Vite (port 5177 in dev)
│   └── src/
│       ├── store/atoms.js
│       ├── audio/AudioEngine.js
│       ├── components/
│       └── styles.css
│
├── electron/
│   └── main.js            <- Electron shell; spawns backend
│
└── voices/                <- Saved voices (24 kHz WAV files)
```

---

## License

Apache 2.0 - see [LICENSE](LICENSE).
CosyVoice 3 model weights are subject to [FunAudioLLM's model license](https://huggingface.co/FunAudioLLM/CosyVoice3-300M-Instruct).

---

## Acknowledgements

- [FunAudioLLM / CosyVoice](https://github.com/FunAudioLLM/CosyVoice) - base TTS model
- [Matcha-TTS](https://github.com/shivammehta25/Matcha-TTS) - flow matching vocoder
