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
from kubeiq.clusters.registry import get_registry
from kubeiq.core.config import Settings, get_settings
from kubeiq.core.logging import setup_logging
from kubeiq.db.migrate import upgrade_database
from kubeiq.db.session import get_sessionmaker
from kubeiq.investigations import repository
from kubeiq.investigations.runner import get_runner
from kubeiq.notifications import engine as alerts
from kubeiq.settings.service import (
    refresh_gke_forever,
    sync_gke,
    sync_token_clusters,
    sync_uploaded_clusters,
)
from kubeiq.tunnel import service as agents
from kubeiq.tunnel.hub import get_hub
from kubeiq.usage.history import sample_forever


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
            await agents.sync(session)
        await get_hub().start()
        if interrupted:
            logger.warning("Marked {} interrupted investigation(s) as failed", interrupted)
        tasks = [asyncio.create_task(refresh_gke_forever())]
        if settings.usage_sample_seconds > 0:
            tasks.append(
                asyncio.create_task(sample_forever(get_registry(), settings.usage_sample_seconds))
            )
        if settings.alert_seconds > 0:
            tasks.append(
                asyncio.create_task(alerts.run_forever(get_registry(), settings.alert_seconds))
            )
        yield
        logger.info("KubeiQ shutting down")
        for task in tasks:
            task.cancel()
        await get_hub().stop()
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
