import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ACTIONS, BAR_BUTTONS, BUTTONS, buttonForCode, normaliseName, playerNames} from './lib/actions.js';
import {readMpvState, writeMpvState} from './lib/mpvconfig.js';
import {readVlcState, writeVlcState} from './lib/vlcconfig.js';

const MPRIS_NAMESPACE = 'org.mpris.MediaPlayer2';
const MPRIS_PATH = '/org/mpris/MediaPlayer2';
const PROPERTIES = 'org.freedesktop.DBus.Properties';
const FLASH_MS = 1200;

// Optional: without it the Controllers page says so.
let Manette = null;
try {
    ({default: Manette} = await import('gi://Manette?version=0.2'));
} catch {
    // Not installed.
}

const POSITIONS = [
    {id: 'bottom', title: 'Bottom'},
    {id: 'top', title: 'Top'},
];

const SLEEP_MODES = [
    {id: 'minutes', title: 'Minutes'},
    {id: 'episodes', title: 'Episodes'},
];

const PREVIOUS_NEXT = [
    {id: 'always', title: 'Always'},
    {id: 'playlist', title: 'Only with a playlist'},
    {id: 'never', title: 'Never'},
];

const REVEALS = [
    {id: 'anywhere', title: 'Anywhere'},
    {id: 'edge', title: 'Near the bar'},
    {id: 'never', title: 'Never'},
];

// What outlives the window (bus subscriptions, the pad monitor, timers) goes when it closes.
class Cleanup {
    constructor(window) {
        this._jobs = [];
        window.connect('close-request', () => {
            for (const job of this._jobs.splice(0).reverse())
                job();
            return false;
        });
    }

    add(job) {
        this._jobs.push(job);
    }

    connect(object, ...args) {
        const id = object.connect(...args);
        this.add(() => object.disconnect(id));
        return id;
    }
}

function removeAllRows(group, rows) {
    for (const row of rows.splice(0))
        group.remove(row);
}

export default class MediaControlsPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const cleanup = new Cleanup(window);
        window.set_default_size(640, 800);
        window.add(this._barPage(window, settings, cleanup));
        window.add(this._playersPage(settings, cleanup));
        window.add(this._controllersPage(settings, cleanup));
    }

    _barPage(window, settings, cleanup) {
        const page = new Adw.PreferencesPage({title: 'Bar', icon_name: 'video-display-symbolic'});

        const showing = new Adw.PreferencesGroup({
            title: 'Showing the bar',
            description: 'The bar appears over a media player whose window is fullscreen and focused.',
        });
        page.add(showing);

        showing.add(this._choiceRow(settings, cleanup, 'pointer-reveal', REVEALS,
            'Show it when the pointer moves',
            'Anywhere over the player, or only near the edge of the screen the bar is on'));

        showing.add(this._spinRow(settings, 'hide-delay', 'Hide it after', 'seconds without movement', 1, 15));

        const paused = new Adw.SwitchRow({
            title: 'Keep it up while paused',
            subtitle: 'A pause from a remote or a controller then shows where you are',
        });
        settings.bind('stay-while-paused', paused, 'active', Gio.SettingsBindFlags.DEFAULT);
        showing.add(paused);

        showing.add(this._shortcutRow(window, settings, cleanup, 'toggle-bar'));

        const look = new Adw.PreferencesGroup({title: 'On the bar'});
        page.add(look);
        look.add(this._choiceRow(settings, cleanup, 'bar-position', POSITIONS,
            'Position', 'At the top, it stays clear of subtitles'));
        look.add(this._scaleRow(settings));
        look.add(this._buttonsRow(settings, cleanup));
        const clockRow = new Adw.SwitchRow({
            title: 'Show the time and when it ends',
            subtitle: 'A line under the title: the time now, and when the video will finish',
        });
        settings.bind('show-clock', clockRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        look.add(clockRow);
        const sleepRow = new Adw.ExpanderRow({
            title: 'Sleep timer',
            subtitle: 'A button that pauses the player after a while',
            show_enable_switch: true,
        });
        settings.bind('sleep-timer', sleepRow, 'enable-expansion', Gio.SettingsBindFlags.DEFAULT);
        sleepRow.add_row(this._choiceRow(settings, cleanup, 'sleep-timer-mode', SLEEP_MODES,
            'Pause after', '15 minutes to 2 hours, or 1 to 5 episodes'));
        look.add(sleepRow);

        const steps = new Adw.PreferencesGroup({title: 'Steps'});
        page.add(steps);
        steps.add(this._spinRow(settings, 'seek-step', 'Skip back and forward by', 'seconds', 1, 300));
        steps.add(this._spinRow(settings, 'volume-step', 'Change the volume by', 'percent', 1, 25));

        return page;
    }

    _scaleRow(settings) {
        const row = new Adw.ActionRow({
            title: 'Size',
            subtitle: 'Larger for a screen seen from across the room',
        });
        const scale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 75, 200, 5);
        scale.set({
            width_request: 220,
            valign: Gtk.Align.CENTER,
            draw_value: true,
            value_pos: Gtk.PositionType.LEFT,
            digits: 0,
        });
        scale.set_format_value_func((_scale, value) => `${Math.round(value)}%`);
        for (const mark of [100, 150, 200])
            scale.add_mark(mark, Gtk.PositionType.BOTTOM, null);
        settings.bind('bar-scale', scale.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
        row.add_suffix(scale);
        return row;
    }

    _buttonsRow(settings, cleanup) {
        const row = new Adw.ExpanderRow({
            title: 'Buttons',
            subtitle: 'Leave off the ones you never use',
        });
        row.add_row(this._choiceRow(settings, cleanup, 'previous-next', PREVIOUS_NEXT,
            'Previous and next', 'With a playlist, they move between its files'));
        for (const button of BAR_BUTTONS) {
            const toggle = new Adw.SwitchRow({title: button.title});
            const sync = () => {
                toggle.active = !settings.get_strv('hidden-buttons').includes(button.id);
            };
            sync();
            cleanup.connect(settings, 'changed::hidden-buttons', sync);
            toggle.connect('notify::active', () => {
                const hidden = settings.get_strv('hidden-buttons');
                if (toggle.active !== hidden.includes(button.id))
                    return;
                settings.set_strv('hidden-buttons', toggle.active
                    ? hidden.filter(id => id !== button.id)
                    : [...hidden, button.id]);
            });
            row.add_row(toggle);
        }
        return row;
    }

    _choiceRow(settings, cleanup, key, choices, title, subtitle) {
        const row = new Adw.ComboRow({title, subtitle, model: Gtk.StringList.new(choices.map(c => c.title))});
        const sync = () => {
            row.selected = Math.max(0, choices.findIndex(c => c.id === settings.get_string(key)));
        };
        sync();
        cleanup.connect(settings, `changed::${key}`, sync);
        row.connect('notify::selected', () => {
            const id = choices[row.selected]?.id;
            if (id && id !== settings.get_string(key))
                settings.set_string(key, id);
        });
        return row;
    }

    _spinRow(settings, key, title, subtitle, min, max) {
        const row = Adw.SpinRow.new_with_range(min, max, 1);
        row.set({title, subtitle});
        settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _shortcutRow(window, settings, cleanup, key) {
        const row = new Adw.ActionRow({
            title: 'Keyboard shortcut',
            subtitle: 'Opens the bar with the keyboard: the arrow keys move, Enter presses, Escape closes',
            activatable: true,
        });
        const label = new Gtk.ShortcutLabel({disabled_text: 'Disabled', valign: Gtk.Align.CENTER});
        const reset = new Gtk.Button({
            icon_name: 'edit-undo-symbolic',
            tooltip_text: 'Reset to the default',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });
        const sync = () => {
            label.accelerator = settings.get_strv(key)[0] ?? '';
            reset.sensitive = settings.get_user_value(key) !== null;
        };
        sync();
        cleanup.connect(settings, `changed::${key}`, sync);
        reset.connect('clicked', () => settings.reset(key));
        row.add_suffix(label);
        row.add_suffix(reset);
        row.connect('activated', () => this._captureShortcut(window, settings, key));
        return row;
    }

    // As in Settings → Keyboard: Escape cancels, Backspace turns the shortcut off.
    _captureShortcut(window, settings, key) {
        const dialog = new Adw.AlertDialog({
            heading: 'Set Shortcut',
            body: 'Press a key combination to show the bar with.\nEscape cancels, Backspace turns the shortcut off.',
        });
        dialog.add_response('cancel', 'Cancel');
        const controller = new Gtk.EventControllerKey({propagation_phase: Gtk.PropagationPhase.CAPTURE});
        controller.connect('key-pressed', (_controller, keyval, _keycode, state) => {
            const mask = state & Gtk.accelerator_get_default_mod_mask() & ~Gdk.ModifierType.LOCK_MASK;
            const lower = Gdk.keyval_to_lower(keyval);
            if (!mask && lower === Gdk.KEY_Escape) {
                dialog.close();
                return Gdk.EVENT_STOP;
            }
            if (!mask && lower === Gdk.KEY_BackSpace) {
                settings.set_strv(key, []);
                dialog.close();
                return Gdk.EVENT_STOP;
            }
            // A modifier on its own is the start of a combination.
            if (!Gtk.accelerator_valid(lower, mask))
                return Gdk.EVENT_STOP;
            settings.set_strv(key, [Gtk.accelerator_name(lower, mask)]);
            dialog.close();
            return Gdk.EVENT_STOP;
        });
        dialog.add_controller(controller);
        dialog.present(window);
    }

    _playersPage(settings, cleanup) {
        const page = new Adw.PreferencesPage({title: 'Players', icon_name: 'multimedia-player-symbolic'});

        const running = new Adw.PreferencesGroup({
            title: 'Running now',
            description: 'Media players that speak MPRIS. The bar appears over the one whose fullscreen ' +
                'window has focus. VLC needs its D-Bus control on (--dbus); mpv needs mpv-mpris.',
        });
        page.add(running);
        page.add(this._vlcGroup(settings));
        page.add(this._mpvGroup());

        const ignoredGroup = new Adw.PreferencesGroup({title: 'Never shown over'});
        page.add(ignoredGroup);
        const ignoredExpander = new Adw.ExpanderRow({
            title: 'Ignored players',
            subtitle: 'Browsers are here by default: a fullscreen video in one draws its own controls',
        });
        ignoredGroup.add(ignoredExpander);

        const bus = Gio.DBus.session;
        const cancellable = new Gio.Cancellable();
        cleanup.add(() => cancellable.cancel());
        // Bus name -> {owner, root, player}
        const players = new Map();
        const runningRows = [];
        const ignoredRows = [];

        // Compared normalised, as app.js does: on removes every name, off adds the first.
        const setIgnored = (names, ignored) => {
            const list = settings.get_strv('ignored-players').filter(k => !names.includes(normaliseName(k)));
            if (ignored)
                list.push(names[0]);
            settings.set_strv('ignored-players', list);
        };

        const fill = () => {
            removeAllRows(running, runningRows);
            const ignored = settings.get_strv('ignored-players');
            const normalised = ignored.map(normaliseName);
            // One row per player process: VLC holds a second name per instance.
            const seen = new Set();
            const keys = new Set();
            for (const [busName, info] of [...players].sort((a, b) => a[0].localeCompare(b[0]))) {
                if (seen.has(info.owner))
                    continue;
                seen.add(info.owner);
                const names = playerNames({
                    desktopEntry: info.root.DesktopEntry, identity: info.root.Identity, busName,
                });
                names.forEach(n => keys.add(n));
                const meta = info.player.Metadata ?? {};
                const title = meta['xesam:title'] || '';
                const status = info.player.PlaybackStatus || 'Stopped';
                const row = new Adw.SwitchRow({
                    title: info.root.Identity || busName,
                    subtitle: [title ? `${status} · ${title}` : status, names.join(' · ')].join('\n'),
                    use_markup: false,
                    active: !names.some(n => normalised.includes(n)),
                    subtitle_lines: 2,
                });
                row.connect('notify::active', () => setIgnored(names, !row.active));
                running.add(row);
                runningRows.push(row);
            }
            if (!runningRows.length) {
                const empty = new Adw.ActionRow({
                    title: 'No players running',
                    subtitle: 'Start one and it appears here.',
                });
                running.add(empty);
                runningRows.push(empty);
            }

            removeAllRows(ignoredExpander, ignoredRows);
            const notRunning = ignored.filter(k => !keys.has(normaliseName(k)));
            ignoredExpander.subtitle = notRunning.length
                ? `${notRunning.length} not running now. Browsers are here by default: they draw their own controls.`
                : 'None';
            for (const key of notRunning) {
                const row = new Adw.SwitchRow({title: key, use_markup: false, active: false});
                row.connect('notify::active', () => row.active && setIgnored([normaliseName(key)], false));
                ignoredExpander.add_row(row);
                ignoredRows.push(row);
            }
        };

        let rebuildId = 0;
        const rebuild = () => {
            if (rebuildId)
                return;
            rebuildId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                rebuildId = 0;
                fill();
                return GLib.SOURCE_REMOVE;
            });
        };
        cleanup.add(() => rebuildId && GLib.source_remove(rebuildId));

        cleanup.connect(settings, 'changed::ignored-players', rebuild);

        const readAll = (busName, owner, iface, field) => {
            bus.call(owner, MPRIS_PATH, PROPERTIES, 'GetAll', new GLib.Variant('(s)', [iface]),
                new GLib.VariantType('(a{sv})'), Gio.DBusCallFlags.NONE, 3000, cancellable, (_bus, result) => {
                    try {
                        const [props] = bus.call_finish(result).recursiveUnpack();
                        const info = players.get(busName);
                        if (info) {
                            Object.assign(info[field], props);
                            rebuild();
                        }
                    } catch {
                        // Gone, cancelled, or not answering: its row keeps what it had.
                    }
                });
        };
        const add = (busName, owner) => {
            players.set(busName, {owner, root: {}, player: {}});
            readAll(busName, owner, MPRIS_NAMESPACE, 'root');
            readAll(busName, owner, `${MPRIS_NAMESPACE}.Player`, 'player');
            rebuild();
        };

        const subscriptions = [
            bus.signal_subscribe('org.freedesktop.DBus', 'org.freedesktop.DBus', 'NameOwnerChanged',
                '/org/freedesktop/DBus', MPRIS_NAMESPACE, Gio.DBusSignalFlags.MATCH_ARG0_NAMESPACE,
                (_bus, _sender, _path, _iface, _signal, params) => {
                    const [name, oldOwner, newOwner] = params.deep_unpack();
                    if (oldOwner) {
                        players.delete(name);
                        rebuild();
                    }
                    if (newOwner)
                        add(name, newOwner);
                }),
            bus.signal_subscribe(null, PROPERTIES, 'PropertiesChanged', MPRIS_PATH, null,
                Gio.DBusSignalFlags.NONE, (_bus, sender, _path, _iface, _signal, params) => {
                    const [iface, changed] = params.recursiveUnpack();
                    for (const info of players.values()) {
                        if (info.owner !== sender)
                            continue;
                        Object.assign(iface === MPRIS_NAMESPACE ? info.root : info.player, changed);
                        rebuild();
                    }
                }),
        ];
        cleanup.add(() => subscriptions.forEach(id => bus.signal_unsubscribe(id)));

        bus.call('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'ListNames', null,
            new GLib.VariantType('(as)'), Gio.DBusCallFlags.NONE, 3000, cancellable, (_bus, result) => {
                let names = [];
                try {
                    [names] = bus.call_finish(result).deep_unpack();
                } catch {
                    return;
                }
                for (const name of names.filter(n => n.startsWith(`${MPRIS_NAMESPACE}.`))) {
                    bus.call('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus',
                        'GetNameOwner', new GLib.Variant('(s)', [name]), new GLib.VariantType('(s)'),
                        Gio.DBusCallFlags.NONE, 3000, cancellable, (_b, res) => {
                            try {
                                add(name, bus.call_finish(res).deep_unpack()[0]);
                            } catch {
                                // Went away before it could be asked.
                            }
                        });
                }
            });
        fill();
        return page;
    }

    _vlcGroup(settings) {
        const group = new Adw.PreferencesGroup({
            title: 'VLC',
            description: 'The tracks switch changes VLC\'s own settings, and applies from the next time VLC starts.',
        });
        const hide = new Adw.SwitchRow({
            title: 'Hide VLC\'s own fullscreen controls',
            subtitle: 'So the bar is the only one over the video',
        });
        settings.bind('hide-vlc-controls', hide, 'active', Gio.SettingsBindFlags.DEFAULT);
        const tracks = new Adw.SwitchRow({
            title: 'Audio and subtitle tracks',
            subtitle: 'Lets the bar list and switch VLC\'s tracks and fix subtitle timing, over a private socket',
            active: readVlcState().trackControl,
        });
        const failed = new Adw.ActionRow({title: 'Could not change VLC\'s settings', use_markup: false, visible: false});
        tracks.connect('notify::active', () => {
            if (tracks.active === readVlcState().trackControl)
                return;
            try {
                tracks.active = writeVlcState(tracks.active).trackControl;
                failed.visible = false;
            } catch (e) {
                failed.subtitle = e.message;
                failed.visible = true;
                // The file is as it was, and so is the switch.
                tracks.active = readVlcState().trackControl;
            }
        });
        group.add(hide);
        group.add(tracks);
        group.add(failed);
        return group;
    }

    _mpvGroup() {
        const group = new Adw.PreferencesGroup({title: 'mpv and Celluloid'});
        const tracks = new Adw.SwitchRow({
            title: 'Audio and subtitle tracks',
            subtitle: 'Lets the bar list and switch tracks and chapters, and fix subtitle timing. ' +
                'Adds a small script to their script folders, and applies from the next start',
            active: readMpvState(),
        });
        const failed = new Adw.ActionRow({title: 'Could not change the script folders', use_markup: false, visible: false});
        tracks.connect('notify::active', () => {
            if (tracks.active === readMpvState())
                return;
            try {
                tracks.active = writeMpvState(tracks.active);
                failed.visible = false;
            } catch (e) {
                failed.subtitle = e.message;
                failed.visible = true;
                tracks.active = readMpvState();
            }
        });
        group.add(tracks);
        group.add(failed);
        return group;
    }

    _controllersPage(settings, cleanup) {
        const page = new Adw.PreferencesPage({title: 'Controllers', icon_name: 'input-gaming-symbolic'});

        const general = new Adw.PreferencesGroup({
            description: 'Game controllers work the bar while a fullscreen player has focus, and do nothing ' +
                'anywhere else. Every mapped pad — Xbox, PlayStation, Switch, 8BitDo, Steam Deck — has the ' +
                'same buttons here.',
        });
        page.add(general);
        const use = new Adw.SwitchRow({title: 'Use game controllers'});
        settings.bind('gamepads', use, 'active', Gio.SettingsBindFlags.DEFAULT);
        general.add(use);

        const connected = new Adw.PreferencesGroup({
            title: 'Connected',
            description: 'Press a button on a controller to see which one it is.',
        });
        page.add(connected);

        const buttons = new Adw.PreferencesGroup({
            title: 'Buttons',
            description: 'Named by where they sit, since the letters on them differ between makers. After ' +
                '"Move around the bar" (Start, to begin with), the d-pad moves the highlight, the bottom ' +
                'button presses and the right one goes back.',
        });
        const resetButtons = new Gtk.Button({
            label: 'Reset',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });
        resetButtons.connect('clicked', () => settings.reset('gamepad-buttons'));
        buttons.set_header_suffix(resetButtons);
        page.add(buttons);

        for (const group of [connected, buttons])
            settings.bind('gamepads', group, 'sensitive', Gio.SettingsBindFlags.GET);

        const buttonRows = this._buttonRows(settings, cleanup, buttons);
        this._watchPads(settings, cleanup, connected, buttonRows);
        return page;
    }

    _buttonRows(settings, cleanup, group) {
        const rows = new Map();
        const titles = Gtk.StringList.new(ACTIONS.map(a => a.title));
        const map = () => settings.get_value('gamepad-buttons').deep_unpack();
        for (const button of BUTTONS) {
            const row = new Adw.ComboRow({title: button.title, subtitle: button.hint ?? '', model: titles});
            const sync = () => {
                const action = map()[button.id] ?? 'none';
                row.selected = Math.max(0, ACTIONS.findIndex(a => a.id === action));
            };
            sync();
            cleanup.connect(settings, 'changed::gamepad-buttons', sync);
            row.connect('notify::selected', () => {
                const action = ACTIONS[row.selected]?.id ?? 'none';
                const current = map();
                if ((current[button.id] ?? 'none') === action)
                    return;
                if (action === 'none')
                    delete current[button.id];
                else
                    current[button.id] = action;
                settings.set_value('gamepad-buttons', new GLib.Variant('a{ss}', current));
            });
            group.add(row);
            rows.set(button.id, row);
        }
        return rows;
    }

    // Read with libmanette as the extension does, so what is listed is what the bar hears.
    _watchPads(settings, cleanup, group, buttonRows) {
        const rows = new Map();
        let placeholder = null;
        const showPlaceholder = (title, subtitle) => {
            if (placeholder)
                group.remove(placeholder);
            placeholder = null;
            if (rows.size)
                return;
            placeholder = new Adw.ActionRow({title, subtitle});
            group.add(placeholder);
        };
        const showNoPads = () => showPlaceholder('No controllers connected',
            'Plug one in or pair it over Bluetooth; it appears here as soon as it is.');

        const timers = new Map();
        cleanup.add(() => timers.forEach(id => GLib.source_remove(id)));
        const flash = (widget, apply, undo) => {
            apply();
            if (timers.has(widget))
                GLib.source_remove(timers.get(widget));
            timers.set(widget, GLib.timeout_add(GLib.PRIORITY_DEFAULT, FLASH_MS, () => {
                timers.delete(widget);
                undo();
                return GLib.SOURCE_REMOVE;
            }));
        };

        if (!Manette) {
            showPlaceholder('libmanette is not installed',
                'Game controllers need it: the libmanette package on most distributions.');
            return;
        }
        const monitor = new Manette.Monitor();
        const devices = new Map();

        const describe = device => {
            const kind = device.get_device_type() === Manette.DeviceType.STEAM_DECK ? 'Steam Deck · ' : '';
            const mapped = device.get_mapping() ? 'Mapped' : 'No mapping known — buttons may not match';
            return `${kind}${mapped}\n${device.get_guid()}`;
        };
        const addDevice = device => {
            if (devices.has(device))
                return;
            const guid = device.get_guid();
            const row = new Adw.SwitchRow({
                title: device.get_name() || 'Controller',
                subtitle: describe(device),
                use_markup: false,
                subtitle_lines: 2,
                active: !settings.get_strv('ignored-gamepads').includes(guid),
            });
            row.add_prefix(new Gtk.Image({icon_name: 'input-gaming-symbolic'}));
            row.connect('notify::active', () => {
                const list = settings.get_strv('ignored-gamepads').filter(g => g !== guid);
                if (!row.active)
                    list.push(guid);
                settings.set_strv('ignored-gamepads', list);
            });
            const id = device.connect('button-press-event', (_device, event) => {
                const [ok, code] = event.get_button();
                const button = ok ? buttonForCode(code) : null;
                const pressed = button ? button.title : `Button ${event.get_hardware_code()} (not mapped)`;
                // Two lines, as the row's own subtitle, so the page does not jump.
                flash(row, () => {
                    row.subtitle = `Pressed: ${pressed}\n${guid}`;
                    row.add_css_class('accent');
                }, () => {
                    row.subtitle = describe(device);
                    row.remove_css_class('accent');
                });
                const buttonRow = button && buttonRows.get(button.id);
                if (buttonRow) {
                    flash(buttonRow, () => buttonRow.add_css_class('accent'),
                        () => buttonRow.remove_css_class('accent'));
                }
            });
            devices.set(device, id);
            rows.set(device, row);
            group.add(row);
            showPlaceholder();
        };
        const removeDevice = device => {
            const row = rows.get(device);
            if (row)
                group.remove(row);
            rows.delete(device);
            const id = devices.get(device);
            if (id)
                device.disconnect(id);
            devices.delete(device);
            showNoPads();
        };

        const it = monitor.iterate();
        for (let [ok, device] = it.next(); ok; [ok, device] = it.next())
            addDevice(device);
        const connectedId = monitor.connect('device-connected', (_m, device) => addDevice(device));
        const disconnectedId = monitor.connect('device-disconnected', (_m, device) => removeDevice(device));
        cleanup.add(() => {
            monitor.disconnect(connectedId);
            monitor.disconnect(disconnectedId);
            for (const [device, id] of devices)
                device.disconnect(id);
            // Closes every pad's evdev node now rather than at garbage collection.
            monitor.run_dispose();
        });
        showNoPads();
    }
}
