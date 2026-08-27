.DEFAULT_GOAL := help
COMPOSE := docker compose

.PHONY: help init up down logs ps build rebuild test backend-test frontend-build clean nuke

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

init: ## Generate .env with strong secrets and a bootstrap admin
	@./scripts/init-env.sh

up: ## Build and start the full stack
	$(COMPOSE) up -d --build
	@echo "Detonate Lab → http://localhost:$${WEB_PORT:-8080}"

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

test: backend-test frontend-build ## Typecheck the backend and build the frontend

backend-test: ## Typecheck the backend (tsc --noEmit)
	cd backend && npm install --no-audit --no-fund && npm run typecheck

frontend-build: ## Typecheck and build the frontend bundle
	cd frontend && npm install --no-audit --no-fund && npm run build

clean: ## Stop and remove containers + networks (keep volumes)
	$(COMPOSE) down --remove-orphans

nuke: ## Remove containers, networks, AND volumes (destroys data)
	$(COMPOSE) down -v --remove-orphans
