"""
Notification dispatcher.

Evaluates notification_rules against newly created change_records
and dispatches alerts via email (SMTP) and/or Slack webhooks.
"""
from __future__ import annotations

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Iterable

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    ChangeRecord, NotificationRule, NotificationLog, ChangeElementType,
)


def dispatch_for_change(db: Session, change: ChangeRecord) -> None:
    """Check all active rules against a single change record; dispatch matching ones."""
    rules = db.query(NotificationRule).filter_by(active=True).all()
    for rule in rules:
        if _rule_matches(rule, change):
            try:
                _send(rule, change)
                _log(db, rule, change, status="sent")
            except Exception as exc:  # noqa: BLE001
                _log(db, rule, change, status="failed", error=str(exc))
    db.commit()


def dispatch_batch(db: Session, changes: Iterable[ChangeRecord]) -> None:
    """Called by the Celery worker after a snapshot is processed."""
    for c in changes:
        dispatch_for_change(db, c)


# ── rule matching ──────────────────────────────────────────────────
def _effective(list_val, scalar_val) -> list:
    """Prefer the JSON array filter if populated; fall back to the legacy scalar."""
    if list_val:
        return [v for v in list_val if v]
    return [scalar_val] if scalar_val else []


def _rule_matches(rule: NotificationRule, change: ChangeRecord) -> bool:
    types = _effective(rule.change_element_types, rule.change_element_type)
    if types:
        change_type = (
            change.change_element_type.value
            if hasattr(change.change_element_type, "value")
            else change.change_element_type
        )
        if change_type not in types:
            return False

    attrs = _effective(rule.attribute_ids, rule.attribute_id)
    if attrs and change.attribute_id not in attrs:
        return False

    quals = _effective(rule.qualifier_ids, rule.qualifier_id)
    if quals and change.qualifier_id not in quals:
        return False

    ref_types = rule.ref_types or []
    if ref_types and change.ref_type not in ref_types:
        return False

    targets = rule.target_ids or []
    if targets and change.target_id not in targets:
        return False

    return True


# ── delivery channels ──────────────────────────────────────────────
def _send(rule: NotificationRule, change: ChangeRecord) -> None:
    if rule.notify_channel == "email":
        _send_email(rule.notify_target, change)
    elif rule.notify_channel == "slack":
        _send_slack(rule.notify_target or settings.SLACK_DEFAULT_WEBHOOK_URL, change)
    else:
        raise ValueError(f"Unknown notify_channel: {rule.notify_channel}")


def _send_email(to_addr: str, change: ChangeRecord) -> None:
    if not settings.SMTP_HOST:
        raise RuntimeError("SMTP_HOST not configured")
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"[{settings.CLIENT_NAME}] Change: {change.change_element_type}"
    msg["From"] = settings.EMAIL_FROM
    msg["To"] = to_addr

    html = _render_email_html(change)
    msg.attach(MIMEText(_render_email_text(change), "plain"))
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.starttls()
        if settings.SMTP_USER:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.sendmail(settings.EMAIL_FROM, [to_addr], msg.as_string())


def _send_slack(webhook_url: str, change: ChangeRecord) -> None:
    if not webhook_url:
        raise RuntimeError("No Slack webhook URL configured")
    payload = {
        "blocks": [
            {"type": "header", "text": {"type": "plain_text",
                "text": f"{settings.CLIENT_NAME} — PIM Change Detected"}},
            {"type": "section", "fields": [
                {"type": "mrkdwn", "text": f"*Type*\n{change.change_element_type}"},
                {"type": "mrkdwn", "text": f"*Product*\n`{change.step_product_id}`"},
                {"type": "mrkdwn", "text": f"*Attribute*\n{change.attribute_id or '—'}"},
                {"type": "mrkdwn", "text": f"*Changed By*\n{change.changed_by or '—'}"},
            ]},
            {"type": "section", "fields": [
                {"type": "mrkdwn", "text": f"*Previous*\n```{(change.previous_value or '—')[:200]}```"},
                {"type": "mrkdwn", "text": f"*Current*\n```{(change.current_value or '—')[:200]}```"},
            ]},
        ]
    }
    r = httpx.post(webhook_url, json=payload, timeout=10)
    r.raise_for_status()


# ── rendering helpers ──────────────────────────────────────────────
def _render_email_text(c: ChangeRecord) -> str:
    return (
        f"Change Type: {c.change_element_type}\n"
        f"Product: {c.step_product_id}\n"
        f"Attribute: {c.attribute_id or '—'}\n"
        f"Previous: {c.previous_value or '—'}\n"
        f"Current: {c.current_value or '—'}\n"
        f"Changed By: {c.changed_by}\n"
        f"Change Date: {c.change_date}\n"
    )


def _render_email_html(c: ChangeRecord) -> str:
    return f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:640px">
      <h2 style="color:{settings.CLIENT_PRIMARY_COLOUR}">{settings.CLIENT_NAME} — Change Detected</h2>
      <table cellpadding="8" style="border-collapse:collapse;width:100%">
        <tr><td style="color:#666">Type</td><td><strong>{c.change_element_type}</strong></td></tr>
        <tr><td style="color:#666">Product</td><td><code>{c.step_product_id}</code></td></tr>
        <tr><td style="color:#666">Attribute</td><td>{c.attribute_id or '—'}</td></tr>
        <tr><td style="color:#666">Previous</td><td style="background:#FFEBEE;padding:8px">{c.previous_value or '—'}</td></tr>
        <tr><td style="color:#666">Current</td><td style="background:#E8F5E9;padding:8px">{c.current_value or '—'}</td></tr>
        <tr><td style="color:#666">Changed By</td><td>{c.changed_by}</td></tr>
        <tr><td style="color:#666">Date</td><td>{c.change_date}</td></tr>
      </table>
    </div>
    """


def _log(db: Session, rule: NotificationRule, change: ChangeRecord,
         status: str, error: str | None = None) -> None:
    db.add(NotificationLog(
        rule_id=rule.id, change_record_id=change.id,
        status=status, error=error,
    ))
