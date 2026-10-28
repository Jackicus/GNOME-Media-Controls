# Shell versions

`metadata.json` claims 51, the version the extension has been booted on: GNOME
Shell 51.1 (mutter 51.1, gjs 1.90.1) in a nested shell on the main desktop
(GTX 1080), 2026-10-28. 50 is no longer claimed: no machine here runs it now,
and the code is written for 51 alone.

## Read on 2026-10-28

gnome-shell and mutter 50.5 against 51.1, and the gjs.guide upgrade page for
51. Every `resource:///org/gnome/shell/…` import, every shell, St, Clutter and
Meta call in `src/` and every selector in the stylesheet (`screenshot-ui-panel`,
`screenshot-ui-type-button`, `icon-button`, `slider`) was checked at 51.1.
`prefs.js` runs unchanged on the libadwaita and GTK 51 ships with.

## What 51 changed here

- **`ui/pointerWatcher.js` is gone** (gnome-shell ad7cdec43). Its import
  failed, so the extension did not load at all. `app.js` watches
  `Meta.CursorTracker`'s `position-invalidated` (as the magnifier now does)
  and reads `global.get_pointer()` at most every `POINTER_INTERVAL`.
- **`Clutter.get_default_backend()` is gone** (mutter f7c4a8e7c): the pad's
  virtual keyboard takes its seat from `global.stage.context.get_backend()`.
- **`St.FocusManager.navigate_from_event()` is gone** (gnome-shell 5ca6fb233):
  `add_group()` now gives the group a `Clutter.KeyController` that moves the
  focus, under a grab too.
- **Actions see an event before the actor's own signal**, and the shell's
  widgets moved to actions: the `Slider` takes Left/Right through a key
  binding and scroll through `Clutter.ScrollController`s, and a `PopupMenu`
  puts a key controller on its source actor (the bar's panel) that toggles it
  on Return and Space and opens it on Up. The bar's `key-press-event` and
  `scroll-event` handlers no longer came first, so they are controllers now:
  the sliders' arrows and the seek slider's scroll in the capture phase, the
  panel's keys after the focus group's controller and before the menu's
  (`.claude/rules/bar.md`).
- **`PopupMenu.open()` takes a params object**, not a `PopupAnimation`.
- **`BoxPointer` turns unredirection off while mapped** (it was while
  visible); the bar's own `disable_unredirect` is unaffected.

## Booted on 51.1

Nested shell, `start --clean` and again after `stop` + `start`: enabled with no
errors in the log; the bar over VLC full screen on pointer motion; a wheel
notch on the seek slider and on the panel skips by `seek-step`, the volume
slider keeps its own scroll; Super+C, the arrow keys (the seek slider's
Right skips by `seek-step`, Up from the top row opens nothing), Return
pausing and Escape hiding; the tracks pop-out opening, picks keeping it open,
one Escape closing it; the virtual pad's Start, D-pad and A; the preferences.
