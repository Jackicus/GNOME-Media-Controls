# Media Controls

Shared rules for every extension come from the GNOME-EXTENSIONS kit: `../CLAUDE.md` and `../.claude/rules/` (loaded with this file), and the `gnome-ext:*` skills. `.claude/kit.sh` pulls the kit at session start, or, with no kit beside this repository, fetches it and prints its rules into the session.

A GNOME Shell extension (UUID `media-controls@jackicus`) that draws a control bar
over a **fullscreen video player**: a replacement for VLC's own fullscreen
controller that works the same way over mpv, Celluloid or anything else that
speaks MPRIS, and that for VLC adds audio and subtitle tracks, subtitle timing
and chapters. It is a bar the shell draws over the player's window, not a
player. `metadata.json` claims shell 50, the version it has been run on, and
the code is written for 50 alone; another version is `gnome-ext:port-shell-version`'s.

It stands alone: it depends on no other extension and knows of none. If another
extension has trouble working beside it, that is fixed in that extension's own
project.

## Seeing it

The bar is drawn over a fullscreen window, so a change is verified only by
looking at it in the nested shell: `gnome-ext:nested-shell` for the loop, then
this repository's **`drive-extension` skill** for the bar's coordinates and its
own commands: `player` (VLC full screen on a test clip with tracks and
chapters), `mpris` (read or poke it), `pad` (a virtual Xbox pad), `preview`.
Its settings are its own, VLC's vlcrc too (`.claude/rules/nested-shell.md`).

`/reload`, `/logs`, `/status` and `/preview` use the nested shell; `make reload` is
the user's own session, theirs to run. `./scripts/dev.sh devices` lists the players
and pads the preferences show (the nested ones under `./scripts/nested.sh run`).

## Layout

```
src/extension.js      the shipped entry point: imports lib/app.js and enables it
src/lib/app.js        which player, when the bar is seen, the key, the pads,
                      the sleep timer, perform(action)
src/lib/mpris.js      PlayerRegistry + Player: the players on the bus, their
                      reckoned position, and the calls the bar makes
src/lib/bar.js        ControlBar: the St widget (seek row, transport, tracks,
                      sleep, volume, rate, close, clock line) and CentredRowLayout
src/lib/tracksmenu.js TracksMenu: the audio-and-subtitles pop-out (a PopupMenu)
src/lib/lineremote.js LineRemote: a player's line-based control socket
src/lib/vlcremote.js  VlcRemote: VLC's remote-control socket
src/lib/mpvremote.js  MpvRemote: mpv's (and Celluloid's) JSON IPC socket
src/lib/vlcconfig.js  VLC's settings file: the one thing we may change in it
src/lib/mpvconfig.js  the script that gives mpv and Celluloid a control socket
src/lib/gamepads.js   libmanette → (button, action)
src/lib/actions.js    pure data shared with prefs.js: ACTIONS, BAR_BUTTONS,
                      BUTTONS, NAVIGATION, RATES, SLEEP_MINUTES,
                      SLEEP_EPISODES, SUBTITLE_SHIFT_MS, and the helpers
                      over them (formatTime, playerNames, isIgnored, …)
src/lib/anim.js       the only durations and curves
src/prefs.js          Bar / Players (with the VLC switches) / Controllers pages
src/stylesheet.css    paint only, every size in em
src/schemas/          org.gnome.shell.extensions.media-controls
scripts/dev.sh, nested.sh, nested_driver.py, dev-extension.js, kit.mk
                      the kit's, synced by its scripts/sync.sh: change them there
scripts/ext.conf      what the kit's scripts need to know about this extension
scripts/dev.d/media-controls.sh     dev.sh's devices, stalls, the pads status line
scripts/nested.d/media-controls.sh  nested.sh's player, mpris, pad, preview
scripts/fakepad.py    the virtual Xbox pad `pad` plugs in (python-evdev)
scripts/stallwatch.py, devices.js, vlc-setup.js  what `make stalls`, `dev.sh
                      devices` and nested `player` (vlcconfig.js from the CLI) run
scripts/demo-clip.sh  `make demo-clip`: docs/media/big-buck-bunny-demo.mkv, the
                      README screenshots' film, with docs/media/captions/
```

`docs/compatibility.md` records the reading of Shell 48 and 49 and what a boot
must check. `docs/publishing.md` covers the EGO zip (`make pack` refuses a stray
file) and the review guidelines; `docs/notes.md` the measurements the code keeps. `TODO.md` is the user's list of what is left to test.

Area detail is in `.claude/rules/`, loaded with the files it covers: `bar.md`
(the widget, its placement, keys and sizes), `mpris.md` (position, playlists),
`vlc.md` (the remote, vlcrc, the pop-out), `mpv.md` (the IPC socket), `gamepads.md` (libmanette, the
virtual pad), `sleep-timer.md` (counting episodes), `nested-shell.md` (VLC and
the pad in the nested shell).

## make check

`make check` is `make lint` and the schema alone (`EXT_CHECKS` is empty): no
headless tests exist, and behaviour is checked in the nested shell.

## How it fits together

The **action vocabulary** (`ACTIONS` in `actions.js`) is the one list every
input speaks: the bar's buttons emit an action id, the pads map a button id to
one (`gamepad-buttons`), and `app.js` `perform()` is the only place an action
turns into a call. Add an action there and in `ACTIONS`, and both the pads and
the preferences pick it up. `actions.js`, `vlcconfig.js` and `mpvconfig.js` are imported by
`prefs.js` too.

Three questions, each answered once, in `app.js`:

**Which player?** The MPRIS player that owns the **focused window, when that
window is fullscreen** and the overview is not up (`_update`, `_playerFor`).
Matched by **process id** first (`GetConnectionUnixProcessID` on the player's
bus connection against `Meta.Window.get_pid()`) and by **desktop entry** after
that, against the window's app id, sandboxed app id, GTK application id and WM
class, for a sandboxed player whose bus connection is a proxy's. Two VLCs, two
pids: the one you are looking at is the one you get. No fullscreen player
focused → nothing is attached and nothing reacts, the pads included, so a game
is never driven. `ignored-players` is matched against **every name a player
goes by** (`playerNames`: desktop entry, identity, and the bus name without its
`.instanceN`): Chrome names no desktop entry and calls itself "Chrome", but is
`org.mpris.MediaPlayer2.chromium.*`. Browsers are ignored by default: a
fullscreen video in one draws its own controls.

**When is it seen?** Pointer motion over the player (`pointer-reveal`:
`anywhere` like VLC's controller, `edge` for the fifth of the monitor at the
edge the bar is on, or `never`), watched with the shell's `PointerWatcher`,
which takes no input away from the video as a reactive hot strip would. The
`toggle-bar` key (default Super+C) or the pad's `navigate` (Start) opens it
**holding the focus** (`Main.pushModal`, `POPUP` tier); Escape, a click outside,
or the key again puts it away. A pad button performs its action and flashes the
bar, except the track and subtitle actions, which leave it down so the
subtitles under it stay visible. The player's own changes show it too: a pause
(from a remote's media key, say), a seek, a new file. It hides after
`hide-delay` seconds unless the pointer is on it, it holds the focus, the
pop-out is open, a slider is being dragged, or (`stay-while-paused`) the player
is paused.

**How is it above the video?** It is chrome, `Main.layoutManager.addChrome()`
with no params: only chrome that asks for `trackFullscreen` (the top bar) hides
over a fullscreen window. It places itself with the OSD's own arrangement and
turns unredirection off while shown (`.claude/rules/bar.md`).

**The pad drives the bar the way the keyboard does**: while the bar or its
pop-out holds the grab, the `NAVIGATION` buttons are arrow keys, Return and
Escape on a Clutter virtual keyboard (`.claude/rules/gamepads.md`).

**Tracks are VLC's and mpv's**. VLC's are over its `oldrc` remote-control socket, which
`vlcconfig.js` turns on in VLC's own settings file only when the user flips the
Players page's switch; mpv's and Celluloid's over their JSON IPC socket, found
from the player's own process, which the Players page's mpv switch sets up with
a script (`.claude/rules/mpv.md`); with no socket the bar
has no tracks button (`.claude/rules/vlc.md`, which also covers `hide-vlc-controls`).

**What is on the bar** (`previous-next`, `hidden-buttons`, `show-length`, and
the clock line, off by default) is in `.claude/rules/bar.md`; the sleep timer,
also off by default, in `.claude/rules/sleep-timer.md`.

## Design rules

- **The shell's widgets:** the seek and volume sliders are the quick settings'
  `Slider`, the buttons the screenshot panel's `screenshot-ui-type-button`s (Play
  an `icon-button default`), the pop-out a `PopupMenu` with the
  shell's radio ornaments, the placement the OSD's `MonitorConstraint`. The
  only layout of our own is `CentredRowLayout`, which keeps the transport
  centred however long the title is.
- **Painted by the shell's classes:** the panel is a `screenshot-ui-panel`, so its
  colours and the buttons' follow the theme: dark in the light theme too, black
  with an outline in High Contrast. The stylesheet sets size and shape in em
  (the shell's classes size in px), and keeps the focus ring, the sliders and
  the text shades. The ring is the shell's own focus colour (the accent mixed
  with white) at full strength, to be found from a sofa, and `!important` as
  the theme's own is; the slider fill is a lighter accent (`docs/notes.md`). The sliders (`.mc-bar .slider`)
  stay white: the shell's are dark on light in the light theme. If GNOME
  renames those classes the panel loses its background.
- **Motion** (`anim.js`): 200 ms arriving, the bar rising 8 px as it fades in;
  120 ms leaving; both ease-out-quad.
- **`bar-scale`** (75–200 %) is one `font-size` percentage on the panel and the
  pop-out, which every em in the stylesheet (0.818em is the caption step)
  follows. Icons are the exception, sized in JS (`.claude/rules/bar.md`).
- **No private shell API.** There is none today: no underscore field is read or
  written (`TracksMenu` uses `PopupMenu`'s public `sourceActor`,
  `setSourceAlignment` and `itemActivated`, and `ControlBar.setTop` its
  `BoxPointer`'s `updateArrowSide`). If one becomes unavoidable, list it here
  with what breaks when it moves.

## Traps

- **Escape goes to the player when the bar does not hold the focus**, and
  VLC's Escape leaves fullscreen, after which the bar correctly detaches. A
  pop-out opened with the mouse needs one Escape, not two.
