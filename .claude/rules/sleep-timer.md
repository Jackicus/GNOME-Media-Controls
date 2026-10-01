---
paths:
  - "src/lib/app.js"
  - "src/lib/mpris.js"
---

# The sleep timer

- **Minutes** (`SLEEP_MINUTES`): 15–120, then the end of the file (counted as
  one episode), then off. **Episodes** (`sleep-timer-mode` `episodes`,
  `SLEEP_EPISODES`): 1–5 files, this one counted. Each press of the button or
  the `sleep-timer` action moves to the next step.
- **It pauses, and leaves it at that**: the pause brings the bar up and keeps
  it there, and GNOME's own screen blank follows once the player stops holding
  it off.
- **The last file counted pauses half a second before its end**
  (`SLEEP_END_MARGIN`), so a player set to exit at the end stays open.
- **A new `url` counts one if the file before was left within 30 s of its end**
  (`SLEEP_WATCHED_MARGIN`, `Player.lastFile`); one skipped with Next or
  Previous is not. Should the end be missed (a player running ahead of the
  reckoning), the next file pauses as it begins.
- **Episodes need a url and a length**, so a stream gets none, nor the minutes'
  end-of-file step.
- **The timer belongs to the player it was set on**: it survives a moment's
  change of focus, shows on that player's bar alone, and one set on another
  player replaces it. It goes when its player leaves the bus.
