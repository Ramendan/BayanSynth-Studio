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
"""

from __future__ import annotations

import io
import os
import sys
import time
import uuid
from pathlib import Path

REPO_ROOT = str(Path(__file__).resolve().parent.parent.parent.parent)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

import numpy as np
import librosa
import soundfile as sf
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

app = FastAPI(title="BayanSynth Studio API", version="0.1.0")

# Allow Electron dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Lazy model loading ──────────────────────────────────────────────
_TTS = None


def _get_tts():
    global _TTS
    if _TTS is None:
        from bayansynth.src.inference import BayanSynthTTS
        _TTS = BayanSynthTTS()
    return _TTS


# ── Request/Response models ─────────────────────────────────────────

class SynthesizeRequest(BaseModel):
    text: str
    voice: str | None = None
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    seed: int = 42
    auto_tashkeel: bool = True


class TashkeelRequest(BaseModel):
    text: str


class TimelineNode(BaseModel):
    id: str
    text: str
    voice: str | None = None
    speed: float = 1.0
    start_time: float = 0.0  # seconds
    pitch_shift: float = 0.0  # semitones (future)
    fade_in: float = 0.0
    fade_out: float = 0.0
    volume: float = 1.0

class Track(BaseModel):
    id: str
    name: str
    nodes: list[TimelineNode]
    volume: float = 1.0
    mute: bool = False
    solo: bool = False

class ExportRequest(BaseModel):
    tracks: list[Track]
    sample_rate: int = 24000
    auto_tashkeel: bool = True


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

    t0 = time.perf_counter()
    audio = tts.synthesize(
        req.text,
        ref_audio=req.voice,
        speed=req.speed,
        seed=req.seed,
        auto_tashkeel=req.auto_tashkeel,
    )
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
        from bayansynth.src.tashkeel import auto_diacritize, detect_diacritization_ratio
        result = auto_diacritize(req.text)
        return {
            "original": req.text,
            "diacritized": result,
            "original_ratio": round(detect_diacritization_ratio(req.text), 3),
            "result_ratio": round(detect_diacritization_ratio(result), 3),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/voices")
async def list_voices():
    """List available voice files."""
    tts = _get_tts()
    voices = tts.list_voices()
    return {"voices": voices}


@app.post("/api/voices/upload")
async def upload_voice(file: UploadFile = File(...)):
    """Upload a new voice WAV to the library."""
    voices_dir = os.path.join(REPO_ROOT, "bayansynth", "voices")
    os.makedirs(voices_dir, exist_ok=True)

    # Sanitize filename
    safe_name = "".join(c for c in file.filename if c.isalnum() or c in "._-")
    if not safe_name:
        safe_name = f"voice_{uuid.uuid4().hex[:8]}.wav"

    dest = os.path.join(voices_dir, safe_name)
    content = await file.read()
    
    # Decode, resample to 24kHz mono, and normalize
    try:
        audio, sr = sf.read(io.BytesIO(content))
        if len(audio.shape) > 1:
            audio = librosa.to_mono(audio.T)
        if sr != 24000:
            audio = librosa.resample(audio, orig_sr=sr, target_sr=24000)
        peak = np.abs(audio).max()
        if peak > 0:
            audio = audio / peak * 0.9
        sf.write(dest, audio, 24000, subtype='PCM_16')
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process audio: {e}")

    return {"filename": safe_name, "path": dest}

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

    for track in req.tracks:
        if track.mute or (has_solo and not track.solo):
            continue

        for node in track.nodes:
            audio = tts.synthesize(
                node.text,
                ref_audio=node.voice,
                speed=node.speed,
                auto_tashkeel=req.auto_tashkeel,
            )

            # Apply pitch shift
            if node.pitch_shift != 0:
                audio = librosa.effects.pitch_shift(audio, sr=sr, n_steps=node.pitch_shift)

            # Apply fade in/out
            if node.fade_in > 0:
                fade_samples = int(node.fade_in * sr)
                if fade_samples > 0 and fade_samples < len(audio):
                    fade_curve = np.linspace(0, 1, fade_samples)
                    audio[:fade_samples] *= fade_curve

            if node.fade_out > 0:
                fade_samples = int(node.fade_out * sr)
                if fade_samples > 0 and fade_samples < len(audio):
                    fade_curve = np.linspace(1, 0, fade_samples)
                    audio[-fade_samples:] *= fade_curve

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
