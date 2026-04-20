"""Client config router — /api/v1/config (public, read-only)."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import settings
from app.db.session import get_db
from app.schemas import ConfigResponse


router = APIRouter(prefix="/api/v1", tags=["config"])


@router.get("/config", response_model=ConfigResponse)
def get_config(db: Session = Depends(get_db)):
    return ConfigResponse(
        client_name=settings.CLIENT_NAME,
        logo_url=settings.CLIENT_LOGO_URL or None,
        primary_colour=settings.CLIENT_PRIMARY_COLOUR,
        step_base_url=settings.STEP_BASE_URL or None,
    )


@router.get("/health")
def health():
    return {"status": "ok"}
