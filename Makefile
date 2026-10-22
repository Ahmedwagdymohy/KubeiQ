.PHONY: check check-backend check-frontend fmt up down

check: check-backend check-frontend ## Run every check CI runs

check-backend:
	cd backend && uv run ruff format --check . && uv run ruff check . && uv run mypy src && uv run pytest -q

check-frontend:
	cd frontend && pnpm lint && pnpm build

fmt: ## Auto-format backend code
	cd backend && uv run ruff format . && uv run ruff check --fix .

up:
	docker compose up --build -d

down:
	docker compose down
