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

import io
import os
import sys
import time
import uuid
from pathlib import Path

# ── Portable BayanSynthTTS discovery ────────────────────────────────────────
# Priority order:
#  1. BAYANSYNTH_ROOT env var  (set by the user or an installer script)
#  2. studio/backend/lib/BayanSynthTTS  (bundled — see bundle_deps.bat)
#  3. Walk upward looking for a sibling BayanSynthTTS/ dir (in-repo layout)

_BACKEND_DIR = Path(__file__).resolve().parent

def _find_bayansynth_root() -> Path:
    # 1. Explicit env override
    env = os.environ.get("BAYANSYNTH_ROOT")
    if env:
        p = Path(env)
        if p.is_dir():
            return p

    # 2. Bundled inside this studio (backend/lib/BayanSynthTTS)
    bundled = _BACKEND_DIR / "lib" / "BayanSynthTTS"
    if bundled.is_dir() and (bundled / "bayansynthtts").is_dir():
        return bundled

    # 3. Walk up from backend/ looking for a BayanSynthTTS sibling directory
    probe = _BACKEND_DIR
    for _ in range(6):
        probe = probe.parent
        candidate = probe / "BayanSynthTTS"
        if candidate.is_dir() and (candidate / "bayansynthtts").is_dir():
            return candidate

    raise RuntimeError(
        "BayanSynthTTS not found.\n"
        "Solutions:\n"
        "  • Set BAYANSYNTH_ROOT=<path> in your environment, OR\n"
        "  • Run  bundle_deps.bat  (copies BayanSynthTTS into backend/lib/), OR\n"
        "  • Run the studio from inside the CosyVoice repository."
    )


BAYAN_LIB_DIR = str(_find_bayansynth_root())
if BAYAN_LIB_DIR not in sys.path:
    sys.path.insert(0, BAYAN_LIB_DIR)

# Also add the parent of BAYAN_LIB_DIR so that `cosyvoice` and `matcha`
# packages bundled at backend/lib/ (by bundle_deps.bat) are importable.
_BAYAN_PARENT = str(Path(BAYAN_LIB_DIR).parent)
if _BAYAN_PARENT not in sys.path:
    sys.path.insert(0, _BAYAN_PARENT)

# Also add backend/lib/third_party/Matcha-TTS to cover the matcha fallback
# path used by inference.py (REPO_ROOT/third_party/Matcha-TTS)
_MATCHA_PATH = str(Path(_BAYAN_PARENT) / "third_party" / "Matcha-TTS")
if os.path.isdir(_MATCHA_PATH) and _MATCHA_PATH not in sys.path:
    sys.path.insert(0, _MATCHA_PATH)

# Voices directory
_LEGACY_VOICES_DIR = os.path.join(BAYAN_LIB_DIR, "voices")

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


app = FastAPI(title="BayanSynth Studio API", version="0.1.0")

# Allow Electron dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://localhost:5177",
        "http://localhost:5178", "http://localhost:5179", "http://localhost:5180",
        "http://localhost:3000",
        "http://127.0.0.1:5173", "http://127.0.0.1:5177",
        "http://127.0.0.1:5178", "http://127.0.0.1:5179", "http://127.0.0.1:5180",
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

# ── Lazy model loading ──────────────────────────────────────────────
_TTS = None


def _get_tts():
    global _TTS
    if _TTS is None:
        from bayansynthtts.inference import BayanSynthTTS
        _TTS = BayanSynthTTS()
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
    return {
        "status": "ok",
        "model_loaded": _TTS is not None,
        "version": "0.1.0",
    }


@app.post("/api/synthesize")
async def synthesize(req: SynthesizeRequest):
    """Synthesize speech and return WAV audio."""
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
    # back to librosa which uses audioread/ffmpeg for WebM, Opus, MP3, etc.
    audio = None
    sr = None
    try:
        audio, sr = sf.read(io.BytesIO(content))
        if len(audio.shape) > 1:
            audio = librosa.to_mono(audio.T)
    except Exception:
        try:
            audio, sr = librosa.load(io.BytesIO(content), sr=None, mono=True)
        except Exception as e2:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Could not decode audio file '{file.filename}'. "
                    f"Supported formats: WAV, WebM, Opus, MP3, FLAC, OGG. "
                    f"(Details: {e2})"
                ),
            )

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
