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
- **Unredirection is off while it is shown**, as the OSD does it, so a
  fullscreen window scanned out directly cannot hide it (`setUnredirect`).
- **`addChrome()` takes no `affectsInputRegion` on 50** (X11-only; not in
  `layout.js`'s `defaultParams`): passing it throws "Unrecognized parameter".
  48's default for it is `true`, so omitting it is right on both.
- **The pop-out keeps to the panel as it rises**: a `BoxPointer` places itself
  from its source's transformed position only when laid out, which a
  translation does not cause, so `notify::translation-y` calls
  `TracksMenu.reposition()`.

## Keys

- **Arrow keys never reach the focus manager while the bar holds the grab**:
  `St.FocusManager` moves focus from the stage's event handler, and a grab
  stops the event at the grab actor. The panel calls `navigate_from_event`
  itself, as the shell's popup menu items do. A focused slider takes
  Left/Right first (the seek slider skips by `seek-step` instead of the
  Slider's tenth of the film, `arrowKeys`); Up/Down leave it.
- **A `PopupMenu` toggles on Return, Space or the arrow towards it reaching its
  source actor**, which is the panel for `TracksMenu` (so it stands above the
  bar rather than over its top row). The panel's key handler swallows those;
  a focused button has already taken them.
- **A `PopupMenuSection` closes the whole menu when one of its items is
  activated** (its own `itemActivated`), so `TracksMenu` overrides it on the
  sections as well as the menu: picking a track leaves the pop-out open.
- A scroll anywhere on the panel skips as the buttons do; the volume slider
  keeps its own scroll.

## Sizes and redraws

- **St sizes a button's icon against the theme, not the panel's font**, so the
  `bar-scale` font size scaled everything but the icons. `bar.js` sets
  `icon_size` from `ICON_SIZE` (16) or `PLAY_ICON_SIZE` (22) × the setting, the
  pop-out's buttons too (`setIconSize`).
- **The redraw timer exists only while the bar is visible and something on it
  moves**: every 250 ms (`TICK_MS`) while playing, once a second otherwise,
  for the clock and the sleep countdown. A paused bar can be up for hours.
