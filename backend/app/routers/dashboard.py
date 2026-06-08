from fastapi import APIRouter

from app.models import DashboardStats
from app.store import store

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=DashboardStats)
def get_stats():
    """Real dashboard stats from session store."""
    return DashboardStats(**store.list_for_dashboard())
