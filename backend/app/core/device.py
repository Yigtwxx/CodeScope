"""Hardware device selection for local embedding models.

Preference order is CUDA (NVIDIA) -> MPS (Apple Silicon) -> CPU, so the same
code runs unchanged on a Windows workstation and a MacBook.
"""

from __future__ import annotations

from functools import lru_cache

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_VALID_DEVICES = {"cuda", "mps", "cpu"}


@lru_cache(maxsize=1)
def resolve_device() -> str:
    """Return the torch device string to run embeddings on.

    Honours ``EMBEDDING_DEVICE`` when it names an explicit device, otherwise
    auto-detects. Falls back to CPU whenever torch is missing or the requested
    accelerator is unavailable.
    """
    configured = settings.EMBEDDING_DEVICE.strip().lower()

    try:
        import torch
    except ImportError:  # pragma: no cover - torch ships with sentence-transformers
        logger.warning("torch is not installed; falling back to CPU embeddings")
        return "cpu"

    available = _available_devices(torch)

    if configured in _VALID_DEVICES:
        if configured in available:
            return configured
        logger.warning(
            "EMBEDDING_DEVICE=%s is not available on this machine; falling back",
            configured,
        )
    elif configured not in ("", "auto"):
        logger.warning("Unknown EMBEDDING_DEVICE=%r; using auto-detection", configured)

    for candidate in ("cuda", "mps", "cpu"):
        if candidate in available:
            logger.info("Selected embedding device: %s", candidate)
            return candidate

    return "cpu"


def _available_devices(torch_module: object) -> set[str]:
    """Probe torch for usable accelerators, tolerating partial builds."""
    devices = {"cpu"}

    try:
        if torch_module.cuda.is_available():  # type: ignore[attr-defined]
            devices.add("cuda")
    except Exception:  # pragma: no cover - depends on driver state
        pass

    try:
        backends = torch_module.backends  # type: ignore[attr-defined]
        if backends.mps.is_available() and backends.mps.is_built():
            devices.add("mps")
    except Exception:  # pragma: no cover - non-Apple platforms
        pass

    return devices
