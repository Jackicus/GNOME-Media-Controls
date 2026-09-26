# Publishing to extensions.gnome.org

How to build the upload, what goes in it, and how the code stands against the
EGO [Review Guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html).

## Building the zip

```sh
make pack
```

This runs `scripts/dev.sh pack` (see its comments for exactly what each step
does): checks the schema with `glib-compile-schemas --strict --dry-run`,
packs `src/` plus `lib/` and `LICENSE` with `gnome-extensions pack`, drops
`schemas/gschemas.compiled` if that `gnome-extensions` put one in (GNOME 45
and older only — 46 and later compile the schema on install, so the zip never
carries a compiled one), then checks the zip holds exactly the files that
should ship and prints the listing. Output:
`dist/media-controls@jackt.shell-extension.zip`.

What it contains:

```
LICENSE
metadata.json
extension.js
prefs.js
stylesheet.css
schemas/org.gnome.shell.extensions.media-controls.gschema.xml
lib/actions.js  lib/anim.js  lib/app.js  lib/bar.js  lib/gamepads.js
lib/log.js  lib/mpris.js  lib/tracksmenu.js  lib/vlcconfig.js  lib/vlcremote.js
```

`scripts/`, `docs/`, `README.md`, `CLAUDE.md`, `.claude/` and the screenshots
never ship; `make pack` refuses a zip holding anything else, naming the file.

To test the built zip rather than the `make link` install: `make uninstall`,
`gnome-extensions install dist/media-controls@jackt.shell-extension.zip`, log
out and back in, enable it. Don't `gnome-extensions install --force` over the
link — its recursive delete follows symlinks into `src/`.

## metadata.json

| Key | Now | Note |
|---|---|---|
| `uuid` | `media-controls@jackt` | Fixed once uploaded — this is the EGO entry |
| `shell-version` | `["50"]` | The only version run. 48 and 49 pass an audit against the shell's sources (CLAUDE.md, Gotchas) but haven't been booted, so they stay off the list until they have |
| `settings-schema` | set | `getSettings()` is called with no arguments in both `app.js` and `prefs.js` |
| `version-name` | `"1.0"` | Must match `/^(?!^[. ]+$)[a-zA-Z0-9 .]{1,16}$/` (letters, digits, space, period) — `"1.0"` qualifies. Bump it with each upload |
| `version` | absent | Correct — EGO assigns this |
| `session-modes` | absent | Correct — the bar has no reason to run outside `user` mode |
| `description` | two paragraphs | Names the VLC switches and the vlcrc file they change, and that game controllers need libmanette — the two things a reviewer or user could otherwise mistake for bugs |
| `url` | GitHub repo | Set |

## The review guidelines, checked against this code

**Only static resources at initialization: meets.** `src/extension.js` has no
constructor; `enable()`/`disable()` build and tear down `MediaControlsApp`.
Every module-scope value under `lib/` is a constant or pure function — no
timer, connection or D-Bus proxy runs before `enable()`.

**Destroy all objects, disconnect all signals, remove main loop sources:
meets.** `MediaControlsApp.disable()` (`src/lib/app.js`) runs teardown as a
list of independent steps, each caught on its own, so one throwing doesn't
skip the rest: removes the keybinding, cancels the sleep timer and its
signals (`_setSleep(null)`), drops the VLC remote, releases the grab,
disposes the virtual keyboard, disables the pad watcher, stops the pointer
watch, removes the hide and update sources, and disconnects every
`connectObject` group (`_player`, `global.display`, `Main.overview`,
`Main.layoutManager`, `_settings`, `_registry`) before destroying the bar.
`ControlBar._onDestroy()` (`src/lib/bar.js`) disconnects the player, removes
its own redraw timer, restores unredirection, and removes the panel from the
focus group. `VlcRemote.close()` (`src/lib/vlcremote.js`) cancels its
`Gio.Cancellable` and clears pending command timeouts. `PlayerRegistry`
(`src/lib/mpris.js`) cancels its own cancellable in `disable()`.

**Do not use deprecated modules: meets.** No `ByteArray`, `imports.lang` or
`Mainloop` anywhere in `src/`.

**No GTK in the shell, no shell libraries in the preferences: meets.** Every
file under `src/lib` imports only `Clutter`, `GLib`, `GObject`, `Gio`, `Meta`,
`Pango`, `Shell`, `St` and shell `resource:///` modules — no `Gtk`, `Gdk` or
`Adw`. `src/prefs.js` imports `Adw`, `Gdk`, `Gio`, `GLib`, `Gtk` plus
`lib/actions.js` and `lib/vlcconfig.js`, both pure GLib/Gio with no shell
import.

**Avoid interfering with the extension system: meets.** The module-cache
workaround (`scripts/dev-extension.js`) is not part of `src/` and is never
packed.

**Code must not be obfuscated: meets.** Plain ES modules, unminified.

**No excessive logging: meets.** `src/lib/log.js`'s `note()` only prints when
`setVerbose(true)` has been called, which only `scripts/dev-extension.js`
does; the shipped `src/extension.js` never calls it, so a normal install logs
nothing on enable, disable, lock or unlock. Every `console.warn`/
`console.error` in `src/lib/` is on a failure path (a player that refused a
call, a `ListNames` failure, a disable step that threw, libmanette missing).

**No subprocesses: meets.** No `Gio.Subprocess` or `GLib.spawn*` anywhere in
`src/`.

**Network access: local socket only.** The one thing resembling network
access is `Gio.SocketClient` connecting to a Unix socket at
`$XDG_RUNTIME_DIR/media-controls-vlc.sock` (`VlcRemote.open()`,
`src/lib/vlcremote.js`) — VLC's own remote-control interface, opened only
when the user turns on the Players page's VLC-tracks switch. `open()` checks
the connection's peer credentials (`get_credentials().get_unix_pid()`)
against the VLC process the bar is attached to and closes the connection if
they don't match, so a socket held by an unrelated VLC is never trusted.
Nothing else opens a socket, makes an HTTP request, or reaches outside the
session bus and this one path.

**Modifying another application's files: only on an explicit switch, and only
these two lines.** `lib/vlcconfig.js`'s `writeVlcState()` edits
`~/.config/vlc/vlcrc`, and is called only from `src/prefs.js` when a Players
page VLC switch changes. It sets, under `[qt]`, `qt-fs-controller=0` (VLC's
own fullscreen controller off) when "hide VLC's controls" is on; and, under
`[core]`/`[oldrc]`, adds `oldrc` to `extraintf`, sets
`rc-unix=$XDG_RUNTIME_DIR/media-controls-vlc.sock` and `rc-fake-tty=1` when
"tracks" is on. Turning a switch off removes exactly what it added (or
restores the commented default) and never touches other options in the file.

**metadata.json is well-formed, GSettings schema: meets.** See the table
above; the schema ships as `schemas/*.gschema.xml` only (`make pack` strips
a compiled one where an older `gnome-extensions` adds it), id and path both
under `org.gnome.shell.extensions.media-controls`.

**Licensing: meets.** GPL-2.0-or-later, `LICENSE` at the repo root, packed by
`make pack`.

**Don't include unnecessary files: meets.** `scripts/dev.sh check_pack`
fails the build on anything in the zip beyond the list above.

**Use a linter: meets.** `make lint` runs ESLint with gjs.guide's
configuration (`eslint.config.mjs`) over `src/`; 0 errors (some warnings).

## Private API

None. No file under `src/` reads or writes an underscore-prefixed field on a
shell object (`Main.*`, `global.*`, or anything from `resource:///`) — every
shell interaction goes through public API (`PopupMenu.sourceActor`,
`setSourceAlignment`, `itemActivated`, `addChrome()`, `pushModal()`,
`PointerWatcher`, `St.FocusManager`). If that ever changes, record what broke
and when here.

## Before each upload

1. Bump `version-name` in `src/metadata.json`.
2. `make lint` — 0 errors.
3. `make pack` — reads the zip listing; confirm nothing unexpected is in it.
4. Install that zip (not the `make link` install) and run through the
   nested-shell checks in `CLAUDE.md` / the `drive-extension` skill on each
   `shell-version` claimed.
5. `make logs` quiet through enable, use, lock, unlock, disable.
6. If a claimed shell version changed, update the table above.

## Uploading

- **Web:** https://extensions.gnome.org/upload/ — choose
  `dist/media-controls@jackt.shell-extension.zip`, accept the terms.
- **Command line:** `gnome-extensions upload --accept-tos
  dist/media-controls@jackt.shell-extension.zip` (gnome-extensions 49 and
  later). It prompts for the EGO username and password; avoid `--password` on
  a shared machine, since a command-line password can end up in shell history
  or process listings.

Each upload is reviewed before it is published; review comments arrive on the
extension's EGO page. EGO assigns the numeric `version`.
