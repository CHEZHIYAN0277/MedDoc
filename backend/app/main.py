from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import dashboard, pipeline, sessions
from app.store import store

app = FastAPI(
    title="MedDoc Copilot API",
    description="AI-assisted emergency medical documentation – transcription, extraction, clinician review",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://localhost:5173", "http://127.0.0.1:8080", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions.router)
app.include_router(pipeline.router)
app.include_router(dashboard.router)


@app.on_event("startup")
def load_demo_sessions():
    """Load demo sessions at startup for hackathon fallback."""
    import logging
    logger = logging.getLogger(__name__)
    
    loaded1 = store.load_demo_session("demo/demo_session.json")
    if loaded1:
        logger.info("Demo session DEMO-CASE-1 (non-emergency) loaded successfully")
    
    loaded2 = store.load_demo_session("demo/demo_session_emergency.json")
    if loaded2:
        logger.info("Demo session DEMO-EMERGENCY-1 (emergency) loaded successfully")

    loaded3 = store.load_demo_session("demo/demo_session_multilingual.json")
    if loaded3:
        logger.info("Demo session DEMO-MULTILINGUAL-1 (multilingual) loaded successfully")

    loaded4 = store.load_demo_session("demo/demo_session_tamil_non_emergency.json")
    if loaded4:
        logger.info("Demo session DEMO-TAMIL-NONEMERG-1 (Tamil non-emergency) loaded successfully")


@app.get("/health")
def health():
    return {"status": "ok"}
