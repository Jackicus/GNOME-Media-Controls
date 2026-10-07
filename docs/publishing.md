# Publishing to extensions.gnome.org

How to build the upload, what goes in it, and how the code stands against the
EGO [Review Guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html).

## Building the zip

```sh
make pack
```

This runs `./scripts/dev.sh pack` (the kit's; see its comments for exactly what
each step does): checks the schema with `glib-compile-schemas --strict --dry-run`,
stages what ships (the entry points, metadata, stylesheet, schema XML, what
`./scripts/ext.conf`'s `EXT_SHIP` names, `lib/*.js`, and `LICENSE`), packs that
with `gnome-extensions pack`, drops
`schemas/gschemas.compiled` if that `gnome-extensions` put one in (45 and
older do; GNOME 44 and later compile the schema on install, so the zip never
carries a compiled one), then checks the zip holds exactly the files that
should ship and prints the listing. Output:
`dist/media-controls@jackicus.shell-extension.zip`.

What it contains:

```
LICENSE
metadata.json
extension.js
prefs.js
stylesheet.css
schemas/org.gnome.shell.extensions.media-controls.gschema.xml
lib/actions.js  lib/anim.js  lib/app.js  lib/bar.js  lib/gamepads.js
lib/mpris.js  lib/tracksmenu.js  lib/vlcconfig.js  lib/vlcremote.js
```

`scripts/`, `docs/`, `README.md`, `CLAUDE.md`, `.claude/` and the screenshots
never ship; `make pack` refuses a zip holding anything else, naming the file.

To test the built zip rather than the `make link` install: `make uninstall`,
`gnome-extensions install dist/media-controls@jackicus.shell-extension.zip`, log
out and back in, enable it. Don't `gnome-extensions install --force` over the
link — its recursive delete follows symlinks into `src/`.

## metadata.json

| Key | Now | Note |
|---|---|---|
| `uuid` | `media-controls@jackicus` | Fixed once uploaded — this is the EGO entry |
| `shell-version` | `["50"]` | The only version run, and the only one the code is written for; another is added with `gnome-ext:port-shell-version` |
| `settings-schema` | set | `getSettings()` is called with no arguments in both `app.js` and `prefs.js` |
| `gettext-domain` | `media-controls` | The shell binds it to the extension's `locale/` at load; the bar's modules translate through `Gettext.domain('media-controls')`, which works from the development stage too. No translations ship yet, and the preferences are English only |
| `version-name` | `"1.0"` | Must match `/^(?!^[. ]+$)[a-zA-Z0-9 .]{1,16}$/` (letters, digits, space, period) — `"1.0"` qualifies. Bump it with each upload |
| `version` | absent | Correct — EGO assigns this |
| `session-modes` | absent | Correct — the bar has no reason to run outside `user` mode |
| `description` | two paragraphs | Names the VLC switches and the vlcrc file they change, and that game controllers need libmanette — the two things a reviewer or user could otherwise mistake for bugs |
| `url` | GitHub repo | Set |

## The review guidelines, checked against this code

Checked on 2026-10-02, before the 1.0 release, against the
[Review Guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html)
and [Best Practices](https://gjs.guide/extensions/review-guidelines/best-practices.html)
as published that day, on the zip `make pack` builds, and by running it in a
nested GNOME Shell 50 (enable, VLC full screen, the bar, disable and enable
again, no errors in the log). No blockers.

**Only static resources at initialization: meets.** `src/extension.js` has no
constructor; `enable()`/`disable()` build and tear down `MediaControlsApp`.
Every module-scope value under `lib/` is a constant or pure function — no
timer, connection or D-Bus proxy runs before `enable()`.

**Destroy all objects, disconnect all signals, remove main loop sources:
meets.** `MediaControlsApp.disable()` (`src/lib/app.js`) undoes `enable()`
in plain calls: removes the keybinding, cancels the sleep timer and its
signals (`_setSleep(null)`), drops the VLC remote, releases the grab,
disposes the virtual keyboard (commented: it leaves the seat at once),
disables the pad watcher, stops the pointer watch, stops watching the window,
disconnects every `connectObject` group (`_player`, `global.display`,
`Main.overview`, `Main.layoutManager`, `global.window_manager`, `_settings`,
`_registry`), destroys the bar, then removes the hide and update sources. Last, it
shows VLC's controller window again if `hide-vlc-controls` had hidden it.
`ControlBar._onDestroy()` (`src/lib/bar.js`) disconnects the player, removes
its own redraw timer, restores unredirection, and removes the panel from the
focus group. `VlcRemote.close()` (`src/lib/vlcremote.js`) cancels its
`Gio.Cancellable` and clears pending command timeouts. `PlayerRegistry`
(`src/lib/mpris.js`) cancels its own cancellable in `disable()`.

**Do not use deprecated modules: meets.** No `ByteArray`, `imports.lang` or
`Mainloop` anywhere in `src/`.

**No GTK in the shell, no shell libraries in the preferences: meets.** Every
file under `src/lib` imports only `Clutter`, `GLib`, `GObject`, `Gio`, `Meta`,
`Pango`, `Shell`, `St`, shell `resource:///` modules and — with an awaited
`import()` in a `try` at the top of `gamepads.js`, so a system without it keeps
the bar — `Manette` — no `Gtk`,
`Gdk` or `Adw`. `src/prefs.js` imports `Adw`, `Gdk`, `Gio`, `GLib`, `Gtk`,
`Manette` (the same way, for the Controllers page) plus `lib/actions.js` and
`lib/vlcconfig.js`, both pure GLib/Gio with no shell import.

**Avoid interfering with the extension system: meets.** The module-cache
workaround (`scripts/dev-extension.js`) is not part of `src/` and is never
packed.

**Code must not be obfuscated: meets.** Plain ES modules, unminified.

**No excessive logging: meets.** An install logs nothing on enable, disable,
lock or unlock. Every `console.warn`/`console.error` in `src/` is on a failure
path (a player that refused a call, a `ListNames` failure, a vlcrc write,
libmanette missing).

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
`MpvRemote.open()` (`src/lib/mpvremote.js`) does the same for mpv and
Celluloid, at the Unix socket that the player's own process listens on (read
from `/proc/<pid>/fd` and `/proc/<pid>/net/unix`, nothing else under `/proc`),
with the same peer check against the window's process. Nothing else opens a
socket, makes an HTTP request, or reaches outside the session bus and these
sockets.

**Modifying another application's files: only on an explicit switch, and only
these options.** `lib/vlcconfig.js`'s `writeVlcState()` edits
`~/.config/vlc/vlcrc`, and the Flatpak VLC's
`~/.var/app/org.videolan.VLC/config/vlc/vlcrc` once that folder exists. "Hide VLC's controls" (`hide-vlc-controls`) writes
nothing: `src/lib/app.js` hides VLC's controller window from the shell while
the extension is enabled. The "tracks" switch is written by `src/prefs.js`: under
`[core]`/`[oldrc]`, adds `oldrc` to `extraintf`, sets
`rc-unix=$XDG_RUNTIME_DIR/media-controls-vlc.sock` and `rc-fake-tty=1` when
"tracks" is on. Turning a switch off removes exactly what it added (or
restores the commented default) and never touches other options in the file.
The "mpv and Celluloid" switch is written by `src/prefs.js` through
`lib/mpvconfig.js`: it adds one file, `media-controls.lua`, to mpv's and
Celluloid's `scripts` folders (native and Flatpak) when on, and removes exactly
that file when off. Nothing else in those folders is touched.

**metadata.json is well-formed, GSettings schema: meets.** See the table
above; the schema ships as `schemas/*.gschema.xml` only (`make pack` strips
a compiled one where an older `gnome-extensions` adds it), id and path both
under `org.gnome.shell.extensions.media-controls`.

**Licensing: meets.** GPL-2.0-or-later, `LICENSE` at the repo root, packed by
`make pack`.

**Don't include unnecessary files: meets.** `./scripts/dev.sh pack` fails
the build on anything in the zip beyond the list above.

**Use a linter: meets.** `make lint` runs ESLint with gjs.guide's
configuration (`eslint.config.mjs`) over the whole repository (`src/` and
the GJS scripts beside it); 0 errors (some warnings).

**`GObject.Object.run_dispose()`: twice, each with its reason.** The
virtual keyboard in `MediaControlsApp.disable()` (`src/lib/app.js`), so it
leaves the seat at once, and the libmanette monitor in `Gamepads.disable()`
(`src/lib/gamepads.js`, and the Controllers page in `src/prefs.js`), so every
pad's evdev node is closed at once rather than at garbage collection.

**Session modes: `user` only.** No `session-modes` key; screen lock disables
the extension.

**Clipboard, telemetry, privileged subprocesses: none.** Nothing reads or
writes the clipboard, nothing is sent anywhere, nothing runs through `pkexec`.

**Readable, explainable code: meets.** Comments are about 4% of `src/`'s
lines and say only why; no `try` around `destroy()`, `disconnect()` or
`GLib.source_remove()`, no `_destroyed` or `_enabled` flags, no checks for
other shell versions; `./scripts/dev.sh size` reports what `src/` comes to.

**Copyrights and trademarks: no logos or artwork.** Every icon is a theme
symbolic icon. Players (VLC, mpv, Celluloid) and controller makers (Xbox,
PlayStation, Nintendo, Switch, 8BitDo, Steam Deck, in the Controllers page's
button hints) are named in text only, to say what the extension works with.

**Best practices.** `St.Icon` in the shell and `Gtk.Image` in the preferences,
no emoji as icons; no line over 200 characters; `enable()` and `disable()`
side by side; each class removes the sources it adds next to where it adds
them; `settings-schema` in `metadata.json`, `getSettings()` with no argument.

## Private API

None. No file under `src/` reads or writes an underscore-prefixed field on a
shell object (`Main.*`, `global.*`, or anything from `resource:///`) — every
shell interaction goes through public API (`PopupMenu.sourceActor`,
`setSourceAlignment`, `itemActivated`, `addChrome()`, `pushModal()`,
`PointerWatcher`, `St.FocusManager`). If that ever changes, record what broke
and when here.

## Before each upload

1. Bump `version-name` in `src/metadata.json`.
2. `make check` — ESLint with 0 errors, and the schema under `--strict`.
3. `make pack` — reads the zip listing; confirm nothing unexpected is in it.
4. Install that zip (not the `make link` install) and run through the
   nested-shell checks in the `drive-extension` skill on each
   `shell-version` claimed.
5. `make logs` quiet through enable, use, lock, unlock, disable.
6. If a claimed shell version changed, update the table above.

## Uploading

- **Web:** https://extensions.gnome.org/upload/ — choose
  `dist/media-controls@jackicus.shell-extension.zip`, accept the terms.
- **Command line:** `gnome-extensions upload --accept-tos
  dist/media-controls@jackicus.shell-extension.zip` (gnome-extensions 49 and
  later). It prompts for the EGO username and password; avoid `--password` on
  a shared machine, since a command-line password can end up in shell history
  or process listings.

Each upload is reviewed before it is published; review comments arrive on the
extension's EGO page. EGO assigns the numeric `version`.
