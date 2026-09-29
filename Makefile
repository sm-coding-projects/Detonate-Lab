.DEFAULT_GOAL := help
COMPOSE := docker compose

.PHONY: help init up down logs ps build rebuild test backend-test frontend-build apparmor-load apparmor-unload validate sandbox-build up-sandbox up-detone nginx-test backup restore clean nuke

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# ---- Bootstrap ---------------------------------------------------------------
init: ## Generate .env with strong secrets, htpasswd, and TLS material
	@./scripts/init-env.sh

apparmor-load: ## Load the AppArmor profiles into the host kernel
	@./apparmor/parser.sh

apparmor-unload: ## Unload the AppArmor profiles
	@for p in api web sandbox runner; do \
		if [ -f apparmor/$$p ] && command -v apparmor_parser >/dev/null 2>&1; then \
			apparmor_parser -R apparmor/$$p 2>/dev/null && echo "removed detonate-$$p" || true; \
		fi; \
	done

# ---- Lifecycle ---------------------------------------------------------------
up: ## Build and start the full stack
	$(COMPOSE) up -d --build
	@echo "Detonate Lab → http://localhost:$${WEB_PORT:-8080}"

up-detone: up ## Alias for `up` — starts the app + optional BasicAuth/TLS

down: ## Stop the stack
	$(COMPOSE) down

logs: ## Tail logs from all services
	$(COMPOSE) logs -f

ps: ## Show service status
	$(COMPOSE) ps

build: ## Build images
	$(COMPOSE) build

rebuild: ## Rebuild images without cache
	$(COMPOSE) build --no-cache

# ---- Real detonation sandbox -------------------------------------------------
# The default `up` target starts only the API + DB + web tier. Detonation
# happens through the simulated connector by default. To run real malware
# in an isolated sandbox, use `make up-sandbox` which brings up the
# sandbox-runner + INetSim services under the `sandbox` profile.

sandbox-build: ## Build the sandbox-runner image (DinD + INetSim + strace)
	$(COMPOSE) --profile sandbox build sandbox-runner

up-sandbox: up sandbox-build ## Start the app stack + the sandbox runner
	$(COMPOSE) --profile sandbox up -d
	@echo "Sandbox runner → http://localhost:$${SANDBOX_RUNNER_PORT:-8090}"

sandbox-test: ## Run the sandbox smoke tests (no docker required)
	cd sandbox && python3 -m unittest tests.test_smoke -v

sandbox-e2e: up-sandbox ## End-to-end test of api + sandbox-runner (slow, requires docker)
	./scripts/test-sandbox-e2e.sh

# ---- Validation --------------------------------------------------------------
test: backend-test frontend-build nginx-test ## Full CI gate (typecheck + build + nginx render test)

backend-test: ## Typecheck the backend (tsc --noEmit)
	cd backend && npm install --no-audit --no-fund && npm run typecheck

frontend-build: ## Typecheck and build the frontend bundle
	cd frontend && npm install --no-audit --no-fund && npm run build

nginx-test: ## Render the web tier's nginx config in all 4 BASIC_AUTH × TLS combinations and validate with `nginx -t`
	@./scripts/test-nginx-render.sh

validate: nginx-test ## Validate all static artefacts (nginx, apparmor, compose)
	@./scripts/test-nginx-render.sh
	@command -v apparmor_parser >/dev/null 2>&1 && for f in apparmor/api apparmor/web apparmor/sandbox apparmor/runner; do \
		[ -f "$$f" ] || continue; \
		apparmor_parser -p "$$f" >/dev/null && echo "parsed $$f" || { echo "FAIL $$f"; exit 1; }; \
	done || echo "apparmor_parser not installed — skipping profile parse"
	@$(COMPOSE) config --quiet && echo "compose config OK"

# ---- Backup / restore -------------------------------------------------------
backup: ## Snapshot db + secrets + uploads to ./backups/detonate-lab-TS.tar.gz
	@./scripts/backup.sh ./backups

restore: ## Restore from a backup file (DESTRUCTIVE)
	@./scripts/restore.sh

# ---- Cleanup -----------------------------------------------------------------
clean: ## Stop and remove containers + networks (keep volumes)
	$(COMPOSE) down --remove-orphans

nuke: ## Remove containers, networks, AND volumes (destroys data)
	$(COMPOSE) down -v --remove-orphans
	@echo "NOTE: secrets/ was preserved. Run 'rm -rf secrets' to delete secrets too."