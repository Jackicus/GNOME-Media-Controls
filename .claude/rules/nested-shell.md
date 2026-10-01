---
paths:
  - "scripts/nested.d/*.sh"
  - "scripts/ext.conf"
  - "scripts/vlc-setup.js"
  - "scripts/fakepad.py"
---

# VLC and the pad in this repository's nested shell

`./scripts/nested.sh` is the kit's (its own settings, the X11 display and its
cookie, `stop`'s sweep: `live-session.md` and `gnome-ext:nested-shell`). What is
Media Controls' own is in `./scripts/nested.d/media-controls.sh`: `player`,
`mpris`, `pad` and `preview`.

- **VLC's settings are the nested session's own.** `player` runs VLC under
  `nested_env`, whose `XDG_CONFIG_HOME` is `$(config_dir)` (kept under
  `~/.local/state/gnome-extensions-nested/media-controls/config`, or the
  stand-in's), so `$(config_dir)/vlc/vlcrc` is the file the nested extension
  applies `hide-vlc-controls` to and the nested preferences' switches write;
  `~/.config/vlc` is never touched. It sets that vlcrc up with
  `./scripts/vlc-setup.js` (the preferences' own `vlcconfig.js`; `--plain` skips
  it), and points VLC's `XDG_DATA_HOME` at `$RUN_DIR/vlc/data` (VLC keeps a
  recent-media list and its volume there), which `stop` removes.
- **The socket path is the real one** (`$XDG_RUNTIME_DIR` is shared), so a VLC
  on the real desktop that holds it leaves the nested one without a tracks
  button; `player` warns.
- **VLC in the headless shell** has no GPU for Xwayland: its GL outputs fail
  and it plays on with no window, so `player` passes `--vout=xcb_x11
  --avcodec-hw=none`. Its dummy audio output reports volume 0 and ignores a
  new one, so the generated clip (`dist/test-video.mkv`) carries *silent*
  tracks and plays through the real sound server (`--aout=pulse`); any other
  file gets `--no-audio`.
- **The virtual pad is a real kernel device** (`./scripts/fakepad.py`, uinput):
  the real session sees it while it is plugged in. `NESTED_STRAYS` names it, so
  `stop` sweeps one left behind.
