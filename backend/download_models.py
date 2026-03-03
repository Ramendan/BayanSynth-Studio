#!/usr/bin/env python3
"""BayanSynth Studio — model downloader.

Downloads the two large binary assets that cannot be stored in git:

  1. CosyVoice3-300M base model  (~7 GB, from Hugging Face)
  2. BayanSynthTTS LoRA checkpoint  (~1.9 GB, from GitHub Releases)

Everything is saved inside  backend/lib/BayanSynthTTS/  so that the studio
folder is completely self-contained after running this once.

Usage
-----
    python download_models.py                    # download everything
    python download_models.py --skip-base        # only LoRA checkpoint
    python download_models.py --skip-checkpoints # only base model
    python download_models.py --force            # re-download even if present
"""

from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import sys
import urllib.request
from pathlib import Path

# ── Paths (all relative to this script so it works anywhere) ───────────────
BACKEND_DIR  = Path(__file__).resolve().parent
BAYAN_DIR    = BACKEND_DIR / "lib" / "BayanSynthTTS"
MODEL_DIR    = BAYAN_DIR / "pretrained_models" / "CosyVoice3"
LLM_CKPT     = BAYAN_DIR / "checkpoints" / "llm" / "epoch_28_whole.pt"
VOICES_DIR   = BAYAN_DIR / "voices"
ASSET_WAV    = BAYAN_DIR / "asset" / "zero_shot_prompt.wav"
DEFAULT_VOICE = VOICES_DIR / "default.wav"

# ── Remote sources ──────────────────────────────────────────────────────────
HF_REPO_ID    = "FunAudioLLM/CosyVoice3-300M-Instruct"
GITHUB_RELEASE = "https://github.com/Ramendan/BayanSynthTTS/releases/download/v1.0"
CHECKPOINT_FILES = {
    "epoch_28_whole.pt": LLM_CKPT,
}
CHECKPOINT_SHA256 = {
    "epoch_28_whole.pt": "805441555f4d829517e6bb79ba74ac23b65c40c8382802362b433d7e91ff8ca2",
}


# ── Helpers ─────────────────────────────────────────────────────────────────
def _progress(block_count: int, block_size: int, total: int) -> None:
    if total > 0:
        pct  = min(100, block_count * block_size * 100 // total)
        done = block_count * block_size / 1_048_576
        tot  = total / 1_048_576
        print(f"\r  {pct:3d}%  {done:.0f} / {tot:.0f} MB", end="", flush=True)


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _download(url: str, dest: Path) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".tmp")
    try:
        print(f"\n  Downloading: {url}")
        print(f"  →  {dest}")
        urllib.request.urlretrieve(url, tmp, reporthook=_progress)
        print()
        tmp.rename(dest)
        size_mb = dest.stat().st_size / 1_048_576
        print(f"  Done  ({size_mb:.0f} MB)")
        return True
    except Exception as e:
        print(f"\n  ERROR: {e}")
        if tmp.exists():
            tmp.unlink()
        return False


# ── Tasks ───────────────────────────────────────────────────────────────────
def download_base_model(force: bool = False) -> bool:
    """Download CosyVoice3 weights from Hugging Face Hub."""
    if MODEL_DIR.exists() and any(MODEL_DIR.iterdir()) and not force:
        print(f"  Base model already present: {MODEL_DIR}")
        return True

    print(f"  Downloading {HF_REPO_ID} from Hugging Face ...")
    print(f"  Destination: {MODEL_DIR}")
    print("  This is ~7 GB and may take 10–30 minutes depending on your internet speed.")
    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        print("\n  ERROR: huggingface_hub is not installed.")
        print("         Run:  pip install huggingface_hub")
        return False

    try:
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        snapshot_download(
            repo_id=HF_REPO_ID,
            local_dir=str(MODEL_DIR),
            ignore_patterns=["*.msgpack", "flax_model*", "tf_model*"],
        )
        print(f"\n  Base model downloaded to {MODEL_DIR}")
        return True
    except Exception as e:
        print(f"\n  ERROR downloading base model: {e}")
        return False


def download_checkpoints(release_url: str, force: bool = False) -> bool:
    """Download LoRA checkpoint .pt files from GitHub Releases."""
    release_url = release_url.rstrip("/")
    all_ok = True

    for filename, dest in CHECKPOINT_FILES.items():
        if dest.exists() and not force:
            size_mb = dest.stat().st_size / 1_048_576
            print(f"  {filename} already present  ({size_mb:.0f} MB)")
            continue

        url = f"{release_url}/{filename}"
        ok = _download(url, dest)
        if ok:
            # Verify checksum
            expected = CHECKPOINT_SHA256.get(filename)
            if expected:
                print("  Verifying SHA-256 ...", end="", flush=True)
                got = _sha256(dest)
                if got != expected:
                    print(f" MISMATCH\n  Expected: {expected}\n  Got:      {got}")
                    dest.unlink()
                    all_ok = False
                    continue
                print(" OK")
        else:
            print(f"\n  Manual download:")
            print(f"    URL:  {url}")
            print(f"    Save: {dest}")
            all_ok = False

    return all_ok


def ensure_default_voice() -> None:
    """Copy asset/zero_shot_prompt.wav → voices/default.wav if missing."""
    if DEFAULT_VOICE.exists():
        print(f"  Default voice present: {DEFAULT_VOICE.name}")
        return
    if ASSET_WAV.exists():
        VOICES_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ASSET_WAV, DEFAULT_VOICE)
        print("  Copied asset/zero_shot_prompt.wav → voices/default.wav")
    else:
        print(f"  NOTE: No default voice found. Add a WAV file to: {DEFAULT_VOICE}")


def check_lib_bundled() -> bool:
    """Warn if bundle_deps.bat hasn't been run yet."""
    pkg = BAYAN_DIR / "bayansynthtts" / "__init__.py"
    cosyvoice = BACKEND_DIR / "lib" / "cosyvoice" / "__init__.py"
    if not pkg.exists() or not cosyvoice.exists():
        print()
        print("  WARNING: Python packages not found in backend/lib/.")
        print("  Run  bundle_deps.bat  BEFORE  download_models.py .")
        print()
        return False
    return True


def main() -> None:
    parser = argparse.ArgumentParser(
        description="BayanSynth Studio — download model weights"
    )
    parser.add_argument("--skip-base",        action="store_true",
                        help="Skip CosyVoice3 base model download")
    parser.add_argument("--skip-checkpoints", action="store_true",
                        help="Skip LoRA checkpoint download")
    parser.add_argument("--release-url",      default=GITHUB_RELEASE,
                        help="GitHub Releases base URL for checkpoint downloads")
    parser.add_argument("--force",            action="store_true",
                        help="Re-download even if files already exist")
    args = parser.parse_args()

    print()
    print("=" * 60)
    print("  BayanSynth Studio — Model Download")
    print("=" * 60)

    check_lib_bundled()

    # ── 1. Base model ─────────────────────────────────────────────────────
    print("\n[1/3] CosyVoice3 base model (~7 GB)")
    if args.skip_base:
        print("  Skipped.")
    else:
        ok = download_base_model(force=args.force)
        if not ok:
            print("\n  FAILED. Aborting. Fix errors above and retry.")
            sys.exit(1)

    # ── 2. LoRA checkpoint ────────────────────────────────────────────────
    print("\n[2/3] BayanSynthTTS LoRA checkpoint (~1.9 GB)")
    if args.skip_checkpoints:
        print("  Skipped.")
    else:
        download_checkpoints(args.release_url, force=args.force)

    # ── 3. Default voice ──────────────────────────────────────────────────
    print("\n[3/3] Default voice")
    ensure_default_voice()

    # ── Summary ──────────────────────────────────────────────────────────
    base_ok  = MODEL_DIR.exists() and any(MODEL_DIR.iterdir())
    ckpt_ok  = LLM_CKPT.exists()
    print()
    print("=" * 60)
    if base_ok and ckpt_ok:
        print("  All models present. Ready to launch!")
        print()
        print("  Run:  start_studio.bat")
    elif base_ok and not ckpt_ok:
        print("  Base model OK. LoRA checkpoint missing.")
        print("  Studio will run but Arabic quality will be lower.")
        print()
        print("  To get the checkpoint manually:")
        print(f"  {args.release_url}/epoch_28_whole.pt")
        print(f"  → Save to: {LLM_CKPT}")
    else:
        print("  Models not fully downloaded. Check errors above.")
    print("=" * 60)
    print()


if __name__ == "__main__":
    main()
