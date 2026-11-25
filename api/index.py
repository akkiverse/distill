"""Vercel entry point: exposes the FastAPI app. All routes are under /api."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from distill.app import app

__all__ = ["app"]
