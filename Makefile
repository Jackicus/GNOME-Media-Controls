# Thin front door; all logic lives in scripts/: dev.sh for the extension
# itself, nested.sh for the throwaway shell the visual checks run in.
DEV := ./scripts/dev.sh
NESTED := ./scripts/nested.sh

.PHONY: all link install reload logs pack devices uninstall status stalls clean help lint check schema demo-clip \
        nested nested-headless nested-stop nested-status preview

all: install

link install reload logs pack devices uninstall status stalls clean schema:
	@$(DEV) $@

# The film the README screenshots are taken over (docs/media/, not in git).
demo-clip:
	@./scripts/demo-clip.sh

# gjs.guide's ESLint rules over the GJS code (eslint.config.mjs).
lint: node_modules
	@npx --no-install eslint .

# Everything that needs no GNOME Shell, and what CI runs (.github/workflows/ci.yml):
# ESLint, and the schema as an install compiles it.
check: lint schema

# The versions package-lock.json names, as CI installs them.
node_modules: package.json package-lock.json
	npm ci --no-audit --no-fund
	@touch $@

# Nested shell -- a throwaway second GNOME Shell for visual testing. Opens a live
# mirror window on the desktop so you can watch; nested-headless skips that.
nested:
	@$(NESTED) start

nested-headless:
	@$(NESTED) start --headless

nested-stop:
	@$(NESTED) stop

nested-status:
	@$(NESTED) status

preview:
	@$(NESTED) preview

help:
	@$(DEV) help
	@echo
	@$(NESTED) help
