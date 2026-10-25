# syntax=docker/dockerfile:1
FROM python:3.12-slim AS builder
COPY --from=ghcr.io/astral-sh/uv:0.11.21 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN uv sync --frozen --no-dev

FROM python:3.12-slim
# The home folder is readable by everyone: docker-compose.yml runs the API as the installing
# user (any uid) and mounts the kubeconfig under it.
RUN useradd --create-home --uid 10001 kubeiq && chmod 755 /home/kubeiq \
    && mkdir /data && chown kubeiq:kubeiq /data
WORKDIR /app
COPY --from=builder --chown=kubeiq:kubeiq /app /app
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1 \
    KUBEIQ_DATABASE_URL=sqlite+aiosqlite:////data/kubeiq.db \
    KUBEIQ_DATA_DIR=/data
VOLUME ["/data"]
USER kubeiq
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/readyz')"
# Behind the proxy: trust X-Forwarded-* so cookies are marked Secure over HTTPS. The API port is
# not published by docker-compose.yml, so only the proxy can reach it.
CMD ["uvicorn", "kubeiq.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
