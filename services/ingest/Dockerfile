# Build a partir de services/ingest:
#   docker build -t vida-publica-ingest services/ingest
FROM python:3.13-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.13 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN uv sync --frozen --no-dev

FROM python:3.13-slim AS runtime
RUN useradd --create-home --uid 10001 ingest
WORKDIR /app
COPY --from=build --chown=ingest:ingest /app /app
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1
USER ingest
ENTRYPOINT ["vp-ingest"]
CMD ["--help"]
