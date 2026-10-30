.PHONY: check check-backend check-frontend check-website check-agent fmt sync-connect up down

check: check-backend check-frontend check-website check-agent ## Run every check CI runs

check-backend:
	cd backend && uv run ruff format --check . && uv run ruff check . && uv run mypy src && uv run pytest -q

check-frontend:
	cd frontend && pnpm lint && pnpm build

check-website:
	cd website && pnpm lint && pnpm build

check-agent: ## The Go agent (skipped without Go; CI always runs it)
	@if command -v go >/dev/null; then \
		cd agent && test -z "$$(gofmt -l .)" && go vet ./... && go test ./...; \
	else echo "Go is not installed: skipping the agent checks (CI runs them)"; fi

sync-connect: ## Copy deploy/connect.sh and deploy/rbac into the backend, which serves them
	cp deploy/connect.sh backend/src/kubeiq/connect/assets/connect.sh
	cp deploy/rbac/*.yaml backend/src/kubeiq/connect/assets/rbac/

fmt: ## Auto-format backend code
	cd backend && uv run ruff format . && uv run ruff check --fix .

up:
	docker compose up --build -d

down:
	docker compose down
