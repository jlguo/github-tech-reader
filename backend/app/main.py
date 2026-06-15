from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings
from app.core.database import init_db
from app.api import repos, reading, agents


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


@app.get("/api/health")
async def health():
    return {"status": "ok"}
