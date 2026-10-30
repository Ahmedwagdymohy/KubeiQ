"""FastAPI application factory."""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from kubeiq import __version__
from kubeiq.api import health
from kubeiq.api.v1.router import router as v1_router
from kubeiq.auth.master import master_key
from kubeiq.core.config import Settings, get_settings
from kubeiq.core.logging import setup_logging
from kubeiq.db.migrate import upgrade_database
from kubeiq.db.session import get_sessionmaker
from kubeiq.investigations import repository
from kubeiq.investigations.runner import get_runner
from kubeiq.settings.service import (
    refresh_gke_forever,
    sync_gke,
    sync_token_clusters,
    sync_uploaded_clusters,
)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    setup_logging(settings.log_level, settings.log_json)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        logger.info("KubeiQ {} starting (env={})", __version__, settings.env)
        await upgrade_database()
        master_key()  # created and announced on first start
        async with get_sessionmaker()() as session:
            interrupted = await repository.fail_interrupted(session)
            await sync_uploaded_clusters(session)
            await sync_gke(session)
            await sync_token_clusters(session)
        if interrupted:
            logger.warning("Marked {} interrupted investigation(s) as failed", interrupted)
        gke_refresh = asyncio.create_task(refresh_gke_forever())
        yield
        logger.info("KubeiQ shutting down")
        gke_refresh.cancel()
        await get_runner().shutdown()

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
