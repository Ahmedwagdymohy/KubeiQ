"""Apply database migrations at startup."""

from alembic import command
from alembic.config import Config
from loguru import logger
from sqlalchemy.engine import Connection

from kubeiq.db.session import get_engine


def alembic_config(url: str) -> Config:
    config = Config()
    config.set_main_option("script_location", "kubeiq.db:migrations")
    config.set_main_option("sqlalchemy.url", url)
    return config


async def upgrade_database() -> None:
    engine = get_engine()

    def run(connection: Connection) -> None:
        config = alembic_config(str(engine.url))
        config.attributes["connection"] = connection
        command.upgrade(config, "head")

    async with engine.begin() as connection:
        await connection.run_sync(run)
    logger.info("Database schema is up to date ({})", engine.url.get_backend_name())
