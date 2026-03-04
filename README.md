# BayanSynth Studio

Vocaloid-style Arabic TTS editor. Draw notes on a piano roll, type your Arabic text, pick a voice, and the AI model generates the audio.

Built on Electron, React 18, FastAPI, CosyVoice 3, and the BayanSynthTTS Arabic LoRA. Runs fully offline once the models are downloaded.

---

## Quickstart

Download the latest `.exe` from the [Releases](https://github.com/Ramendan/BayanSynth-Studio/releases) page.

- `BayanSynth Studio Setup 0.1.0-alpha.exe` - installs to your start menu
- `BayanSynth Studio 0.1.0-alpha.exe` - portable, just double-click

> **Note:** the exe relies on the Python environment created by `setup.bat`. Run the script once (see [Installation from source](#installation-from-source) below) before using the executable.

On the first run it will download the AI models (~9 GB total). After that it opens straight to the editor every time.

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

Both repos are needed — `BayanSynth-Studio` is the app and `BayanSynthTTS` supplies the AI engine code that gets bundled during setup:

```bat
git clone https://github.com/Ramendan/BayanSynth-Studio.git
git clone https://github.com/Ramendan/BayanSynthTTS.git
cd BayanSynth-Studio
```

The two folders must sit **side by side** (same parent folder).

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

Since `setup.bat` already downloaded the models, the studio opens straight to the editor. If for any reason the models are missing (e.g. you used `--skip-download`), a download screen will appear — click the button and it will fetch them automatically.

---

## Where are the models stored?

Inside the studio folder itself, under `backend\lib\`:

```
BayanSynth-Studio\
  backend\
    lib\
      BayanSynthTTS\
        pretrained_models\
          CosyVoice3\        <- base model (~7 GB)
        checkpoints\
          llm\
            epoch_28_whole.pt  <- Arabic LoRA (~1.9 GB)
```

To re-download (e.g. after moving the folder), delete those paths and run `python backend\download_models.py`.

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

## Building the .exe yourself

From the repo root:

```bat
npm run build
```

Outputs to `dist/`:

| File | What it is |
|------|------------|
| `BayanSynth Studio Setup 0.1.0-alpha.exe` | Standard Windows installer |
| `BayanSynth Studio 0.1.0-alpha.exe` | Portable, no install needed |

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

```bat
git clone https://github.com/Ramendan/BayanSynth-Studio.git
cd BayanSynth-Studio
```

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
├── setup.bat              <- First-time setup
├── start_studio.bat       <- Daily launcher
├── package.json           <- Electron + electron-builder config
│
├── backend/
│   ├── server.py          <- FastAPI on port 8910
│   ├── requirements.txt
│   └── lib/               <- Populated by setup.bat (gitignored)
│
├── frontend/              <- React 18 + Vite (port 5177 in dev)
│   └── src/
│       ├── store/atoms.js
│       ├── audio/AudioEngine.js
│       ├── components/
│       └── styles.css
│
└── electron/
    └── main.js            <- Electron shell; spawns backend
```

---

## License

Apache 2.0 - see [LICENSE](LICENSE).
CosyVoice 3 model weights are subject to [FunAudioLLM's model license](https://huggingface.co/FunAudioLLM/CosyVoice3-300M-Instruct).

---

## Acknowledgements

- [FunAudioLLM / CosyVoice](https://github.com/FunAudioLLM/CosyVoice) - base TTS model
- [Matcha-TTS](https://github.com/shivammehta25/Matcha-TTS) - flow matching vocoder
