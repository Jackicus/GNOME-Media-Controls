---
description: Show what Media Controls logged in the nested shell (or, read-only, the real session's journal)
argument-hint: "[N lines of the nested shell's log, default 80; or a systemd time spec such as '5 min ago' for the real session's journal]"
allowed-tools: Bash(./scripts/nested.sh status), Bash(./scripts/nested.sh logs:*), Bash(./scripts/dev.sh logs:*)
---

Show what the extension has logged recently.

Requested: $ARGUMENTS

**The nested shell** is where changes are tried, so its log is the one to read.
If the request above is empty or a number, run `./scripts/nested.sh status`; if a
nested shell is running, `./scripts/nested.sh logs <N>` (80 when none was given;
add `--all` for the D-Bus and portal chatter the default filters out). If none is
running, say so: its log goes with it at `stop`, and a fresh one starts at
`start`.

**The real session's journal**, read-only, only when the request is a time spec
(`5 min ago`, `today`, `09:00`) or asks for the user's own desktop:
`./scripts/dev.sh logs "<window>"` (what `make logs SINCE='<window>'` runs; the
preferences window's lines included). Head the answer "real session
(read-only)": it is what Media Controls did on the user's desktop, not in the
nested shell.

Summarise rather than dump: how many enable/disable cycles (`Enabled from …`),
which players the bar attached to (`Attached to … (pid N)`), which controllers
came and went, and any errors or stack traces in full with the file they point
at. Only `[Media Controls]` lines are this extension's; other extensions' errors
at the nested shell's startup are not. Exceptions inside a GNOME extension only
ever surface in these logs, never in a terminal, so this is the place to look
when the bar silently never shows.
