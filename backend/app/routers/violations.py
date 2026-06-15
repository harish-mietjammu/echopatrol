from fastapi import APIRouter, HTTPException, Query, status
from typing import List, Optional

from ..database import get_db
from ..models import ViolationPayload, IncidentOut
from ..clustering import resolve_cluster_id
from ..websocket_manager import broadcast_violation, broadcast_review

router = APIRouter(prefix="/api/v1", tags=["violations"])

OCR_REVIEW_THRESHOLD = 0.80


@router.post("/violations", status_code=status.HTTP_201_CREATED)
async def log_violation(payload: ViolationPayload):
    needs_review = 1 if payload.evidence.confidence_score < OCR_REVIEW_THRESHOLD else 0

    db = await get_db()
    try:
        cluster_id = await resolve_cluster_id(
            db,
            payload.device_id,
            payload.evidence.license_plate_text,
            payload.timestamp,
        )

        cur = await db.execute(
            """
            INSERT INTO incidents (
                device_id, timestamp,
                audio_db, vibration_g, peak_frequency_hz,
                license_plate_text, confidence_score, image_url,
                needs_review, cluster_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.device_id,
                payload.timestamp,
                payload.metrics.audio_db,
                payload.metrics.vibration_g,
                payload.metrics.peak_frequency_hz,
                payload.evidence.license_plate_text,
                payload.evidence.confidence_score,
                payload.evidence.image_url,
                needs_review,
                cluster_id,
            ),
        )
        new_id = cur.lastrowid
        await db.commit()

        async with db.execute(
            "SELECT * FROM incidents WHERE id = ?", (new_id,)
        ) as q:
            row = await q.fetchone()
    finally:
        await db.close()

    if row is None:
        raise HTTPException(status_code=500, detail="Incident insert lost row")

    incident = dict(row)

    if needs_review:
        await broadcast_review(incident)
    else:
        await broadcast_violation(incident)

    return {
        "status": "success",
        "id": new_id,
        "needs_review": bool(needs_review),
        "cluster_id": cluster_id,
        "detail": "Incident recorded",
    }


@router.get("/violations", response_model=List[IncidentOut])
async def list_violations(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    needs_review: Optional[bool] = None,
    device_id: Optional[str] = None,
    license_plate: Optional[str] = None,
):
    where = []
    params: list = []
    if needs_review is not None:
        where.append("needs_review = ?")
        params.append(1 if needs_review else 0)
    if device_id:
        where.append("device_id = ?")
        params.append(device_id)
    if license_plate:
        where.append("license_plate_text = ?")
        params.append(license_plate)
    sql = "SELECT * FROM incidents"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY id DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    db = await get_db()
    try:
        async with db.execute(sql, params) as cur:
            rows = await cur.fetchall()
    finally:
        await db.close()

    return [dict(r) for r in rows]


@router.get("/violations/{incident_id}", response_model=IncidentOut)
async def get_violation(incident_id: int):
    db = await get_db()
    try:
        async with db.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)) as cur:
            row = await cur.fetchone()
    finally:
        await db.close()
    if row is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return dict(row)


@router.post("/violations/{incident_id}/review", status_code=200)
async def resolve_review(incident_id: int):
    db = await get_db()
    try:
        cur = await db.execute(
            "UPDATE incidents SET needs_review = 0 WHERE id = ?", (incident_id,)
        )
        await db.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Incident not found")
    finally:
        await db.close()
    return {"status": "ok", "id": incident_id}
