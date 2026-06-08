cd backend
source .venv/bin/activate
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000


cd /Users/chelvachezhiyan/Projects/e-doc-assistant
npm run dev




# MedDoc Copilot Backend

Python FastAPI backend for AI-assisted emergency medical form automation. Uses Whisper (speech-to-text), LLM (OpenAI), and spaCy for extraction.

## Setup

1. **Install ffmpeg (required for audio transcription)**

   Whisper decodes uploaded audio (e.g. WebM) using ffmpeg. Install it first:

   - **macOS:** `brew install ffmpeg`
   - **Ubuntu/Debian:** `sudo apt-get install ffmpeg`
   - **Windows:** Download from [ffmpeg.org](https://ffmpeg.org/download.html) or `winget install ffmpeg`

   Verify: `ffmpeg -version`

2. **Create a virtual environment and install dependencies:**

   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate   # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Install spaCy language model (for heuristic extraction when no API key):**

   ```bash
   python -m spacy download en_core_web_sm
   ```

4. **Optional: set environment variables**

   Create a `.env` file in `backend/`:

   ```
   OPENAI_API_KEY=sk-...          # For LLM extraction and follow-up questions
   WHISPER_MODEL=base             # Whisper model: tiny, base, small, medium, large
   ```

   Without `OPENAI_API_KEY`, extraction uses heuristic + spaCy only.

## Run

```bash
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API: http://127.0.0.1:8000  
Docs: http://127.0.0.1:8000/docs

## Frontend

From project root, set the API base URL and run the frontend:

```bash
 export VITE_API_URL=http://127.0.0.1:8000
 npm run dev
 ```

Frontend runs on port 8080 (or 5173) and talks to the backend for sessions, audio upload, extraction, and review.
