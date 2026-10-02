---
paths:
  - "src/lib/gamepads.js"
  - "src/lib/actions.js"
  - "scripts/fakepad.py"
  - "scripts/devices.js"
---

# Pads: libmanette, and the pad on the bar

- **libmanette** (`gi://Manette?version=0.2`, the library WebKitGTK reads
  gamepads with) is imported once, at module scope inside a `try`, in
  `gamepads.js` and `prefs.js`, so a system without it loses the pads and
  keeps the bar. It watches udev, opens each pad's evdev node on the
  main loop, and maps whatever was plugged in onto the kernel's standard
  buttons with the SDL controller database, so a button is named by
  **position** (`south`, `east`, `dpad-left`, `left-trigger`, …, `BUTTONS` in
  `actions.js`) and an Xbox, PlayStation or Switch pad presses the same one.
  Triggers arrive as `BTN_TL2`/`BTN_TR2` presses, d-pad hats as `BTN_DPAD_*`.
- **Pads are never grabbed**: a game beside the player still sees every press.
  `ignored-gamepads` holds SDL GUIDs (a model, not a unit).
- **Navigation is a Clutter virtual keyboard**, the on-screen keyboard's
  mechanism: while the bar holds the focus or its pop-out is open, the
  `NAVIGATION` buttons are pressed as arrow keys, Return and Escape, so
  everything the keyboard reaches the pad reaches, highlight and all.
- **A held button repeats** (400 ms, then every 150 ms): the actions marked
  `repeats` in `ACTIONS` (skips, volume, subtitle timing) and the arrows, never
  play or Return. `app.js` `_onPadButton` hands back what to repeat, settled at
  the press: an arrow goes on only while the bar holds the focus, an action
  only while it does not, so a hold never turns from moving the highlight into
  seeking; either stops when the player goes. Any press ends a repeat.
- **On an Xbox pad the kernel's `BTN_X` is `BTN_NORTH` (0x133) but is the
  *left* button**, and `BTN_Y` (`BTN_WEST`, 0x134) the top one. libmanette's
  output is positional; what the kernel sends is not. `fakepad.py` therefore
  takes position names and sends what xpad would.
