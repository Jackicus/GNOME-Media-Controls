# Media Controls

Shared rules for every extension come from the GNOME-EXTENSIONS kit: `../CLAUDE.md` and `../.claude/rules/` (loaded with this file), and the `gnome-ext:*` skills. `.claude/kit.sh` pulls the kit at session start, or, with no kit beside this repository, fetches it and prints its rules into the session.

A GNOME Shell extension (UUID `media-controls@jackicus`) that draws a control bar
over a **fullscreen video player**: a replacement for VLC's own fullscreen
controller that works the same way over mpv, Celluloid or anything else that
speaks MPRIS, and that for VLC adds audio and subtitle tracks, subtitle timing
and chapters. It is a bar the shell draws over the player's window, not a
player. `metadata.json` claims shell 50, the version it has been run on; 48
and 49 pass an audit against the shell's sources (Traps, below) and can be
claimed once booted.

It stands alone: it depends on no other extension and knows of none. If another
extension has trouble working beside it, that is fixed in that extension's own
project.

## Seeing it

The bar is drawn over a fullscreen window, so a change is verified only by
looking at it in the nested shell: `gnome-ext:nested-shell` for the loop, then
this repository's **`drive-extension` skill** for the bar's coordinates and its
own commands: `player` (VLC full screen on a test clip with tracks and
chapters), `mpris` (read or poke it), `pad` (a virtual Xbox pad). `stop` checks that
nothing of the nested session survived (a prefs window once kept a nested shell
alive after a `stop` that reported success) and says so if something did.

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
src/lib/vlcremote.js  VlcRemote: VLC's remote-control socket
src/lib/vlcconfig.js  VLC's settings file: the two things we may change in it
src/lib/gamepads.js   libmanette → (button, action)
src/lib/actions.js    pure data shared with prefs.js: ACTIONS, BAR_BUTTONS,
                      BUTTONS, NAVIGATION, RATES, SLEEP_MINUTES,
                      SLEEP_EPISODES, SUBTITLE_SHIFT_MS, and the helpers
                      over them (formatTime, playerNames, isIgnored, …)
src/lib/anim.js       the only durations and curves
src/lib/gtype.js      typeName(): our GObject type names, prefixed, apart per load
src/lib/log.js        note(): `Attached to …` and the like, on only under
                      dev-extension.js (the shipped extension logs failures only)
src/prefs.js          Bar / Players (with the VLC switches) / Controllers pages
src/stylesheet.css    paint only, every size in em
src/schemas/          org.gnome.shell.extensions.media-controls
scripts/dev-extension.js  the development entry point `make link` installs
scripts/dev.sh        link / install / reload / pack / schema / logs / status /
                      devices / stalls / clean / uninstall
scripts/nested.sh     the nested shell: start / player / do / pad / mpris / stop …
scripts/nested_driver.py  the `do` steps: input and screenshots over the nested
                      shell's RemoteDesktop/Screenshot
scripts/fakepad.py    the virtual Xbox pad `pad` plugs in (python-evdev)
scripts/stallwatch.py, devices.js, vlc-setup.js  what `make stalls`, `dev.sh
                      devices` and nested `player` (vlcconfig.js from the CLI) run
scripts/demo-clip.sh  `make demo-clip`: docs/media/big-buck-bunny-demo.mkv, the
                      README screenshots' film, with docs/media/captions/
```

`docs/proposal.md` is a live proposal (taking the bar's colours from the shell's
theme classes instead of copying the OSD's), not yet done. `docs/publishing.md`
covers building the EGO zip (`make pack` refuses a stray file, naming it) and checks
the code against the review guidelines. `TODO.md` is the user's list of what is left
to test.

Area detail is in `.claude/rules/`, loaded with the files it covers: `bar.md`
(the widget, its placement, keys and sizes), `mpris.md` (position, playlists),
`vlc.md` (the remote, vlcrc, the pop-out), `gamepads.md` (libmanette, the
virtual pad), `sleep-timer.md` (counting episodes), `nested-shell.md` (how
`./scripts/nested.sh` keeps off the real session).

## make check

`make check` is everything that needs no shell, and what CI runs: `make lint`
(ESLint; its present warnings are known, add none) and
`./scripts/dev.sh schema` (`glib-compile-schemas --strict --dry-run`). No
headless tests exist; behaviour is checked in the nested shell.

## How it fits together

The **action vocabulary** (`ACTIONS` in `actions.js`) is the one list every
input speaks: the bar's buttons emit an action id, the pads map a button id to
one (`gamepad-buttons`), and `app.js` `perform()` is the only place an action
turns into a call. Add an action there and in `ACTIONS`, and both the pads and
the preferences pick it up. `actions.js` and `vlcconfig.js` are imported by
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

**The pad drives the bar the way the keyboard does.** While the bar holds the
focus, or its pop-out is open, the d-pad, the bottom and the right face buttons
(`NAVIGATION`) are pressed as the arrow keys, Return and Escape on a **Clutter
virtual keyboard**, only ever while the bar or the pop-out holds the grab, so
they never land on the player. Every other button keeps its own action; a held
button repeats (`.claude/rules/gamepads.md`).

**Tracks are VLC's alone**, over its `oldrc` remote-control socket, which
`vlcconfig.js` turns on in VLC's own settings file only when the user flips the
Players page's switch; with no socket the bar has no tracks button
(`.claude/rules/vlc.md`). `hide-vlc-controls` turns VLC's own fullscreen
controller off in that file **only while the extension is on**.

**Settings that are off by default**: `show-clock` (a line under the title,
"21∶40 · ends at 23∶12", formatted by the shell's own `dateUtils.formatTime`, so
12/24-hour as the top bar's clock is set) and `sleep-timer`: a button cycling
15–120 minutes, then the end of the file, then off, or, with `sleep-timer-mode`
`episodes`, 1–5 files, this one counted. It pauses the player, which brings
the bar up; GNOME's own screen blank follows (`.claude/rules/sleep-timer.md`).

**Which buttons** are on the bar is two settings: `previous-next` (`always`,
greyed out with nowhere to go; `playlist`, only while `Player.hasPlaylist`;
`never`) and `hidden-buttons` (`BAR_BUTTONS`: skip, volume, rate, close). A
hidden button's action still works from the keys and pads. The time at the end
of the seek row is a button out of the focus chain whose click is the
`toggle-length` action (`show-length`: the time left or the whole length).

## Design rules

- **The shell's widgets:** the seek and volume sliders are the quick settings'
  `Slider`, the buttons `icon-button`s, the pop-out a `PopupMenu` with the
  shell's radio ornaments, the placement the OSD's `MonitorConstraint`. The
  only layout of our own is `CentredRowLayout`, which keeps the transport
  centred however long the title is.
- **Painted as the OSD:** `#2e2e33`, which the shell keeps dark in the light
  theme too. So buttons and sliders inside the bar carry their own colours
  (`.mc-bar .mc-button`, `.mc-bar .slider`): the theme's are dark on light in
  the light theme. The focus highlight is the accent at full strength, to be
  found from a sofa; its `box-shadow` is `!important`, as the theme's own
  `.icon-button:focus` ring is.
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
- **An older `make link` install may be a symlink to `src/`** rather than a
  directory of links; `make status` reports it, and `make link` replaces it.
- **The 48 floor is by audit, not boot.** The APIs used are all present in 48:
  `St.BoxLayout({orientation})`, `-st-accent-color`, `Slider` with
  `drag-begin`/`drag-end`, `global.stage.get_event_actor()`,
  `global.focus_manager.navigate_from_event()`, `EventEmitter` in
  `misc/signals.js`, `PopupMenu.setSourceAlignment`,
  `BoxPointer.updateArrowSide`, Clutter virtual input devices.
  `Ornament.NO_DOT` falls back to `NONE` where missing. Unredirection's API
  differs by version (`Meta.*_unredirect_for_display` vs.
  `global.compositor`); `bar.js` `setUnredirect` uses whichever exists.
  `addChrome()` and `Clutter.Grab` differ too (`.claude/rules/bar.md`).
