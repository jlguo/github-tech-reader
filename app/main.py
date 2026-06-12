from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.config import settings
from app.job_store import init_db
from app.routes.api import router as api_router
from app.routes.web import router as web_router

logger = logging.getLogger(__name__)

APP_DIR = Path(__file__).resolve().parent


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Startup / shutdown lifecycle for the FastAPI application."""
    await init_db()
    logger.info("GitHub Tech Reader server ready on %s:%d", settings.HOST, settings.PORT)
    yield


app = FastAPI(
    title="GitHub Tech Reader",
    description="Local-only GitHub repo iteration & tech evolution analyzer — web interface",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files
app.mount("/static", StaticFiles(directory=str(APP_DIR / "static")), name="static")

reports_dir = Path(settings.OUTPUT_DIR)
reports_dir.mkdir(parents=True, exist_ok=True)
app.mount("/reports", StaticFiles(directory=str(reports_dir), html=True), name="reports")

# Jinja2 templates
templates = Jinja2Templates(directory=str(APP_DIR / "templates"))
app.state.templates = templates

# Routers
app.include_router(web_router)
app.include_router(api_router)


# ---------------------------------------------------------------------------
# Exception handlers
# ---------------------------------------------------------------------------


@app.exception_handler(404)
async def not_found_handler(request: Request, _exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": "Not found"})


@app.exception_handler(500)
async def internal_error_handler(request: Request, _exc: Exception) -> JSONResponse:
    logger.exception("Internal server error on %s %s", request.method, request.url)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


# ---------------------------------------------------------------------------
# Direct-run entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
        log_level="info",
    )
