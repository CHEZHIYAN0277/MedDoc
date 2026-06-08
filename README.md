# MedDoc Copilot
## Overview

Healthcare professionals spend a significant portion of their time documenting patient interactions instead of delivering care.

**MedDoc Copilot** is an AI-powered clinical documentation assistant that automates patient intake, transcription, information extraction, clinical summarization, and documentation generation.

The system converts doctor-patient conversations into structured clinical records using automatic speech recognition, large language models, validation pipelines, and export-ready healthcare documentation.

---

## Key Features

### 🎙 Real-Time Medical Transcription

* Audio upload and processing
* Local Whisper-based speech recognition
* Speaker role identification
* Multilingual support
* Translation-enabled transcription workflow

### 🧠 AI-Powered Clinical Information Extraction

Automatically extracts:

* Patient demographics
* Chief complaints
* History of Present Illness (HPI)
* Vitals
* Medications
* Allergies
* Triage information
* Observations

### 📊 Confidence-Aware Extraction

Each extracted field includes:

* Confidence score
* Supporting evidence
* Validation status

This enables clinicians to verify AI-generated information quickly.

### ❓ Intelligent Follow-Up Question Generation

Detects missing information and generates context-aware follow-up questions.

Examples:

* Missing allergy information
* Incomplete medication history
* Missing symptom duration

### 📝 AI Draft Summary Generation

Generates editable:

* Clinical summaries
* Patient notes
* Encounter documentation

### ✅ Human-in-the-Loop Review

Clinicians can:

* Review extracted data
* Modify fields
* Validate information
* Approve final records

### 📄 PDF Report Generation

Produces clinician-ready reports containing:

* Patient information
* Clinical observations
* Structured documentation
* Review notes

### 🏥 FHIR-like Healthcare Export

Exports encounter information as structured JSON compatible with modern healthcare workflows.

Includes:

* Patient
* Encounter
* Observation
* Clinical metadata

### 📂 Session Management Dashboard

Supports:

* Session creation
* Session history
* Session approval workflow
* Demo patient sessions

---

# System Architecture

```text
Doctor–Patient Audio
          │
          ▼
 ┌───────────────────┐
 │ Whisper ASR       │
 │ Speech-to-Text    │
 └───────────────────┘
          │
          ▼
 ┌───────────────────┐
 │ Speaker Tagging   │
 └───────────────────┘
          │
          ▼
 ┌───────────────────┐
 │ LLM Extraction    │
 │ GPT-4o-mini       │
 └───────────────────┘
          │
          ▼
 ┌───────────────────┐
 │ Validation Layer  │
 │ spaCy + Rules     │
 └───────────────────┘
          │
          ▼
 ┌───────────────────┐
 │ Review Interface  │
 └───────────────────┘
          │
          ▼
 ┌───────────────────┐
 │ PDF / FHIR Export │
 └───────────────────┘
```

---

# Tech Stack

## Frontend

* React
* TypeScript
* Vite
* Tailwind CSS
* Radix UI
* shadcn/ui
* React Query
* React Hook Form
* Framer Motion

## Backend

* Python
* FastAPI
* Uvicorn
* Pydantic

## AI & Machine Learning

### Automatic Speech Recognition

* OpenAI Whisper (Local)

### Clinical Information Extraction

* GPT-4o-mini
* Gemini (optional fallback)

### NLP Validation

* spaCy
* Rule-based heuristics

### Explainability Layer

* Confidence scoring
* Evidence extraction

## Reporting

* ReportLab
* PDF Generation

---

# Project Structure

```text
MedDoc/
│
├── src/                     # Frontend
├── public/
│
├── backend/
│   ├── app/
│   │   ├── routers/
│   │   ├── services/
│   │   ├── demo/
│   │   ├── models.py
│   │   ├── store.py
│   │   └── main.py
│   │
│   ├── requirements.txt
│   └── README.md
│
├── package.json
├── README.md
└── .gitignore
```

---

# Installation

## 1. Clone Repository

```bash
git clone https://github.com/CHEZHIYAN0277/MedDoc.git
cd MedDoc
```

---

## 2. Frontend Setup

```bash
npm install
```

Start development server:

```bash
npm run dev
```

Frontend:

```text
http://localhost:5173
```

---

## 3. Backend Setup

Create virtual environment:

```bash
cd backend

python -m venv .venv

source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

---

## 4. Environment Variables

Create:

```bash
backend/.env
```

Example:

```env
OPENAI_API_KEY=your_openai_api_key

GEMINI_API_KEY=your_gemini_api_key

WHISPER_MODEL=base
```

---

## 5. Run Backend

```bash
uvicorn app.main:app --reload
```

Backend:

```text
http://localhost:8000
```

---

# API Endpoints

## Session Management

```http
GET    /api/sessions
POST   /api/sessions
GET    /api/sessions/{id}
```

## Pipeline

```http
POST /api/pipeline/run
```

Uploads audio and executes:

1. Transcription
2. Extraction
3. Validation
4. Summary generation

## PDF Export

```http
POST /api/export/pdf
```

## FHIR Export

```http
GET /api/export/fhir/{session_id}
```

---

# Example Workflow

1. Upload doctor-patient audio
2. Whisper generates transcript
3. LLM extracts medical information
4. Validation layer checks outputs
5. Follow-up questions generated
6. Clinician reviews results
7. PDF generated
8. FHIR JSON exported

---

# Demo Scenarios

Included demo sessions:

* Emergency Case
* Non-Emergency Consultation
* Multilingual Consultation
* Tamil Clinical Conversation

---

# Future Enhancements

### Advanced Healthcare AI

* Retrieval-Augmented Generation (RAG)
* Clinical Knowledge Graphs
* Medical Entity Linking
* ICD-10 Auto Coding
* SNOMED CT Integration
* Clinical Decision Support
* Risk Prediction Models
* Differential Diagnosis Assistance

### Infrastructure

* PostgreSQL
* Redis
* Docker
* Kubernetes
* CI/CD Pipelines

---

# Impact

MedDoc Copilot demonstrates how AI can reduce administrative burden in healthcare by transforming unstructured clinical conversations into structured, reviewable, and export-ready medical documentation.

The project combines speech recognition, natural language processing, information extraction, validation, and human-in-the-loop workflows to create an end-to-end clinical documentation assistant.


