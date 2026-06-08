from __future__ import annotations

from typing import Any


def _norm(s: str) -> str:
    return " ".join((s or "").lower().split()).strip()


def build_evidence(transcript: list[dict[str, Any]], summary_dict: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    """
    Best-effort provenance builder.

    Returns: { field_key: [ {line_id, timestamp, speaker, text_snippet}, ... ] }

    We keep this intentionally simple and robust for demo/hackathon:
    - Find the first transcript line that contains the extracted value (substring match).
    - For vitals, try matching either the raw value or just digits.
    """
    out: dict[str, list[dict[str, Any]]] = {}

    # Flatten values from summary structure (FormFieldWithConfidence objects)
    def get_val(field_key: str) -> str:
        v = summary_dict.get(field_key)
        if isinstance(v, dict):
            return (v.get("value") or "").strip()
        return (v or "").strip() if isinstance(v, str) else ""

    def add_hit(field_key: str, line: dict[str, Any]) -> None:
        out.setdefault(field_key, []).append(
            {
                "line_id": line.get("id"),
                "timestamp": line.get("timestamp"),
                "speaker": line.get("speaker"),
                "text": line.get("text"),
            }
        )

    # Direct fields
    direct_fields = [
        "patientName",
        "patientAge",
        "gender",
        "chiefComplaint",
        "timeOfOnset",
        "presentIllness",
        "medicalHistory",
        "drugAllergies",
        "currentMedications",
        "knownConditions",
        "consciousnessLevel",
        "provisionalDiagnosis",
        "investigationsOrdered",
        "medicationsInterventions",
        "disposition",
        "attendantName",
    ]

    transcript_norm = [(_norm(str(l.get("text") or "")), l) for l in (transcript or [])]

    for k in direct_fields:
        val = get_val(k)
        if not val:
            continue
        nval = _norm(val)
        if not nval:
            continue
        for t_norm, line in transcript_norm:
            if nval in t_norm:
                add_hit(k, line)
                break

    # Vitals
    vitals = summary_dict.get("vitalSigns") if isinstance(summary_dict.get("vitalSigns"), dict) else {}
    vital_map = {
        "bloodPressure": "vitalSigns.bloodPressure",
        "heartRate": "vitalSigns.heartRate",
        "temperature": "vitalSigns.temperature",
        "respiratoryRate": "vitalSigns.respiratoryRate",
        "oxygenSaturation": "vitalSigns.oxygenSaturation",
    }

    for vital_key, out_key in vital_map.items():
        vobj = vitals.get(vital_key) if isinstance(vitals, dict) else None
        val = (vobj.get("value") or "").strip() if isinstance(vobj, dict) else ""
        if not val:
            continue
        nval = _norm(val)
        digits = "".join(ch for ch in val if ch.isdigit() or ch in ["/", "."])
        for t_norm, line in transcript_norm:
            if nval and nval in t_norm:
                add_hit(out_key, line)
                break
            if digits and digits in (line.get("text") or ""):
                add_hit(out_key, line)
                break

    return out

