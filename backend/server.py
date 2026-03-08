#!/usr/bin/env python3
"""BayanSynth Studio — FastAPI backend.

Provides REST API for the Electron frontend to interact with
the BayanSynthTTS engine.

Endpoints:
    POST /api/synthesize     — Generate speech from text
    POST /api/tashkeel       — Diacritize Arabic text
    GET  /api/voices          — List available voices
    POST /api/voices/upload   — Upload a new voice
    GET  /api/status          — Backend health check
    POST /api/export          — Export timeline to WAV
    POST /api/audition        — Quick 2s preview synthesis
    POST /api/phonemize       — Buckwalter transliteration
"""

from __future__ import annotations

import asyncio
import io
import json as _json_mod
import os
import sys
import tempfile
import threading
import time
import uuid
from pathlib import Path

# ── BayanSynthTTS path discovery ─────────────────────────────────────────────
#
# Two concerns are kept SEPARATE:
#
#   1. PACKAGE root  — the directory that contains the bayansynthtts/ Python
#      package (needed for imports).  Found via bundled lib/ or walk-up.
#      The BAYANSYNTH_ROOT env var is intentionally NOT used here because it
#      may point to a user-data folder that has NO bayansynthtts/ package.
#
#   2. MODEL storage root  — where model files (pretrained_models/, checkpoints/)
#      live or will be downloaded.  When BAYANSYNTH_ROOT is set we use it
#      (creates the dir if needed); otherwise falls back to the package root.
#
# Both functions return None / fallback gracefully — the server must ALWAYS
# start so the setup screen can trigger a download on first run.

_BACKEND_DIR = Path(__file__).resolve().parent


def _find_package_root() -> Path | None:
    """Return the BayanSynthTTS repo root that contains bayansynthtts/, or None."""
    # 1. Bundled inside backend/lib/
    bundled = _BACKEND_DIR / "lib" / "BayanSynthTTS"
    if bundled.is_dir() and (bundled / "bayansynthtts").is_dir():
        return bundled

    # 2. Walk up from backend/ — covers in-repo and dist/ layouts
    probe = _BACKEND_DIR
    for _ in range(10):
        probe = probe.parent
        candidate = probe / "BayanSynthTTS"
        if candidate.is_dir() and (candidate / "bayansynthtts").is_dir():
            return candidate

    return None


def _get_model_storage_root() -> Path:
    """Return (and create) the directory used for model storage.

    Priority:
      1. BAYANSYNTH_ROOT env var  (set by main.js for packaged builds →
         AppData/Roaming/BayanSynth Studio/, always writable)
      2. Package root found via walk-up  (dev/in-repo layout)
      3. backend/models/ as a last resort
    """
    env = os.environ.get("BAYANSYNTH_ROOT")
    if env:
        p = Path(env)
        p.mkdir(parents=True, exist_ok=True)
        return p

    pkg = _find_package_root()
    if pkg is not None:
        return pkg

    fallback = _BACKEND_DIR / "models"
    fallback.mkdir(parents=True, exist_ok=True)
    return fallback


# Backwards-compat alias used by older call sites that expect a single root.
# Returns the package root when bayansynthtts is importable, otherwise the
# model-storage root (so the 503/setup checks can still locate model files).
def _find_bayansynth_root() -> Path | None:
    pkg = _find_package_root()
    if pkg is not None:
        return pkg
    # No package root — fall back to model storage so callers can inspect it
    env = os.environ.get("BAYANSYNTH_ROOT")
    if env:
        p = Path(env)
        p.mkdir(parents=True, exist_ok=True)
        return p
    return None


# ── Add BayanSynthTTS to sys.path so bayansynthtts.* are importable ──────────
_PKG_ROOT: Path | None = _find_package_root()

if _PKG_ROOT is not None:
    _pkg_root_str = str(_PKG_ROOT)
    if _pkg_root_str not in sys.path:
        sys.path.insert(0, _pkg_root_str)

    # Also expose cosyvoice/ and matcha/ that live inside the same repo
    _PKG_PARENT = str(_PKG_ROOT.parent)
    if _PKG_PARENT not in sys.path:
        sys.path.insert(0, _PKG_PARENT)

    _MATCHA_PATH = str(_PKG_ROOT.parent / "third_party" / "Matcha-TTS")
    if os.path.isdir(_MATCHA_PATH) and _MATCHA_PATH not in sys.path:
        sys.path.insert(0, _MATCHA_PATH)

    BAYAN_LIB_DIR = _pkg_root_str
    print(f"[Studio] BayanSynthTTS package root: {_PKG_ROOT}")
else:
    BAYAN_LIB_DIR = ""
    print("[Studio] WARNING: BayanSynthTTS package not found — synthesis unavailable until bundled.")

# Voices directory
_LEGACY_VOICES_DIR = os.path.join(BAYAN_LIB_DIR, "voices") if BAYAN_LIB_DIR else ""

import numpy as np
import unicodedata
import json as _json
import shutil
import librosa
import soundfile as sf
from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# ── Voices directory — stored in the project, NOT inside the library ──────────
# Layout: demos/studio/voices/   (sibling of backend/ and frontend/)
VOICES_DIR = str(_BACKEND_DIR.parent / "voices")
os.makedirs(VOICES_DIR, exist_ok=True)

# ── Asset sources for default voices ─────────────────────────────────────────
# Walk up to find the repo root that contains an asset/ folder with demo WAVs.
def _find_asset(filename: str) -> str | None:
    probe = _BACKEND_DIR
    for _ in range(6):
        probe = probe.parent
        candidate = probe / "asset" / filename
        if candidate.is_file():
            return str(candidate)
    return None


class ArabicJSONResponse(JSONResponse):
    """JSONResponse that preserves Arabic / Unicode characters (no \\uXXXX escapes)."""
    def render(self, content) -> bytes:
        return _json.dumps(
            content,
            ensure_ascii=False,
            allow_nan=False,
            indent=None,
            separators=(",", ":"),
        ).encode("utf-8")


app = FastAPI(title="BayanSynth Studio API", version="0.1.1")

# Allow both the Vite dev server and the packaged Electron app (file:// origin)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://localhost:5177",
        "http://localhost:5178", "http://localhost:5179", "http://localhost:5180",
        "http://localhost:3000",
        "http://127.0.0.1:5173", "http://127.0.0.1:5177",
        "http://127.0.0.1:5178", "http://127.0.0.1:5179", "http://127.0.0.1:5180",
        # Packaged Electron app loads index.html via file://, which makes the
        # browser send  Origin: null  for every fetch / EventSource request.
        "null",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve voice files directly so the browser can play them back
app.mount("/voices", StaticFiles(directory=VOICES_DIR), name="voices")


@app.on_event("startup")
async def _seed_default_voices():
    """Copy bundled reference voices into the project voices/ folder on first run."""
    os.makedirs(VOICES_DIR, exist_ok=True)
    seeds = {
        "default_zh.wav": "zero_shot_prompt.wav",
        "cross_lingual.wav": "cross_lingual_prompt.wav",
    }
    for dest_name, src_name in seeds.items():
        dest = os.path.join(VOICES_DIR, dest_name)
        if not os.path.isfile(dest):
            src = _find_asset(src_name)
            if src:
                shutil.copy2(src, dest)
                print(f"[BayanSynth Studio] Seeded default voice: {dest_name}")


@app.on_event("startup")
async def _try_load_models_on_startup():
    """If models are already present, load them in a TRUE background thread.

    CRITICAL: We must NOT await the model load — doing so blocks the entire
    uvicorn startup for ~40 s, causing the Electron frontend to time out and
    show "Download failed / Connection to backend lost" errors.  Instead we
    fire-and-forget a daemon thread; the server starts accepting requests
    immediately and the /api/status endpoint reports models_ready once done.
    """
    if _bayan_has_models():
        print("[Studio] Models found — loading in background…")

        def _bg_load():
            global _model_loading
            _model_loading = True
            try:
                _get_tts()
                print("[Studio] Models ready.")
            except Exception as exc:
                print(f"[Studio] Background model load failed: {exc}")
            finally:
                _model_loading = False

        threading.Thread(target=_bg_load, daemon=True).start()
    else:
        print("[Studio] Models not found — first-run setup required.")

# ── Model state ─────────────────────────────────────────────────────
_TTS = None
_models_ready: bool = False          # True once BayanSynthTTS() loaded OK
_model_loading: bool = False         # True while models are being loaded
_download_thread: threading.Thread | None = None  # background download
_dl_progress: dict = {
    "stage": "idle",      # idle | base | lora | loading | done | error
    "base_pct": 0,
    "lora_pct": 0,
    "message": "",
    "error": None,
}


def _bayan_has_models() -> bool:
    """Return True when both the base model dir and LoRA checkpoint exist.

    Checks both the model storage root (BAYANSYNTH_ROOT or package root)
    and, as a fallback, the package root itself to avoid false negatives
    when BAYANSYNTH_ROOT points to an empty first-run AppData dir while
    models already exist in the BayanSynthTTS repo.
    """
    candidates: list[Path] = []
    candidates.append(_get_model_storage_root())
    pkg = _find_package_root()
    if pkg is not None and pkg not in candidates:
        candidates.append(pkg)

    for d in candidates:
        try:
            base_ok = (d / "pretrained_models" / "CosyVoice3").is_dir()
            lora_ok = (d / "checkpoints" / "llm" / "epoch_28_whole.pt").is_file()
            if base_ok and lora_ok:
                return True
        except Exception:
            pass
    return False


def _locate_model_dir() -> Path | None:
    """Return the directory that actually has model files in it, or None."""
    candidates: list[Path] = []
    candidates.append(_get_model_storage_root())
    pkg = _find_package_root()
    if pkg is not None and pkg not in candidates:
        candidates.append(pkg)

    for d in candidates:
        try:
            if (d / "pretrained_models" / "CosyVoice3").is_dir():
                return d
        except Exception:
            pass
    return None


def _get_tts():
    global _TTS, _models_ready
    if _TTS is None:
        from bayansynthtts.inference import BayanSynthTTS
        model_root = _locate_model_dir()
        if model_root is not None:
            model_dir   = str(model_root / "pretrained_models" / "CosyVoice3")
            llm_ckpt    = str(model_root / "checkpoints" / "llm" / "epoch_28_whole.pt")
            llm_ckpt_kw = {"llm_checkpoint": llm_ckpt} if Path(llm_ckpt).is_file() else {}
            _TTS = BayanSynthTTS(model_dir=model_dir, **llm_ckpt_kw)
        else:
            # No explicit root found — let bayansynthtts use its own defaults
            _TTS = BayanSynthTTS()
        _models_ready = True
    return _TTS


# ── Request/Response models ─────────────────────────────────────────

class SynthesizeRequest(BaseModel):
    text: str
    voice: str | None = None
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    seed: int = 42
    auto_tashkeel: bool = True
    instruct: str | None = None


class TashkeelRequest(BaseModel):
    text: str


class TimelineNode(BaseModel):
    id: str
    text: str
    voice: str | None = None
    speed: float = 1.0
    start_time: float = 0.0  # seconds
    duration: float | None = None
    pitch_shift: float = 0.0  # semitones
    fade_in: float = 0.0
    fade_out: float = 0.0
    volume: float = 1.0
    pan: float = 0.0
    seed: int = 42
    instruct: str | None = None
    engine_speed: float = 1.0
    offset: float = 0.0
    original_duration: float | None = None
    node_type: str = 'tts'
    audio_base64: str | None = None  # Pre-generated audio (avoids re-synthesis)

class Track(BaseModel):
    id: str
    name: str
    nodes: list[TimelineNode]
    volume: float = 1.0
    pan: float = 0.0
    mute: bool = False
    solo: bool = False

class ExportRequest(BaseModel):
    tracks: list[Track]
    sample_rate: int = 24000
    auto_tashkeel: bool = True


class AuditionRequest(BaseModel):
    text: str
    voice: str | None = None
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    seed: int = 42
    auto_tashkeel: bool = True
    instruct: str | None = None
    max_duration: float = Field(default=2.0, ge=0.5, le=5.0)


class PitchProcessRequest(BaseModel):
    semitones: float = 0.0


class VoiceRenameRequest(BaseModel):
    old_name: str
    new_name: str


class PhonemeRequest(BaseModel):
    text: str


# ── Helpers ──────────────────────────────────────────────────────────

def _resolve_voice_path(tts, voice: str | None) -> str | None:
    """Resolve a voice name/filename to a full absolute path.

    Search order:
      1. Already an absolute path — use as-is.
      2. Studio voices dir  (demos/studio/voices/)
      3. BayanSynthTTS built-in voices dir.
      4. tts.get_voice_path() helper (legacy).
    """
    if not voice:
        return None
    # 1. Absolute path
    if os.path.isabs(voice):
        return voice if os.path.isfile(voice) else None
    # 2. Studio voices directory (project-level)
    studio_candidate = os.path.join(VOICES_DIR, voice)
    if os.path.isfile(studio_candidate):
        return studio_candidate
    # 3. Legacy BayanSynthTTS voices dir
    legacy_candidate = os.path.join(_LEGACY_VOICES_DIR, voice)
    if os.path.isfile(legacy_candidate):
        return legacy_candidate
    # 4. tts helper (handles relative filenames bundled with the model)
    try:
        candidate = tts.get_voice_path(voice)
        if os.path.isfile(candidate):
            return candidate
    except Exception:
        pass
    return None


# ── Endpoints ────────────────────────────────────────────────────────

@app.get("/api/status")
async def status():
    storage = _get_model_storage_root()
    return {
        "status": "ok",
        "model_loaded": _TTS is not None,
        "models_ready": _models_ready,
        "model_loading": _model_loading,
        "model_dir": str(storage),
        "voices_dir": VOICES_DIR,
        "version": "0.1.1",
    }


# ── Setup / first-run model download ────────────────────────────────

@app.get("/api/setup/status")
async def setup_status():
    """Check whether the required model files are present on disk.

    Returns:
        ready      — True when both base model and LoRA are present
        base_model — True when pretrained_models/CosyVoice3/ dir exists
        lora       — True when checkpoints/llm/epoch_28_whole.pt exists
        model_dir  — Absolute path where the base model will be / is saved
        lora_path  — Absolute path where the LoRA checkpoint will be / is saved
    """
    try:
        storage   = _get_model_storage_root()
        model_dir = storage / "pretrained_models" / "CosyVoice3"
        lora_path = storage / "checkpoints" / "llm" / "epoch_28_whole.pt"
        base_ok   = model_dir.is_dir()
        lora_ok   = lora_path.is_file()
        # Also allow models that live in the package root (dev mode)
        if not (base_ok and lora_ok):
            pkg = _find_package_root()
            if pkg is not None and pkg != storage:
                pkg_base = (pkg / "pretrained_models" / "CosyVoice3").is_dir()
                pkg_lora = (pkg / "checkpoints" / "llm" / "epoch_28_whole.pt").is_file()
                if pkg_base and pkg_lora:
                    base_ok = True
                    lora_ok = True
                    model_dir = pkg / "pretrained_models" / "CosyVoice3"
                    lora_path = pkg / "checkpoints" / "llm" / "epoch_28_whole.pt"
    except Exception:
        bayan     = Path("?")
        model_dir = Path("?")
        lora_path = Path("?")
        base_ok   = False
        lora_ok   = False
    return ArabicJSONResponse(
        content={
            "ready":      base_ok and lora_ok,
            "base_model": base_ok,
            "lora":       lora_ok,
            "model_dir":  str(model_dir),
            "lora_path":  str(lora_path),
        }
    )


# Expected on-disk sizes used for progress estimation
_BASE_MODEL_EXPECTED_BYTES = 3_000_000_000   # ~3 GB
_LORA_EXPECTED_BYTES       = 1_500_000_000   # ~1.5 GB

# Hugging Face repo IDs — mirrored from setup_models.py so the packaged app
# has no dependency on that script (which lives in BayanSynthTTS/scripts/).
_HF_BASE_REPO_ID  = "FunAudioLLM/Fun-CosyVoice3-0.5B-2512"
_HF_CKPT_REPO_ID  = "Ramendan/BayanSynthTTS-checkpoints"
_HF_CKPT_FILENAME = "epoch_28_whole.pt"


def _dir_size(path: Path) -> int:
    """Sum of all file sizes under *path* (non-recursive would miss sub-dirs)."""
    total = 0
    try:
        for entry in path.rglob("*"):
            try:
                if entry.is_file():
                    total += entry.stat().st_size
            except OSError:
                pass
    except OSError:
        pass
    return total


def _run_download(bayan: Path) -> None:
    """Background thread: download base model then LoRA, updating _dl_progress.

    Uses huggingface_hub directly — no dependency on setup_models.py, so this
    works both in dev and in the packaged .exe.
    """
    global _dl_progress, _models_ready, _TTS

    try:
        from huggingface_hub import snapshot_download, hf_hub_download
    except ImportError:
        _dl_progress["error"] = (
            "huggingface_hub is not installed. "
            "Run: pip install huggingface_hub"
        )
        _dl_progress["stage"] = "error"
        return

    model_dir = bayan / "pretrained_models" / "CosyVoice3"
    lora_path = bayan / "checkpoints" / "llm" / _HF_CKPT_FILENAME

    # ── Stage 1: base model ──────────────────────────────────────────
    _dl_progress["stage"] = "base"
    _dl_progress["message"] = "Downloading CosyVoice3 base model…"

    def _poll_base():
        while _dl_progress["stage"] == "base":
            pct = min(99, int(_dir_size(model_dir) * 100 / _BASE_MODEL_EXPECTED_BYTES))
            _dl_progress["base_pct"] = pct
            time.sleep(0.5)

    poll_t = threading.Thread(target=_poll_base, daemon=True)
    poll_t.start()

    try:
        if not model_dir.exists():
            model_dir.mkdir(parents=True, exist_ok=True)
        snapshot_download(
            repo_id=_HF_BASE_REPO_ID,
            local_dir=str(model_dir),
            ignore_patterns=["*.msgpack", "flax_model*", "tf_model*"],
        )
        print(f"[Studio] Base model downloaded to {model_dir}")
    except Exception as exc:
        _dl_progress["error"] = f"Base model download failed: {exc}"
        _dl_progress["stage"] = "error"
        return

    _dl_progress["base_pct"] = 100
    poll_t.join(timeout=2)

    # ── Stage 2: LoRA checkpoint ─────────────────────────────────────
    _dl_progress["stage"] = "lora"
    _dl_progress["message"] = "Downloading LoRA checkpoint…"

    def _poll_lora():
        while _dl_progress["stage"] == "lora":
            if lora_path.is_file():
                pct = min(99, int(lora_path.stat().st_size * 100 / _LORA_EXPECTED_BYTES))
            else:
                pct = 0
            # Also check for partial / in-progress files in the same dir
            parent = lora_path.parent
            if parent.is_dir():
                for f in parent.iterdir():
                    if f.suffix in (".tmp", ".part", ".incomplete"):
                        try:
                            pct = min(99, int(f.stat().st_size * 100 / _LORA_EXPECTED_BYTES))
                        except OSError:
                            pass
            _dl_progress["lora_pct"] = pct
            time.sleep(0.5)

    poll_t2 = threading.Thread(target=_poll_lora, daemon=True)
    poll_t2.start()

    try:
        lora_path.parent.mkdir(parents=True, exist_ok=True)
        hf_hub_download(
            repo_id=_HF_CKPT_REPO_ID,
            filename=_HF_CKPT_FILENAME,
            local_dir=str(lora_path.parent),
        )
        print(f"[Studio] LoRA downloaded to {lora_path}")
    except Exception as exc:
        _dl_progress["error"] = f"LoRA download failed: {exc}"
        _dl_progress["stage"] = "error"
        return

    _dl_progress["lora_pct"] = 100
    poll_t2.join(timeout=2)

    # ── Stage 3: load models into memory ────────────────────────────
    _dl_progress["stage"] = "loading"
    _dl_progress["message"] = "Loading models into memory…"
    try:
        _get_tts()
    except Exception as exc:
        _dl_progress["error"] = f"Model load failed: {exc}"
        _dl_progress["stage"] = "error"
        return

    _dl_progress["stage"] = "done"
    _dl_progress["message"] = "Models ready!"


@app.get("/api/setup/download")
async def setup_download():
    """SSE stream — starts background model download and reports progress.

    Events:
        {"stage":"base","base_pct":N,"lora_pct":0,"message":"…"}
        {"stage":"lora","base_pct":100,"lora_pct":N,"message":"…"}
        {"stage":"loading",…}
        {"type":"done"}
        {"type":"error","message":"…"}
    """
    global _download_thread

    bayan = _get_model_storage_root()

    # Kick off the download thread (only one at a time)
    if _download_thread is None or not _download_thread.is_alive():
        _dl_progress["stage"] = "idle"
        _dl_progress["error"] = None
        _dl_progress["base_pct"] = 0
        _dl_progress["lora_pct"] = 0
        _dl_progress["message"] = "Starting…"
        _download_thread = threading.Thread(
            target=_run_download, args=(bayan,), daemon=True
        )
        _download_thread.start()

    async def _stream():
        while True:
            prog = dict(_dl_progress)
            if prog["error"]:
                payload = _json_mod.dumps({"type": "error", "message": prog["error"]}, ensure_ascii=False)
                yield f"data: {payload}\n\n"
                return
            if prog["stage"] == "done":
                payload = _json_mod.dumps({"type": "done"}, ensure_ascii=False)
                yield f"data: {payload}\n\n"
                return
            # Progress update
            payload = _json_mod.dumps(
                {
                    "stage":    prog["stage"],
                    "base_pct": prog["base_pct"],
                    "lora_pct": prog["lora_pct"],
                    "message":  prog["message"],
                },
                ensure_ascii=False,
            )
            yield f"data: {payload}\n\n"
            await asyncio.sleep(0.6)

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/synthesize")
async def synthesize(req: SynthesizeRequest):
    """Synthesize speech and return WAV audio."""
    if not _models_ready:
        raise HTTPException(status_code=503, detail={"error": "models_not_ready", "hint": "Complete first-run setup before synthesizing."})
    tts = _get_tts()

    # Resolve bare voice filename → absolute path so the model can load it.
    # Passing just 'voice1.wav' (no directory) would cause a FileNotFoundError
    # inside the model; None means "use the built-in default reference voice".
    resolved_voice = _resolve_voice_path(tts, req.voice)

    # Build kwargs — only pass instruct if model supports it and it's set
    kwargs = dict(
        ref_audio=resolved_voice,
        speed=req.speed,
        seed=req.seed,
        auto_tashkeel=req.auto_tashkeel,
    )
    if req.instruct:
        kwargs['instruct'] = req.instruct

    t0 = time.perf_counter()
    audio = tts.synthesize(req.text, **kwargs)
    elapsed = time.perf_counter() - t0

    # Encode to WAV in memory
    wav_bytes = _audio_to_wav_bytes(audio, tts.sample_rate)

    return StreamingResponse(
        io.BytesIO(wav_bytes),
        media_type="audio/wav",
        headers={
            "X-Duration": str(round(len(audio) / tts.sample_rate, 2)),
            "X-Generation-Time": str(round(elapsed, 2)),
        },
    )


@app.post("/api/tashkeel")
async def tashkeel(req: TashkeelRequest):
    """Auto-diacritize Arabic text."""
    if not _models_ready:
        raise HTTPException(status_code=503, detail={"error": "models_not_ready", "hint": "Complete first-run setup."})
    try:
        from bayansynthtts.tashkeel import auto_diacritize, detect_diacritization_ratio
        result = auto_diacritize(req.text)
        # Normalize to NFC so diacritics are properly combined in the browser
        result = unicodedata.normalize("NFC", result)
        original_nfc = unicodedata.normalize("NFC", req.text)
        return ArabicJSONResponse(
            content={
                "original": original_nfc,
                "diacritized": result,
                "original_ratio": round(detect_diacritization_ratio(req.text), 3),
                "result_ratio": round(detect_diacritization_ratio(result), 3),
            },
            media_type="application/json; charset=utf-8",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/voices")
async def list_voices(voices_dir: str | None = None):
    """List available voice files from the studio voices folder.

    Returns bare filenames (not full paths) so the frontend can
    pass them back via the `voice` synthesis parameter.
    Studio voices folder: demos/studio/voices/
    """
    os.makedirs(VOICES_DIR, exist_ok=True)
    seen: set[str] = set()
    voices: list[str] = []

    def _add(name: str):
        key = os.path.basename(name)
        if key not in seen:
            seen.add(key)
            voices.append(key)

    # 1. Studio voices dir (primary — project-level, user-uploaded)
    for f in sorted(os.listdir(VOICES_DIR)):
        if f.lower().endswith((".wav", ".mp3", ".flac", ".ogg")):
            _add(f)

    # 2. Legacy BayanSynthTTS voices dir (built-in defaults)
    if os.path.isdir(_LEGACY_VOICES_DIR):
        for f in sorted(os.listdir(_LEGACY_VOICES_DIR)):
            if f.lower().endswith((".wav", ".mp3", ".flac", ".ogg")):
                _add(f)

    # 3. Optional custom directory passed by the caller
    if voices_dir and os.path.isdir(voices_dir):
        for f in sorted(os.listdir(voices_dir)):
            if f.lower().endswith((".wav", ".mp3", ".flac", ".ogg")):
                full = os.path.join(voices_dir, f)
                if full not in voices:
                    _add(full)

    return {"voices": voices}


@app.post("/api/voices/upload")
async def upload_voice(file: UploadFile = File(...)):
    """Upload a new voice file to the studio voices library.

    Accepts any format the browser can produce (WAV, WebM/Opus, OGG, MP3, FLAC).
    Always re-encodes to 24-kHz mono PCM-16 WAV so the model can read it reliably.
    The saved filename always has a .wav extension regardless of the uploaded format.
    Saved to: demos/studio/voices/
    """
    os.makedirs(VOICES_DIR, exist_ok=True)

    # Sanitize filename stem; always save with .wav extension because we
    # always re-encode to PCM WAV — keeping the original extension (e.g. .webm)
    # would confuse soundfile on the next read.
    original_stem = os.path.splitext(file.filename or "")[0]
    safe_stem = "".join(c for c in original_stem if c.isalnum() or c in "._-")
    if not safe_stem:
        safe_stem = f"voice_{uuid.uuid4().hex[:8]}"
    safe_name = safe_stem + ".wav"

    dest = os.path.join(VOICES_DIR, safe_name)
    content = await file.read()

    # Decode audio — try soundfile first (native WAV/FLAC/OGG-Vorbis), then fall
    # back to librosa via a temp file (audioread/ffmpeg need a real file path to
    # decode WebM, Opus, MP3, etc. — BytesIO doesn't work for those formats).
    audio = None
    sr = None
    try:
        audio, sr = sf.read(io.BytesIO(content))
        if len(audio.shape) > 1:
            audio = librosa.to_mono(audio.T)
    except Exception:
        # Determine a suffix from the MIME type so ffmpeg can identify the format
        ct = (file.content_type or "").lower()
        ext = ".webm" if "webm" in ct else ".ogg" if "ogg" in ct else ".mp3" if "mp3" in ct else ".wav"
        tmp_fd, tmp_path = tempfile.mkstemp(suffix=ext)
        try:
            os.write(tmp_fd, content)
            os.close(tmp_fd)
            audio, sr = librosa.load(tmp_path, sr=None, mono=True)
        except Exception as e2:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Could not decode audio file '{file.filename}'. "
                    f"Supported formats: WAV, WebM, Opus, MP3, FLAC, OGG. "
                    f"(Details: {e2})"
                ),
            )
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    # Resample to 24 kHz and normalise
    if sr != 24000:
        audio = librosa.resample(audio, orig_sr=sr, target_sr=24000)
    peak = np.abs(audio).max()
    if peak > 0:
        audio = audio / peak * 0.9

    sf.write(dest, audio, 24000, subtype='PCM_16')
    return {"filename": safe_name, "path": dest}


@app.delete("/api/voices/{name}")
async def delete_voice(name: str):
    """Delete a voice file from the studio voices library."""
    safe_name = "".join(c for c in name if c.isalnum() or c in "._-")
    path = os.path.join(VOICES_DIR, safe_name)
    if not os.path.isfile(path):
        raise HTTPException(404, "Voice not found")
    os.remove(path)
    return {"deleted": safe_name}


@app.post("/api/voices/rename")
async def rename_voice(req: VoiceRenameRequest):
    """Rename a voice file in the studio voices library."""
    old = os.path.join(VOICES_DIR, "".join(c for c in req.old_name if c.isalnum() or c in "._-"))
    new = os.path.join(VOICES_DIR, "".join(c for c in req.new_name if c.isalnum() or c in "._-"))
    if not os.path.isfile(old):
        raise HTTPException(404, "Voice not found")
    if os.path.exists(new):
        raise HTTPException(409, "Target name already exists")
    os.rename(old, new)
    return {"old": req.old_name, "new": req.new_name}


@app.post("/api/voices/folder")
async def open_voices_folder():
    """Open the voices directory in the system file manager (Windows Explorer).

    This is a fallback for non-Electron (browser) mode.  In Electron the
    renderer calls shell.openPath via IPC instead.
    """
    os.makedirs(VOICES_DIR, exist_ok=True)
    if sys.platform == "win32":
        import subprocess
        subprocess.Popen(["explorer", os.path.normpath(VOICES_DIR)])
    return {"path": VOICES_DIR}


@app.post("/api/pitch_process")
async def pitch_process(file: UploadFile = File(...), semitones: float = 0.0):
    """Server-side pitch shift using librosa (formant-preserving).
    Used for high-quality export."""
    content = await file.read()
    audio, sr = sf.read(io.BytesIO(content))
    if len(audio.shape) > 1:
        audio = librosa.to_mono(audio.T)
    if semitones != 0:
        audio = librosa.effects.pitch_shift(audio, sr=sr, n_steps=semitones)
    wav_bytes = _audio_to_wav_bytes(audio, sr)
    return StreamingResponse(
        io.BytesIO(wav_bytes),
        media_type="audio/wav",
        headers={"X-Duration": str(round(len(audio) / sr, 2))},
    )


@app.post("/api/pitch_detect")
async def pitch_detect(file: UploadFile = File(...)):
    """Extract pitch contour using torchcrepe."""
    try:
        import torchcrepe
        import torch
        content = await file.read()
        audio, sr = sf.read(io.BytesIO(content))
        if len(audio.shape) > 1:
            audio = librosa.to_mono(audio.T)
        if sr != 16000:
            audio = librosa.resample(audio, orig_sr=sr, target_sr=16000)
        
        audio_tensor = torch.tensor(audio).unsqueeze(0)
        # Run CREPE
        pitch, periodicity = torchcrepe.predict(
            audio_tensor,
            16000,
            100, # hop_length
            fmin=50,
            fmax=2000,
            model='tiny',
            batch_size=2048,
            device='cuda' if torch.cuda.is_available() else 'cpu',
            return_periodicity=True
        )
        
        # Filter unvoiced frames
        pitch = pitch.squeeze(0).cpu().numpy()
        periodicity = periodicity.squeeze(0).cpu().numpy()
        pitch[periodicity < 0.2] = 0
        
        return {"pitch": pitch.tolist(), "hop_length": 100, "sr": 16000}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/audition")
async def audition(req: AuditionRequest):
    """Quick synthesis preview, truncated to max_duration seconds."""
    if not _models_ready:
        raise HTTPException(status_code=503, detail={"error": "models_not_ready", "hint": "Complete first-run setup."})
    tts = _get_tts()

    resolved_voice = _resolve_voice_path(tts, req.voice)

    kwargs = dict(
        ref_audio=resolved_voice,
        speed=req.speed,
        seed=req.seed,
        auto_tashkeel=req.auto_tashkeel,
    )
    if req.instruct:
        kwargs['instruct'] = req.instruct

    t0 = time.perf_counter()
    audio = tts.synthesize(req.text, **kwargs)
    elapsed = time.perf_counter() - t0

    # Truncate to max_duration
    max_samples = int(req.max_duration * tts.sample_rate)
    if len(audio) > max_samples:
        # Apply quick fade out at cutpoint
        fade_len = min(int(0.05 * tts.sample_rate), max_samples)
        audio = audio[:max_samples].copy()
        audio[-fade_len:] *= np.linspace(1, 0, fade_len)

    wav_bytes = _audio_to_wav_bytes(audio, tts.sample_rate)

    return StreamingResponse(
        io.BytesIO(wav_bytes),
        media_type="audio/wav",
        headers={
            "X-Duration": str(round(len(audio) / tts.sample_rate, 2)),
            "X-Generation-Time": str(round(elapsed, 2)),
        },
    )


@app.post("/api/phonemize")
async def phonemize(req: PhonemeRequest):
    """Convert Arabic text to Buckwalter transliteration."""
    # Buckwalter transliteration table
    BUCKWALTER = {
        '\u0621': '\'', '\u0622': '|', '\u0623': '>', '\u0624': '&',
        '\u0625': '<', '\u0626': '}', '\u0627': 'A', '\u0628': 'b',
        '\u0629': 'p', '\u062A': 't', '\u062B': 'v', '\u062C': 'j',
        '\u062D': 'H', '\u062E': 'x', '\u062F': 'd', '\u0630': '*',
        '\u0631': 'r', '\u0632': 'z', '\u0633': 's', '\u0634': '$',
        '\u0635': 'S', '\u0636': 'D', '\u0637': 'T', '\u0638': 'Z',
        '\u0639': 'E', '\u063A': 'g', '\u0640': '_', '\u0641': 'f',
        '\u0642': 'q', '\u0643': 'k', '\u0644': 'l', '\u0645': 'm',
        '\u0646': 'n', '\u0647': 'h', '\u0648': 'w', '\u0649': 'Y',
        '\u064A': 'y', '\u064B': 'F', '\u064C': 'N', '\u064D': 'K',
        '\u064E': 'a', '\u064F': 'u', '\u0650': 'i', '\u0651': '~',
        '\u0652': 'o', '\u0670': '`', '\u0671': '{',
        '\u067E': 'P', '\u0686': 'J', '\u06A4': 'V', '\u06AF': 'G',
    }
    result = ''.join(BUCKWALTER.get(c, c) for c in req.text)
    return ArabicJSONResponse(content={"phonemes": result, "original": req.text})


@app.post("/api/export")
async def export_timeline(req: ExportRequest):
    """Render a timeline of nodes into a single WAV file."""
    if not _models_ready:
        raise HTTPException(status_code=503, detail={"error": "models_not_ready", "hint": "Complete first-run setup."})
    tts = _get_tts()
    sr = req.sample_rate

    # Find total duration needed
    if not req.tracks:
        raise HTTPException(400, "No tracks to export")

    has_solo = any(t.solo for t in req.tracks)

    track_audios = []
    max_end = 0

    import base64

    for track in req.tracks:
        if track.mute or (has_solo and not track.solo):
            continue

        for node in track.nodes:
            # Prefer pre-generated audio (avoids re-synthesis — Item 21)
            if node.audio_base64:
                try:
                    raw = base64.b64decode(node.audio_base64)
                    audio, node_sr = sf.read(io.BytesIO(raw))
                    if node_sr != sr:
                        audio = librosa.resample(audio, orig_sr=node_sr, target_sr=sr)
                except Exception:
                    audio = tts.synthesize(
                        node.text,
                        ref_audio=_resolve_voice_path(tts, node.voice),
                        speed=node.speed,
                        seed=node.seed,
                        auto_tashkeel=req.auto_tashkeel,
                        **(dict(instruct=node.instruct) if node.instruct else {}),
                    )
            else:
                audio = tts.synthesize(
                    node.text,
                    ref_audio=_resolve_voice_path(tts, node.voice),
                    speed=node.speed,
                    seed=node.seed,
                    auto_tashkeel=req.auto_tashkeel,
                    **(dict(instruct=node.instruct) if node.instruct else {}),
                )

            # Apply server-side pitch shift (librosa, formant-preserving)
            if node.pitch_shift != 0:
                audio = librosa.effects.pitch_shift(audio, sr=sr, n_steps=node.pitch_shift)

            # Apply engine speed (time-stretch without pitch change)
            if node.engine_speed != 1.0:
                audio = librosa.effects.time_stretch(audio, rate=node.engine_speed)

            # Handle offset (split nodes start mid-buffer)
            if node.offset > 0:
                skip = int(node.offset * sr)
                audio = audio[skip:] if skip < len(audio) else np.zeros(0, dtype=np.float32)

            # Trim to node.duration if set
            if node.duration and node.duration > 0:
                end_sample = int(node.duration * sr)
                if end_sample < len(audio):
                    audio = audio[:end_sample]

            # Apply fade in/out
            if node.fade_in > 0:
                fade_samples = int(node.fade_in * sr)
                if 0 < fade_samples < len(audio):
                    audio[:fade_samples] *= np.linspace(0, 1, fade_samples)

            if node.fade_out > 0:
                fade_samples = int(node.fade_out * sr)
                if 0 < fade_samples < len(audio):
                    audio[-fade_samples:] *= np.linspace(1, 0, fade_samples)

            # Apply volume and pan (stereo mixing would go here for multichannel)
            audio *= node.volume * track.volume
            track_audios.append((node.start_time, audio))
            end = node.start_time + len(audio) / sr
            max_end = max(max_end, end)

    # Mix into output buffer
    output = np.zeros(int(max_end * sr) + sr, dtype=np.float32)  # +1s padding
    for start_time, audio in track_audios:
        start_sample = int(start_time * sr)
        end_sample = start_sample + len(audio)
        if end_sample > len(output):
            output = np.pad(output, (0, end_sample - len(output)))
        output[start_sample:end_sample] += audio

    # Normalize
    peak = np.abs(output).max()
    if peak > 0:
        output = output / peak * 0.9

    wav_bytes = _audio_to_wav_bytes(output, sr)

    return StreamingResponse(
        io.BytesIO(wav_bytes),
        media_type="audio/wav",
        headers={"X-Duration": str(round(len(output) / sr, 2))},
    )


def _audio_to_wav_bytes(audio: np.ndarray, sr: int) -> bytes:
    """Convert numpy audio to WAV bytes."""
    import struct
    import wave

    # Normalize to int16
    peak = np.abs(audio).max()
    if peak > 0:
        audio = audio / peak * 0.9
    int_audio = (audio * 32767).astype(np.int16)

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(int_audio.tobytes())

    return buf.getvalue()


if __name__ == "__main__":
    import uvicorn
    print("[BayanSynth Studio] Starting backend on http://localhost:8910")
    uvicorn.run(app, host="127.0.0.1", port=8910)
