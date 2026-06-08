"""
Unified pipeline: audio → Whisper → LLM extraction → spaCy validation.
Stateless, reusable. No session or store.
"""
from typing import Any, Optional

from app.models import FormFieldWithConfidence, LiveSummaryState, VitalSignsData
from app.services.extraction import extract_with_llm
from app.services.transcription import transcribe_audio_bytes


def _flatten_confidence(summary: LiveSummaryState) -> dict[str, str]:
    """Build confidence_per_field from LiveSummaryState."""
    out: dict[str, str] = {}
    for key in ("patientAge", "gender", "chiefComplaint", "medicalHistory", "riskFlags", "presentIllness", "drugAllergies", "currentMedications"):
        f = getattr(summary, key, None)
        if isinstance(f, FormFieldWithConfidence):
            out[key] = f.confidence.value
    vs = summary.vitalSigns
    if isinstance(vs, VitalSignsData):
        for k in ("bloodPressure", "heartRate", "temperature", "respiratoryRate", "oxygenSaturation"):
            f = getattr(vs, k, None)
            if isinstance(f, FormFieldWithConfidence):
                out[f"vitalSigns.{k}"] = f.confidence.value
    return out


def run_pipeline(
    audio_bytes: bytes,
    qa_text: Optional[str] = None,
    *,
    model_name: str = "base",
    openai_api_key: Optional[str] = None,
    filename_suffix: str = ".webm",
) -> dict[str, Any]:
    """
    Stateless pipeline: audio → Whisper → LLM extraction → spaCy validation.
    Returns raw_transcript, structured_medical_data, confidence_per_field, validation_notes.
    """
    lines = transcribe_audio_bytes(audio_bytes, model_name=model_name, filename_suffix=filename_suffix)
    transcript_text = " ".join(line.text for line in lines).strip()
    summary = extract_with_llm(transcript_text, qa_text=qa_text, openai_api_key=openai_api_key)

    return {
        "raw_transcript": transcript_text,
        "transcript_lines": [line.model_dump() for line in lines],
        "structured_medical_data": summary.model_dump(),
        "confidence_per_field": _flatten_confidence(summary),
        "validation_notes": summary.validationFlags,
    }
