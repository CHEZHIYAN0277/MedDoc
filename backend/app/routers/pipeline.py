"""
Stateless pipeline endpoint. No session required.
"""
from fastapi import APIRouter, File, Form, UploadFile

from app.config import settings
from app.services.pipeline import run_pipeline

router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])


@router.post("/run")
async def run_pipeline_endpoint(
    file: UploadFile = File(...),
    qa_text: str = Form(default=""),
):
    """
    Stateless pipeline: audio file → Whisper → LLM extraction → spaCy validation.
    Returns raw_transcript, structured_medical_data, confidence_per_field, validation_notes.
    """
    content = await file.read()
    if not content:
        return {
            "raw_transcript": "",
            "transcript_lines": [],
            "structured_medical_data": {},
            "confidence_per_field": {},
            "validation_notes": [],
        }
    suffix = "." + (file.filename or "webm").split(".")[-1] if file.filename else ".webm"
    return run_pipeline(
        content,
        qa_text=qa_text.strip() or None,
        model_name=settings.whisper_model,
        openai_api_key=settings.openai_api_key or None,
        filename_suffix=suffix,
    )
