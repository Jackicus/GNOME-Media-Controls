---
paths:
  - "src/lib/vlcremote.js"
  - "src/lib/vlcconfig.js"
  - "src/lib/tracksmenu.js"
  - "scripts/vlc-setup.js"
---

# VLC: its remote-control socket, its settings file, the tracks pop-out

MPRIS has no audio or subtitle tracks, no subtitle timing and no chapters, so
those come from VLC's C remote-control interface (`oldrc`) on a Unix socket at
`$XDG_RUNTIME_DIR/media-controls-vlc.sock`: one path, since a settings file
cannot name one per instance. `vlcconfig.js` turns it on in VLC's own settings
file when the user flips the Players page's switch.

- **`hide-vlc-controls`** (`qt-fs-controller` under `[qt]`) is applied by
  `app.js` **only while the extension is on**: off at enable, back on at
  disable, except at a lock, which the unlock's enable would only undo. With
  the setting off the file is never touched, so VLC's own choice stands. The
  shell does not disable on logout, shutdown or a crash, so a session that ends
  with the setting on leaves VLC's controls off until the next enable.
- **`VlcRemote` keeps a connection only if** the socket's peer credentials are
  the attached VLC's pid and VLC then **answers** a harmless `atrack`: it
  serves one client at a time, and a second connection is accepted by the
  kernel and never read. With no socket, another VLC holding it, or any other
  player, the bar has no tracks button.
- **The pop-out** (`TracksMenu`): audio and subtitles as radio lists that stay
  open as they are picked, a Timing row (− / value / + / ↺ in 0.1 s steps,
  VLC's `key-subdelay-*` hotkeys at 50 ms each, the value tracked here since
  VLC cannot be asked it, reset on each new input), and a chapter row when the
  file has chapters.

## VLC's traps

- **The module is `oldrc`.** `--extraintf rc` loads VLC 3's *Lua* CLI, which
  cannot listen on a Unix socket and ignores `--rc-unix`.
- **`oldrc` will not start without a terminal** ("fd 0 is not a TTY"), socket
  or not, unless `rc-fake-tty` is set.
- **vlcrc options are read only under their module's section**: `rc-fake-tty`
  anywhere but under `[oldrc]` is ignored. `vlcconfig.js` uncomments the line
  VLC wrote in the right section, or adds it under its header.
- **VLC drops the last character of every line of vlcrc as its newline**, the
  last line's too, so a file that does not end in one loses a letter (the
  socket came up as `…vlc.soc`).
- **A Unix socket path is at most 107 bytes**, so it lives straight in
  `$XDG_RUNTIME_DIR`, which is also private (0700).
- **While paused, VLC answers almost everything with "Press pause to
  continue."**, listing and setting tracks and chapters included, but still
  takes `key` hotkeys. `VlcRemote` keeps the lists it read while playing (read
  on connect and whenever the bar comes up playing), shows those paused, and
  picks a track paused by pressing `key-audio-track`/`key-subtitle-track` as
  many times as it takes: VLC cycles in the order it lists them, audio
  skipping Disable, subtitles through Off. Chapters use
  `key-chapter-next/prev`.
- **One client at a time**, and a dropped connection is only noticed when VLC
  next reads. So the connection is checked with `atrack` before it is trusted,
  one unanswered attempt is retried a second later (a reload, a shell
  restart), and `app.js` `_dropRemote` closes before anything else. Replies
  are matched to commands by verb, so a reply that has not come in 2 s ends
  the connection rather than being taken for the next command's; the bar
  reconnects the next time it comes up.
- **Two writes at once on a GIO stream fail** ("Stream has outstanding
  operation"), and two hotkey presses come at once: `VlcRemote` queues its
  lines.
- **A subtitle that already started is not drawn after a track switch**; the
  next one is. Not a failed switch.
- **Subtitles are drawn along the foot of the picture, under the bar** (unless
  `bar-position` is `top`, which is what that setting is for). Hence the
  subtitle actions leaving the bar down.
