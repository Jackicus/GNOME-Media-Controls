---
description: Report the nested shell's state, the install mode, and the players and controllers the extension can see
allowed-tools: Bash(make status), Bash(./scripts/dev.sh status), Bash(./scripts/nested.sh status), Bash(./scripts/nested.sh run ./scripts/dev.sh devices)
---

Run `./scripts/nested.sh status` and `./scripts/dev.sh status`; if a nested shell
is running, also `./scripts/nested.sh run ./scripts/dev.sh devices`. Report in
two parts.

**Nested shell** (where changes are tried):

- **nested** — running or not, its pid, size and idle timeout. Not running is
  normal between tasks; `strays` means a previous one left processes, which
  `./scripts/nested.sh stop` sweeps.
- **extension** — `ACTIVE` is healthy; `ERROR` means `enable()` threw
  (`/logs`); anything else after a `reload`, see `/logs` too.
- **settings** — always its own, never the user's dconf: `kept between starts`
  (a plain `start`; `start --clean` resets them) or `fresh for this run`
  (`--stand-in`). VLC's vlcrc is in the same directory.
- **data** — `your own` or `stand-in` (a scratch HOME, for screenshots).
- **mirror** — open on the desktop, or closed (`./scripts/nested.sh mirror on`).
- **players / controllers** (from `devices` under `run`) — the MPRIS players
  on the nested bus (`./scripts/nested.sh player` starts VLC there) and the pads
  libmanette sees (`NO MAPPING` means its buttons may not match the positions in
  the preferences).

**Real session (read-only)**, from `./scripts/dev.sh status`, which only reads:

- **install** — `link` means dev mode: the nested shell, and the real one at its
  next login, run `src/` through `scripts/dev-extension.js`; `made before
  dev-extension.json` or `old-style symlink` needs `make link` again (the user's
  to run: it is their session's install); `copy` is a real install that won't
  pick up edits until `make install` is re-run. The nested shell reads the same
  install, except under `--stand-in`, which runs a copy of `src/`.
- **state** — the extension's state in the user's own shell. It says nothing
  about the edits in progress, and is never fixed by reloading or enabling
  there: that is the user's to do.
- **pads** — whether libmanette is installed; without it the bar works but game
  controllers do not.

If anything is off, say which command fixes it.
