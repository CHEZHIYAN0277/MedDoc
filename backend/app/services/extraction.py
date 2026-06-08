"""
LLM + spaCy extraction: transcript (+ Q&A in non-emergency) -> structured fields with confidence.
Task 3: STRICT JSON schema, null for missing, no hallucination, no diagnosis.
"""
import json
import os
import re
import logging
import urllib.error
import urllib.request
from typing import Any, Optional

from app.models import (
    Confidence,
    FormFieldWithConfidence,
    LiveSummaryState,
    VitalSignsData,
)
from app.services.spacy_validation import validate_extraction


def _field(value: str, confidence: Confidence, filled: bool = True) -> FormFieldWithConfidence:
    return FormFieldWithConfidence(value=value or "", confidence=confidence, filled=filled)


def _vital(value: str, confidence: Confidence) -> FormFieldWithConfidence:
    return FormFieldWithConfidence(value=value or "", confidence=confidence, filled=bool(value))


def _safe_str(val: Any) -> str:
    """Coerce LLM output to string; null or missing -> empty string."""
    if val is None:
        return ""
    if isinstance(val, (int, float)):
        return str(val) if val else ""
    return str(val).strip() if isinstance(val, str) else ""


def _confidence_from_data(conf: dict, key: str) -> Confidence:
    v = conf.get(key) if isinstance(conf, dict) else None
    if isinstance(v, str) and v in ("high", "medium", "low"):
        return Confidence(v)
    return Confidence.medium


# --- Clinical safety / triage helpers ---
def _parse_number(s: str) -> float | None:
    try:
        s = (s or "").strip()
        if not s:
            return None
        token = ""
        for ch in s:
            if ch.isdigit() or ch == ".":
                token += ch
            elif token:
                break
        return float(token) if token else None
    except Exception:
        return None


def _parse_bp(s: str) -> tuple[float | None, float | None]:
    s = (s or "").strip()
    if not s or "/" not in s:
        return None, None
    a, b = s.split("/", 1)
    return _parse_number(a), _parse_number(b)


def _apply_triage_and_safety(summary: LiveSummaryState) -> LiveSummaryState:
    flags: list[str] = list(summary.validationFlags or [])

    bp_s = (summary.vitalSigns.bloodPressure.value or "").strip()
    hr_s = (summary.vitalSigns.heartRate.value or "").strip()
    rr_s = (summary.vitalSigns.respiratoryRate.value or "").strip()
    spo2_s = (summary.vitalSigns.oxygenSaturation.value or "").strip()
    consciousness = (summary.consciousnessLevel.value or "").strip().lower() if summary.consciousnessLevel else ""

    sbp, _ = _parse_bp(bp_s)
    hr = _parse_number(hr_s)
    rr = _parse_number(rr_s)
    spo2 = _parse_number(spo2_s)

    red: list[str] = []
    urgent: list[str] = []

    if spo2 is not None:
        if spo2 < 90:
            red.append(f"Low SpO₂ ({spo2_s})")
        elif spo2 < 92:
            urgent.append(f"Borderline SpO₂ ({spo2_s})")
    if sbp is not None:
        if sbp < 90:
            red.append(f"Hypotension (BP {bp_s})")
        elif sbp < 100:
            urgent.append(f"Low BP (BP {bp_s})")
    if hr is not None and (hr >= 130 or hr < 50):
        urgent.append(f"Abnormal HR ({hr_s})")
    if rr is not None and (rr >= 30 or rr < 10):
        urgent.append(f"Abnormal RR ({rr_s})")
    if consciousness:
        if any(k in consciousness for k in ["unconscious", "unresponsive"]):
            red.append("Altered consciousness (unconscious)")
        elif any(k in consciousness for k in ["drowsy", "confused"]):
            urgent.append("Altered consciousness (drowsy/confused)")

    triage = "Stable"
    if red:
        triage = "Critical"
    elif urgent:
        triage = "Urgent"

    risk_text = ""
    if triage != "Stable":
        risk_text = f"{triage}: " + "; ".join(red + urgent)
        flags.append(risk_text)

    # Medication safety checks (lightweight)
    allergies = (summary.drugAllergies.value or "").lower().strip() if summary.drugAllergies else ""
    meds = (summary.currentMedications.value or "").lower().strip() if summary.currentMedications else ""
    if allergies and meds:
        if "penicillin" in allergies and any(x in meds for x in ["amoxicillin", "ampicillin", "penicillin"]):
            flags.append("Possible allergy conflict: penicillin allergy vs penicillin-class antibiotic mentioned")
        if "sulfa" in allergies and any(x in meds for x in ["sulfamethoxazole", "trimethoprim"]):
            flags.append("Possible allergy conflict: sulfa allergy vs sulfonamide antibiotic mentioned")
    if meds:
        for drug in ["paracetamol", "acetaminophen", "ibuprofen", "aspirin"]:
            if meds.count(drug) >= 2:
                flags.append(f"Possible duplicate medication: {drug}")

    dedup: list[str] = []
    seen = set()
    for f in flags:
        key = (f or "").strip()
        if not key or key in seen:
            continue
        seen.add(key)
        dedup.append(key)

    triage_field = FormFieldWithConfidence(
        value=triage,
        confidence=Confidence.high if triage != "Stable" else Confidence.medium,
        filled=True,
    )
    risk_field = FormFieldWithConfidence(
        value=risk_text,
        confidence=Confidence.high if risk_text else Confidence.low,
        filled=bool(risk_text),
    )

    return summary.model_copy(update={"triageLevel": triage_field, "riskFlags": risk_field, "validationFlags": dedup})


# Word form of numbers 1-99 for age extraction
_WORD_TO_NUM = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
    "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13,
    "fourteen": 14, "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18,
    "nineteen": 19, "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
    "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90,
}


def _word_age_to_str(text: str) -> str:
    """Convert phrase like 'eighteen-year-old' or 'eighteen years old' to '18 years'.
    
    Handles compound numbers like 'twenty-five' -> 25, 'thirty two' -> 32.
    Uses context-aware matching: ONLY matches number words that are directly
    adjacent to age qualifiers (year-old, years old, y.o., etc.) to avoid
    false positives from vitals like 'heart rate is ninety two per minute'.
    """
    if not text:
        return ""
    text_lower = text.lower().strip()

    # Match numeric age: "18-year-old" or "18 years old" (requires age qualifier)
    num_m = re.search(r"(\d{1,3})\s*[-\s]*(?:years?\s*old|y\.?o\.?|yo\b|year-old)", text_lower, re.I)
    if num_m:
        return f"{num_m.group(1)} years"

    # Build a single alternation pattern of all number words (longest first to prevent substring issues)
    all_words = sorted(_WORD_TO_NUM.keys(), key=len, reverse=True)
    word_alt = "|".join(all_words)

    # Try compound age patterns first: "twenty-five-year-old", "thirty two year old"
    compound_m = re.search(
        rf"\b({word_alt})[\s-]+({word_alt})\s*[-\s]*(?:years?\s*old|year[\s-]*old|y\.?o\.?|yo\b)",
        text_lower, re.I,
    )
    if compound_m:
        w1, w2 = compound_m.group(1), compound_m.group(2)
        v1, v2 = _WORD_TO_NUM.get(w1, 0), _WORD_TO_NUM.get(w2, 0)
        if v1 >= 20 and v2 < 10:
            return f"{v1 + v2} years"
        return f"{v1 + v2} years"

    # Single word age: "eighteen-year-old", "eighteen years old"
    single_m = re.search(
        rf"\b({word_alt})\s*[-\s]*(?:years?\s*old|year[\s-]*old|y\.?o\.?|yo\b)",
        text_lower, re.I,
    )
    if single_m:
        w = single_m.group(1)
        return f"{_WORD_TO_NUM.get(w, 0)} years"

    return ""


def _parse_demographics_from_chief(chief: str) -> tuple[str, str, str, str]:
    """
    When chief_complaint is actually demographics (e.g. "Ananya, eighteen-year-old female"),
    parse out name, age, gender and return remaining text (should be empty or actual complaint).
    Returns (name, age, gender, remaining_chief).
    """
    if not chief or len(chief) > 150:
        return "", "", "", chief or ""
    text = chief.strip()
    remaining = chief
    name, age, gender = "", "", ""
    # Pattern: "Name, N-year-old male/female" or "Name, N year(s) old male/female" or "Name, eighteen-year-old female"
    demo_pattern = re.compile(
        r"^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*[,.]?\s*"
        r"((?:\d{1,3}|eighteen|seventeen|sixteen|fifteen|twenty|thirty|forty|fifty)\s*"
        r"(?:years?\s*old|y\.?o\.?|yo|-year-old)?)\s*"
        r"(male|female)?\s*[,.]?\s*",
        re.IGNORECASE,
    )
    match = demo_pattern.match(text)
    if match:
        name = match.group(1).strip()
        if name.lower() in ["this", "that", "the", "patient", "doctor", "she", "he"]:
            return "", "", "", chief
        age_phrase = (match.group(2) or "").strip()
        if age_phrase:
            age = _word_age_to_str(age_phrase) or age_phrase
            if age and not age.endswith(" years"):
                age = age + " years" if age.replace(" ", "").isdigit() else age
        if match.group(3):
            gender = (match.group(3) or "").strip().capitalize()
            if gender.lower() == "female":
                gender = "Female"
            elif gender.lower() == "male":
                gender = "Male"
        remaining = text[match.end() :].strip()
    return name, age, gender, remaining


def _extract_patient_name_from_text(text: str) -> str:
    """
    Extract patient name from transcript text.
    Looks for patterns like "This is [Name]", "patient name is [Name]", etc.
    """
    if not text:
        return ""
    # Common patterns for patient name introduction
    name_patterns = [
        r"this is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)",
        r"patient name is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)",
        r"name is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)",
        r"^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*[,.]",
    ]
    for pattern in name_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            name = match.group(1).strip()
            if 2 <= len(name) <= 30 and name.lower() not in ["this", "that", "the", "patient", "doctor"]:
                return name
    return ""


def _redistribute_from_chief(
    chief: str,
    pmh: str,
    meds: str,
    source_text: str | None = None,
    patient_name: str | None = None,
) -> tuple[str, str, str]:
    """
    Heuristic post-processing: pull obvious history/medication/demographic
    fragments out of chief_complaint and into the appropriate fields.

    This runs on top of the LLM output to correct common patterns where the
    model still dumps everything into chief_complaint.
    """
    import re

    text = chief or ""
    # Full transcript / combined text (transcript + Q&A) – used as a
    # secondary source when LLM leaves some fields empty.
    full = source_text or ""
    new_pmh = pmh or ""
    new_meds = meds or ""
    
    # 0) Remove patient name if it's incorrectly placed in chief complaint
    # This happens when LLM puts "Ananya" in chief_complaint instead of patient_name
    if patient_name:
        # Remove the patient name from chief complaint if it appears there
        name_pattern = re.escape(patient_name)
        text = re.sub(rf"^\s*{name_pattern}\s*[,.]?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(rf"\b{name_pattern}\b", "", text, flags=re.IGNORECASE)
    
    # Also check if chief complaint is JUST a name (common error)
    text_stripped = text.strip()
    # If chief complaint is a single capitalized word (likely a name), clear it
    if text_stripped and re.match(r"^[A-Z][a-z]+$", text_stripped) and len(text_stripped) <= 20:
        # Check if it looks like a name (not a medical term)
        if text_stripped.lower() not in ["fever", "pain", "headache", "nausea", "vomiting", "diarrhea", "cough", "chest", "shortness", "breathing"]:
            text = ""  # Clear it - it's likely a mis-mapped name

    # 1) Extract "history of ..." fragments into past_medical_history
    history_patterns = [
        r"(history of [^.,;]+)",
        r"(past history of [^.,;]+)",
        r"(having (?:a )?history of [^.,;]+)",
        r"(known case of [^.,;]+)",
    ]
    for pattern in history_patterns:
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            frag = match.group(1).strip(" ,.")
            if frag:
                new_pmh = f"{new_pmh}; {frag}" if new_pmh else frag
            # remove this fragment from chief complaint text
            text = text.replace(match.group(1), " ")

    # 2) Extract obvious medication phrases into medications.
    # Be generous here – we would rather slightly over-extract meds than
    # leave them stuck in chief_complaint.
    med_patterns = [
        # "she is currently taking Dolo 650 twice a day"
        r"(?:is|was)?\s*currently\s+taking\s+([^.,;]+)",
        # "she is taking metformin 500 mg bd"
        r"(?:is|was)?\s*taking\s+([^.,;]+)",
        # "she is on insulin", "he was started on aspirin"
        r"(?:is|was|currently|still)?\s*(?:on|receives|receiving|started on)\s+([^.,;]+)",
    ]
    for pattern in med_patterns:
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            frag = match.group(1).strip(" ,.")
            if frag:
                new_meds = f"{new_meds}; {frag}" if new_meds else frag
            text = text.replace(match.group(0), " ")

    # 3) Remove demographic phrases like "13 year old female" from chief_complaint
    demo_patterns = [
        r"\b\d{1,3}\s*years?\s*(?:old)?\s*(?:male|female)\b",
        r"\b\d{1,3}\s*(?:year|yr|yrs)\s*(?:old)?\b",
    ]
    for pattern in demo_patterns:
        text = re.sub(pattern, " ", text, flags=re.IGNORECASE)

    # 4) If past_medical_history or medications are still empty, try to
    #    harvest them from the full transcript text as a fallback.
    if not new_pmh and full:
        for pattern in history_patterns:
            match = re.search(pattern, full, flags=re.IGNORECASE)
            if match:
                frag = match.group(1).strip(" ,.")
                if frag:
                    new_pmh = frag
                break

    if not new_meds and full:
        for pattern in med_patterns:
            match = re.search(pattern, full, flags=re.IGNORECASE)
            if match:
                frag = match.group(1).strip(" ,.")
                if frag:
                    new_meds = frag
                break

    # Normalize whitespace and return
    clean_chief = " ".join(text.split()).strip(" ,.")
    return clean_chief, new_pmh.strip(" ;"), new_meds.strip(" ;")


def _extract_onset_from_text(
    chief: str,
    source_text: str | None = None,
) -> tuple[str, str]:
    """
    Heuristic extraction of time_of_onset from chief complaint / transcript.

    Examples:
    - "fever and headache for past two days" ->
        chief: "fever and headache"
        time_of_onset: "for past two days"
    - "fever for the last 3 hours" ->
        chief: "fever"
        time_of_onset: "for the last 3 hours"
    - "headache since yesterday evening" ->
        chief: "headache"
        time_of_onset: "since yesterday evening"
    """
    import re

    text = chief or ""
    full = source_text or ""

    onset_patterns = [
        r"(for the (?:past|last)\s+[^,.;]+)",
        r"(for\s+the\s+past\s+[^,.;]+)",
        r"(for\s+the\s+last\s+[^,.;]+)",
        r"(for\s+[^,.;]+\s+days?)",
        r"(since\s+[^,.;]+)",
    ]

    def _search_and_strip(container: str) -> tuple[str, str]:
        for pattern in onset_patterns:
            m = re.search(pattern, container, flags=re.IGNORECASE)
            if m:
                frag = m.group(1).strip(" ,.")
                new_container = container.replace(m.group(1), " ")
                new_container = " ".join(new_container.split()).strip(" ,.")
                return new_container, frag
        return container, ""

    # First, try to pull onset phrase out of the chief complaint text itself.
    new_chief, onset = _search_and_strip(text)
    if onset:
        return new_chief, onset

    # If nothing found in chief complaint, try the full transcript/Q&A text
    if full:
        _, onset_full = _search_and_strip(full)
        if onset_full:
            return text, onset_full

    return text, ""


def _clean_chief_text(chief: str) -> str:
    """
    Normalize chief complaint text by stripping filler intros and leftover
    demographics like "This is ..." / "18 years old female".
    """
    import re

    if not chief:
        return ""

    text = chief.strip()
    lower = text.lower()

    # Strip leading filler phrases commonly seen in transcripts.
    leading_patterns = [
        r"^\s*this is\s*,?\s*",
        r"^\s*my name is\s*,?\s*",
        r"^\s*i am\s*,?\s*",
        r"^\s*i'm\s*,?\s*",
        r"^\s*she is\s*,?\s*",
        r"^\s*he is\s*,?\s*",
        r"^\s*the patient is\s*,?\s*",
    ]
    for pattern in leading_patterns:
        text = re.sub(pattern, "", text, flags=re.IGNORECASE)

    # Remove age/gender phrases like "18 years old female" or "eighteen-year-old female"
    demo_patterns = [
        r"\b\d{1,3}\s*years?\s*(?:old)?\s*(?:male|female)\b",
        r"\b\d{1,3}\s*(?:year|yr|yrs)\s*(?:old)?\b",
        r"\b(?:eighteen|seventeen|sixteen|fifteen|twenty|thirty|forty|fifty)\s*(?:years?\s*old|-year-old)?\s*(?:male|female)?\b",
    ]
    for pattern in demo_patterns:
        text = re.sub(pattern, " ", text, flags=re.IGNORECASE)

    # Collapse whitespace and trailing punctuation.
    text = " ".join(text.split()).strip(" ,.")
    return text


_EXTRACTION_SYSTEM_PROMPT = """You are a medical documentation assistant. Extract ONLY information that is explicitly stated or clearly implied in the transcript. Do not infer, guess, or add diagnoses.

CRITICAL RULES:
- Extract each piece of information into its CORRECT field. Do NOT put everything into chief_complaint.
- If information is missing, use null for that field (do not use empty string or 0).
- NO hallucination: only extract what is stated or clearly implied.
- NO diagnosis: do not infer or add any diagnosis; only document what was said.
- Return STRICT JSON only: a single JSON object, no markdown, no explanation, no code fence.

FIELD DEFINITIONS AND ROUTING RULES:

- patient_name:
  - ONLY the patient's name.
  - Example: "Kaushika Yadu suffering from fever" → patient_name: "Kaushika Yadu", chief_complaint: "fever".

- patient_age:
  - Age if stated (e.g., "45 years", "30 years old", "25 yo").

- patient_gender:
  - Gender if stated (e.g., "Male", "Female", "M", "F").

- chief_complaint:
  - ONLY the primary current reason for seeking care: symptoms or problems (e.g., "fever", "chest pain", "shortness of breath", "headache").
  - MUST NOT contain:
    - Patient name
    - Medication lists
    - Past medical history
    - Long narrative that is only background
  - If the text describes ONLY history or medications and no clear current problem, set chief_complaint to null.
  - Examples:
    - "Good night. Kaushika Yadu suffering from fever" → chief_complaint: "fever".
    - "A history of two types of diabetes and hypertension and she is currently taking dolo 650 twice a day" → chief_complaint: null (this is history + meds, NOT a complaint).

- history_of_present_illness:
  - Narrative description of the CURRENT illness: onset, progression, associated symptoms.
  - Often starts with phrases like "for the last", "since yesterday", "over the past 3 days", "recently developed".
  - Can be longer text; do NOT copy medication lists or past history here unless they are clearly part of the current episode.

- past_medical_history:
  - Past or chronic conditions (not necessarily the reason for the current visit).
  - Typical phrases: "history of", "known case of", "has had", "previously diagnosed with".
  - Examples:
    - "She has a history of two types of diabetes and hypertension" → past_medical_history: "two types of diabetes and hypertension".
    - "Known case of bronchial asthma" → past_medical_history: "bronchial asthma".

- known_conditions:
  - Chronic or long-term conditions that are still relevant now.
  - If the transcript clearly states chronic conditions (e.g., "long-standing diabetes", "chronic kidney disease"), you may put them in known_conditions as well.
  - It is acceptable for a condition to appear in both past_medical_history and known_conditions IF that reflects the wording.

- medications:
  - Current medications the patient is taking (names and doses).
  - Typical phrases: "is taking", "currently taking", "on", "receives", "was started on".
  - Example:
    - "She is currently taking dolo 650 twice a day" → medications: "dolo 650 twice a day".
    - "He takes metformin 500 mg twice daily and amlodipine 5 mg once daily" → medications: "metformin 500 mg twice daily and amlodipine 5 mg once daily".
  - These sentences MUST NOT be placed into chief_complaint.

- allergies:
  - Drug or medication allergies.
  - Example: "No known drug allergies" → allergies: "No known drug allergies".

- vitals:
  - Object with keys: bp (blood pressure), hr (heart rate), spo2 (oxygen saturation), temp (temperature), rr (respiratory rate).
  - Each vital extracted separately if mentioned (e.g., "BP 120/80", "HR 72 bpm").

- time_of_onset:
  - When the current symptoms started (e.g., "2 hours ago", "yesterday morning").

- consciousness_level:
  - Level of consciousness if stated (e.g., "alert", "drowsy", "unconscious").

- confidence_per_field:
  - Object with the same keys (except vitals use "vitals" or each vital key).
  - Each value must be exactly "high", "medium", or "low".

IMPORTANT SPLITTING RULE:
- If a single sentence mixes multiple kinds of information (e.g., past history + medications), SPLIT IT logically across fields instead of copying the whole sentence into one field.
  - Example:
    - Input: "a history of two types of diabetes and hypertension and she is currently taking dolo 650 twice a day"
    - Output:
      - past_medical_history: "two types of diabetes and hypertension"
      - medications: "dolo 650 twice a day"
      - chief_complaint: null

Output a single JSON object with exactly these keys:
- patient_name
- patient_age
- patient_gender
- chief_complaint
- history_of_present_illness
- vitals
- allergies
- medications
- past_medical_history
- time_of_onset
- consciousness_level
- known_conditions
- confidence_per_field
"""


def extract_with_llm(
    transcript_text: str,
    qa_text: Optional[str] = None,
    openai_api_key: Optional[str] = None,
) -> LiveSummaryState:
    """
    Use LLM to extract structured fields from transcript (and optional Q&A).
    Falls back to spaCy + heuristics if no API key.
    """
    key = openai_api_key or os.environ.get("OPENAI_API_KEY")
    combined = transcript_text
    if qa_text:
        combined = transcript_text + "\n\n--- Follow-up Q&A ---\n" + qa_text

    if key:
        logging.getLogger(__name__).info("Extraction provider: openai")
        return _extract_openai(combined, key)
    # Gemini fallback (if configured)
    gemini_key = os.environ.get("GEMINI_API_KEY")
    if gemini_key:
        logging.getLogger(__name__).info("Extraction provider: gemini")
        return _extract_gemini(combined, gemini_key, model=os.environ.get("GEMINI_MODEL") or "gemini-2.0-flash")
    logging.getLogger(__name__).info("Extraction provider: heuristic")
    return _extract_heuristic(combined)


def _extract_openai(combined: str, api_key: str) -> LiveSummaryState:
    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        content = (combined[:12000]).strip()
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": _EXTRACTION_SYSTEM_PROMPT},
                {"role": "user", "content": f"Transcript and/or Q&A:\n\n{content}"},
            ],
            temperature=0,
            response_format={"type": "json_object"},
        )
        raw = (response.choices[0].message.content or "").strip()
        # Robust parse: strip markdown if present (some models may still add it)
        if "```" in raw:
            raw = raw.split("```")[1]
            if raw.strip().lower().startswith("json"):
                raw = raw.strip()[4:].strip()
        data = json.loads(raw)
        # Debug: log what we extracted (first 200 chars of each field)
        import logging
        logger = logging.getLogger(__name__)
        logger.debug(
            "LLM extraction result - patient_name: %s, chief_complaint: %s",
            (data.get("patient_name") or "null")[:200]
            if isinstance(data.get("patient_name"), str)
            else "null",
            (data.get("chief_complaint") or "null")[:200]
            if isinstance(data.get("chief_complaint"), str)
            else "null",
        )
    except Exception as e:
        # Log error but don't fail - fall back to heuristic
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"LLM extraction failed, falling back to heuristic: {e}")
        return _extract_heuristic(combined)

    conf = data.get("confidence_per_field") or {}

    # Extract patient name first - check if it's in chief_complaint incorrectly
    patient_name_raw = _safe_str(data.get("patient_name"))
    patient_age_raw = _safe_str(data.get("patient_age"))
    patient_gender_raw = _safe_str(data.get("patient_gender"))
    
    chief_raw = _safe_str(data.get("chief_complaint"))
    
    # When chief_complaint is actually "Name, eighteen-year-old female", parse it out
    parsed_name, parsed_age, parsed_gender, chief_after_demo = _parse_demographics_from_chief(chief_raw)
    if parsed_name or parsed_age or parsed_gender:
        if parsed_name and not patient_name_raw:
            patient_name_raw = parsed_name
            data["patient_name"] = parsed_name
        if parsed_age and not patient_age_raw:
            patient_age_raw = parsed_age
            data["patient_age"] = parsed_age
        if parsed_gender and not patient_gender_raw:
            patient_gender_raw = parsed_gender
            data["patient_gender"] = parsed_gender
        chief_raw = chief_after_demo
    
    # If patient_name still empty but chief looks like just a name or "Name, demographics"
    if not patient_name_raw and chief_raw:
        extracted_name = _extract_patient_name_from_text(combined)
        if extracted_name:
            patient_name_raw = extracted_name
            data["patient_name"] = extracted_name
        elif re.match(r"^[A-Z][a-z]+$", chief_raw.strip()) and len(chief_raw.strip()) <= 20:
            if chief_raw.strip().lower() not in ["fever", "pain", "headache", "nausea", "vomiting", "diarrhea", "cough", "chest", "shortness", "breathing", "dizziness"]:
                patient_name_raw = chief_raw.strip()
                data["patient_name"] = patient_name_raw
                chief_raw = ""
    
    # Heuristic redistribution: fix common cases where the model still dumps
    # history/medications/demographics into chief_complaint OR ignores them
    # completely even though they are present in the transcript.
    pmh_raw = _safe_str(data.get("past_medical_history"))
    meds_raw = _safe_str(data.get("medications"))
    chief_clean, pmh_new, meds_new = _redistribute_from_chief(
        chief_raw, pmh_raw, meds_raw, source_text=combined, patient_name=patient_name_raw if patient_name_raw else None
    )
    
    # Update patient_name if we extracted it
    if patient_name_raw and not data.get("patient_name"):
        data["patient_name"] = patient_name_raw
    
    # If chief complaint is empty or was cleared (because it was just a name/demographics),
    # try to extract actual complaint from transcript
    if not chief_clean or chief_clean.strip() == "":
        complaint_patterns = [
            r"(?:she is|he is|patient is)\s+having\s+([^.,;]+)",
            r"(?:suffering from|complaining of|presents? with)\s+([^.,;]+)",
            r"\bhaving\s+([^.,;]+(?:for the past[^.,;]+)?)",
            r"(?:chief complaint|main complaint|reason for visit)\s*[:\-]?\s*([^.,;]+)",
        ]
        for pattern in complaint_patterns:
            match = re.search(pattern, combined, re.IGNORECASE)
            if match:
                extracted_complaint = match.group(1).strip()
                if patient_name_raw:
                    extracted_complaint = re.sub(re.escape(patient_name_raw), "", extracted_complaint, flags=re.IGNORECASE).strip()
                extracted_complaint = _clean_chief_text(extracted_complaint)
                if extracted_complaint and len(extracted_complaint) > 3:
                    chief_clean = extracted_complaint
                    break
    
    # Final clean-up on chief complaint text (strip "This is...", demographics, etc.).
    data["chief_complaint"] = _clean_chief_text(chief_clean) or None
    data["past_medical_history"] = pmh_new or None
    data["medications"] = meds_new or None

    # Time of onset heuristic: if the model did not fill time_of_onset but the
    # chief complaint contains phrases like "for past two days" or
    # "since yesterday", pull that phrase out of chief_complaint and put it
    # into time_of_onset. This avoids long narrative complaints while keeping
    # structured onset information.
    time_of_onset_existing = _safe_str(data.get("time_of_onset"))
    if not time_of_onset_existing:
        chief_after_onset, onset_phrase = _extract_onset_from_text(
            data.get("chief_complaint") or chief_clean,
            source_text=combined,
        )
        if onset_phrase:
            data["time_of_onset"] = onset_phrase
            data["chief_complaint"] = chief_after_onset or None

    vitals = data.get("vitals") or {}
    if not isinstance(vitals, dict):
        vitals = {}

    def c(k: str) -> Confidence:
        return _confidence_from_data(conf, k)

    def v_val(key: str) -> str:
        return _safe_str(vitals.get(key))

    def field_val(key: str) -> tuple[str, Confidence, bool]:
        val = data.get(key)
        s = _safe_str(val)
        filled = s != "" and val is not None
        confidence = c(key) if filled else Confidence.low
        return s, confidence, filled

    patient_name_s, patient_name_c, patient_name_f = field_val("patient_name")
    patient_age_s, patient_age_c, patient_age_f = field_val("patient_age")
    patient_gender_s, patient_gender_c, patient_gender_f = field_val("patient_gender")
    chief_s, chief_c, chief_f = field_val("chief_complaint")
    hpi_s, hpi_c, hpi_f = field_val("history_of_present_illness")
    allergies_s, allergies_c, allergies_f = field_val("allergies")
    meds_s, meds_c, meds_f = field_val("medications")
    pmh_s, pmh_c, pmh_f = field_val("past_medical_history")
    time_onset_s, time_onset_c, time_onset_f = field_val("time_of_onset")
    consciousness_s, consciousness_c, consciousness_f = field_val("consciousness_level")
    known_cond_s, known_cond_c, known_cond_f = field_val("known_conditions")

    def v_conf(key: str) -> Confidence:
        if key in conf:
            return c(key)
        return c("vitals") if "vitals" in conf else Confidence.medium

    summary = LiveSummaryState(
        patientName=_field(patient_name_s, patient_name_c, patient_name_f),
        patientAge=_field(patient_age_s, patient_age_c, patient_age_f),
        gender=_field(patient_gender_s, patient_gender_c, patient_gender_f),
        chiefComplaint=_field(chief_s, chief_c, chief_f),
        vitalSigns=VitalSignsData(
            bloodPressure=_vital(v_val("bp"), v_conf("blood_pressure")),
            heartRate=_vital(v_val("hr"), v_conf("heart_rate")),
            temperature=_vital(v_val("temp"), v_conf("temperature")),
            respiratoryRate=_vital(v_val("rr"), v_conf("respiratory_rate")),
            oxygenSaturation=_vital(v_val("spo2"), v_conf("oxygen_saturation")),
        ),
        medicalHistory=_field(pmh_s, pmh_c, pmh_f),
        riskFlags=_field("", Confidence.low, filled=False),
        presentIllness=_field(hpi_s, hpi_c, hpi_f),
        drugAllergies=_field(allergies_s, allergies_c, allergies_f),
        currentMedications=_field(meds_s, meds_c, meds_f),
        timeOfOnset=_field(time_onset_s, time_onset_c, time_onset_f),
        consciousnessLevel=_field(consciousness_s, consciousness_c, consciousness_f),
        knownConditions=_field(known_cond_s, known_cond_c, known_cond_f),
    )
    summary = _apply_triage_and_safety(summary)
    # spaCy validation: adds flags and confidence adjustments only; never edits value/filled
    try:
        summary, _ = validate_extraction(combined, summary)
    except Exception:
        pass
    return summary


def _extract_gemini(combined: str, api_key: str, *, model: str = "gemini-2.0-flash") -> LiveSummaryState:
    """
    Gemini-based extractor. Produces the same JSON schema as OpenAI path and
    reuses the same post-processing and fallback behavior.
    """
    content = (combined[:12000]).strip()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"

    payload = {
        "system_instruction": {"parts": [{"text": _EXTRACTION_SYSTEM_PROMPT}]},
        "contents": [
            {"role": "user", "parts": [{"text": f"Transcript and/or Q&A:\n\n{content}"}]},
        ],
        "generationConfig": {
            "temperature": 0,
            # Ask for JSON directly when supported
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

        # Strip code fences if present
        if "```" in text:
            text = text.split("```")[1]
            if text.strip().lower().startswith("json"):
                text = text.strip()[4:].strip()
        data = json.loads(text)
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError, json.JSONDecodeError) as e:
        import logging

        logger = logging.getLogger(__name__)
        logger.warning(f"Gemini extraction failed, falling back to heuristic: {e}")
        return _extract_heuristic(combined)

    # Reuse the OpenAI post-processing logic by emulating the same variables/flow.
    conf = data.get("confidence_per_field") or {}

    patient_name_raw = _safe_str(data.get("patient_name"))
    patient_age_raw = _safe_str(data.get("patient_age"))
    patient_gender_raw = _safe_str(data.get("patient_gender"))

    chief_raw = _safe_str(data.get("chief_complaint"))
    parsed_name, parsed_age, parsed_gender, chief_after_demo = _parse_demographics_from_chief(chief_raw)
    if parsed_name or parsed_age or parsed_gender:
        if parsed_name and not patient_name_raw:
            patient_name_raw = parsed_name
            data["patient_name"] = parsed_name
        if parsed_age and not patient_age_raw:
            patient_age_raw = parsed_age
            data["patient_age"] = parsed_age
        if parsed_gender and not patient_gender_raw:
            patient_gender_raw = parsed_gender
            data["patient_gender"] = parsed_gender
        chief_raw = chief_after_demo

    if not patient_name_raw and chief_raw:
        extracted_name = _extract_patient_name_from_text(combined)
        if extracted_name:
            patient_name_raw = extracted_name
            data["patient_name"] = extracted_name
        elif re.match(r"^[A-Z][a-z]+$", chief_raw.strip()) and len(chief_raw.strip()) <= 20:
            if chief_raw.strip().lower() not in ["fever", "pain", "headache", "nausea", "vomiting", "diarrhea", "cough", "chest", "shortness", "breathing", "dizziness"]:
                patient_name_raw = chief_raw.strip()
                data["patient_name"] = patient_name_raw
                chief_raw = ""

    pmh_raw = _safe_str(data.get("past_medical_history"))
    meds_raw = _safe_str(data.get("medications"))
    chief_clean, pmh_new, meds_new = _redistribute_from_chief(
        chief_raw, pmh_raw, meds_raw, source_text=combined, patient_name=patient_name_raw if patient_name_raw else None
    )

    if patient_name_raw and not data.get("patient_name"):
        data["patient_name"] = patient_name_raw

    if not chief_clean or chief_clean.strip() == "":
        complaint_patterns = [
            r"(?:she is|he is|patient is)\s+having\s+([^.,;]+)",
            r"(?:suffering from|complaining of|presents? with)\s+([^.,;]+)",
            r"\bhaving\s+([^.,;]+(?:for the past[^.,;]+)?)",
            r"(?:chief complaint|main complaint|reason for visit)\s*[:\-]?\s*([^.,;]+)",
        ]
        for pattern in complaint_patterns:
            match = re.search(pattern, combined, re.IGNORECASE)
            if match:
                extracted_complaint = match.group(1).strip()
                if patient_name_raw:
                    extracted_complaint = re.sub(re.escape(patient_name_raw), "", extracted_complaint, flags=re.IGNORECASE).strip()
                extracted_complaint = _clean_chief_text(extracted_complaint)
                if extracted_complaint and len(extracted_complaint) > 3:
                    chief_clean = extracted_complaint
                    break

    data["chief_complaint"] = _clean_chief_text(chief_clean) or None
    data["past_medical_history"] = pmh_new or None
    data["medications"] = meds_new or None

    time_of_onset_existing = _safe_str(data.get("time_of_onset"))
    if not time_of_onset_existing:
        chief_after_onset, onset_phrase = _extract_onset_from_text(
            data.get("chief_complaint") or chief_clean,
            source_text=combined,
        )
        if onset_phrase:
            data["time_of_onset"] = onset_phrase
            data["chief_complaint"] = chief_after_onset or None

    vitals = data.get("vitals") or {}
    if not isinstance(vitals, dict):
        vitals = {}

    def c(k: str) -> Confidence:
        return _confidence_from_data(conf, k)

    def v_val(key: str) -> str:
        return _safe_str(vitals.get(key))

    def field_val(key: str) -> tuple[str, Confidence, bool]:
        val = data.get(key)
        s = _safe_str(val)
        filled = s != "" and val is not None
        confidence = c(key) if filled else Confidence.low
        return s, confidence, filled

    patient_name_s, patient_name_c, patient_name_f = field_val("patient_name")
    patient_age_s, patient_age_c, patient_age_f = field_val("patient_age")
    patient_gender_s, patient_gender_c, patient_gender_f = field_val("patient_gender")
    chief_s, chief_c, chief_f = field_val("chief_complaint")
    hpi_s, hpi_c, hpi_f = field_val("history_of_present_illness")
    allergies_s, allergies_c, allergies_f = field_val("allergies")
    meds_s, meds_c, meds_f = field_val("medications")
    pmh_s, pmh_c, pmh_f = field_val("past_medical_history")
    time_onset_s, time_onset_c, time_onset_f = field_val("time_of_onset")
    consciousness_s, consciousness_c, consciousness_f = field_val("consciousness_level")
    known_cond_s, known_cond_c, known_cond_f = field_val("known_conditions")

    def v_conf(key: str) -> Confidence:
        if key in conf:
            return c(key)
        return c("vitals") if "vitals" in conf else Confidence.medium

    summary = LiveSummaryState(
        patientName=_field(patient_name_s, patient_name_c, patient_name_f),
        patientAge=_field(patient_age_s, patient_age_c, patient_age_f),
        gender=_field(patient_gender_s, patient_gender_c, patient_gender_f),
        chiefComplaint=_field(chief_s, chief_c, chief_f),
        vitalSigns=VitalSignsData(
            bloodPressure=_vital(v_val("bp"), v_conf("blood_pressure")),
            heartRate=_vital(v_val("hr"), v_conf("heart_rate")),
            temperature=_vital(v_val("temp"), v_conf("temperature")),
            respiratoryRate=_vital(v_val("rr"), v_conf("respiratory_rate")),
            oxygenSaturation=_vital(v_val("spo2"), v_conf("oxygen_saturation")),
        ),
        medicalHistory=_field(pmh_s, pmh_c, pmh_f),
        riskFlags=_field("", Confidence.low, filled=False),
        presentIllness=_field(hpi_s, hpi_c, hpi_f),
        drugAllergies=_field(allergies_s, allergies_c, allergies_f),
        currentMedications=_field(meds_s, meds_c, meds_f),
        timeOfOnset=_field(time_onset_s, time_onset_c, time_onset_f),
        consciousnessLevel=_field(consciousness_s, consciousness_c, consciousness_f),
        knownConditions=_field(known_cond_s, known_cond_c, known_cond_f),
    )
    summary = _apply_triage_and_safety(summary)
    try:
        summary, _ = validate_extraction(combined, summary)
    except Exception:
        pass
    return summary

def _extract_heuristic(combined: str) -> LiveSummaryState:
    """
    Heuristic + spaCy fallback when no LLM. Extracts numbers and common patterns.
    """
    text = combined.lower()
    # Very simple heuristics; spaCy can improve NER for drugs/conditions.
    # This path is used when no LLM is available or when the LLM call fails
    # (e.g. quota issues). We try to populate as many summary fields as
    # reasonably possible without inferring or diagnosing.
    try:
        import spacy

        nlp = spacy.load("en_core_web_sm")
        doc = nlp(combined[:100000])

        # --- Basic demographics ---
        patient_name_str = ""
        person_entities = [ent.text for ent in doc.ents if ent.label_ == "PERSON"]
        if person_entities:
            # Take the first person entity as patient name (often the first mentioned)
            patient_name_str = person_entities[0]
        else:
            # Fallback: regex-based extraction for patterns like
            # "Patient name is Ananya", "This is Ananya", etc.
            patient_name_str = _extract_patient_name_from_text(combined)

        import re

        age_m = re.search(r"(\d{1,3})\s*(?:years?\s*old|y\.?o\.?|yo\b)", text, re.I)
        if age_m:
            age_str = f"{age_m.group(1)} years"
        else:
            # Word form: "eighteen-year-old" or "eighteen years old"
            age_str = _word_age_to_str(combined)

        male = " male" in text or " man " in text or "gentleman" in text
        female = " female" in text or " woman " in text or "lady" in text
        gender_str = "Male" if male and not female else ("Female" if female else "")

        # --- Vitals (supports both digit and word-form numbers) ---
        def _words_to_number(text_segment: str) -> str:
            """Convert word-form numbers to digits. E.g., 'one twenty' -> '120', 'ninety two' -> '92'."""
            if not text_segment:
                return ""
            text_segment = text_segment.strip()
            # If already a digit string, return as-is
            digit_m = re.match(r"^(\d+\.?\d*)$", text_segment.strip())
            if digit_m:
                return digit_m.group(1)

            word_nums = {
                "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
                "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
                "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14,
                "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18,
                "nineteen": 19, "twenty": 20, "thirty": 30, "forty": 40,
                "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90,
                "hundred": 100,
            }
            words = re.split(r"[\s-]+", text_segment.lower().strip())
            total = 0
            current = 0
            found_any = False
            for w in words:
                if w in word_nums:
                    found_any = True
                    val = word_nums[w]
                    if val == 100:
                        current = (current if current else 1) * 100
                    elif val >= 20:
                        # Vital sign shorthand: "one twenty" means 120, not 21
                        # When a small digit (1-9) is followed by tens (20-90),
                        # treat as "X hundred Y"
                        if 0 < current < 10:
                            current = current * 100 + val
                        else:
                            current += val
                    else:
                        current += val
                elif w == "point" or w == ".":
                    # Handle decimal: "one hundred point four" -> combine
                    total += current
                    current = 0
                    # Gather the fractional part
                    remaining_words = words[words.index(w) + 1:]
                    frac_digits = []
                    for rw in remaining_words:
                        if rw in word_nums:
                            frac_digits.append(str(word_nums[rw]))
                        elif rw.isdigit():
                            frac_digits.append(rw)
                        else:
                            break
                    if frac_digits:
                        return f"{total}.{''.join(frac_digits)}"
                    return str(total)
            total += current
            return str(total) if found_any else ""

        # Try digit regexes first, then word-form extraction for each vital
        bp_m = re.search(r"(?:bp|blood pressure|b/p)\s*[:\s]*(\d{2,3})\s*/?\s*(\d{2,3})", text, re.I)
        if bp_m:
            bp_str = f"{bp_m.group(1)}/{bp_m.group(2)}"
        else:
            # Word form: "blood pressure is one twenty over eighty"
            bp_word_m = re.search(
                r"(?:bp|blood pressure|b/p)\s+(?:is\s+)?(.+?)\s+over\s+(.+?)(?:\.|,|$)",
                text, re.I,
            )
            if bp_word_m:
                sys_val = _words_to_number(bp_word_m.group(1))
                dia_val = _words_to_number(bp_word_m.group(2))
                bp_str = f"{sys_val}/{dia_val}" if sys_val and dia_val else ""
            else:
                bp_str = ""

        hr_m = re.search(r"(?:heart rate|pulse|hr)\s*[:\s]*(\d{2,3})\s*(?:bpm|per minute)?", text, re.I)
        if hr_m:
            hr_str = hr_m.group(1) + " bpm"
        else:
            hr_word_m = re.search(
                r"(?:heart rate|pulse|hr)\s+(?:is\s+)?(.+?)\s+(?:per minute|bpm|beats)",
                text, re.I,
            )
            if hr_word_m:
                hr_val = _words_to_number(hr_word_m.group(1))
                hr_str = f"{hr_val} bpm" if hr_val else ""
            else:
                hr_str = ""

        temp_m = re.search(r"(?:temp(?:erature)?)\s*[:\s]*(\d{2,3}\.?\d*)\s*°?\s*(?:degrees?\s*)?(?:fahrenheit|celsius|f|c)?", text, re.I)
        if temp_m:
            temp_str = f"{temp_m.group(1)}"
        else:
            temp_word_m = re.search(
                r"(?:temperature)\s+(?:is\s+)?(.+?)\s+(?:degrees?|°)",
                text, re.I,
            )
            if temp_word_m:
                temp_val = _words_to_number(temp_word_m.group(1))
                temp_str = f"{temp_val}" if temp_val else ""
            else:
                temp_str = ""

        rr_m = re.search(r"(?:resp(?:iratory)?\s*(?:rate|date)|rr)\s*[:\s]*(\d{1,2})\s*(?:/min|per minute)?", text, re.I)
        if rr_m:
            rr_str = rr_m.group(1) + "/min"
        else:
            rr_word_m = re.search(
                r"(?:resp(?:iratory)?\s*(?:rate|date)|rr)\s+(?:is\s+)?(.+?)\s+per\s+minute",
                text, re.I,
            )
            if rr_word_m:
                rr_val = _words_to_number(rr_word_m.group(1))
                rr_str = f"{rr_val}/min" if rr_val else ""
            else:
                rr_str = ""

        spo2_m = re.search(r"(?:spo2|o2\s*sat|oxygen\s*saturation)\s*[:\s]*(\d{2,3})\s*%?", text, re.I)
        if spo2_m:
            spo2_str = spo2_m.group(1) + "%"
        else:
            spo2_word_m = re.search(
                r"(?:spo2|o2\s*sat(?:uration)?|oxygen\s*saturation)\s+(?:is\s+)?(.+?)\s+(?:percent|%|on\s+room)",
                text, re.I,
            )
            if spo2_word_m:
                spo2_val = _words_to_number(spo2_word_m.group(1))
                spo2_str = f"{spo2_val}%" if spo2_val else ""
            else:
                spo2_str = ""

        # --- Chief complaint ---
        complaint = ""
        text_for_complaint = combined
        if patient_name_str:
            text_for_complaint = text_for_complaint.replace(patient_name_str, "").strip()

        complaint_patterns = [
            r"chief complaint (?:is|was)?\s*([^\.]+)",
            r"(?:she is|he is|patient is)\s+having\s+([^\.]+)",
            r"suffering from\s+([^\.]+)",
            r"complaining of\s+([^\.]+)",
            r"presents? with\s+([^\.]+)",
            r"\bhaving\s+([^\.]+)",
        ]
        for pattern in complaint_patterns:
            match = re.search(pattern, text_for_complaint, re.I)
            if match:
                complaint = match.group(1).strip()
                break

        if not complaint:
            sentences = [s.strip() for s in text_for_complaint.split(".") if len(s.strip()) > 5]
            for sent in sentences:
                if not re.match(r"^(good|hello|hi|hey)\s+(night|morning|afternoon|evening)", sent, re.I):
                    complaint = sent[:200]
                    break

        # Normalize chief complaint to remove intros like "This is..." and demographics.
        complaint = _clean_chief_text(complaint)

        # --- Past medical history / known conditions ---
        history_str = ""
        history_patterns = [
            r"history of ([^\.]+)",
            r"past history of ([^\.]+)",
            r"has a history of ([^\.]+)",
            r"known case of ([^\.]+)",
        ]
        for pattern in history_patterns:
            m = re.search(pattern, combined, re.I)
            if m:
                history_str = m.group(1).strip(" ,.")
                break

        # --- Current medications ---
        meds_str = ""
        med_patterns = [
            r"(?:is|was)?\s*currently\s+taking\s+([^\.]+)",
            r"(?:is|was)?\s*taking\s+([^\.]+)",
            r"(?:is|was|currently|still)?\s*(?:on|receives|receiving|started on)\s+([^\.]+)",
        ]
        for pattern in med_patterns:
            m = re.search(pattern, combined, re.I)
            if m:
                meds_str = m.group(1).strip(" ,.")
                break

        # --- Allergies ---
        allergies_str = ""
        if re.search(r"no\s+known\s+drug\s+allerg", text, re.I) or re.search(
            r"no\s+drug\s+allerg", text, re.I
        ):
            allergies_str = "No known drug allergies"
        elif re.search(r"no\s+known\s+allerg", text, re.I):
            allergies_str = "No known allergies"
        else:
            m = re.search(r"allerg(?:y|ies)\s+to\s+([^\.]+)", combined, re.I)
            if m:
                allergies_str = m.group(1).strip(" ,.")

        # --- Time of onset ---
        time_onset_str = ""
        m = re.search(r"for\s+the\s+past\s+([^\.]+)", combined, re.I)
        if m:
            time_onset_str = f"for the past {m.group(1).strip(' .,')}"
        else:
            m = re.search(r"since\s+([^\.]+)", combined, re.I)
            if m:
                time_onset_str = f"since {m.group(1).strip(' .,')}"

        # --- History of Present Illness (HPI) ---
        hpi_str = ""
        # Build HPI from symptom progression sentences (onset, duration, associated symptoms)
        hpi_patterns = [
            r"(?:the )?(?:fever|pain|symptoms?|illness|condition)\s+started\s+([^\.]+\.?)",
            r"(?:has been|have been)\s+(persistent|worsening|improving)[^\.]*\.?",
            r"(?:she |he )?feels?\s+(?:very\s+)?([^\.]+)",
            r"(?:there is|there are)\s+no\s+([^\.]+)",
            r"(?:but |however )(?:there is|there are)\s+([^\.]+)",
        ]
        hpi_parts = []
        for pattern in hpi_patterns:
            m = re.search(pattern, combined, re.I)
            if m:
                hpi_parts.append(m.group(0).strip(" ,."))
        if hpi_parts:
            hpi_str = ". ".join(hpi_parts[:3])
        elif complaint and time_onset_str:
            hpi_str = f"Patient presenting with {complaint} {time_onset_str}"

        # --- Consciousness and orientation ---
        consciousness_str = ""
        if "alert" in text:
            consciousness_str = "alert"
        elif "drowsy" in text:
            consciousness_str = "drowsy"
        elif "unconscious" in text:
            consciousness_str = "unconscious"

        orient_person = orient_place = orient_time = False
        # Check combined pattern first: "oriented to person, place, and time" (with various formats)
        if re.search(r"oriented\s+to\s+(?:person|place|time)\s*[,]\s*(?:person|place|time)\s*[,]?\s*(?:and\s+)?(?:person|place|time)", text, re.I):
            orient_person = orient_place = orient_time = True
        elif re.search(r"oriented\s+(?:to\s+)?(?:person|place|time)[\s,]+(?:person|place|time)[\s,]+(?:and\s+)?(?:person|place|time)", text, re.I):
            orient_person = orient_place = orient_time = True
        else:
            # Check individual patterns
            if re.search(r"oriented\s+to\s+person", text, re.I):
                orient_person = True
            if re.search(r"oriented\s+to\s+place", text, re.I):
                orient_place = True
            if re.search(r"oriented\s+to\s+time", text, re.I):
                orient_time = True

        summary = LiveSummaryState(
            patientName=_field(
                patient_name_str,
                Confidence.medium if patient_name_str else Confidence.low,
                filled=bool(patient_name_str),
            ),
            patientAge=_field(
                age_str,
                Confidence.medium if age_str else Confidence.low,
                filled=bool(age_str),
            ),
            gender=_field(
                gender_str,
                Confidence.medium if gender_str else Confidence.low,
                filled=bool(gender_str),
            ),
            chiefComplaint=_field(complaint, Confidence.medium if complaint else Confidence.low, filled=bool(complaint)),
            vitalSigns=VitalSignsData(
                bloodPressure=_vital(bp_str, Confidence.high if bp_str else Confidence.low),
                heartRate=_vital(hr_str, Confidence.high if hr_str else Confidence.low),
                temperature=_vital(temp_str, Confidence.medium if temp_str else Confidence.low),
                respiratoryRate=_vital(rr_str, Confidence.medium if rr_str else Confidence.low),
                oxygenSaturation=_vital(spo2_str, Confidence.medium if spo2_str else Confidence.low),
            ),
            medicalHistory=_field(history_str, Confidence.medium if history_str else Confidence.low, filled=bool(history_str)),
            knownConditions=_field(history_str, Confidence.medium if history_str else Confidence.low, filled=bool(history_str)),
            presentIllness=_field(hpi_str, Confidence.medium if hpi_str else Confidence.low, filled=bool(hpi_str)),
            drugAllergies=_field(allergies_str, Confidence.medium if allergies_str else Confidence.low, filled=bool(allergies_str)),
            currentMedications=_field(meds_str, Confidence.medium if meds_str else Confidence.low, filled=bool(meds_str)),
            timeOfOnset=_field(time_onset_str, Confidence.medium if time_onset_str else Confidence.low, filled=bool(time_onset_str)),
            consciousnessLevel=_field(
                consciousness_str, Confidence.medium if consciousness_str else Confidence.low, filled=bool(consciousness_str)
            ),
            orientationPerson=_field(
                "oriented" if orient_person else "",
                Confidence.medium if orient_person else Confidence.low,
                filled=orient_person,
            ),
            orientationPlace=_field(
                "oriented" if orient_place else "",
                Confidence.medium if orient_place else Confidence.low,
                filled=orient_place,
            ),
            orientationTime=_field(
                "oriented" if orient_time else "",
                Confidence.medium if orient_time else Confidence.low,
                filled=orient_time,
            ),
            riskFlags=_field("", Confidence.low, filled=False),
        )
        return _apply_triage_and_safety(summary)
    except Exception:
        summary = LiveSummaryState(
            patientName=_field("", Confidence.low, filled=False),
            patientAge=_field("", Confidence.low, filled=False),
            gender=_field("", Confidence.low, filled=False),
            chiefComplaint=_field(combined[:300].strip() or "", Confidence.low, filled=bool(combined.strip())),
            vitalSigns=VitalSignsData(
                bloodPressure=_vital("", Confidence.low),
                heartRate=_vital("", Confidence.low),
                temperature=_vital("", Confidence.low),
                respiratoryRate=_vital("", Confidence.low),
                oxygenSaturation=_vital("", Confidence.low),
            ),
            medicalHistory=_field("", Confidence.low, filled=False),
            riskFlags=_field("", Confidence.low, filled=False),
        )
        return _apply_triage_and_safety(summary)

