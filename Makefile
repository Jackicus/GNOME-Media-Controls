# The kit's targets (link, install, reload, logs, pack, check, the nested
# shell, ...) are in scripts/kit.mk; what follows is Media Controls' own.
include scripts/kit.mk

.PHONY: devices stalls demo-clip

devices stalls:
	@$(DEV) $@

# The film the README screenshots are taken over (docs/media/, not in git).
demo-clip:
	@./scripts/demo-clip.sh
