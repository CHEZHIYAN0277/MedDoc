"""
In-memory store for sessions and extracted data. Replace with DB (e.g. SQLite) for production.
"""
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.models import (
    CaseContext,
    FollowUpQuestion,
    LiveSummaryState,
    ListeningStatus,
    ReviewFormData,
    SessionMode,
    TranscriptLine,
)


def _now() -> datetime:
    return datetime.utcnow()


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, dict] = {}
        self._transcript_id_counter = 0

    def _next_transcript_id(self) -> int:
        self._transcript_id_counter += 1
        return self._transcript_id_counter

    def create(self, session_id: str, context: CaseContext) -> dict:
        now = _now()
        session = {
            "id": session_id,
            "context": context,
            "mode": SessionMode.passive_listening.value,
            "listening_status": ListeningStatus.on.value,
            "started_at": now,
            "last_updated_at": now,
            "tags": ["Listening"],
            "transcript": [],
            "questions": None,
            "live_summary": None,
            "review_form": None,
            "approved": False,
            "approved_at": None,
        }
        self._sessions[session_id] = session
        return session

    def get(self, session_id: str) -> Optional[dict]:
        return self._sessions.get(session_id)

    def update_transcript(self, session_id: str, lines: list[TranscriptLine]) -> None:
        s = self._sessions.get(session_id)
        if not s:
            return
        s["transcript"] = [line.model_dump() for line in lines]
        s["last_updated_at"] = _now()

    def append_transcript_lines(self, session_id: str, new_lines: list[dict]) -> None:
        s = self._sessions.get(session_id)
        if not s:
            return
        existing = s.get("transcript") or []
        s["transcript"] = existing + new_lines
        s["last_updated_at"] = _now()

    def set_questions(self, session_id: str, questions: list[FollowUpQuestion]) -> None:
        s = self._sessions.get(session_id)
        if not s:
            return
        s["questions"] = [q.model_dump() for q in questions]
        s["mode"] = SessionMode.assisted_questioning.value
        s["last_updated_at"] = _now()

    def update_question_answer(
        self,
        session_id: str,
        question_id: int,
        response: Optional[str],
        status: str,
    ) -> None:
        s = self._sessions.get(session_id)
        if not s or not s.get("questions"):
            return
        for q in s["questions"]:
            if q["id"] == question_id:
                q["response"] = response
                q["status"] = status
                break
        s["last_updated_at"] = _now()

    def set_live_summary(self, session_id: str, summary: LiveSummaryState) -> None:
        s = self._sessions.get(session_id)
        if not s:
            return
        s["live_summary"] = summary.model_dump()
        s["mode"] = SessionMode.review_pending.value
        s["tags"] = ["Awaiting Review"]
        s["listening_status"] = ListeningStatus.reviewing.value
        s["last_updated_at"] = _now()

    def set_review_form(self, session_id: str, form: ReviewFormData) -> None:
        s = self._sessions.get(session_id)
        if not s:
            return
        s["review_form"] = form.model_dump()
        s["last_updated_at"] = _now()

    def approve(self, session_id: str) -> None:
        s = self._sessions.get(session_id)
        if not s:
            return
        s["approved"] = True
        s["approved_at"] = _now()
        s["mode"] = SessionMode.completed.value
        s["listening_status"] = ListeningStatus.locked.value
        s["tags"] = []
        s["last_updated_at"] = _now()

    def set_listening_status(self, session_id: str, status: ListeningStatus) -> None:
        s = self._sessions.get(session_id)
        if not s:
            return
        s["listening_status"] = status.value
        s["last_updated_at"] = _now()

    def set_mode(self, session_id: str, mode: SessionMode) -> None:
        s = self._sessions.get(session_id)
        if not s:
            return
        s["mode"] = mode.value
        s["last_updated_at"] = _now()

    def list_sessions(
        self,
        *,
        include_approved: bool = True,
        limit: int = 50,
    ) -> list[dict]:
        sessions = list(self._sessions.values())
        if not include_approved:
            sessions = [s for s in sessions if not s.get("approved")]
        sessions.sort(key=lambda x: x["last_updated_at"], reverse=True)
        return sessions[:limit]

    def list_for_dashboard(self) -> dict:
        sessions = list(self._sessions.values())
        now = _now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        active = sum(1 for s in sessions if s["mode"] in ("passive-listening", "assisted-questioning") and not s.get("approved"))
        pending_review = sum(1 for s in sessions if s["mode"] == "review-pending" and not s.get("approved"))
        approved_today = sum(1 for s in sessions if s.get("approved") and s.get("approved_at") and s["approved_at"] >= today_start)
        return {
            "active_sessions": active,
            "pending_review": pending_review,
            "approved_today": approved_today,
            "avg_time_saved_percent": 68.0,
        }

    def load_demo_session(self, demo_file_path: str) -> bool:
        """
        Load a demo session from JSON file for hackathon fallback.
        Returns True if loaded successfully, False otherwise.
        """
        try:
            demo_path = Path(__file__).parent / demo_file_path
            if not demo_path.exists():
                return False
            with open(demo_path, "r", encoding="utf-8") as f:
                demo_data = json.load(f)
            # Convert datetime strings back to datetime objects
            if isinstance(demo_data.get("started_at"), str):
                dt_str = demo_data["started_at"]
                if "Z" in dt_str:
                    dt_str = dt_str.replace("Z", "+00:00")
                elif "+" not in dt_str and "T" in dt_str:
                    dt_str = dt_str + "+00:00"
                demo_data["started_at"] = datetime.fromisoformat(dt_str)
            if isinstance(demo_data.get("last_updated_at"), str):
                dt_str = demo_data["last_updated_at"]
                if "Z" in dt_str:
                    dt_str = dt_str.replace("Z", "+00:00")
                elif "+" not in dt_str and "T" in dt_str:
                    dt_str = dt_str + "+00:00"
                demo_data["last_updated_at"] = datetime.fromisoformat(dt_str)
            if isinstance(demo_data.get("approved_at"), str):
                dt_str = demo_data["approved_at"]
                if "Z" in dt_str:
                    dt_str = dt_str.replace("Z", "+00:00")
                elif "+" not in dt_str and "T" in dt_str:
                    dt_str = dt_str + "+00:00"
                demo_data["approved_at"] = datetime.fromisoformat(dt_str)
            elif demo_data.get("approved_at") is None:
                demo_data["approved_at"] = None
            # Insert into store
            self._sessions[demo_data["id"]] = demo_data
            return True
        except Exception:
            return False


store = SessionStore()
