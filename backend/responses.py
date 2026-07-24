"""Custom FastAPI response classes powered by orjson."""

from __future__ import annotations

from typing import Any

from fastapi.responses import JSONResponse

from backend.jsonio import dumps


class ORJSONResponse(JSONResponse):
    """Faster JSONResponse that uses orjson when available.

    Falls back to stdlib json (via ``backend.jsonio.dumps``) if orjson is not
    installed, so it's safe to use on any deployment.
    """

    media_type = "application/json"

    def render(self, content: Any) -> bytes:  # type: ignore[override]
        return dumps(content)
