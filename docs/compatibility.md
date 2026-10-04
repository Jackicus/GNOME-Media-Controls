# Shell versions

`metadata.json` claims 50, the version the extension has been booted on (50.5,
main desktop). 48 and 49 have been **read, not booted**, so they are not
claimed.

## Read on 2026-10-04

gnome-shell 48.8, 49.10, 50.5 and mutter 48.8, 49.8, 50.5; the gjs.guide
upgrade pages for 48, 49 and 50 list nothing that touches what is used here.
Every `resource:///org/gnome/shell/…` import, every shell, St, Clutter and Meta
call in `src/` and every selector in the stylesheet (`screenshot-ui-panel`,
`screenshot-ui-type-button`, `icon-button`, `slider`) exists with the same
signature at all three tags. `prefs.js` uses Adw widgets from 1.5 or earlier,
older than libadwaita 1.7 (48) and 1.8 (49). No newer language feature is used.

## What differs

- **`addChrome()` on 48 and 49** defaults to `affectsInputRegion: true`
  (`ui/layout.js`), and on an X11 session `_updateRegions()` then adds every
  visible chrome actor's rectangle to the input region. The bar is
  monitor-sized (`MonitorConstraint`), so clicks over the video would be
  swallowed while it is up. Wayland is unaffected. 50 has no such key, and
  passing it there throws `Unrecognized parameter`. The fix that needs no
  version branch is what `osdWindow.js` does, `Main.uiGroup.add_child(bar)`;
  `reveal()` already raises the bar above its siblings. It touches the 50
  path too, so it is made when 48 or 49 is ported, and booted on 50 with it.
- **`GrabHelper`** (the tracks pop-out opens through `PopupMenuManager`): 48 and
  49 refuse to grab unless the stage's seat state is `ALL` and swallow a press
  outside the grab; 50 uses a click gesture and no `ignoreRelease`. The stage
  state stays `ALL` under the bar's own `pushModal`, so the pop-out should
  open, but a click on a bar button while it is open probably closes it and is
  swallowed on 48 and 49 and not on 50. Only a boot settles it.
- **Cosmetic:** 48's `dateUtils.formatTime` uses U+2236 and adds a left-to-right
  mark, which the clock line (`clockTime()` in `bar.js`) would carry; 48's
  `BoxPointer` opens linearly with no scale; 49 changed the insensitive
  foreground.

## To claim 48 or 49

Boot it (a Fedora 42 or 43 VM), then in `stop` + `start`: the bar over a
fullscreen player, the tracks pop-out opening and closing (and the click
difference above), the sleep timer, the pad's virtual keyboard, and on 48 the
clock line. Add the version to `metadata.json` and the boot, with
`gnome-shell --version`, here.
