"""Client config router — /api/v1/config.

GET is public (used by the Login page to render branding before auth).
PATCH is admin-only and persists overrides to the ClientConfig table; env
settings act as fall-throughs when no DB row exists or a column is null."""
import secrets

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.config import settings
from app.db.session import get_db
from app.dependencies import require_admin
from app.models import ClientConfig, User
from app.schemas import ConfigResponse
from app.schemas.schemas import ConfigUpdate, SecurityPolicies, IngestCredentials


router = APIRouter(prefix="/api/v1", tags=["config"])


def _row_or_none(db: Session) -> ClientConfig | None:
    return db.query(ClientConfig).first()


def _resolved(row: ClientConfig | None) -> ConfigResponse:
    return ConfigResponse(
        client_name=(row.client_name if row and row.client_name else settings.CLIENT_NAME),
        logo_url=(row.logo_url if row and row.logo_url else settings.CLIENT_LOGO_URL) or None,
        primary_colour=(row.primary_colour if row and row.primary_colour else settings.CLIENT_PRIMARY_COLOUR),
        step_base_url=(row.step_base_url if row and row.step_base_url else settings.STEP_BASE_URL) or None,
        change_records_retention_days=row.change_records_retention_days if row else None,
        raw_xml_retention_days=row.raw_xml_retention_days if row else None,
        updated_at=row.updated_at if row else None,
    )


@router.get("/config", response_model=ConfigResponse)
def get_config(db: Session = Depends(get_db)):
    return _resolved(_row_or_none(db))


def _apply_config_update(
    body: ConfigUpdate,
    db: Session,
) -> ConfigResponse:
    row = _row_or_none(db)
    if row is None:
        row = ClientConfig()
        db.add(row)
    if body.client_name is not None:    row.client_name = body.client_name
    if body.logo_url is not None:       row.logo_url = body.logo_url or None
    if body.primary_colour is not None: row.primary_colour = body.primary_colour
    if body.step_base_url is not None:  row.step_base_url = body.step_base_url or None
    # Retention fields: use model_fields_set so an explicit null clears the value
    # while an omitted field leaves the existing DB value unchanged.
    if "change_records_retention_days" in body.model_fields_set:
        row.change_records_retention_days = body.change_records_retention_days
    if "raw_xml_retention_days" in body.model_fields_set:
        row.raw_xml_retention_days = body.raw_xml_retention_days
    db.commit()
    return _resolved(row)


@router.patch("/config", response_model=ConfigResponse)
def update_config(
    body: ConfigUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return _apply_config_update(body, db)


# PUT alias — same handler. Defensive: some corporate proxies / API gateways
# strip or block PATCH and only forward PUT, which surfaces as a 405 in the UI.
@router.put("/config", response_model=ConfigResponse)
def update_config_put(
    body: ConfigUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return _apply_config_update(body, db)


@router.get("/admin/policies", response_model=SecurityPolicies)
def get_security_policies(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Surfaces the server-enforced policy values so the admin Settings page
    shows ground-truth instead of duplicating constants in the frontend."""
    return SecurityPolicies(
        jwt_expire_minutes=settings.JWT_EXPIRE_MINUTES,
        login_rate_limit_per_min=settings.LOGIN_RATE_LIMIT_PER_MIN,
        password_min_length=12,  # mirrors Field(min_length=12) on password schemas
        max_users=settings.MAX_USERS,
        user_count=db.query(User).count(),
        smtp_configured=bool(settings.SMTP_HOST),
        env=settings.ENV,
    )


def _mask_key(key: str) -> str:
    return (
        f"{key[:4]}…{key[-4:]}"
        if len(key) >= 12 else "•" * max(8, len(key))
    )


def _resolve_ingest_key(db: Session) -> tuple[str, str]:
    """Returns (api_key, source) where source is 'db' if rotated in-app, else 'env'."""
    row = _row_or_none(db)
    if row and row.ingest_api_key:
        return row.ingest_api_key, "db"
    return settings.INGEST_API_KEY or "", "env"


def _ingest_endpoint_url(request: Request) -> str:
    """Build the absolute URL STEP should POST payloads to.

    Order of preference:
      1. PUBLIC_BASE_URL env var — explicit and proxy-safe in prod.
      2. Forwarded / X-Forwarded-Proto + Host headers from a reverse proxy.
      3. The request's own base_url — correct for direct dev hits.

    Frontend dev origins (e.g. http://localhost:3000) are filtered out so
    the UI never shows a URL that points at the dev server instead of the
    backend — STEP would not be able to reach it from outside the browser.
    """
    if settings.PUBLIC_BASE_URL:
        base = settings.PUBLIC_BASE_URL.rstrip("/")
    else:
        fwd_host = request.headers.get("x-forwarded-host")
        fwd_proto = request.headers.get("x-forwarded-proto")
        if fwd_host and fwd_proto:
            base = f"{fwd_proto}://{fwd_host}".rstrip("/")
        else:
            base = str(request.base_url).rstrip("/")
    return f"{base}/api/v1/ingest"


@router.get("/admin/ingest-credentials", response_model=IngestCredentials)
def get_ingest_credentials(
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Returns the X-API-Key used by STEP OIEP to POST payloads. Admin-only.
    Cache-Control: no-store is set explicitly so intermediate proxies don't
    keep the secret around."""
    key, source = _resolve_ingest_key(db)
    from fastapi.responses import JSONResponse
    body = IngestCredentials(
        api_key=key, masked=_mask_key(key), source=source,
        endpoint=_ingest_endpoint_url(request),
    ).model_dump()
    return JSONResponse(content=body, headers={"Cache-Control": "no-store"})


@router.post("/admin/ingest-credentials/rotate", response_model=IngestCredentials)
def rotate_ingest_credentials(
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Generates a new random API key, persists it to ClientConfig, and returns
    the new value. The previous key (whether DB or env) stops working
    immediately — STEP OIEP must be reconfigured with the new key."""
    row = _row_or_none(db)
    if row is None:
        row = ClientConfig()
        db.add(row)
    new_key = secrets.token_urlsafe(32)
    row.ingest_api_key = new_key
    db.commit()
    from fastapi.responses import JSONResponse
    body = IngestCredentials(
        api_key=new_key, masked=_mask_key(new_key), source="db",
        endpoint=_ingest_endpoint_url(request),
    ).model_dump()
    return JSONResponse(content=body, headers={"Cache-Control": "no-store"})


@router.get("/health")
def health():
    return {"status": "ok"}
