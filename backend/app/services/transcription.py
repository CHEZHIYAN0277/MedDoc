"""
Whisper-based transcription. Uses local openai-whisper by default.
"""
import json
import os
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional

from app.config import settings
from app.models import TranscriptLine


_whisper_model = None


def _get_whisper_model(model_name: str = "base"):
    global _whisper_model
    if _whisper_model is None:
        import whisper
        _whisper_model = whisper.load_model(model_name)
    return _whisper_model


def _classify_speaker_role(text: str) -> str:
    """
    Lightweight heuristic classification of speaker role from a single segment.

    Returns one of: "Doctor", "Patient", "Caregiver", "Unknown".

    We prefer the AI (Gemini) when available, and fall back to heuristics when it
    cannot classify (or when the API key is missing).
    """
    t = (text or "").strip()
    if not t:
        return "Unknown"

    # Prefer Gemini when configured; if it returns Unknown, use heuristics.
    gemini_key = os.environ.get("GEMINI_API_KEY")
    if gemini_key:
        role = _classify_speaker_with_gemini(text, gemini_key)
        if role in {"Doctor", "Patient", "Caregiver"}:
            return role

    lower = t.lower()

    # Doctor self-identification or clear clinician narration about "the patient"
    doctor_markers = [
        "i am the doctor",
        "i'm the doctor",
        "this is the doctor",
        "as the doctor",
        "as a doctor",
    ]
    if any(m in lower for m in doctor_markers):
        return "Doctor"
    if "dr " in lower or "doctor " in lower and "patient" in lower:
        return "Doctor"

    # Caregiver: mentions of "my mother/father/child" etc.
    caregiver_markers = [
        "my mother",
        "my father",
        "my dad",
        "my mom",
        "my son",
        "my daughter",
        "my child",
        "my wife",
        "my husband",
    ]
    if any(m in lower for m in caregiver_markers):
        return "Caregiver"

    # Doctor or caregiver talking *about* the patient in third person.
    # If "patient" is explicitly mentioned without first-person "i have", assume Doctor.
    if "patient" in lower and "i have" not in lower and "i am having" not in lower:
        return "Doctor"

    # Patient speaking in first person about their own symptoms.
    patient_markers = [
        "i am having",
        "i'm having",
        "i have",
        "i am suffering from",
        "i'm suffering from",
        "i feel",
        "i am feeling",
        "i'm feeling",
        "i am experiencing",
        "i'm experiencing",
    ]
    if any(m in lower for m in patient_markers):
        return "Patient"

    # Sentences like "This is <name> ..." or "My name is <name> ..." are usually
    # patients introducing themselves (unless explicitly marked as doctor or caregiver).
    if lower.startswith("this is ") and "doctor" not in lower and "dr " not in lower:
        return "Patient"
    if lower.startswith("my name is "):
        return "Patient"

    return "Unknown"


def _classify_speaker_with_gemini(text: str, api_key: str, model: str = "gemini-2.0-flash") -> str:
    """
    Ask Gemini to classify who is speaking in a single utterance.

    Returns one of: "Doctor", "Patient", "Caregiver", "Unknown".
    """
    utterance = (text or "").strip()
    if not utterance:
        return "Unknown"

    prompt = f"""
You are labeling who is speaking in a clinical conversation.

ROLES:
- Doctor: clinician, emergency physician, nurse, or hospital staff asking questions or describing findings.
- Patient: the person receiving care, speaking in first person about their own symptoms.
- Caregiver: family member or bystander (e.g. "my mother", "my son", "my father").

Given ONE utterance, choose exactly one role: "Doctor", "Patient", or "Caregiver".
If it is impossible to tell, return "Unknown".

Return ONLY JSON like: {{"role": "Doctor"}}.

Utterance:
{utterance}
""".strip()

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0,
            "responseMimeType": "application/json",
        },
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode("utf-8")
        j = json.loads(raw)

        text_resp = ""
        candidates = j.get("candidates") or []
        if candidates:
            parts = (((candidates[0].get("content") or {}).get("parts")) or [])
            if parts and isinstance(parts[0], dict):
                text_resp = (parts[0].get("text") or "").strip()

        if not text_resp:
            return "Unknown"

        # Some models may wrap JSON in ``` fences
        if "```" in text_resp:
            text_resp = text_resp.split("```")[1]
            if text_resp.strip().lower().startswith("json"):
                text_resp = text_resp.strip()[4:].strip()

        data = json.loads(text_resp)
        role = (data.get("role") or "").strip().capitalize()
        if role in {"Doctor", "Patient", "Caregiver"}:
            return role
        return "Unknown"
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, TimeoutError, ValueError):
        return "Unknown"


def transcribe_audio(
    audio_path: Path,
    *,
    model_name: str = "base",
) -> list[TranscriptLine]:
    """
    Transcribe audio file with Whisper **in translation mode**.

    - Supports multilingual speech (e.g. English + Tamil) in the same recording.
    - Whisper auto-detects the spoken language and **translates everything into
      standard English text**, so downstream extraction logic can stay language-agnostic.
    - Whisper does not diarize; we assign speaker as "Unknown" and split by segments.
    """
    model = _get_whisper_model(model_name)
    # Translation mode: auto-detect spoken language (e.g. Tamil or English)
    # and always produce English text. This keeps downstream extraction simple
    # and consistent regardless of input language.
    result = model.transcribe(
        str(audio_path),
        task="translate",
        fp16=False,
        no_speech_threshold=0.6,        # treat low-probability segments as silence
        logprob_threshold=-1.0,         # drop very low-confidence segments
        compression_ratio_threshold=2.4,  # filter out repetitive/noise-like output
        condition_on_previous_text=False,  # avoid propagating errors in noisy audio
    )
    segments = result.get("segments") or []
    lines: list[TranscriptLine] = []
    for i, seg in enumerate(segments):
        text = (seg.get("text") or "").strip()
        if not text:
            continue
        start = seg.get("start") or 0
        # Format timestamp as HH:MM:SS or MM:SS
        total_secs = int(start)
        mins, secs = divmod(total_secs, 60)
        hrs, mins = divmod(mins, 60)
        if hrs > 0:
            ts = f"{hrs:02d}:{mins:02d}:{secs:02d}"
        else:
            ts = f"{mins:02d}:{secs:02d}"

        speaker_role = _classify_speaker_role(text)

        lines.append(
            TranscriptLine(
                id=i + 1,
                text=text,
                speaker=speaker_role,  # Doctor / Patient / Caregiver / Unknown
                timestamp=ts,
            )
        )
    return lines


def transcribe_audio_bytes(
    audio_bytes: bytes,
    *,
    model_name: str = "base",
    filename_suffix: str = ".webm",
) -> list[TranscriptLine]:
    """Transcribe from in-memory audio bytes (e.g. uploaded file)."""
    with tempfile.NamedTemporaryFile(suffix=filename_suffix, delete=False) as f:
        f.write(audio_bytes)
        path = Path(f.name)
    try:
        return transcribe_audio(path, model_name=model_name)
    finally:
        path.unlink(missing_ok=True)
