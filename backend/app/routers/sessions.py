"""
Sessions, transcript, audio upload, extraction, summary, review, approve.
"""
import logging
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, File, HTTPException, UploadFile, Response

logger = logging.getLogger(__name__)

from app.config import settings
from app.models import (
    CaseContext,
    FollowUpQuestion,
    LiveSummaryState,
    QuestionAnswer,
    ReviewFormData,
    SessionCreate,
    SessionResponse,
    TranscriptLine,
    TranscriptUpdate,
)
from app.store import store
from app.services.extraction import extract_with_llm
from app.services.evidence import build_evidence
from app.services.mode_logic import (
    FIELD_TO_CATEGORY,
    get_missing_and_questions,
    _infer_category_from_question,
)
from app.services.review_form import summary_to_review_form
from app.services.pdf_export import build_review_pdf
from app.services.transcription import transcribe_audio_bytes

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


def _session_id() -> str:
    d = datetime.utcnow().strftime("%Y%m%d")
    r = uuid.uuid4().hex[:4].upper()
    return f"ER-{d}-{r}"


def _to_response(s: dict) -> SessionResponse:
    return SessionResponse(
        id=s["id"],
        context=CaseContext(s["context"]),
        mode=s["mode"],
        listening_status=s["listening_status"],
        started_at=s["started_at"],
        last_updated_at=s["last_updated_at"],
        tags=s.get("tags"),
        transcript=[TranscriptLine(**line) for line in (s.get("transcript") or [])],
        questions=[FollowUpQuestion(**q) for q in (s.get("questions") or [])] if s.get("questions") else None,
    )


@router.post("", response_model=dict)
def create_session(body: SessionCreate):
    """Create a new intake session. Returns session id and full session."""
    sid = _session_id()
    session = store.create(sid, CaseContext(body.context))
    return {"id": sid, "session": _to_response(session)}


@router.get("", response_model=list)
def list_sessions(include_approved: bool = True, limit: int = 50):
    """List sessions for dashboard/list views."""
    sessions = store.list_sessions(include_approved=include_approved, limit=limit)
    return [
        {
            "id": s["id"],
            "context": s["context"],
            "mode": s["mode"],
            "listening_status": s["listening_status"],
            "started_at": s["started_at"],
            "last_updated_at": s["last_updated_at"],
            "tags": s.get("tags"),
        }
        for s in sessions
    ]


@router.get("/{session_id}", response_model=dict)
def get_session(session_id: str):
    """Get one session with transcript and questions."""
    s = store.get(session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    return _to_response(s).model_dump()


@router.post("/{session_id}/audio")
async def upload_audio(session_id: str, file: UploadFile = File(...)):
    """
    Upload audio chunk; backend transcribes with Whisper and appends to session transcript.
    """
    s = store.get(session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    content = await file.read()
    if not content:
        return {"appended": 0, "transcript": s.get("transcript") or []}
    # Skip Whisper for very small payloads (e.g. empty or near-empty recording) to avoid decode errors
    if len(content) < 1000:
        return {"appended": 0, "transcript": s.get("transcript") or []}
    suffix = "." + (file.filename or "webm").split(".")[-1] if file.filename else ".webm"
    try:
        lines = transcribe_audio_bytes(content, model_name=settings.whisper_model, filename_suffix=suffix)
    except Exception as e:
        logger.exception("Transcription failed for session %s", session_id)
        msg = str(e) if str(e) else "Transcription failed"
        if "ffmpeg" in msg.lower() or "no such file or directory" in msg.lower() and "ffmpeg" in msg:
            msg = "ffmpeg is not installed or not on PATH. Install ffmpeg (e.g. brew install ffmpeg on macOS) and restart the server."
        raise HTTPException(status_code=422, detail=msg)
    # Append with unique ids
    existing = s.get("transcript") or []
    base_id = max((line.get("id") or 0) for line in existing) if existing else 0
    new_lines = [
        {
            "id": base_id + i + 1,
            "text": line.text,
            "speaker": line.speaker,
            "timestamp": line.timestamp,
        }
        for i, line in enumerate(lines)
    ]

    # If Whisper/heuristics couldn't confidently classify the speaker for this
    # chunk, infer a single role for all new lines:
    # - If any line has a non-"Unknown" speaker, propagate that to Unknowns.
    # - Otherwise, if this is the first audio for the session, default to "Patient".
    non_unknown_speakers = {l["speaker"] for l in new_lines if l["speaker"] != "Unknown"}
    default_speaker: str | None = None
    if non_unknown_speakers:
        # If we somehow saw multiple different roles, just pick one (very rare).
        default_speaker = next(iter(non_unknown_speakers))
    elif not existing:
        default_speaker = "Patient"

    if default_speaker:
        for l in new_lines:
            if l["speaker"] == "Unknown":
                l["speaker"] = default_speaker

    store.append_transcript_lines(session_id, new_lines)
    s = store.get(session_id)
    return {"appended": len(new_lines), "transcript": s.get("transcript") or []}


@router.get("/{session_id}/transcript")
def get_transcript(session_id: str):
    """Get transcript lines for this session."""
    s = store.get(session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"transcript": s.get("transcript") or []}


@router.patch("/{session_id}/transcript")
def update_transcript(session_id: str, body: TranscriptUpdate):
    """Replace transcript (e.g. after user edits on Live Case Summary)."""
    s = store.get(session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    store.update_transcript(session_id, body.lines)
    return {"transcript": store.get(session_id).get("transcript") or []}


def _questions_from_missing_fields(
    missing_fields: list[str],
    suggested_questions: list[str],
) -> list[FollowUpQuestion]:
    """Build FollowUpQuestion list from missing-field-driven suggested questions."""
    out: list[FollowUpQuestion] = []
    for i, q_text in enumerate(suggested_questions):
        if not (q_text or "").strip():
            continue
        # Use field-based category when 1:1 with missing_fields
        if i < len(missing_fields):
            cat = FIELD_TO_CATEGORY.get(missing_fields[i], "Follow-up")
        else:
            cat = _infer_category_from_question(q_text)
        out.append(
            FollowUpQuestion(
                id=len(out) + 1,
                question=q_text.strip(),
                category=cat,
                status="pending",
            )
        )
    return out


@router.post("/{session_id}/questions")
def generate_questions(session_id: str):
    """
    Generate follow-up questions (non-emergency only) to fill remaining form fields.
    Runs extraction if needed, then uses transcript + missing fields to produce
    AI-generated questions that target gaps in the form.
    """
    s = store.get(session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    if s["context"] == CaseContext.emergency.value:
        return {"questions": []}
    transcript = s.get("transcript") or []
    transcript_text = " ".join((line.get("text") or "") for line in transcript)
    if not transcript_text.strip():
        return {"questions": []}

    # Need summary to know which fields are missing: run extraction if not yet done
    summary_data = s.get("live_summary")
    if not summary_data:
        qa_text = None
        questions = s.get("questions") or []
        if questions:
            qa_parts = [f"Q: {q.get('question')} A: {q.get('response') or 'N/A'}" for q in questions]
            qa_text = "\n".join(qa_parts)
        summary = extract_with_llm(
            transcript_text, qa_text=qa_text, openai_api_key=settings.openai_api_key
        )
        # Attach provenance evidence (best effort)
        evidence = build_evidence(transcript, summary.model_dump())
        summary = summary.model_copy(update={"evidence": evidence})
        store.set_live_summary(session_id, summary)
    else:
        summary = LiveSummaryState.model_validate(summary_data)

    context = CaseContext(s.get("context", "emergency"))
    result = get_missing_and_questions(
        context, summary, transcript_text, openai_api_key=settings.openai_api_key
    )
    missing_fields = result.get("missing_fields") or []
    suggested = result.get("suggested_follow_up_questions") or []

    questions = _questions_from_missing_fields(missing_fields, suggested)
    store.set_questions(session_id, questions)
    return {"questions": [q.model_dump() for q in questions]}


@router.post("/{session_id}/questions/{question_id}/answer")
def answer_question(session_id: str, question_id: int, body: QuestionAnswer):
    """Submit answer (or skip/unknown) for a follow-up question."""
    s = store.get(session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    store.update_question_answer(session_id, question_id, body.response, body.status)
    return {"ok": True}


@router.post("/{session_id}/extract")
def run_extraction(session_id: str):
    """
    Run extraction (LLM + spaCy) on transcript and Q&A; returns and stores AI-assisted draft summary.
    All output requires clinician review. Includes missing_fields and suggested_follow_up_questions for non-emergency mode.
    """
    s = store.get(session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    transcript = s.get("transcript") or []
    transcript_text = " ".join((line.get("text") or "") for line in transcript)
    qa_text = None
    questions = s.get("questions") or []
    if questions:
        qa_parts = [f"Q: {q.get('question')} A: {q.get('response') or 'N/A'}" for q in questions]
        qa_text = "\n".join(qa_parts)
    summary = extract_with_llm(transcript_text, qa_text=qa_text, openai_api_key=settings.openai_api_key)
    evidence = build_evidence(transcript, summary.model_dump())
    summary = summary.model_copy(update={"evidence": evidence})
    store.set_live_summary(session_id, summary)

    context = CaseContext(s.get("context", "emergency"))
    mode_result = get_missing_and_questions(
        context, summary, transcript_text, openai_api_key=settings.openai_api_key
    )

    return {
        "summary": summary.model_dump(),
        "missing_fields": mode_result["missing_fields"],
        "suggested_follow_up_questions": mode_result["suggested_follow_up_questions"],
    }


@router.get("/{session_id}/summary")
def get_summary(session_id: str):
    """Get live case summary (extracted fields only)."""
    s = store.get(session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    summary = s.get("live_summary")
    if not summary:
        raise HTTPException(status_code=404, detail="Summary not yet extracted. POST /extract first.")
    return summary


@router.get("/{session_id}/missing-and-questions")
def get_missing_and_questions_endpoint(session_id: str):
    """
    Get missing_fields and suggested_follow_up_questions (Emergency vs Non-Emergency).
    Runs extraction if summary not yet available.
    """
    s = store.get(session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    summary_data = s.get("live_summary")
    if not summary_data:
        # Run extraction first
        transcript = s.get("transcript") or []
        transcript_text = " ".join((line.get("text") or "") for line in transcript)
        qa_text = None
        questions = s.get("questions") or []
        if questions:
            qa_parts = [f"Q: {q.get('question')} A: {q.get('response') or 'N/A'}" for q in questions]
            qa_text = "\n".join(qa_parts)
        summary = extract_with_llm(transcript_text, qa_text=qa_text, openai_api_key=settings.openai_api_key)
        store.set_live_summary(session_id, summary)
    else:
        summary = LiveSummaryState.model_validate(summary_data)
    transcript = s.get("transcript") or []
    transcript_text = " ".join((line.get("text") or "") for line in transcript)
    context = CaseContext(s.get("context", "emergency"))
    return get_missing_and_questions(context, summary, transcript_text, openai_api_key=settings.openai_api_key)


@router.patch("/{session_id}/summary")
def update_summary(session_id: str, body: dict):
    """Update live summary (user edits on Live Case Summary page)."""
    s = store.get(session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    try:
        summary = LiveSummaryState.model_validate(body)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))
    store.set_live_summary(session_id, summary)
    return store.get(session_id).get("live_summary")


@router.get("/{session_id}/review")
def get_review_form(session_id: str):
    """Get full editable form for Review page. Build from summary + Q&A if not yet saved."""
    s = store.get(session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    review = s.get("review_form")
    if review:
        return review
    summary = s.get("live_summary")
    if not summary:
        raise HTTPException(status_code=404, detail="Run extraction first (POST /extract).")
    transcript = s.get("transcript") or []
    transcript_text = " ".join((line.get("text") or "") for line in transcript)
    form = summary_to_review_form(summary, s.get("questions"), transcript_text)
    return form.model_dump()


@router.put("/{session_id}/review")
def save_review_form(session_id: str, body: ReviewFormData):
    """Save edits from Review page."""
    s = store.get(session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    store.set_review_form(session_id, body)
    return {"ok": True}


@router.post("/{session_id}/approve")
def approve_session(session_id: str):
    """
    Finalize and approve the emergency intake and return a clinician-friendly PDF.

    - Uses the finalized ReviewFormData (from /review PUT or built from summary).
    - Generates a clean, printable PDF that includes:
      - Patient information
      - Clinical summary
      - Vitals
      - Key notes (assessment, plan, consent)
    - Marks the document as "Clinician Approved" with date & session id.
    - The PDF is generated in memory and not stored long-term on the server.
    """
    s = store.get(session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    review_data = s.get("review_form")
    if not review_data:
        summary = s.get("live_summary")
        if not summary:
            raise HTTPException(status_code=400, detail="No review form or summary available to approve.")
        transcript = s.get("transcript") or []
        transcript_text = " ".join((line.get("text") or "") for line in transcript)
        form = summary_to_review_form(summary, s.get("questions"), transcript_text)
    else:
        form = ReviewFormData.model_validate(review_data)

    # Mark as approved (timestamps etc.) before generating the PDF
    store.approve(session_id)
    approved_at: datetime = s.get("approved_at") or datetime.utcnow()

    pdf_bytes = build_review_pdf(form, session_id=session_id, approved_at=approved_at)
    filename = f"{session_id}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )


@router.get("/{session_id}/export")
def export_emr(session_id: str):
    """
    Export an EHR-friendly structured JSON payload.

    This is intentionally "FHIR-like" in shape (Encounter/Patient/Observations),
    without claiming full FHIR compliance.
    """
    s = store.get(session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    transcript = s.get("transcript") or []
    questions = s.get("questions") or []
    live_summary = s.get("live_summary")

    transcript_text = " ".join((line.get("text") or "") for line in transcript)

    # Ensure we have clinician-review values.
    review_data = s.get("review_form")
    if not review_data:
        if not live_summary:
            raise HTTPException(status_code=400, detail="Run extraction first (POST /extract).")
        form = summary_to_review_form(live_summary, questions, transcript_text)
        review_data = form.model_dump()

    triage = (live_summary or {}).get("triageLevel") or {}
    risk_flags = (live_summary or {}).get("riskFlags") or {}
    validation_flags = (live_summary or {}).get("validationFlags") or []
    evidence = (live_summary or {}).get("evidence") or {}

    patient = {
        "name": review_data.get("patientName") or "",
        "age": review_data.get("age") or "",
        "gender": review_data.get("gender") or "",
    }

    # Lightweight SBAR text (derived from ReviewFormData only)
    def _build_sbar(f: dict) -> str:
        chief = f.get("chiefComplaint") or "-"
        onset_text = f.get("timeOfOnset") or ""
        onset_part = f"; onset {onset_text}" if onset_text else ""
        background = " | ".join(
            [f.get("knownConditions"), f.get("currentMedications"), f.get("drugAllergies")]
        ).strip(" | ")
        vitals = [
            f"BP {f.get('bloodPressure') or '-'}",
            f"HR {f.get('heartRate') or '-'}",
            f"Temp {f.get('temperature') or '-'}",
            f"RR {f.get('respiratoryRate') or '-'}",
            f"SpO₂ {f.get('oxygenSaturation') or '-'}",
        ]
        assessment = ". ".join(
            [
                ", ".join(vitals),
                f"Consciousness: {f.get('consciousnessLevel')}" if f.get("consciousnessLevel") else "",
            ]
        ).strip(". ")
        recommendation = " | ".join(
            [f.get("investigationsOrdered"), f.get("medicationsInterventions"), f.get("disposition")]
        ).strip(" | ")
        return (
            f"S (Situation): {chief}{onset_part}.\n"
            f"B (Background): {background or '-'}.\n"
            f"A (Assessment): {assessment or '-'}.\n"
            f"R (Recommendation): {recommendation or '-'}."
        )

    sbar_text = _build_sbar(review_data)

    return {
        "resourceType": "StructuredEHRExport",
        "session": {
            "id": s.get("id"),
            "context": s.get("context"),
            "mode": s.get("mode"),
            "startedAt": s.get("started_at"),
            "lastUpdatedAt": s.get("last_updated_at"),
            "approved": bool(s.get("approved")),
            "approvedAt": s.get("approved_at"),
            "tags": s.get("tags"),
        },
        "patient": patient,
        "encounter": {
            "sessionId": session_id,
            "triage": {
                "triageLevel": triage.get("value") or "",
                "riskFlags": risk_flags.get("value") or "",
                "validationFlags": validation_flags,
            },
            "clinical": {
                **review_data,
                "sbar": sbar_text,
            },
        },
        "provenance": {
            "evidence": evidence,
        },
        "transcript": transcript,
        "questions": questions,
    }
