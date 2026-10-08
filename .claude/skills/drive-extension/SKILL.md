---
name: drive-extension
description: Run Media Controls in a throwaway nested GNOME Shell, mirrored live on the user's desktop, with VLC playing full screen inside it — move the pointer, press keys, plug in a virtual gamepad, screenshot, then shut it all down. Use whenever a change must be SEEN (the bar's layout, colours, reveal and hide, focus rings, the preferences window) or needs a fresh shell start (extension.js, metadata.json, the schema).
---

# Driving Media Controls in a nested shell

**Read `gnome-ext:nested-shell` first**: the loop (`start`, `do`, `reload`,
`stop`), the steps, its settings (its own, kept between starts; `--clean`
resets them), the hot corner and the rest are there. This is what is particular to Media Controls: a player to
put the bar over, a virtual pad, and where everything is on its screen.

```bash
./scripts/nested.sh start                   # Media Controls is ACTIVE when it returns
./scripts/nested.sh player                  # VLC, full screen, the test clip (made once, in dist/)
./scripts/nested.sh do "say Showing the bar" "move 700 400" "move 760 430" "wait 0.5" \
                       "shot $S/bar.png 343 760 913 130"
```

Check what the player did with `./scripts/nested.sh mpris` (status, position,
volume, rate, title): the bar showing a pause is not the player pausing.

## Its own commands

| Command | Does |
|---|---|
| `player [--qt] [--windowed] [--plain] [FILE] [-- VLC ARGS]` | VLC in the nested session: cvlc by default, `--qt` for the Qt interface; full screen unless `--windowed`. No FILE = the generated 10-minute test pattern: running time burned in, audio Japanese/English, subtitles English "Second N"/Spanish "Segundo N" (one a second, so timing shows), a chapter every 2 min. Its vlcrc, the nested session's own (`.claude/rules/nested-shell.md`), gets the tracks socket (the preferences' own code) unless `--plain`, which is how to check a VLC with no tracks button; the real `~/.config/vlc` is never touched. With `--qt`, VLC's own fullscreen controller shows on pointer motion (`move` from far away, then three small moves toward the foot of the screen) unless `hide-vlc-controls` is on. Run it twice for two players. |
| `mpris` | The first player's PlaybackStatus, Position (µs), Volume, Rate, title |
| `mpris get PROP` / `set PROP '<VALUE>'` / `METHOD [ARGS]` / `Quit` | Poke it directly (`set Volume '<0.8>'`, `PlayPause`, `Quit`). Quit players this way or by pid. |
| `pad [HOLD] BUTTON...` | Plug in a virtual Xbox 360 pad, wait HOLD s (default 1.5) for libmanette to open it, press each BUTTON, unplug. Buttons are the `gamepad-buttons` ids: `south` `east` `west` `north` `dpad-left` `dpad-right` `dpad-up` `dpad-down` `left-shoulder` `right-shoulder` `left-trigger` `right-trigger` `select` `start` `mode` `left-stick` `right-stick`, any of them as `BUTTON:SECS` to hold it down (`dpad-right:2` scrubs forward), plus `wait:SECS`. |
| `do` … `scroll X Y up\|down [N]` | The kit's step; over the bar, the panel skips by `seek-step` per notch. |
| `preview` | `start` (if none runs), the test clip, the bar up, a shot in `dist/preview.png` |
| `logs` | `[Media Controls]` lines are ours: failures, and the development entry point's `Enabled from …`. Which player the bar is attached to is seen in a `shot`. |

The preferences: `run gnome-extensions prefs media-controls@jackicus`.

## Reading the screen (1600×900)

- **VLC's socket, directly:** while the extension is attached it holds VLC's
  one connection, so a `python3` probe of the socket hangs. Test the protocol
  on a headless VLC of your own instead (`cvlc -I dummy --extraintf oldrc
  --rc-fake-tty --rc-unix=$XDG_RUNTIME_DIR/<short>.sock --vout=dummy
  --aout=dummy --no-dbus FILE`, and kill it by pid).
- **Showing the bar:** two `move`s to different points over the player
  (`pointer-reveal` `anywhere`): the pointer watcher only reacts to a change.
  With `edge`, the moves must land below y ≈ 720 (above y ≈ 180 with
  `bar-position` `top`, where the panel is `320,28` to `1280,120`). It hides
  `hide-delay` (3) s after the last movement unless paused; a paused bar is
  put away by a click outside its panel (`click 700 300`), which VLC never sees.
- **The bar:** panel `363,778` to `1236,872`; crop shots to `343 760 913 130`.
  Seek slider on y ≈ 800 from x ≈ 445 to 1155; `click 800 800` is the middle
  of the clip. Transport on y ≈ 839: previous 706, skip back 748, **play 799**,
  skip forward 851, next 894. **Tracks 972** (when VLC's socket answered:
  give it ~3 s after `player` or a `reload`), mute 1015, volume slider
  1038–1118, rate 1150, **close 1197** (quits the player). At another
  `bar-scale`, or with the sleep button on, read positions off a `shot` first.
- **The pop-out** (`click 972 839`) stands above the bar centred on the
  tracks button, x ≈ 855–1090; its height depends on the file (the default
  clip's chapters add a row), so `shot` it and read the item rows off that
  before clicking one. An item's highlight follows the pointer, so park the
  pointer away from the pop-out before checking where the keyboard or pad
  focus landed. Picking keeps it open. Opened with the mouse it needs
  one Escape; the next Escape goes to VLC (which leaves fullscreen).
- **Keyboard mode:** `key Super+c` opens it holding the keyboard with play
  focused; `Right`/`Left`/`Up`/`Down` move the focus, `Return` presses,
  `Escape` backs out a level.
- **Pad mode:** `pad start` does the same as Super+C; then `dpad-*`, `south`
  (press) and `east` (back) are the arrow keys, Return and Escape. `pad north`
  opens the pop-out with the current audio track focused. Each `pad` call plugs
  a fresh pad in (1.5 s), so for a walk with shots in between, open with `pad`
  and continue with `key` steps: the path is the same.
- **Preferences** (`wait 2.5` after opening): a 640×800 window, centred in the
  work area, so where it lands depends on the panels loaded. With only this
  extension enabled (the nested default; stock top bar) its tabs are Bar (687,86), Players (800,86), Controllers
  (925,86); with other panels, take a `shot` and read them off before
  clicking. The first frame after a tab switch can carry redraw leftovers;
  `wait 1` before a `window` shot. A pad plugged in while Controllers is
  showing lists itself, and a press lights its row and the button's row for
  1.2 s: start `pad` in the background and shoot during it.
- **Two players:** `player --windowed` starts a second VLC in a window on top;
  `key f` makes the focused VLC fullscreen. The bar follows focus.

## Other players (Flatpak, user-level)

mpv, Celluloid and Showtime are installed as `flatpak --user` apps
(`io.mpv.Mpv`, `io.github.celluloid_player.Celluloid`, `org.gnome.Showtime`).
Start one through `./scripts/nested.sh run setsid flatpak run
--filesystem=<scratchpad> <id> … FILE` (the sandbox sees nothing outside its own
folders and `/tmp` unless told), then `F11` in a `do` to make it fullscreen.
`mpv` wants `--vo=x11 --hwdec=no --ao=null` here. Their config is under
`~/.var/app/<id>/`, which the nested shell does *not* redirect: the Players
page's mpv switch, flipped in the nested preferences, writes there for real, so
flip it off again when done. A sandbox's runtime folder is
`$XDG_RUNTIME_DIR/.flatpak/<id>/xdg-run/`. Each player's own overlay shows
beside the bar when the pointer moves; that is theirs.

## Two monitors

`start --monitors 2` puts a second 1600×900 monitor to the right: coordinates
there are +1600 in x, and a `shot` is 3200 wide (crop it). `player` opens on the
first. With the bar up and not holding the keyboard, `key Shift+Super+Right`
moves the fullscreen VLC to the second monitor and the bar follows it. Under
the bar's grab (Super+C, or the pop-out opened with the mouse) that key does
nothing: press Escape first, which closes the pop-out.

## Never

- **Close (1197) quits the player**, and **Escape reaches VLC** when the bar
  does not hold the keyboard: VLC's Escape leaves fullscreen, after which the
  bar (correctly) detaches. If a shot shows VLC in a window, that is why:
  `key f` or restart the player.
- **Keep VLC's `--vout=xcb_x11 --avcodec-hw=none`** if you pass your own args:
  with a GL output it plays with no window in the headless shell.
- **A virtual pad is a real kernel device**: the real session sees it too while
  it is plugged in. It does nothing there unless a fullscreen player is focused
  on the real desktop.

## README screenshots

`docs/screenshots/`, taken under `start --stand-in` at 1600×900 over
`docs/media/big-buck-bunny-demo.mkv`: Big Buck Bunny (CC BY 3.0, credited in
the README) with two audio tracks (Stereo, 5.1 Surround) and two subtitle
tracks (English, Español), so the tracks pop-out has something to show. It is
not in git: `make demo-clip` downloads the film and builds it with the
captions in `docs/media/captions/`. Play it with
`./scripts/nested.sh player docs/media/big-buck-bunny-demo.mkv -- --audio
--aout=pulse --gain=0`: a file of its own plays with `--no-audio`, which leaves
the pop-out with no audio track picked; `--gain=0` keeps the real sound server
silent. Set its volume with `mpris set Volume '<0.6>'`. The published shots use
the green accent (`run timeout 5 gsettings set org.gnome.desktop.interface
accent-color green`, in the nested session's own settings). The hero `bar.jpg` is the
whole screen as a JPEG at 1:24, `bar-closeup.png` the bar's crop of it,
`tracks.jpg` the crop `300 330 1000 570` with the pop-out open (Stereo and
Español picked), and the preference windows PNGs from `window`;
`prefs-controllers.png` needs a virtual pad (python-evdev).
