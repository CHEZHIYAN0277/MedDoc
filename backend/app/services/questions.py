"""
Generate follow-up questions for non-emergency mode. Uses LLM to suggest questions
needed to fill the emergency form from transcript gaps.
"""
import os
import json
import urllib.request
import urllib.error
from typing import Optional

from app.models import FollowUpQuestion


REQUIRED_QUESTION_TEMPLATES = [
    ("Does the patient have any known drug allergies?", "Allergies"),
    ("Has the patient experienced similar symptoms before?", "History"),
    ("Is the patient currently taking any blood thinners?", "Medications"),
    ("Does the patient have diabetes or kidney disease?", "Conditions"),
]


def get_follow_up_questions(
    transcript_text: str,
    openai_api_key: Optional[str] = None,
) -> list[FollowUpQuestion]:
    """
    Return list of follow-up questions. If LLM available, can filter/adapt by transcript;
    otherwise return standard set required for form.
    """
    key = openai_api_key or os.environ.get("OPENAI_API_KEY")
    gemini_key = os.environ.get("GEMINI_API_KEY")
    if key and transcript_text.strip():
        return _questions_with_llm(transcript_text, key)
    if gemini_key and transcript_text.strip():
        return _questions_with_gemini(transcript_text, gemini_key, model=os.environ.get("GEMINI_MODEL") or "gemini-2.0-flash")
    return [
        FollowUpQuestion(id=i + 1, question=q, category=cat, status="pending")
        for i, (q, cat) in enumerate(REQUIRED_QUESTION_TEMPLATES)
    ]


def _questions_with_llm(transcript_text: str, api_key: str) -> list[FollowUpQuestion]:
    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        prompt = """Based on this clinical transcript, list 2-4 short follow-up questions that would help complete an emergency intake form. 
Focus on: drug allergies, current medications, relevant medical history, and conditions (e.g. diabetes, kidney disease).
Return a JSON array of objects with keys: "question", "category". Category is one of: Allergies, History, Medications, Conditions.
Transcript:
""" + transcript_text[:6000]
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        )
        content = (response.choices[0].message.content or "").strip()
        import json
        if "```" in content:
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        items = json.loads(content)
        return [
            FollowUpQuestion(id=i + 1, question=item.get("question", ""), category=item.get("category", "History"), status="pending")
            for i, item in enumerate(items[:8])
        ]
    except Exception:
        return [
            FollowUpQuestion(id=i + 1, question=q, category=cat, status="pending")
            for i, (q, cat) in enumerate(REQUIRED_QUESTION_TEMPLATES)
        ]


def _questions_with_gemini(transcript_text: str, api_key: str, *, model: str = "gemini-2.0-flash") -> list[FollowUpQuestion]:
    prompt = (
        "Based on this clinical transcript, list 2-4 short follow-up questions that would help complete an emergency intake form. "
        "Focus on: drug allergies, current medications, relevant medical history, and conditions (e.g. diabetes, kidney disease). "
        "Return a JSON array of objects with keys: \"question\", \"category\". Category is one of: Allergies, History, Medications, Conditions.\n"
        "Transcript:\n"
        + transcript_text[:6000]
        + "\nReturn ONLY JSON."
    )

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.3, "responseMimeType": "application/json"},
    }
    try:
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
            raise ValueError("Empty Gemini response")
        if "```" in text:
            text = text.split("```")[1]
            if text.strip().lower().startswith("json"):
                text = text.strip()[4:].strip()
        items = json.loads(text)
        return [
            FollowUpQuestion(
                id=i + 1,
                question=(item.get("question", "") or ""),
                category=(item.get("category", "History") or "History"),
                status="pending",
            )
            for i, item in enumerate((items or [])[:8])
            if isinstance(item, dict)
        ]
    except Exception:
        return [
            FollowUpQuestion(id=i + 1, question=q, category=cat, status="pending")
            for i, (q, cat) in enumerate(REQUIRED_QUESTION_TEMPLATES)
        ]
