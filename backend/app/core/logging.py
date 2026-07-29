"""Centralised logging setup.

The application previously used bare ``print`` calls, which made output
impossible to filter and broke on non-UTF-8 Windows consoles. Everything now
goes through the standard library ``logging`` module.
"""

from __future__ import annotations

import contextlib
import logging
import sys

_CONFIGURED = False

_LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
_DATE_FORMAT = "%H:%M:%S"


def configure_logging(level: str = "INFO") -> None:
    """Configure root logging once, with a UTF-8 safe stream handler."""
    global _CONFIGURED
    if _CONFIGURED:
        return

    # Windows consoles default to cp1252 and raise on the emoji used in
    # progress output. Reconfiguring is a no-op on POSIX terminals.
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            # Fails on some redirected streams; the default encoding still works.
            with contextlib.suppress(ValueError, OSError):
                reconfigure(encoding="utf-8", errors="replace")

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(_LOG_FORMAT, datefmt=_DATE_FORMAT))

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level.upper())

    # These libraries are extremely chatty at INFO level.
    for noisy in ("httpx", "httpcore", "chromadb", "sentence_transformers", "urllib3"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    """Return a module-scoped logger."""
    return logging.getLogger(name)
