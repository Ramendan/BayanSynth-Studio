# BayanSynth Studio

> A **Vocaloid-style Arabic TTS editor** — draw notes on a piano roll, pick a voice, and hear your text sung or spoken in Arabic.

Built with Electron · React 18 · FastAPI · CosyVoice 3 + BayanSynthTTS Arabic LoRA.

---

## What is this?

BayanSynth Studio is a desktop app that lets you create Arabic speech and song by drawing notes on a timeline, like Vocaloid or Synthesizer V. You type Arabic text into each note, choose a voice (or clone your own), and the AI model generates the audio. You can then add effects, export to WAV, and share the result.

It runs entirely on your computer — no subscription, no internet required after setup.

---

## Requirements

| Item | What you need |
|------|---------------|
| **OS** | Windows 10 or 11 (64-bit) |
| **Python** | 3.11 — [python.org/downloads](https://www.python.org/downloads/) |
| **Node.js** | 20 LTS — [nodejs.org](https://nodejs.org) |
| **Git** | Any recent version — [git-scm.com](https://git-scm.com) |
| **GPU** | Any NVIDIA CUDA GPU recommended (GTX 1080 or newer, any RTX / Quadro). CPU-only works but synthesis takes ~30 s per note. |
| **RAM** | 16 GB minimum, 32 GB recommended |
| **Disk** | ~5 GB free (AI models ~3.5 GB + Python environment ~1.5 GB) |

> **Tip:** During Python installation, tick **"Add Python to PATH"**. During Node.js installation, tick **"Automatically install the necessary tools"**.

---

## Installation (non-technical guide)

You only need to do this once.

### Step 1 — Get the code

Open a terminal (search for **Command Prompt** or **PowerShell** in the Start menu) and run:

```bat
git clone https://github.com/Ramendan/CosyVoice-Arabic.git
cd CosyVoice-Arabic\demos\studio
```

### Step 2 — Run setup

Double-click **`setup.bat`** (or type it in the terminal).

This will automatically:
1. Create a Python virtual environment inside the folder
2. Install all Python packages (`torch`, `fastapi`, `bayansynthtts`, etc.)
3. Install all Node.js packages

> Setup creates the environment only — it does **not** download the AI models.
> The models are downloaded automatically the first time you launch the studio (see next step).

> Re-running `setup.bat` is safe — it skips anything already installed.

### Step 3 — First launch: download models

Double-click **`start_studio.bat`**.

On the very first launch, the studio will detect that the AI models are missing and show a **Download Models** screen. Click the button to start the download (~3.5 GB total from Hugging Face).

| What gets downloaded | Approx. size |
|----------------------|--------------|
| CosyVoice3 base model | ~2.8 GB |
| BayanSynth Arabic LoRA | ~1.5 GB |

The screen shows two live progress bars. When both reach 100 % the models load into memory and the studio opens automatically.

> This download happens **once**. After that, the studio opens directly every time.

---

## Where are the models stored?

The models are saved inside the **BayanSynthTTS** folder that lives alongside the repository:

```
BayanSynthTTS\
  pretrained_models\
    CosyVoice3\          ← base model (~2.8 GB)
  checkpoints\
    llm\
      epoch_28_whole.pt  ← Arabic LoRA (~1.5 GB)
```

The download wizard shows the exact paths on your machine before you start.

To **re-download** (e.g. after moving the folder), delete those two locations and launch the studio again.

---

### Step 4 — Daily use

Double-click **`start_studio.bat`** every time you want to use the app. The model download only runs on the first launch; from then on the studio opens straight to the editor.

---

## Using the studio

| What you want to do | How |
|---------------------|-----|
| Draw a note | Choose the **Draw** tool (B key), click and drag on the piano roll |
| Type text into a note | Double-click the note |
| Change the voice | Click the voice dropdown on the left of each track |
| Clone your own voice | Click the microphone icon in the toolbar, record ~10 seconds, save |
| Play back | Press **Space** |
| Export to WAV | **File → Export WAV** (or the export icon in the toolbar) |
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

## Settings explained

Open **Settings** (gear icon) to see these options:

| Setting | What it does |
|---------|-------------|
| **Playback Quality** | *Low* — least delay, may glitch on slow computers. *Balanced* — best for most machines. *High* — smoothest playback, slight extra delay. |
| **Default Voice** | The voice pre-selected when you add a new track. |
| **Auto-tashkeel** | Automatically adds Arabic diacritics (vowel marks) to your text before synthesis. Turn off only if you are supplying fully diacritized text yourself. |
| **Default BPM** | The tempo used when you create a new project. |
| **Confirm before delete** | Shows a confirmation dialog before deleting a note. Turn off if you find it annoying. |
| **Auto-Save** | Saves your project automatically every N minutes so you never lose work. |
| **Language** | Interface language. English (`en`) and Arabic (`ar`) are available. |
| **Theme** | Dark (default) or Light. |
| **Export prefix** | A string added to the start of the exported WAV filename. |
| **Voice Library folder** | An extra folder on your computer where you keep `.wav`/`.mp3` voice reference files. These appear alongside the built-in voices. |

---

## Building a portable / installer .exe

If you want to give someone the app without them needing Python or Node.js, you can build a single Windows executable.

### Prerequisites

- Complete the full installation above (Steps 1–2) so all dependencies are present
- Make sure `npm install` has been run inside `demos/studio/` (setup.bat does this automatically)

### Build

From inside `demos/studio/`:

```bat
npm run build
```

This compiles the React frontend, then packages everything into `dist/`:

| File | What it is |
|------|------------|
| `BayanSynth Studio Setup 0.1.0.exe` | Standard Windows installer |
| `BayanSynth Studio 0.1.0.exe` | Portable — just double-click, no install needed |

Just send the `.exe` to a friend. No Python, no Node.js, no terminal required.

### Adding a custom icon (optional)

Create `demos/studio/assets/` and put your icon there:

```
assets/
  icon.ico    ← Windows (256×256 px recommended)
  icon.icns   ← macOS
```

Then in `demos/studio/package.json` under `"build"` add:

```json
"win": { "target": [...], "icon": "assets/icon.ico" },
"mac": { "target": "dmg",  "icon": "assets/icon.icns" }
```

Re-run `npm run build` to pick up the icon.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `python` is not recognized | Re-install Python and tick **"Add Python to PATH"** |
| `node` is not recognized | Re-install Node.js |
| `git` is not recognized | Install Git from [git-scm.com](https://git-scm.com) |
| Setup stops at model download | Check your internet connection; re-run `setup.bat` — it resumes from where it stopped |
| Studio opens but no audio | Check that another app is not blocking your audio device |
| Synthesis is very slow | You are running on CPU. Any NVIDIA CUDA GPU (GTX 1080 or newer) greatly speeds this up |
| Light theme looks wrong | Clear the app's `localStorage` in DevTools (`F12 → Application → Local Storage → Clear`) |
| Build fails: cannot find `assets/icon.ico` | Remove the `icon` lines from `package.json` (see above), or add the file |
| Port 8910 already in use | Close any other BayanSynth Studio window, then retry |

---

## For developers — building from source

### 1. Clone the repository

```bat
git clone https://github.com/Ramendan/CosyVoice-Arabic.git
cd CosyVoice-Arabic
```

The studio lives at `demos/studio/` inside the repo.

### 2. Python environment

```bat
python -m venv .venv
call .venv\Scripts\activate.bat
pip install -r demos\studio\backend\requirements.txt
```

### 3. Node dependencies

```bat
cd demos\studio
npm install
```

### 4. Run in dev mode

```bat
REM Terminal 1 — backend  (from demos\studio)
call ..\..\..venv\Scripts\activate.bat
python backend\server.py

REM Terminal 2 — frontend hot-reload  (from demos\studio\frontend)
npm run dev

REM Or start both at once from demos\studio:
npm run dev
```

The app opens at `http://localhost:5177`.

### 5. Build the packaged app

```bat
REM From demos\studio
npm run build
```

Outputs an installer + portable `.exe` to `demos/studio/dist/`.

### Project layout

```
CosyVoice-Arabic/
└── demos/studio/
    ├── setup.bat              ← First-time setup for end-users
    ├── start_studio.bat       ← Daily launcher
    ├── package.json           ← Electron + electron-builder config
    │
    ├── backend/
    │   ├── server.py          ← FastAPI on port 8910
    │   ├── requirements.txt
    │   └── lib/               ← Populated by setup.bat (gitignored)
    │
    ├── frontend/              ← React 18 + Vite (port 5177 in dev)
    │   └── src/
    │       ├── store/atoms.js
    │       ├── audio/AudioEngine.js
    │       ├── components/
    │       └── styles.css
    │
    └── electron/
        └── main.js            ← Electron shell; spawns backend
```


---

## License

**Apache 2.0** — see [LICENSE](LICENSE).  
CosyVoice 3 model weights are subject to [FunAudioLLM's model license](https://huggingface.co/FunAudioLLM/CosyVoice3-300M-Instruct).

---

## Acknowledgements

- [FunAudioLLM / CosyVoice](https://github.com/FunAudioLLM/CosyVoice) — base TTS model  
- BayanSynthTTS — Arabic fine-tuning  
- [Matcha-TTS](https://github.com/shivammehta25/Matcha-TTS) — flow matching vocoder
