// Game controllers, through libmanette — GNOME's gamepad library, the one
// WebKitGTK reads pads with. It watches udev for pads coming and going, opens
// each one's evdev node on the main loop without blocking, and maps whatever
// was plugged in onto the kernel's standard buttons with the SDL controller
// database, so an Xbox, PlayStation, Switch or 8BitDo pad all press the same
// `BTN_SOUTH`. Which action a button performs is the `gamepad-buttons`
// setting, keyed by the ids in actions.js BUTTONS; every press of a known
// button is handed on with its id as well, since while the bar holds the
// focus the d-pad and the face buttons move around it instead (app.js).
//
// A button held down goes on doing what it did, as a held key does: after
// REPEAT_DELAY, every REPEAT_INTERVAL until it is let go — when the handler
// hands back what to do again (app.js: a skip, a volume step, an arrow key;
// not play or pause), and until that says it is done. One button repeats at
// a time: another press ends it.
//
// Pads are never grabbed: a game running beside the player still sees every
// press. The actions only reach a player when app.js has one attached — a
// focused, fullscreen window of a player — so a pad in a game does nothing
// here.
//
// libmanette is imported when enabled rather than at the top, so a system
// without it loses the pads and keeps the bar.

import GLib from 'gi://GLib';

import {buttonForCode} from './actions.js';
import {note} from './log.js';

// ms: the keyboard's feel, a little slower, since each repeat is a call to
// the player.
const REPEAT_DELAY = 400;
const REPEAT_INTERVAL = 150;

export class Gamepads {
    constructor(settings, onButton) {
        this._settings = settings;
        this._onButton = onButton;
        this._monitor = null;
        this._devices = new Set();
        this._generation = 0;
        this._held = null;              // {device, id, source}: repeating
    }

    async enable() {
        const generation = ++this._generation;
        let Manette;
        try {
            ({default: Manette} = await import('gi://Manette?version=0.2'));
        } catch {
            console.warn('[Media Controls] libmanette is not installed, so game controllers are off');
            return;
        }
        // Disabled, or disabled and enabled again, while the import ran.
        if (generation !== this._generation)
            return;
        this._monitor = new Manette.Monitor();
        const it = this._monitor.iterate();
        for (let [ok, device] = it.next(); ok; [ok, device] = it.next())
            this._watch(device);
        this._monitor.connectObject(
            'device-connected', (_monitor, device) => this._watch(device),
            'device-disconnected', (_monitor, device) => this._unwatch(device),
            this);
    }

    disable() {
        this._generation++;
        this._stopRepeat();
        for (const device of this._devices)
            device.disconnectObject(this);
        this._devices.clear();
        if (this._monitor) {
            this._monitor.disconnectObject(this);
            // Closes every pad's evdev node now rather than whenever the
            // collector gets to the monitor.
            this._monitor.run_dispose();
            this._monitor = null;
        }
    }

    _watch(device) {
        if (this._devices.has(device))
            return;
        this._devices.add(device);
        note(`Controller connected: ${device.get_name()}`);
        device.connectObject(
            'button-press-event', (_device, event) => this._pressed(device, event),
            'button-release-event', (_device, event) => this._released(device, event),
            this);
    }

    _unwatch(device) {
        if (!this._devices.delete(device))
            return;
        if (this._held?.device === device)
            this._stopRepeat();
        device.disconnectObject(this);
        note(`Controller disconnected: ${device.get_name()}`);
    }

    _pressed(device, event) {
        if (this._settings.get_strv('ignored-gamepads').includes(device.get_guid()))
            return;
        // Any press ends a repeat, a button outside the standard positions
        // (a paddle, say) as well.
        this._stopRepeat();
        const [ok, code] = event.get_button();
        const button = ok ? buttonForCode(code) : null;
        if (!button)
            return;
        const action = this._settings.get_value('gamepad-buttons').deep_unpack()[button.id] ?? 'none';
        const again = this._onButton(button.id, action);
        if (again)
            this._startRepeat(device, button.id, again);
    }

    _released(device, event) {
        const [ok, code] = event.get_button();
        if (ok && this._held?.device === device && this._held.id === buttonForCode(code)?.id)
            this._stopRepeat();
    }

    // `again` after the delay, then at the interval, for as long as it says
    // it did something (the player, or the bar's focus, may have gone).
    _startRepeat(device, id, again) {
        const held = {device, id, source: 0};
        this._held = held;
        const repeat = () => {
            if (again())
                return true;
            // The source that asked ends itself.
            held.source = 0;
            this._held = null;
            return false;
        };
        held.source = GLib.timeout_add(GLib.PRIORITY_DEFAULT, REPEAT_DELAY, () => {
            if (repeat()) {
                held.source = GLib.timeout_add(GLib.PRIORITY_DEFAULT, REPEAT_INTERVAL,
                    () => repeat() ? GLib.SOURCE_CONTINUE : GLib.SOURCE_REMOVE);
                GLib.Source.set_name_by_id(held.source, '[media-controls] pad repeat');
            }
            return GLib.SOURCE_REMOVE;
        });
        GLib.Source.set_name_by_id(held.source, '[media-controls] pad repeat');
    }

    _stopRepeat() {
        if (this._held?.source)
            GLib.source_remove(this._held.source);
        this._held = null;
    }
}
