from pydantic import BaseModel, Field
from typing import Optional, List


class Metrics(BaseModel):
    audio_db: float = Field(..., ge=0, le=200)
    vibration_g: float = Field(..., ge=0, le=20)
    peak_frequency_hz: float = Field(..., ge=0, le=20000)


class Evidence(BaseModel):
    license_plate_text: str
    confidence_score: float = Field(..., ge=0.0, le=1.0)
    image_url: str


class ViolationPayload(BaseModel):
    device_id: str
    timestamp: str
    metrics: Metrics
    evidence: Evidence


class IncidentOut(BaseModel):
    id: int
    device_id: str
    timestamp: str
    audio_db: float
    vibration_g: float
    peak_frequency_hz: float
    license_plate_text: str
    confidence_score: float
    image_url: str
    needs_review: int
    cluster_id: Optional[int] = None


class EdgeConfig(BaseModel):
    device_id: str
    audio_threshold_db: float = 85.0
    vibration_threshold_g: float = 1.2
    cooldown_seconds: int = 5
    active_frequency_range: List[int] = [30, 60]
