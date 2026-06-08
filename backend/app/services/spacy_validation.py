"""
spaCy validation and sanity-check layer. NEVER edits extracted data.
ONLY adds: validation flags, confidence adjustments.
"""
import re
from typing import Any

from app.models import Confidence, FormFieldWithConfidence, LiveSummaryState, VitalSignsData


_nlp = None


def _get_nlp():
    global _nlp
    if _nlp is None:
        import spacy
        _nlp = spacy.load("en_core_web_sm")
    return _nlp


# Patterns for vital mentions in transcript (phrase must appear; value extracted separately)
VITAL_PATTERNS = {
    "bp": re.compile(r"\b(?:bp|blood\s*pressure|b/?p)\b", re.I),
    "hr": re.compile(r"\b(?:heart\s*rate|pulse|hr)\b", re.I),
    "spo2": re.compile(r"\b(?:spo2|o2\s*sat|oxygen\s*sat|sp.?o.?2)\b", re.I),
    "temp": re.compile(r"\b(?:temp(?:erature)?|t)\b", re.I),
    "rr": re.compile(r"\b(?:resp(?:iratory)?\s*rate|rr)\b", re.I),
}

# Map vital key to LiveSummaryState vitalSigns key
VITAL_TO_FIELD = {
    "bp": "bloodPressure",
    "hr": "heartRate",
    "spo2": "oxygenSaturation",
    "temp": "temperature",
    "rr": "respiratoryRate",
}

# Common drug-like patterns (mg, tablets, pills, generic drug suffixes)
DRUG_PATTERN = re.compile(
    r"\b(?:\d+\s*mg|\d+\s*ml|tablet|pill|medication|meds|lisinopril|metformin|aspirin|ibuprofen|penicillin|amoxicillin)\b",
    re.I,
)


def _lower_confidence(c: Confidence) -> Confidence:
    if c == Confidence.high:
        return Confidence.medium
    if c == Confidence.medium:
        return Confidence.low
    return Confidence.low


def _field_with_adjusted_confidence(f: FormFieldWithConfidence, lower: bool) -> FormFieldWithConfidence:
    if not lower:
        return f
    return FormFieldWithConfidence(
        value=f.value,
        confidence=_lower_confidence(f.confidence),
        filled=f.filled,
    )


def validate_extraction(transcript_text: str, summary: LiveSummaryState) -> tuple[LiveSummaryState, list[str]]:
    """
    Run spaCy + regex validation on transcript vs extracted summary.
    Never edits value or filled; only adds validationFlags and may lower confidence.
    """
    flags: list[str] = []
    text = transcript_text or ""
    if not text.strip():
        return summary, flags

    try:
        nlp = _get_nlp()
        doc = nlp(text[:50000])
    except Exception:
        return summary, flags

    vs = summary.vitalSigns
    vs_dict = vs.model_dump()
    confidence_drops: dict[str, bool] = {}

    # Check each vital: mentioned in transcript but empty in extraction
    for vital_key, pattern in VITAL_PATTERNS.items():
        if pattern.search(text):
            field_key = VITAL_TO_FIELD[vital_key]
            field = getattr(vs, field_key)
            if not (field.value or "").strip():
                flag = f"{vital_key}_mentioned_no_value"
                flags.append(flag)
                confidence_drops[f"vitalSigns.{field_key}"] = True

    # Drugs in transcript but not in medications
    if DRUG_PATTERN.search(text):
        meds_val = (summary.currentMedications.value or "").strip()
        if not meds_val:
            flags.append("drugs_in_transcript_missing_from_medications")
            confidence_drops["currentMedications"] = True

    # Build updated vital signs with confidence adjustments only
    def adjust_vital(key: str) -> FormFieldWithConfidence:
        f = getattr(vs, key)
        drop = confidence_drops.get(f"vitalSigns.{key}", False)
        return _field_with_adjusted_confidence(f, drop)

    new_vitals = VitalSignsData(
        bloodPressure=adjust_vital("bloodPressure"),
        heartRate=adjust_vital("heartRate"),
        temperature=adjust_vital("temperature"),
        respiratoryRate=adjust_vital("respiratoryRate"),
        oxygenSaturation=adjust_vital("oxygenSaturation"),
    )

    new_meds = _field_with_adjusted_confidence(
        summary.currentMedications,
        confidence_drops.get("currentMedications", False),
    )

    def _f(name: str):
        return getattr(summary, name, FormFieldWithConfidence(value="", confidence=Confidence.low, filled=False))

    validated = LiveSummaryState(
        patientName=_f("patientName"),
        patientAge=summary.patientAge,
        gender=summary.gender,
        chiefComplaint=summary.chiefComplaint,
        vitalSigns=new_vitals,
        medicalHistory=summary.medicalHistory,
        riskFlags=summary.riskFlags,
        presentIllness=summary.presentIllness,
        drugAllergies=summary.drugAllergies,
        currentMedications=new_meds,
        timeOfOnset=_f("timeOfOnset"),
        consciousnessLevel=_f("consciousnessLevel"),
        orientationPerson=_f("orientationPerson"),
        orientationPlace=_f("orientationPlace"),
        orientationTime=_f("orientationTime"),
        knownConditions=_f("knownConditions"),
        provisionalDiagnosis=_f("provisionalDiagnosis"),
        investigationsOrdered=_f("investigationsOrdered"),
        medicationsInterventions=_f("medicationsInterventions"),
        disposition=_f("disposition"),
        consentObtained=_f("consentObtained"),
        consentNotObtainedReason=_f("consentNotObtainedReason"),
        attendantName=_f("attendantName"),
        validationFlags=flags,
    )
    return validated, flags
