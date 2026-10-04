---
paths:
  - "src/lib/mpvremote.js"
  - "src/lib/lineremote.js"
  - "src/lib/mpvconfig.js"
---

# mpv and Celluloid: the JSON IPC socket

mpv (and Celluloid, which links libmpv) has the tracks, subtitle delay and
chapters MPRIS lacks, over its JSON IPC socket (`input-ipc-server`). `MpvRemote`
has the surface `VlcRemote` has, so `TracksMenu` and `app.js` do not know which
they hold; both share `LineRemote` (connect, peer check, one write at a time,
read a line).

- **The socket is found from the player's own process**, not from a path we
  choose: the listening Unix socket in `/proc/<pid>/fd` matched in
  `/proc/<pid>/net/unix` (flags `00010000`). It works for a flag, mpv.conf, a
  script or a Flatpak, all read from the host. A player with no socket gets no
  tracks button.
- **The pid is the window's** (`Meta.Window.get_pid()`), also for the peer
  check: a sandboxed player's bus connection is xdg-dbus-proxy's, so
  `Player.pid` is the wrong one.
- **A sandbox's runtime directory is its own**: a path `/run/user/<uid>/…` seen
  by a Flatpak is `$XDG_RUNTIME_DIR/.flatpak/<app-id>/xdg-run/…` on the host
  (`hostPath`, with `get_sandboxed_app_id()`). `/tmp` is shared as it is.
- **mpv answers while paused**, so nothing is cached; one `request_id` per
  request, events (`property-change` on `sub-delay`, `start-file`) interleaved.
  `sub-delay` is observed, so the Timing row shows what mpv has, VLC's keys or
  not. A decrement of `chapter` may restart the current chapter.
- **`chapter` is unavailable on a file with no chapters**: it is only asked when
  `chapter-list` is not empty.
- **The Players page's mpv switch** writes `media-controls.lua` into mpv's and
  Celluloid's `scripts/` folders (`~/.config/mpv`, `~/.config/celluloid` if it
  exists, and `~/.var/app/<id>/config/…` of an installed Flatpak that has run
  once) and removes it when turned off. The script sets `input-ipc-server` to
  `$XDG_RUNTIME_DIR/mc-mpv-<pid>-<random>.sock` unless the user set one, for each
  mpv core, since Celluloid runs several in one process. mpv reads it at start.
- **A Unix socket path is at most 107 bytes**, and a sandbox's folder is 70 of
  them on the host (`/run/user/1000/.flatpak/<app-id>/xdg-run/`), so the name is
  short: the first one, `media-controls-mpv-<pid>-<time>-<random>.sock`, failed
  to connect for Celluloid's long app id ("AF_UNIX path too long").
- **The IPC socket can run commands** (`run`), so it must stay in a private
  directory. Never an abstract socket: it has no permission check.
