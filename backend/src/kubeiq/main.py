"""FastAPI application factory."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from kubeiq import __version__
from kubeiq.api import health
from kubeiq.api.v1.router import router as v1_router
from kubeiq.core.config import Settings, get_settings
from kubeiq.core.logging import setup_logging


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    setup_logging(settings.log_level, settings.log_json)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        logger.info("KubeiQ {} starting (env={})", __version__, settings.env)
        yield
        logger.info("KubeiQ shutting down")

    app = FastAPI(title="KubeiQ", version=__version__, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    app.include_router(v1_router)
    return app


app = create_app()
