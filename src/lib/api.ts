/**
 * API client for MedDoc Copilot backend. No mock logic.
 */

const API_BASE =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL
    ? (import.meta.env.VITE_API_URL as string).replace(/\/$/, "")
    : "http://127.0.0.1:8000";

async function request<T>(
  path: string,
  options: RequestInit & { body?: unknown } = {}
): Promise<T> {
  const { body, ...rest } = options;
  const headers: HeadersInit = {
    ...(options.headers as HeadersInit),
  };
  if (body !== undefined && body !== null) {
    if (body instanceof FormData || body instanceof Blob) {
      // Don't set Content-Type for FormData/Blob
    } else {
      (headers as Record<string, string>)["Content-Type"] = "application/json";
    }
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers,
    body:
      body === undefined || body === null
        ? undefined
        : body instanceof FormData || body instanceof Blob
          ? (body as BodyInit)
          : JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `HTTP ${res.status}`);
  }
  const contentType = res.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return res.json() as Promise<T>;
  }
  return res.text() as Promise<T>;
}

// --- Types (aligned with backend) ---
export type CaseContext = "emergency" | "non-emergency";

export interface TranscriptLine {
  id: number;
  text: string;
  speaker: "Doctor" | "Patient" | "Caregiver" | "Unknown";
  timestamp: string;
}

export interface FollowUpQuestion {
  id: number;
  question: string;
  category: string;
  status: "pending" | "asking" | "listening" | "answered" | "skipped" | "unknown";
  response?: string;
}

export interface SessionSummary {
  id: string;
  context: CaseContext;
  mode: string;
  listening_status: string;
  started_at: string;
  last_updated_at: string;
  tags?: string[];
  transcript: TranscriptLine[];
  questions?: FollowUpQuestion[] | null;
}

export interface FormFieldWithConfidence {
  value: string;
  confidence: "high" | "medium" | "low";
  filled: boolean;
}

export interface VitalSignsData {
  bloodPressure: FormFieldWithConfidence;
  heartRate: FormFieldWithConfidence;
  temperature: FormFieldWithConfidence;
  respiratoryRate: FormFieldWithConfidence;
  oxygenSaturation: FormFieldWithConfidence;
}

export interface LiveSummaryState {
  patientName?: FormFieldWithConfidence;
  patientAge: FormFieldWithConfidence;
  gender: FormFieldWithConfidence;
  chiefComplaint: FormFieldWithConfidence;
  vitalSigns: VitalSignsData;
  medicalHistory: FormFieldWithConfidence;
  riskFlags: FormFieldWithConfidence;
  triageLevel?: FormFieldWithConfidence;
  evidence?: Record<string, Array<{ line_id?: number; timestamp?: string; speaker?: string; text?: string }>>;
  presentIllness?: FormFieldWithConfidence;
  drugAllergies?: FormFieldWithConfidence;
  currentMedications?: FormFieldWithConfidence;
  timeOfOnset?: FormFieldWithConfidence;
  consciousnessLevel?: FormFieldWithConfidence;
  orientationPerson?: FormFieldWithConfidence;
  orientationPlace?: FormFieldWithConfidence;
  orientationTime?: FormFieldWithConfidence;
  knownConditions?: FormFieldWithConfidence;
  provisionalDiagnosis?: FormFieldWithConfidence;
  investigationsOrdered?: FormFieldWithConfidence;
  medicationsInterventions?: FormFieldWithConfidence;
  disposition?: FormFieldWithConfidence;
  consentObtained?: FormFieldWithConfidence;
  consentNotObtainedReason?: FormFieldWithConfidence;
  attendantName?: FormFieldWithConfidence;
  validationFlags?: string[];
}

export interface ReviewFormData {
  patientName: string;
  age: string;
  gender: string;
  chiefComplaint: string;
  timeOfOnset: string;
  presentIllness: string;
  consciousnessLevel: string;
  orientationPerson: boolean;
  orientationPlace: boolean;
  orientationTime: boolean;
  knownConditions: string;
  drugAllergies: string;
  currentMedications: string;
  bloodPressure: string;
  heartRate: string;
  temperature: string;
  respiratoryRate: string;
  oxygenSaturation: string;
  provisionalDiagnosis: string;
  investigationsOrdered: string;
  medicationsInterventions: string;
  disposition: string;
  consentObtained: string;
  consentNotObtainedReason: string;
  attendantName: string;
}

export interface DashboardStats {
  active_sessions: number;
  pending_review: number;
  approved_today: number;
  avg_time_saved_percent?: number;
}

// --- Sessions ---
export function createSession(context: CaseContext): Promise<{ id: string; session: SessionSummary }> {
  return request("/api/sessions", { method: "POST", body: { context } });
}

export function getSession(sessionId: string): Promise<SessionSummary> {
  return request(`/api/sessions/${sessionId}`);
}

export function uploadAudio(sessionId: string, blob: Blob, filename?: string): Promise<{ appended: number; transcript: TranscriptLine[] }> {
  const form = new FormData();
  form.append("file", blob, filename || "audio.webm");
  return request(`/api/sessions/${sessionId}/audio`, { method: "POST", body: form });
}

export function getTranscript(sessionId: string): Promise<{ transcript: TranscriptLine[] }> {
  return request(`/api/sessions/${sessionId}/transcript`);
}

export function updateTranscript(sessionId: string, lines: TranscriptLine[]): Promise<{ transcript: TranscriptLine[] }> {
  return request(`/api/sessions/${sessionId}/transcript`, { method: "PATCH", body: { lines } });
}

export function generateQuestions(sessionId: string): Promise<{ questions: FollowUpQuestion[] }> {
  return request(`/api/sessions/${sessionId}/questions`, { method: "POST" });
}

export function answerQuestion(
  sessionId: string,
  questionId: number,
  data: { response?: string; status: "answered" | "skipped" | "unknown" }
): Promise<{ ok: boolean }> {
  return request(`/api/sessions/${sessionId}/questions/${questionId}/answer`, {
    method: "POST",
    body: data,
  });
}

export function runExtraction(sessionId: string): Promise<{
  summary: LiveSummaryState;
  missing_fields?: string[];
  suggested_follow_up_questions?: string[];
}> {
  return request(`/api/sessions/${sessionId}/extract`, { method: "POST" });
}

export function getSummary(sessionId: string): Promise<LiveSummaryState> {
  return request(`/api/sessions/${sessionId}/summary`);
}

export function updateSummary(sessionId: string, summary: LiveSummaryState): Promise<LiveSummaryState> {
  return request(`/api/sessions/${sessionId}/summary`, { method: "PATCH", body: summary });
}

export function getReviewForm(sessionId: string): Promise<ReviewFormData> {
  return request(`/api/sessions/${sessionId}/review`);
}

export function saveReviewForm(sessionId: string, form: ReviewFormData): Promise<{ ok: boolean }> {
  return request(`/api/sessions/${sessionId}/review`, { method: "PUT", body: form });
}

export async function approveSession(sessionId: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/approve`, {
    method: "POST",
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `HTTP ${res.status}`);
  }
  return res.blob();
}

export async function exportEmrSession(sessionId: string): Promise<Record<string, unknown>> {
  return request(`/api/sessions/${sessionId}/export`);
}

// --- Dashboard ---
export function getDashboardStats(): Promise<DashboardStats> {
  return request("/api/dashboard/stats");
}
