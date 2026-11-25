"""Model catalog, Google AI Studio model discovery, and quota tracking."""

from __future__ import annotations

import json
import logging
import re
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from ..config import AppConfig
from ..models import ModelListResponse, ModelQuotaInfo
from ..utils import read_json_file, utc_now_iso

logger = logging.getLogger(__name__)

# Documented Google AI Studio Free Tier limits
KNOWN_QUOTAS: dict[str, dict[str, Any]] = {
    # Flash models (1500 req/day, 15 RPM)
    "gemini-3-flash-preview": {
        "display_name": "Gemini 3 Flash Preview",
        "description": "Model thế hệ mới nhất, phản hồi siêu tốc, quota cực lớn (Khuyên dùng)",
        "category": "flash",
        "daily_limit": 1500,
        "rpm_limit": 15,
        "input_token_limit": 1048576,
        "output_token_limit": 65536,
    },
    "gemini-3.8-flash": {
        "display_name": "Gemini 3.8 Flash",
        "description": "Bản Flash ổn định, tư duy sắc bén và tốc độ cao",
        "category": "flash",
        "daily_limit": 1500,
        "rpm_limit": 15,
        "input_token_limit": 1048576,
        "output_token_limit": 65536,
    },
    "gemini-flash-latest": {
        "display_name": "Gemini Flash Latest",
        "description": "Bản cập nhật Flash tự động mới nhất từ Google",
        "category": "flash",
        "daily_limit": 1500,
        "rpm_limit": 15,
        "input_token_limit": 1048576,
        "output_token_limit": 65536,
    },
    "gemini-3.1-flash-lite": {
        "display_name": "Gemini 3.1 Flash-Lite",
        "description": "Model siêu nhẹ, tối ưu chi phí và độ trễ cực thấp",
        "category": "flash",
        "daily_limit": 1500,
        "rpm_limit": 15,
        "input_token_limit": 1048576,
        "output_token_limit": 65536,
    },
    # Pro models (50 req/day, 2 RPM)
    "gemini-3.1-pro-preview": {
        "display_name": "Gemini 3.1 Pro Preview",
        "description": "Model suy luận chuyên sâu, giải quyết logic và kiến trúc phức tạp",
        "category": "pro",
        "daily_limit": 50,
        "rpm_limit": 2,
        "input_token_limit": 2097152,
        "output_token_limit": 65536,
    },
    "gemini-pro-latest": {
        "display_name": "Gemini Pro Latest",
        "description": "Bản Pro cập nhật tự động mới nhất",
        "category": "pro",
        "daily_limit": 50,
        "rpm_limit": 2,
        "input_token_limit": 2097152,
        "output_token_limit": 65536,
    },
    # Experimental models (20 req/day trial)
    "gemini-4-hydrogen": {
        "display_name": "Gemini 4 Hydrogen (Experimental)",
        "description": "Model thử nghiệm cao cấp của Antigravity (Free Tier giới hạn 20 req/ngày)",
        "category": "experimental",
        "daily_limit": 20,
        "rpm_limit": 5,
        "input_token_limit": 1048576,
        "output_token_limit": 65536,
    },
}


class ModelsService:
    """Manages models catalog and tracks daily quota consumption."""

    def __init__(self, config: AppConfig, settings_service: Any) -> None:
        self.config = config
        self.settings = settings_service
        self._quota_status_file = config.data_dir / "quota_status.json"
        self._cached_api_models: list[dict[str, Any]] = []
        self._last_fetch_time: float = 0.0

    def record_exhaustion(self, model_id: str, retry_delay_seconds: int = 12600) -> None:
        """Record when a model hits Error 429 quota exhaustion."""
        data = read_json_file(self._quota_status_file, default={})
        if not isinstance(data, dict):
            data = {}
        resume_time = time.time() + retry_delay_seconds
        data[model_id] = {
            "exhausted_at": utc_now_iso(),
            "resume_timestamp": resume_time,
            "retry_delay": retry_delay_seconds,
        }
        try:
            self._quota_status_file.parent.mkdir(parents=True, exist_ok=True)
            self._quota_status_file.write_text(json.dumps(data, indent=2), encoding="utf-8")
        except Exception as e:
            logger.warning("Could not persist quota status: %s", e)

    def _fetch_google_models(self, api_key: str) -> list[dict[str, Any]]:
        now = time.time()
        if self._cached_api_models and (now - self._last_fetch_time < 300):
            return self._cached_api_models

        url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "AntigravityPulse/1.0"})
            with urllib.request.urlopen(req, timeout=6.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                models = data.get("models", [])
                valid_models = [
                    m for m in models
                    if "generateContent" in m.get("supportedGenerationMethods", [])
                ]
                self._cached_api_models = valid_models
                self._last_fetch_time = now
                return valid_models
        except Exception as exc:
            logger.debug("Failed to query Google AI Studio models: %s", exc)
            return self._cached_api_models

    def list_models_with_quota(self, runner_service: Any | None = None) -> ModelListResponse:
        current_model = self.settings.get_model()
        api_key = self.settings.get_effective_api_key()

        # Load exhaustion records
        exhaustion_data = read_json_file(self._quota_status_file, default={})
        if not isinstance(exhaustion_data, dict):
            exhaustion_data = {}

        # Default model order
        known_keys = list(KNOWN_QUOTAS.keys())

        # If API key is present, also discover any new models
        if api_key:
            remote_models = self._fetch_google_models(api_key)
            for rm in remote_models:
                m_id = rm.get("name", "").replace("models/", "")
                if m_id and m_id not in KNOWN_QUOTAS and ("flash" in m_id or "pro" in m_id):
                    is_pro = "pro" in m_id
                    KNOWN_QUOTAS[m_id] = {
                        "display_name": rm.get("displayName") or m_id,
                        "description": rm.get("description") or "Google Gemini Model",
                        "category": "pro" if is_pro else "flash",
                        "daily_limit": 50 if is_pro else 1500,
                        "rpm_limit": 2 if is_pro else 15,
                        "input_token_limit": rm.get("inputTokenLimit", 1048576),
                        "output_token_limit": rm.get("outputTokenLimit", 65536),
                    }
                    if m_id not in known_keys:
                        known_keys.append(m_id)

        # Count runs today per model
        today_prefix = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        runs_today: dict[str, int] = {}
        if runner_service is not None:
            try:
                for run in getattr(runner_service, "_runs", {}).values():
                    if run.created_at and run.created_at.startswith(today_prefix):
                        m = getattr(run, "model", None) or current_model
                        runs_today[m] = runs_today.get(m, 0) + 1
            except Exception:
                pass

        result_items: list[ModelQuotaInfo] = []
        now_ts = time.time()

        for mid in known_keys:
            spec = KNOWN_QUOTAS[mid]
            daily_limit = spec["daily_limit"]
            used = runs_today.get(mid, 0)

            # Check if recorded as exhausted
            ex_info = exhaustion_data.get(mid)
            is_exhausted = False
            retry_text: str | None = None
            if ex_info and isinstance(ex_info, dict):
                resume_ts = ex_info.get("resume_timestamp", 0)
                if now_ts < resume_ts:
                    is_exhausted = True
                    rem_secs = int(resume_ts - now_ts)
                    hrs = rem_secs // 3600
                    mins = (rem_secs % 3600) // 60
                    retry_text = f"Reset sau {hrs}h {mins}p" if hrs > 0 else f"Reset sau {mins} phút"

            if is_exhausted:
                rem = 0
                status: Literal["active", "exhausted", "low"] = "exhausted"
            else:
                rem = max(0, daily_limit - used)
                status = "low" if rem <= 5 else "active"

            result_items.append(
                ModelQuotaInfo(
                    id=mid,
                    display_name=spec["display_name"],
                    description=spec["description"],
                    category=spec["category"],
                    daily_limit=daily_limit,
                    used_today=used,
                    remaining_today=rem,
                    rpm_limit=spec["rpm_limit"],
                    status=status,
                    is_current=(mid == current_model),
                    retry_after=retry_text,
                    input_token_limit=spec.get("input_token_limit", 1048576),
                    output_token_limit=spec.get("output_token_limit", 65536),
                )
            )

        # Sort: current first, active flash next, pro next, exhausted last
        def sort_key(item: ModelQuotaInfo) -> tuple[int, int, str]:
            c_rank = 0 if item.is_current else 1
            status_rank = 0 if item.status == "active" else 1 if item.status == "low" else 2
            cat_rank = 0 if item.category == "flash" else 1 if item.category == "pro" else 2
            return (c_rank, status_rank, cat_rank)

        result_items.sort(key=sort_key)

        return ModelListResponse(
            current_model=current_model,
            models=result_items,
        )
