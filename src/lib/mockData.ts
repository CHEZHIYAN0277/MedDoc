export interface PatientData {
  id: string;
  name: string;
  dateOfBirth: string;
  gender: string;
  mrn: string;
  chiefComplaint: string;
  vitalSigns: {
    bloodPressure: string;
    heartRate: string;
    temperature: string;
    respiratoryRate: string;
    oxygenSaturation: string;
  };
  allergies: string[];
  medications: string[];
  symptoms: string[];
  painLevel: number;
  onsetTime: string;
  triageLevel: 1 | 2 | 3 | 4 | 5;
  notes: string;
  status: "listening" | "processing" | "ready" | "approved";
}

export interface IntakeSession {
  id: string;
  context: "emergency" | "non-emergency";
  mode: "passive-listening" | "assisted-questioning" | "review-pending" | "completed";
  listeningStatus: "on" | "off" | "reviewing" | "locked";
  startedAt: Date;
  lastUpdatedAt: Date;
  tags?: string[];
}

// Generate mock sessions with relative times
const now = new Date();
export const mockIntakeSessions: IntakeSession[] = [
  {
    id: "ER-20260207-A1B2",
    context: "emergency",
    mode: "passive-listening",
    listeningStatus: "on",
    startedAt: new Date(now.getTime() - 4 * 60 * 1000), // 4 min ago
    lastUpdatedAt: new Date(now.getTime() - 30 * 1000), // 30 sec ago
    tags: ["Listening"],
  },
  {
    id: "ER-20260207-C3D4",
    context: "non-emergency",
    mode: "assisted-questioning",
    listeningStatus: "off",
    startedAt: new Date(now.getTime() - 12 * 60 * 1000), // 12 min ago
    lastUpdatedAt: new Date(now.getTime() - 30 * 1000), // 30 sec ago
    tags: ["Questions Pending"],
  },
  {
    id: "ER-20260207-E5F6",
    context: "emergency",
    mode: "review-pending",
    listeningStatus: "reviewing",
    startedAt: new Date(now.getTime() - 25 * 60 * 1000), // 25 min ago
    lastUpdatedAt: new Date(now.getTime() - 2 * 60 * 1000), // 2 min ago
    tags: ["Awaiting Review"],
  },
  {
    id: "ER-20260207-G7H8",
    context: "non-emergency",
    mode: "completed",
    listeningStatus: "locked",
    startedAt: new Date(now.getTime() - 45 * 60 * 1000), // 45 min ago
    lastUpdatedAt: new Date(now.getTime() - 10 * 60 * 1000), // 10 min ago
  },
  {
    id: "ER-20260207-I9J0",
    context: "emergency",
    mode: "passive-listening",
    listeningStatus: "on",
    startedAt: new Date(now.getTime() - 2 * 60 * 1000), // 2 min ago
    lastUpdatedAt: new Date(now.getTime() - 15 * 1000), // 15 sec ago
    tags: ["Listening"],
  },
  {
    id: "ER-20260207-K1L2",
    context: "non-emergency",
    mode: "review-pending",
    listeningStatus: "off",
    startedAt: new Date(now.getTime() - 18 * 60 * 1000), // 18 min ago
    lastUpdatedAt: new Date(now.getTime() - 5 * 60 * 1000), // 5 min ago
    tags: ["Awaiting Review"],
  },
];

export const mockTranscript = [
  { time: "0:00", speaker: "Clinician", text: "Good afternoon, can you tell me your name and date of birth?" },
  { time: "0:05", speaker: "Patient", text: "I'm John Martinez, born March 15, 1978." },
  { time: "0:12", speaker: "Clinician", text: "And what brings you to the emergency room today, Mr. Martinez?" },
  { time: "0:18", speaker: "Patient", text: "I've been having severe chest pain for about two hours now. It started while I was at work." },
  { time: "0:28", speaker: "Clinician", text: "Can you describe the pain? Is it sharp, dull, or pressure-like?" },
  { time: "0:35", speaker: "Patient", text: "It feels like pressure, like someone is sitting on my chest. It's radiating to my left arm." },
  { time: "0:45", speaker: "Clinician", text: "On a scale of 1 to 10, how would you rate the pain?" },
  { time: "0:50", speaker: "Patient", text: "It's about an 8. It's really uncomfortable." },
  { time: "0:55", speaker: "Clinician", text: "Any shortness of breath, nausea, or sweating?" },
  { time: "1:02", speaker: "Patient", text: "Yes, I'm sweating and feeling a bit nauseous." },
  { time: "1:08", speaker: "Clinician", text: "Do you have any allergies to medications?" },
  { time: "1:12", speaker: "Patient", text: "I'm allergic to penicillin. It gives me hives." },
  { time: "1:18", speaker: "Clinician", text: "Are you currently taking any medications?" },
  { time: "1:22", speaker: "Patient", text: "Lisinopril for blood pressure and metformin for diabetes." },
];

export const mockPatientData: PatientData = {
  id: "PT-2024-001",
  name: "John Martinez",
  dateOfBirth: "1978-03-15",
  gender: "Male",
  mrn: "MRN-7845921",
  chiefComplaint: "Chest pain with radiation to left arm",
  vitalSigns: {
    bloodPressure: "158/95",
    heartRate: "98",
    temperature: "98.6°F",
    respiratoryRate: "22",
    oxygenSaturation: "96%",
  },
  allergies: ["Penicillin (hives)"],
  medications: ["Lisinopril 10mg daily", "Metformin 500mg twice daily"],
  symptoms: [
    "Chest pressure",
    "Left arm radiation",
    "Diaphoresis",
    "Nausea",
  ],
  painLevel: 8,
  onsetTime: "2 hours ago",
  triageLevel: 2,
  notes: "Patient presenting with classic symptoms of acute coronary syndrome. History of hypertension and diabetes. Immediate cardiac workup recommended.",
  status: "ready",
};

export const mockDashboardData = {
  todayStats: {
    totalPatients: 47,
    pendingReview: 5,
    approved: 38,
    averageTime: "3.2 min",
  },
  recentPatients: [
    { id: "PT-2024-001", name: "John Martinez", complaint: "Chest pain", status: "ready" as const, time: "2:34 PM" },
    { id: "PT-2024-002", name: "Maria Garcia", complaint: "Abdominal pain", status: "approved" as const, time: "2:15 PM" },
    { id: "PT-2024-003", name: "Robert Johnson", complaint: "Laceration", status: "approved" as const, time: "1:52 PM" },
    { id: "PT-2024-004", name: "Emily Chen", complaint: "Difficulty breathing", status: "processing" as const, time: "1:30 PM" },
    { id: "PT-2024-005", name: "David Williams", complaint: "Fever", status: "approved" as const, time: "1:12 PM" },
  ],
};
