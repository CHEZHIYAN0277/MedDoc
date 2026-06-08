# MedDoc — AI-assisted Emergency Medical Documentation

Compact summary for reviewers

MedDoc is a demo application for AI-assisted clinical intake: a React + TypeScript frontend (Vite) and a FastAPI Python backend. Key features include real-time transcription (Whisper), LLM-based structured extraction, follow-up Q&A generation, clinician review and approval, PDF export, and a FHIR-like JSON export.

Quick tech overview
- Frontend: React + TypeScript, Vite, Tailwind CSS, Radix/shadcn components
- Backend: Python, FastAPI, Uvicorn, pydantic
- AI: openai-whisper (local), OpenAI Chat (gpt-4o-mini) for extraction; optional Gemini
- Other: spaCy for validation, reportlab for PDF

Prerequisites
- Node (>=16) and npm or yarn
- Python 3.10+ and pip
- ffmpeg installed (for some audio workflows): `brew install ffmpeg` on macOS
- Set API keys in environment variables (see below)

Environment variables
- `OPENAI_API_KEY` — required for LLM extraction using OpenAI
- `WHISPER_MODEL` — optional (default: `base`) for local Whisper model
- `GEMINI_API_KEY` — optional, used for speaker classification/fallbacks

Backend (run locally)
```bash
# from repo root
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# run server
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend (run locally)
```bash
# repo root
npm install
npm run dev
# Open http://localhost:5173
```

Tests
- Frontend: `npm run test`
- Backend: add pytest commands if you add tests (not included in demo)

Submission checklist for Amazon ML Summer School
- [ ] Remove any real API keys or secrets from the repo (ensure `.env` not committed)
- [ ] Keep `backend/.env.example` but do not commit `backend/.env`
- [ ] Confirm `.gitignore` covers `node_modules`, `.venv`, `.env`, and large media
- [ ] Add a short `demo/` README describing included demo sessions and their purpose
- [ ] Add brief architecture diagram or `ARCHITECTURE.md` if helpful
- [ ] Freeze Python dependencies (consider `pip freeze > backend/requirements.lock`)
- [ ] Add short usage notes for reviewers: which endpoints to call, sample cURL examples

Recommended reviewer quick commands
```bash
# create demo session and run pipeline (example)
# Backend must be running on :8000
curl -F "file=@sample.webm" -F "qa_text=" http://127.0.0.1:8000/api/pipeline/run
```

Notes & next steps
- Store is in-memory (`backend/app/store.py`); for production or long-running tests, swap for SQLite/Postgres.
- Demo sessions are loaded at startup; include a short README mapping demo files to scenarios.

If you want, I can:
- create `backend/.env.example` (if missing)
- add a short `ARCHITECTURE.md` and sample cURL examples
- run `git init`, add files, and show the exact `git` commands to push to GitHub
