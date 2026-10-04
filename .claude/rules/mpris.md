---
paths:
  - "src/lib/mpris.js"
---

# MPRIS: the players, their position, their playlists

- **Position is never polled.** MPRIS never announces where playback has got
  to, so `Player` keeps the last reading and the monotonic time it was taken,
  and `now` reckons forward from that at the current rate while playing. A
  reading is taken when the bar comes up from hidden (`refreshPosition`), when
  a player starts playing, when it moves to a new file, and whenever it
  announces `Seeked`.
- **A reading from before a seek of ours is dropped**: for a second
  (`SEEK_SETTLE`) after one, a reading nearer where it jumped from than where
  it went is stale (`Player.reading`). VLC announces each seek twice, the
  second `Seeked` ~150 ms after the first; in a run of seeks (a held pad
  button, a fast scroll) that second one arrives after the next seek has gone,
  and taken as read it pulled the position back and wasted every other seek.
- **A seek made while VLC is paused is not announced at all.** Ours are
  reckoned here; one from VLC's own keys shows only once it plays again.
- **Seeks** use `SetPosition(trackid, µs)` where the player names its track as
  an object path, relative `Seek` where it does not.
- **Nothing blocks a player**: every call is asynchronous with a 5 s timeout
  (`CALL_TIMEOUT`) and a cancellable that `disable()` cancels. Players are
  found with `NameOwnerChanged` (arg0 namespace `org.mpris.MediaPlayer2`) plus
  one `ListNames` at enable, and followed with `PropertiesChanged` and
  `Seeked`. One `Player` per unique bus name, however many well-known names it
  holds (VLC takes a second per instance).
- **A player's `CanGoNext` says nothing about a playlist**: VLC says true with a
  single file open (certainly under `--loop`, which the nested `player` passes);
  mpv (mpv-mpris 1.2), Celluloid and Showtime say false, Showtime always. `hasPlaylist` counts the `TrackList`'s `Tracks` instead,
  which VLC serves (and announces, as invalidated) although its `HasTrackList`
  says false; a player that keeps no list falls back on `CanGo*`. VLC's list
  is what it started playing with: **empty until playback begins**, announced
  only as it was made, and a file added while it plays is announced but not
  listed, so `Tracks` is read again whenever the bar comes up from hidden
  (`refreshTrackList`).
- **A player may hold the rate to steps of its own.** Showtime has no 0.75 and
  rounds a request for it to 1.0, without announcing anything. `setRate`
  therefore reads `Rate` back after the `Set`; when the player kept another
  value the bar shows that one and `refusedRates` keeps the step out of
  `stepRate`, so "Slower" from 1× reaches 0.5×.
- **Several windows of one app each have a player** (Celluloid: one process,
  one bus name per window, `…Celluloid.instance-N`). `_playerFor` takes the
  player whose `xesam:title` the window's title shows, else the first. For a
  sandboxed player `Player.pid` is xdg-dbus-proxy's and never equals the
  window's, so it is matched by desktop entry.
- **Showtime freezes on MPRIS `Quit`** (the bar's close button) in the nested
  shell, and its own ✕ closes the window but leaves the process; the cause is
  its shutdown here, not the call. `window.delete` instead would leave a
  `cvlc` playing, so `Quit` stays.
- **Seen over the three players (Flatpak, Shell 50, nested):** the bar attaches
  over mpv 0.41, Celluloid 0.30 and Showtime 50.0 in fullscreen, and play and
  pause, seek, volume, speed and skip work from it. Each draws its own controls
  beside the bar when the pointer moves (mpv's `--no-osc` removes mpv's;
  Celluloid's and Showtime's cannot be turned off from outside).
