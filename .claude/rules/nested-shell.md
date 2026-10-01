---
paths:
  - "scripts/nested.sh"
  - "scripts/nested_driver.py"
---

# How this repository's nested shell keeps off the real session

What is generic (dconf sharing, `--clean`, `do`, `stop`) is the kit's
`live-session.md` and `gnome-ext:nested-shell`; this is how `nested.sh` does it.

- **`start --clean`**: its own profile (`DCONF_PROFILE`, handed to everything
  the nested bus activates, the prefs window included) has a writable
  `~/.config/dconf/media_controls_nested` over a read-only seed compiled at
  start from the real session's look; `stop` deletes the writable one.
- **The nested session's `XDG_CONFIG_HOME`** is a directory of links to the
  real one's entries (dconf included, so settings behave as before) except
  `vlc`, which is the throwaway directory `player` gives VLC: the nested
  extension's `hide-vlc-controls` and the nested preferences' switch reach the
  nested VLC, never `~/.config/vlc`. `player` also points VLC's
  `XDG_DATA_HOME` into the run directory (VLC keeps a recent-media list and its
  volume) and sets its vlcrc up with `scripts/vlc-setup.js` (the preferences'
  own code; `--plain` skips it).
- **The socket path is the real one** (`$XDG_RUNTIME_DIR` is shared), so a VLC
  on the real desktop that holds it leaves the nested one without a tracks
  button; `player` warns.
- **Not installed**, `start` links it with `dev.sh link --no-enable`, which
  leaves the real shell alone.
- **VLC in the headless shell** has no GPU for Xwayland: its GL outputs fail
  and it plays on with no window, so `player` passes `--vout=xcb_x11
  --avcodec-hw=none`. Its dummy audio output reports volume 0 and ignores a
  new one, so the generated clip carries *silent* tracks and plays through the
  real sound server (`--aout=pulse`); any other file gets `--no-audio`.
- **The nested X11 display needs its own cookie.** `start` records the display
  (from the listening socket the nested gnome-shell holds) and the
  `.mutter-Xwaylandauth.*` it wrote, `run`/`player` pass both, and `stop`
  deletes that cookie, since nothing else does.
