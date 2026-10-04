# To do

What is left is what needs your hardware, your machines or your call. The rest
is done and was seen in the nested shell; open issues hold the rest.

## Test for real

- [ ] Log out and back in, so the session runs the current version
- [ ] VLC on the desktop: bar at the top, "Near the bar" reveal, hiding buttons,
      Previous/Next "Only with a playlist", sleep timer by episodes, the time
      switch, and that VLC's own controls come back when the extension is off
- [ ] A real controller: hold the d-pad to keep skipping; Start, then hold to
      move around the bar
- [ ] A touchscreen, if you have one: tap the video, tap outside the bar
- [ ] Native (non-Flatpak) mpv, Celluloid and Showtime. Only their Flatpaks were
      run, in the nested shell
- [ ] On the real `~/.config/vlc/vlcrc`, delete `qt-fs-controller=0` if it is
      still there: an older version left it

## Machines

- [ ] Boot GNOME Shell 48 and 49 (Fedora 42 and 43 in a VM) and tick off the list
      in `docs/compatibility.md`; if all is well, add them to `shell-version`
      in `src/metadata.json`
- [ ] Remove the test Flatpaks if you do not want them:
      `flatpak --user uninstall io.mpv.Mpv io.github.celluloid_player.Celluloid org.gnome.Showtime`

## Your call

- [ ] The size budget: `src/` is over 3400 lines now (the mpv remote and its
      setup are about 190 of them). Raise it in `scripts/ext.conf` or ask for a
      simplify pass
- [ ] Open decisions: a paused bar that cannot be dismissed (#78), controlling a
      player on another monitor while focus is elsewhere (#77)
- [ ] Publish on extensions.gnome.org (`docs/publishing.md`)
