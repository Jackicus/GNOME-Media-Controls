# To do

## Tomorrow: testing

- [ ] Log out and back in, so the session runs the new version
- [ ] VLC, for real:
  - [ ] Bar at the top, and "Near the bar" reveal
  - [ ] Hiding buttons; Previous/Next "Only with a playlist" with one file and with several
  - [ ] Sleep timer by episodes, over a few real episodes (and pressing Next partway)
  - [ ] Clicking the time to switch to the length
- [ ] A real controller: hold the d-pad to keep skipping; Start, then hold to move around the bar
- [ ] Other players (install them first):
  - [ ] Showtime (GNOME's own video player)
  - [ ] mpv, with mpv-mpris and `--no-osc`
  - [ ] Celluloid
  - For each: the bar shows over it full screen, and play, seek, volume, speed,
    Previous/Next, the sleep timer and the time switch work
- [ ] Note anything that breaks, and fix only that

## After that

- [ ] Try GNOME 48 and 49 (Fedora 42 and 43 in a VM); if all good, add them to
      `shell-version` in `src/metadata.json`
- [ ] Maybe: High Contrast and theme colours (`docs/proposal.md`)
- [ ] Publish on extensions.gnome.org (`docs/publishing.md`)
