---
description: Apply src/ edits to Media Controls in the nested shell and check for errors
allowed-tools: Bash(./scripts/nested.sh status), Bash(./scripts/nested.sh start:*), Bash(./scripts/nested.sh reload), Bash(./scripts/nested.sh logs:*), Bash(./scripts/nested.sh mirror:*), Bash(./scripts/nested.sh stop)
---

Apply the current `src/` edits to Media Controls in this repository's **nested
shell**, then confirm they took. Never the user's own session: `make reload` and
`./scripts/dev.sh reload` disable and enable the extension on the real desktop,
which is the user's to do.

1. `./scripts/nested.sh status`. **Not running:** `./scripts/nested.sh start`. A
   fresh start loads the current `src/`, so Media Controls is ACTIVE with the
   edits when it returns; skip step 2. Its settings are its own either way
   (`settings:` names where), so a reload never touches the user's.
2. `./scripts/nested.sh reload`. It recompiles the schema (under `--stand-in`,
   copies `src/` again first) and waits for ACTIVE.
3. `./scripts/nested.sh logs 40` and report whether it came up clean. A healthy
   reload ends with `[Media Controls] Enabled from
   /run/user/1000/media-controls/shell-<pid>/lib-<stamp>` (a new stamp when
   `lib/` changed), and `[Media Controls] Attached to <player> (pid N)` once a
   fullscreen player has focus. Anything with `Failed to load`, `Error during
   disable`, `already registered`, or a JS stack trace under a `[Media
   Controls]` line is a real failure: quote it and say which file it points at.

How to see it: the mirror window on the desktop shows the nested shell live
(`./scripts/nested.sh mirror on` if `status` says it is closed); the bar shows
only over a fullscreen player, so `/preview` (or the `drive-extension` skill:
`player`, two `move`s, a `shot`) brings it up and screenshots it. Leave the
nested shell running for that, and stop it (`./scripts/nested.sh stop`) when the
work is done.

A reload re-imports `lib/` only. An edit to `scripts/dev-extension.js`,
`metadata.json` or the schema's keys needs `./scripts/nested.sh stop` then
`start`, not a reload, and no logout: only the real session needs one, and that
is the user's to do.
