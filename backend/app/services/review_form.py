"""
Build full review form from live summary and Q&A. Merge into ReviewFormData.
"""
from typing import Any

from app.models import ReviewFormData


def summary_to_review_form(
    summary: dict[str, Any],
    questions: list[dict[str, Any]] | None,
    transcript_text: str = "",
) -> ReviewFormData:
    """
    Map live summary (extracted fields) and Q&A answers into the full editable review form.
    """
    qa = (questions or [])
    allergies = ""
    medications = ""
    conditions = ""
    # Vitals answered via follow-up Q&A (non-emergency flow). We treat these
    # as a *fallback* source: extracted vitals still win; Q&A fills gaps.
    vitals_from_qa: dict[str, str] = {
        "bloodPressure": "",
        "heartRate": "",
        "temperature": "",
        "respiratoryRate": "",
        "oxygenSaturation": "",
    }

    for q in qa:
        if not q.get("response"):
            continue
        r = (q["response"] or "").strip()
        if not r:
            continue
        question_text = (q.get("question") or "").lower()
        cat = (q.get("category") or "").lower()

        # Allergies / medications / conditions (existing behaviour)
        if "allerg" in cat or "allerg" in question_text:
            allergies = (allergies + " " + r).strip() if allergies else r
        elif "medication" in cat or "medication" in question_text or "drug" in question_text:
            medications = (medications + " " + r).strip() if medications else r
        elif "condition" in cat or "diabetes" in question_text or "history" in question_text:
            conditions = (conditions + " " + r).strip() if conditions else r
        else:
            conditions = (conditions + " " + r).strip() if conditions else r

        # Vitals from Q&A (category "Vitals" or question mentions vital terms)
        is_vitals_cat = "vital" in cat or "vitals" in cat
        if is_vitals_cat or any(
            key in question_text
            for key in ["blood pressure", "bp", "heart rate", "pulse", "temperature", "temp", "respiratory rate", "rr", "oxygen saturation", "spo2", "o2 sat"]
        ):
            # Very lightweight routing based on question text keywords.
            if ("blood pressure" in question_text or "bp" in question_text) and not vitals_from_qa["bloodPressure"]:
                vitals_from_qa["bloodPressure"] = r
            if ("heart rate" in question_text or "pulse" in question_text) and not vitals_from_qa["heartRate"]:
                vitals_from_qa["heartRate"] = r
            if ("temperature" in question_text or "temp" in question_text or "fever" in question_text) and not vitals_from_qa["temperature"]:
                vitals_from_qa["temperature"] = r
            if ("respiratory rate" in question_text or "rr" in question_text) and not vitals_from_qa["respiratoryRate"]:
                vitals_from_qa["respiratoryRate"] = r
            if any(k in question_text for k in ["oxygen saturation", "spo2", "o2 sat"]) and not vitals_from_qa["oxygenSaturation"]:
                vitals_from_qa["oxygenSaturation"] = r

    vs = summary.get("vitalSigns") or {}

    def _val(field_name: str) -> str:
        f = summary.get(field_name)
        if isinstance(f, dict):
            return (f.get("value") or "").strip()
        return ""

    def v(key: str) -> str:
        """Get a vital value, preferring extraction; fall back to Q&A answer."""
        f = vs.get(key) or {}
        extracted = (f.get("value") or "").strip()
        if extracted:
            return extracted
        # Map ReviewFormData vital key to our vitals_from_qa dict keys
        qa_key_map = {
            "bloodPressure": "bloodPressure",
            "heartRate": "heartRate",
            "temperature": "temperature",
            "respiratoryRate": "respiratoryRate",
            "oxygenSaturation": "oxygenSaturation",
        }
        qa_key = qa_key_map.get(key)
        if qa_key:
            return vitals_from_qa.get(qa_key, "").strip()
        return ""

    def _orient_bool(field_name: str) -> bool:
        s = _val(field_name).lower()
        return s in ("yes", "true", "1", "oriented")

    # Prefer extraction fields; fall back to Q&A or transcript
    present_illness = _val("presentIllness") or ""
    if not present_illness and transcript_text:
        present_illness = transcript_text[:2000].strip()
    drug_allergies = _val("drugAllergies") or allergies
    current_meds = _val("currentMedications") or medications
    if not current_meds:
        current_meds = _val("medicalHistory") or medications
    known_conditions = _val("knownConditions") or _val("medicalHistory") or conditions

    return ReviewFormData(
        patientName=_val("patientName"),
        age=_val("patientAge"),
        gender=_val("gender"),
        chiefComplaint=_val("chiefComplaint"),
        timeOfOnset=_val("timeOfOnset"),
        presentIllness=present_illness,
        consciousnessLevel=_val("consciousnessLevel"),
        orientationPerson=_orient_bool("orientationPerson"),
        orientationPlace=_orient_bool("orientationPlace"),
        orientationTime=_orient_bool("orientationTime"),
        knownConditions=known_conditions,
        drugAllergies=drug_allergies,
        currentMedications=current_meds,
        bloodPressure=v("bloodPressure"),
        heartRate=v("heartRate"),
        temperature=v("temperature"),
        respiratoryRate=v("respiratoryRate"),
        oxygenSaturation=v("oxygenSaturation"),
        provisionalDiagnosis=_val("provisionalDiagnosis"),
        investigationsOrdered=_val("investigationsOrdered"),
        medicationsInterventions=_val("medicationsInterventions"),
        disposition=_val("disposition"),
        consentObtained=_val("consentObtained"),
        consentNotObtainedReason=_val("consentNotObtainedReason"),
        attendantName=_val("attendantName"),
    )
