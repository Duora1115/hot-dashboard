"""Fast JSON I/O helpers.

Uses orjson when available (5-10x faster than stdlib for large payloads),
falls back to stdlib json when orjson is not installed on the target box.

All helpers return the same types as stdlib json to keep call sites simple.
"""

from __future__ import annotations

import json as _stdjson
import os
import tempfile
from pathlib import Path
from typing import Any

try:
    import orjson as _orjson  # type: ignore
    _HAS_ORJSON = True
except ImportError:  # pragma: no cover
    _orjson = None
    _HAS_ORJSON = False


_ORJSON_DUMPS_OPTS = 0
if _HAS_ORJSON:
    _ORJSON_DUMPS_OPTS = (
        _orjson.OPT_NON_STR_KEYS  # tolerate int keys
        | _orjson.OPT_SERIALIZE_NUMPY
    )


def loads(data: str | bytes) -> Any:
    if _HAS_ORJSON:
        if isinstance(data, str):
            data = data.encode("utf-8")
        return _orjson.loads(data)
    if isinstance(data, bytes):
        data = data.decode("utf-8")
    return _stdjson.loads(data)


def load_path(path: str | Path) -> Any:
    """Read a JSON file. Uses rb + orjson when available."""
    p = Path(path)
    if _HAS_ORJSON:
        return _orjson.loads(p.read_bytes())
    with open(p, encoding="utf-8") as f:
        return _stdjson.load(f)


def dumps(obj: Any, *, indent: bool = False) -> bytes:
    """Serialize to bytes. orjson is roughly 3-8x faster than stdlib.

    Pass ``indent=True`` for human-readable output (used for on-disk files).
    """
    if _HAS_ORJSON:
        opts = _ORJSON_DUMPS_OPTS
        if indent:
            opts |= _orjson.OPT_INDENT_2
        try:
            return _orjson.dumps(obj, option=opts)
        except TypeError:
            # orjson refuses unknown types; fall back to stdlib with default=str
            return _stdjson.dumps(
                obj, ensure_ascii=False, indent=2 if indent else None, default=str
            ).encode("utf-8")
    return _stdjson.dumps(
        obj, ensure_ascii=False, indent=2 if indent else None, default=str
    ).encode("utf-8")


def dump_path(obj: Any, path: str | Path, *, indent: bool = False) -> None:
    """Write JSON to disk atomically.

    Writes to a temp file in the same directory, fsyncs, then os.replace()s it
    over the target. Readers never observe a half-written JSON file.
    """
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    payload = dumps(obj, indent=indent)

    fd, tmp = tempfile.mkstemp(dir=str(p.parent), prefix=p.name + ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(payload)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, p)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


HAS_ORJSON = _HAS_ORJSON
