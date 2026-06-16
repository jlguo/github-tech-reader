from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings
from app.core.database import init_db
from app.api import repos, reading, agents, books


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(repos.router, prefix="/api/repos", tags=["repos"])
app.include_router(reading.router, prefix="/api/reading", tags=["reading"])
app.include_router(agents.router, prefix="/api/agents", tags=["agents"])
app.include_router(books.router, prefix="/api", tags=["books"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}


import os
from fastapi.responses import FileResponse

_static_dir = os.path.join(os.path.dirname(__file__), "..", "static")


@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    if not os.path.isdir(_static_dir):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Not Found")

    file_path = os.path.join(_static_dir, full_path)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    return FileResponse(os.path.join(_static_dir, "index.html"))
