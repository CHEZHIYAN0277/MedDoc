"""
Pydantic models for API request/response. Aligned with frontend types.
"""
from datetime import datetime
from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class CaseContext(str, Enum):
    emergency = "emergency"
    non_emergency = "non-emergency"


class SessionMode(str, Enum):
    passive_listening = "passive-listening"
    assisted_questioning = "assisted-questioning"
    review_pending = "review-pending"
    completed = "completed"


class ListeningStatus(str, Enum):
    on = "on"
    off = "off"
    reviewing = "reviewing"
    locked = "locked"


# --- Session ---
class SessionCreate(BaseModel):
    context: CaseContext


class TranscriptLine(BaseModel):
    id: int
    text: str
    speaker: Literal["Doctor", "Patient", "Caregiver", "Unknown"] = "Unknown"
    timestamp: str


class FollowUpQuestion(BaseModel):
    id: int
    question: str
    category: str
    status: Literal["pending", "asking", "listening", "answered", "skipped", "unknown"] = "pending"
    response: Optional[str] = None


class SessionResponse(BaseModel):
    id: str
    context: CaseContext
    mode: SessionMode
    listening_status: ListeningStatus
    started_at: datetime
    last_updated_at: datetime
    tags: Optional[list[str]] = None
    transcript: list[TranscriptLine] = Field(default_factory=list)
    questions: Optional[list[FollowUpQuestion]] = None


# --- Audio / Transcript ---
class TranscriptUpdate(BaseModel):
    lines: list[TranscriptLine]


# --- Live Case Summary (extracted fields only, with confidence) ---
class Confidence(str, Enum):
    high = "high"
    medium = "medium"
    low = "low"


class FormFieldWithConfidence(BaseModel):
    value: str
    confidence: Confidence
    filled: bool


class VitalSignsData(BaseModel):
    bloodPressure: FormFieldWithConfidence
    heartRate: FormFieldWithConfidence
    temperature: FormFieldWithConfidence
    respiratoryRate: FormFieldWithConfidence
    oxygenSaturation: FormFieldWithConfidence


def _empty_field() -> "FormFieldWithConfidence":
    return FormFieldWithConfidence(value="", confidence=Confidence.low, filled=False)


class LiveSummaryState(BaseModel):
    """Live Case Summary: same field set as Review form, with confidence for extraction."""
    patientName: FormFieldWithConfidence = Field(default_factory=_empty_field)
    patientAge: FormFieldWithConfidence
    gender: FormFieldWithConfidence
    chiefComplaint: FormFieldWithConfidence
    vitalSigns: VitalSignsData
    medicalHistory: FormFieldWithConfidence
    riskFlags: FormFieldWithConfidence
    presentIllness: FormFieldWithConfidence = Field(default_factory=_empty_field)
    drugAllergies: FormFieldWithConfidence = Field(default_factory=_empty_field)
    currentMedications: FormFieldWithConfidence = Field(default_factory=_empty_field)
    # Review-form-aligned fields (visible on Live Summary when filled)
    timeOfOnset: FormFieldWithConfidence = Field(default_factory=_empty_field)
    consciousnessLevel: FormFieldWithConfidence = Field(default_factory=_empty_field)
    orientationPerson: FormFieldWithConfidence = Field(default_factory=_empty_field)  # "yes"/"no" -> bool
    orientationPlace: FormFieldWithConfidence = Field(default_factory=_empty_field)
    orientationTime: FormFieldWithConfidence = Field(default_factory=_empty_field)
    knownConditions: FormFieldWithConfidence = Field(default_factory=_empty_field)
    provisionalDiagnosis: FormFieldWithConfidence = Field(default_factory=_empty_field)
    investigationsOrdered: FormFieldWithConfidence = Field(default_factory=_empty_field)
    medicationsInterventions: FormFieldWithConfidence = Field(default_factory=_empty_field)
    disposition: FormFieldWithConfidence = Field(default_factory=_empty_field)
    consentObtained: FormFieldWithConfidence = Field(default_factory=_empty_field)
    consentNotObtainedReason: FormFieldWithConfidence = Field(default_factory=_empty_field)
    attendantName: FormFieldWithConfidence = Field(default_factory=_empty_field)
    validationFlags: list[str] = Field(default_factory=list)
    triageLevel: FormFieldWithConfidence = Field(default_factory=_empty_field)  # "Stable" | "Urgent" | "Critical"
    # Evidence/provenance for extracted fields (field_key -> list of evidence hits)
    evidence: dict[str, list[dict[str, Any]]] = Field(default_factory=dict)


# --- Review form (full editable form) ---
class ReviewFormData(BaseModel):
    patientName: str = ""
    age: str = ""
    gender: str = ""
    chiefComplaint: str = ""
    timeOfOnset: str = ""
    presentIllness: str = ""
    consciousnessLevel: str = ""
    orientationPerson: bool = False
    orientationPlace: bool = False
    orientationTime: bool = False
    knownConditions: str = ""
    drugAllergies: str = ""
    currentMedications: str = ""
    bloodPressure: str = ""
    heartRate: str = ""
    temperature: str = ""
    respiratoryRate: str = ""
    oxygenSaturation: str = ""
    provisionalDiagnosis: str = ""
    investigationsOrdered: str = ""
    medicationsInterventions: str = ""
    disposition: str = ""
    consentObtained: str = ""
    consentNotObtainedReason: str = ""
    attendantName: str = ""


# --- Question answer ---
class QuestionAnswer(BaseModel):
    response: Optional[str] = None
    status: Literal["answered", "skipped", "unknown"]


# --- Dashboard ---
class DashboardStats(BaseModel):
    active_sessions: int
    pending_review: int
    approved_today: int
    avg_time_saved_percent: Optional[float] = None
