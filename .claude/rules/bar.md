---
paths:
  - "src/lib/bar.js"
  - "src/lib/tracksmenu.js"
  - "src/lib/anim.js"
  - "src/stylesheet.css"
---

# The bar: placement, keys and sizes

## Where it is

- **The OSD's arrangement** (`osdWindow.js`): a `Layout.MonitorConstraint` sizes
  the `ControlBar` actor to the monitor, and `x_align CENTER` / `y_align END`
  shrink it back around the panel. It raises itself above later chrome when
  shown, as the OSD does.
- **`bar-position` `top`** is `y_align START`, the panel's margin moved to its
  top (`.mc-top`), the arrival a drop rather than a rise, and the pop-out's
  `BoxPointer` turned to hang below it (`updateArrowSide`, public on
  `menu.actor`).
- **The width** is the monitor's less `SIDE_MARGIN` a side (logical px, times
  the stage's `scale_factor`), capped by the panel's `max-width` in em, read
  back from the theme node (already physical). Off the stage the panel has no
  style, so `setMonitor` runs again on `style-changed`. The row gap
  (`CentredRowLayout`) is the row's `spacing`, read the same way.
- **Unredirection is off while it is shown**, as the OSD does it
  (`global.compositor.disable_unredirect()`), so a fullscreen window scanned
  out directly cannot hide it.
- **The pop-out keeps to the panel as it rises**: a `BoxPointer` places itself
  from its source's transformed position only when laid out, which a
  translation does not cause, so `notify::translation-y` calls
  `TracksMenu.reposition()`.

## Keys

- **The panel calls `navigate_from_event` itself**, since the bar holds a grab.
  A focused slider takes
  Left/Right first (the seek slider skips by `seek-step` instead of the
  Slider's tenth of the film, `arrowKeys`); Up/Down leave it.
- **A `PopupMenu` toggles on Return, Space or the arrow towards it reaching its
  source actor**, which is the panel for `TracksMenu` (so it stands above the
  bar rather than over its top row). The panel's key handler swallows those;
  a focused button has already taken them.
- **`TracksMenu` overrides `itemActivated` on its sections as well as the
  menu**: picking a track leaves the pop-out open.
- A scroll anywhere on the panel skips as the buttons do; the volume slider
  keeps its own scroll.

## Touch

- **`PointerWatcher` never sees a finger** (it polls the pointer), so while it
  runs `app.js` also watches the stage's `captured-event` for `TOUCH_BEGIN` and
  treats it as a pointer move to where it landed, edge band and monitor test
  included.
- **A press or touch outside the bar closes it under its grab**: the panel's
  `captured-event` takes `BUTTON_PRESS` and `TOUCH_BEGIN` alike, as the shell's
  popup menus do.
- Driven in the nested shell with the kit's `tap` step (kit #40), or a local
  copy of it, which `nested_driver.py` does not have yet.

## Sizes and redraws

- **`bar-scale` scales the icons by hand**: `bar.js` sets `icon_size` from `ICON_SIZE` (16) or `PLAY_ICON_SIZE` (22) × the setting, the
  pop-out's buttons too (`setIconSize`).
- **The redraw timer exists only while the bar is visible and something on it
  moves**: every 250 ms (`TICK_MS`) while playing, once a second otherwise,
  for the clock and the sleep countdown. A paused bar can be up for hours.
