"""
Emergency vs Non-Emergency mode logic.
- Emergency: no AI questions, missing fields allowed
- Non-Emergency: identify missing required fields, generate AI follow-up questions (text only), no auto-diagnose
"""
import json
import os
import logging
import urllib.request
import urllib.error
from typing import Any, Optional

from app.models import CaseContext, LiveSummaryState


# Required fields for emergency form completeness (non-emergency only)
REQUIRED_FIELDS_NON_EMERGENCY = [
    "patientName",
    "patientAge",
    "gender",
    "chiefComplaint",
    "drugAllergies",
    "currentMedications",
    "medicalHistory",
    "vitalSigns_bloodPressure",
    "vitalSigns_heartRate",
    "vitalSigns_temperature",
    "vitalSigns_respiratoryRate",
    "vitalSigns_oxygenSaturation",
]

# Fallback question per missing field (when LLM unavailable)
FIELD_TO_QUESTION: dict[str, str] = {
    "patientName": "What is the patient's name?",
    "patientAge": "What is the patient's age?",
    "gender": "What is the patient's gender?",
    "chiefComplaint": "What is the chief complaint or reason for visit?",
    "drugAllergies": "Does the patient have any known drug allergies?",
    "currentMedications": "Is the patient currently taking any medications?",
    "medicalHistory": "Does the patient have any relevant medical history or conditions?",
    "vitalSigns_bloodPressure": "What is the patient's blood pressure?",
    "vitalSigns_heartRate": "What is the patient's heart rate?",
    "vitalSigns_temperature": "What is the patient's temperature?",
    "vitalSigns_respiratoryRate": "What is the patient's respiratory rate?",
    "vitalSigns_oxygenSaturation": "What is the patient's oxygen saturation (SpO2)?",
}

# Category for form display (follow-up questions)
FIELD_TO_CATEGORY: dict[str, str] = {
    "patientName": "Demographics",
    "patientAge": "Demographics",
    "gender": "Demographics",
    "chiefComplaint": "Chief Complaint",
    "drugAllergies": "Allergies",
    "currentMedications": "Medications",
    "medicalHistory": "History",
    "vitalSigns_bloodPressure": "Vitals",
    "vitalSigns_heartRate": "Vitals",
    "vitalSigns_temperature": "Vitals",
    "vitalSigns_respiratoryRate": "Vitals",
    "vitalSigns_oxygenSaturation": "Vitals",
}


def _get_field_value(summary: LiveSummaryState, field_key: str) -> str:
    """Get value string for a field; handles nested vitals."""
    if field_key.startswith("vitalSigns_"):
        vital_key = field_key.replace("vitalSigns_", "")
        vs = summary.vitalSigns
        f = getattr(vs, vital_key, None)
        if f and hasattr(f, "value"):
            return (f.value or "").strip()
        return ""
    f = getattr(summary, field_key, None)
    if f and hasattr(f, "value"):
        return (f.value or "").strip()
    if isinstance(f, str):
        return (f or "").strip()
    return ""


def _get_filled(summary: LiveSummaryState, field_key: str) -> bool:
    """Check if field is filled; handles nested vitals."""
    if field_key.startswith("vitalSigns_"):
        vital_key = field_key.replace("vitalSigns_", "")
        vs = summary.vitalSigns
        f = getattr(vs, vital_key, None)
        if f and hasattr(f, "filled"):
            return bool(f.filled)
        return bool(_get_field_value(summary, field_key))
    f = getattr(summary, field_key, None)
    if f and hasattr(f, "filled"):
        return bool(f.filled)
    return bool(_get_field_value(summary, field_key))


def get_missing_fields(summary: LiveSummaryState) -> list[str]:
    """
    Return list of required fields that are empty or unfilled.
    Uses LiveSummaryState field names (e.g. vitalSigns_bloodPressure for nested).
    """
    missing: list[str] = []
    for key in REQUIRED_FIELDS_NON_EMERGENCY:
        val = _get_field_value(summary, key)
        filled = _get_filled(summary, key)
        if not val or not filled:
            missing.append(key)
    return missing


def _infer_category_from_question(question: str) -> str:
    """Infer display category from question text (for when no field mapping)."""
    q = (question or "").lower()
    if "allerg" in q:
        return "Allergies"
    if "medication" in q or "medications" in q or "taking" in q:
        return "Medications"
    if "blood pressure" in q or "heart rate" in q or "temperature" in q or "respiratory" in q or "oxygen" in q or "spo2" in q or "vital" in q:
        return "Vitals"
    if "age" in q:
        return "Demographics"
    if "gender" in q:
        return "Demographics"
    if "history" in q or "condition" in q or "diabetes" in q or "kidney" in q:
        return "History"
    if "complaint" in q:
        return "Chief Complaint"
    return "Follow-up"


def get_suggested_questions_for_missing_fields(
    missing_fields: list[str],
    transcript_text: str,
    openai_api_key: Optional[str] = None,
    summary: Optional[LiveSummaryState] = None,
) -> list[str]:
    """
    Generate follow-up questions (text only) targeting missing fields.
    Do NOT auto-diagnose; only ask to gather missing information.
    Provides already-known information context so the LLM doesn't ask redundant questions.
    """
    if not missing_fields:
        return []

    key = openai_api_key or os.environ.get("OPENAI_API_KEY")
    gemini_key = os.environ.get("GEMINI_API_KEY")
    transcript_preview = (transcript_text or "")[:4000].strip()

    # Build already-known fields context to prevent redundant questions
    already_known = _build_already_known_context(summary) if summary else ""

    if key and transcript_preview:
        try:
            logging.getLogger(__name__).info("Follow-up questions provider: openai")
            return _questions_with_llm(missing_fields, transcript_preview, key, already_known=already_known)
        except Exception:
            pass
    if gemini_key and transcript_preview:
        try:
            logging.getLogger(__name__).info("Follow-up questions provider: gemini")
            return _questions_with_gemini(
                missing_fields, transcript_preview, gemini_key,
                model=os.environ.get("GEMINI_MODEL") or "gemini-2.0-flash",
                already_known=already_known,
            )
        except Exception:
            pass

    # Fallback: one question per missing field
    logging.getLogger(__name__).info("Follow-up questions provider: fallback")
    return [FIELD_TO_QUESTION.get(f, f"Please provide: {f}") for f in missing_fields]


def _build_already_known_context(summary: Optional[LiveSummaryState]) -> str:
    """Build a text summary of already-extracted fields so the LLM avoids redundant questions."""
    if not summary:
        return ""
    known_parts = []
    for field_key in REQUIRED_FIELDS_NON_EMERGENCY:
        val = _get_field_value(summary, field_key)
        if val:
            label = FIELD_TO_QUESTION.get(field_key, field_key).replace("What is the patient's ", "").replace("?", "")
            known_parts.append(f"- {label}: {val}")
    if not known_parts:
        return ""
    return "ALREADY KNOWN (do NOT ask about these):\n" + "\n".join(known_parts)


def _questions_with_llm(missing_fields: list[str], transcript: str, api_key: str, *, already_known: str = "") -> list[str]:
    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        fields_str = ", ".join(missing_fields)
        known_section = f"\n\n{already_known}" if already_known else ""
        prompt = f"""You are a medical documentation assistant. Generate SHORT follow-up questions (text only) to fill the REMAINING form fields listed below. Base your wording on what was already said in the transcript so questions feel natural and relevant.

MISSING FORM FIELDS TO FILL: {fields_str}{known_section}

RULES:
- Do NOT auto-diagnose. Do NOT infer or suggest diagnoses.
- ONLY ask questions to gather the MISSING information for the fields above.
- Do NOT ask about information that is already known or already mentioned in the transcript.
- If a vital sign or field value is clearly stated in the transcript, do NOT generate a question for it.
- Frame questions in light of the transcript: reference the situation or terms already mentioned where it helps (e.g. if the transcript mentions "chest pain", you can ask "Is the patient on any medications for chest pain or heart conditions?").
- Return a JSON array of question strings, one per missing field (or fewer if one question can cover multiple).
- Example: ["Does the patient have any known drug allergies?", "What medications is the patient currently taking?"]

Transcript (use this to make questions contextually relevant):
{transcript}

Return ONLY a JSON array of strings, no other text."""
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
        )
        content = (response.choices[0].message.content or "").strip()
        if "```" in content:
            content = content.split("```")[1]
            if content.strip().lower().startswith("json"):
                content = content.strip()[4:].strip()
        items = json.loads(content)
        if isinstance(items, list):
            return [str(q) for q in items if q][:12]
    except Exception:
        pass
    return [FIELD_TO_QUESTION.get(f, f"Please provide: {f}") for f in missing_fields]


def _questions_with_gemini(
    missing_fields: list[str], transcript: str, api_key: str, *,
    model: str = "gemini-2.0-flash", already_known: str = "",
) -> list[str]:
    fields_str = ", ".join(missing_fields)
    known_section = f"\n\n{already_known}" if already_known else ""
    prompt = f"""You are a medical documentation assistant. Generate SHORT follow-up questions (text only) to fill the REMAINING form fields listed below. Base your wording on what was already said in the transcript so questions feel natural and relevant.

MISSING FORM FIELDS TO FILL: {fields_str}{known_section}

RULES:
- Do NOT auto-diagnose. Do NOT infer or suggest diagnoses.
- ONLY ask questions to gather the MISSING information listed above.
- Do NOT ask about information that is already known or already mentioned in the transcript.
- If a vital sign or field value is clearly stated in the transcript, do NOT generate a question for it.
- Return a JSON array of question strings, one per missing field (or fewer if one question can cover multiple).

Transcript:
{transcript}

Return ONLY a JSON array of strings, no other text."""

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"},
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw_body = resp.read().decode("utf-8")
    j = json.loads(raw_body)
    text = ""
    candidates = j.get("candidates") or []
    if candidates:
        parts = (((candidates[0].get("content") or {}).get("parts")) or [])
        if parts and isinstance(parts[0], dict):
            text = (parts[0].get("text") or "").strip()
    if not text:
        return [FIELD_TO_QUESTION.get(f, f"Please provide: {f}") for f in missing_fields]
    if "```" in text:
        text = text.split("```")[1]
        if text.strip().lower().startswith("json"):
            text = text.strip()[4:].strip()
    items = json.loads(text)
    if isinstance(items, list):
        return [str(q) for q in items if q][:12]
    return [FIELD_TO_QUESTION.get(f, f"Please provide: {f}") for f in missing_fields]


def get_missing_and_questions(
    context: CaseContext,
    summary: LiveSummaryState,
    transcript_text: str,
    openai_api_key: Optional[str] = None,
) -> dict[str, Any]:
    """
    Unified mode logic. Returns missing_fields and suggested_follow_up_questions.
    Emergency: always empty lists.
    Non-Emergency: compute missing fields, generate AI questions for them.
    """
    if context == CaseContext.emergency:
        return {"missing_fields": [], "suggested_follow_up_questions": []}

    missing_fields = get_missing_fields(summary)
    suggested_follow_up_questions = get_suggested_questions_for_missing_fields(
        missing_fields, transcript_text, openai_api_key, summary=summary
    )
    return {
        "missing_fields": missing_fields,
        "suggested_follow_up_questions": suggested_follow_up_questions,
    }
