// Which player the bar is attached to (the focused fullscreen one), when the
// bar is seen, and what each action does.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {getPointerWatcher} from 'resource:///org/gnome/shell/ui/pointerWatcher.js';

import {
    NAVIGATION, SLEEP_EPISODES, SLEEP_MINUTES, SUBTITLE_SHIFT_MS, isIgnored, normaliseName, playerNames, repeats,
    stepRate,
} from './actions.js';
import {ControlBar} from './bar.js';
import {Gamepads} from './gamepads.js';
import {note} from './log.js';
import {PlayerRegistry} from './mpris.js';
import {readVlcState, writeVlcState} from './vlcconfig.js';
import {VlcRemote} from './vlcremote.js';

const POINTER_INTERVAL = 100;
const EDGE_FRACTION = 0.2;
// Seconds before a VLC without a socket is tried again as the bar comes up.
const REMOTE_RETRY = 10;
// Seconds before the end: a player that exits at the end of its file stays open.
const SLEEP_END_MARGIN = 0.5;
// A file left this near its end was watched: room for the credits and a lagging reckoning.
const SLEEP_WATCHED_MARGIN = 30;

const clock = () => GLib.get_monotonic_time() / 1e6;

export class MediaControlsApp {
    constructor(extension) {
        this._extension = extension;
        this._settings = null;
        this._registry = null;
        this._bar = null;
        this._pads = null;
        this._player = null;
        this._window = null;
        this._pointerWatch = null;
        this._hideId = 0;
        this._grab = null;
        this._pressId = 0;
        this._updateId = 0;
        this._watched = null;
        this._remote = null;
        this._remoteTriedAt = -Infinity;
        this._remoteRetryId = 0;
        this._keyboard = null;
        this._sleep = null;
        this._sleepId = 0;
    }

    enable() {
        this._settings = this._extension.getSettings();
        if (this._settings.get_boolean('hide-vlc-controls'))
            this._setVlcControls(true);

        this._bar = new ControlBar();
        this._bar.connect('action', (_bar, action) => this.perform(action));
        this._bar.panel.connect('notify::hover', () => this._armHide());
        this._bar.tracksMenu.connect('open-state-changed', () => this._armHide());
        this._bar.setScale(this._settings.get_int('bar-scale'));
        this._syncPosition();
        this._syncButtons();
        // trackFullscreen stays off (the default), so the bar is shown over fullscreen windows.
        Main.layoutManager.addChrome(this._bar);

        this._registry = new PlayerRegistry();
        this._registry.connectObject(
            'added', () => this._queueUpdate(),
            'removed', (_registry, player) => {
                if (this._sleep?.player === player)
                    this._setSleep(null);
                this._queueUpdate();
            },
            // Once a player is attached, only the window's own pid, arriving
            // late, may replace one matched by desktop entry.
            'changed', (_registry, player) => {
                if (!this._player ||
                    (player.pid && player.pid === this._window?.get_pid() && this._player.pid !== player.pid))
                    this._queueUpdate();
            },
            this);
        this._registry.enable();

        global.display.connectObject('notify::focus-window', () => this._queueUpdate(), this);
        Main.overview.connectObject(
            'showing', () => this._queueUpdate(),
            'hidden', () => this._queueUpdate(),
            this);
        Main.layoutManager.connectObject('monitors-changed', () => this._queueUpdate(), this);
        this._settings.connectObject(
            'changed::ignored-players', () => this._queueUpdate(),
            'changed::pointer-reveal', () => this._syncPointerWatch(),
            'changed::gamepads', () => this._syncGamepads(),
            'changed::bar-scale', () => this._bar.setScale(this._settings.get_int('bar-scale')),
            'changed::bar-position', () => this._syncPosition(),
            'changed::previous-next', () => this._syncButtons(),
            'changed::hidden-buttons', () => this._syncButtons(),
            'changed::show-clock', () => this._syncClock(),
            'changed::show-length', () => this._syncLength(),
            'changed::sleep-timer', () => this._syncSleep(),
            'changed::hide-vlc-controls', () => this._setVlcControls(this._settings.get_boolean('hide-vlc-controls')),
            'changed::sleep-timer-mode', () => {
                this._setSleep(null);
                this._syncSleep();
            },
            this);
        this._syncClock();
        this._syncLength();
        this._syncSleep();

        Main.wm.addKeybinding('toggle-bar', this._settings, Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.POPUP, () => this._toggleFocus());

        this._syncGamepads();
        this._update();
    }

    disable() {
        Main.wm.removeKeybinding('toggle-bar');
        this._setSleep(null);
        this._dropRemote();
        this._ungrab();
        // Disposed now, so the virtual keyboard leaves the seat at once.
        this._keyboard?.run_dispose();
        this._keyboard = null;
        this._pads?.disable();
        this._pads = null;
        this._stopPointerWatch();
        this._watchWindow(null);
        this._player?.disconnectObject(this);
        this._player = null;
        this._window = null;
        global.display.disconnectObject(this);
        Main.overview.disconnectObject(this);
        Main.layoutManager.disconnectObject(this);
        this._settings.disconnectObject(this);
        this._registry.disconnectObject(this);
        this._registry.disable();
        this._registry = null;
        this._bar.destroy();
        this._bar = null;
        if (this._hideId)
            GLib.source_remove(this._hideId);
        this._hideId = 0;
        if (this._updateId)
            GLib.source_remove(this._updateId);
        this._updateId = 0;
        // Not at a lock: the unlock enables again, and no VLC starts between.
        if (!Main.sessionMode.isLocked && this._settings.get_boolean('hide-vlc-controls'))
            this._setVlcControls(false);
        this._settings = null;
    }

    _setVlcControls(hide) {
        try {
            if (readVlcState().hideControls !== hide)
                writeVlcState({hideControls: hide});
        } catch (e) {
            console.error('[Media Controls] Could not change VLC\'s settings:', e);
        }
    }

    // Focus moves as the overview hides: such changes are settled together.
    _queueUpdate() {
        if (this._updateId)
            return;
        this._updateId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._updateId = 0;
            this._update();
            return GLib.SOURCE_REMOVE;
        });
    }

    _update() {
        const focused = global.display.focus_window;
        this._watchWindow(focused);
        const window = focused?.is_fullscreen() && !Main.overview.visible ? focused : null;
        const player = window ? this._playerFor(window) : null;
        this._attach(player, player ? window : null);
    }

    // The focused window can change fullscreen or close without the focus moving.
    _watchWindow(window) {
        if (window === this._watched)
            return;
        this._watched?.disconnectObject(this);
        this._watched = window;
        window?.connectObject(
            'notify::fullscreen', () => this._queueUpdate(),
            'notify::main-monitor', () => this._queueUpdate(),
            'unmanaged', () => this._queueUpdate(),
            this);
    }

    _playerFor(window) {
        const ignored = this._settings.get_strv('ignored-players').map(normaliseName);
        const players = this._registry.players.filter(p => !isIgnored(p, ignored));
        const pid = window.get_pid();
        const byPid = pid > 0 && players.find(p => p.pid === pid);
        if (byPid)
            return byPid;
        const app = Shell.WindowTracker.get_default().get_window_app(window);
        const ids = [app?.get_id(), window.get_sandboxed_app_id(), window.get_gtk_application_id(),
            window.get_wm_class(), window.get_wm_class_instance()].filter(Boolean).map(normaliseName);
        return players.find(p => p.desktopEntry && ids.includes(normaliseName(p.desktopEntry))) ?? null;
    }

    _attach(player, window) {
        if (player === this._player && window === this._window) {
            if (window)
                this._bar.setMonitor(window.get_monitor());
            return;
        }
        this._player?.disconnectObject(this);
        this._player = player;
        this._window = window;
        this._dropRemote();
        this._ungrab();
        this._bar.setPlayer(player);
        if (!player) {
            this._bar.conceal({animate: false});
            this._syncPointerWatch();
            return;
        }
        note(`Attached to ${player.identity || player.busName} (pid ${player.pid})`);
        this._bar.setMonitor(window.get_monitor());
        let status = player.status;
        let url = player.url;
        player.connectObject(
            'changed', () => {
                if (player.status !== status || player.url !== url) {
                    status = player.status;
                    url = player.url;
                    this._reveal();
                }
            },
            'seeked', () => this._reveal(),
            this);
        this._syncPointerWatch();
        this._connectRemote(player);
        if (player.status === 'Paused')
            this._reveal();
    }

    _reveal() {
        if (!this._bar.visible) {
            this._player.refreshPosition();
            this._player.refreshTrackList();
            this._readTracks();
            if (!this._remote && clock() - this._remoteTriedAt > REMOTE_RETRY)
                this._connectRemote(this._player);
        }
        this._bar.reveal();
        this._armHide();
    }

    _conceal() {
        this._bar.conceal();
        this._ungrab();
        if (this._hideId) {
            GLib.source_remove(this._hideId);
            this._hideId = 0;
        }
    }

    _armHide() {
        if (this._hideId)
            GLib.source_remove(this._hideId);
        this._hideId = 0;
        if (!this._bar.visible)
            return;
        this._hideId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
            this._settings.get_int('hide-delay') * 1000, () => {
                this._hideId = 0;
                if (this._staying())
                    this._armHide();
                else
                    this._conceal();
                return GLib.SOURCE_REMOVE;
            });
        GLib.Source.set_name_by_id(this._hideId, '[media-controls] hide');
    }

    _staying() {
        return this._bar.hovered || this._bar.dragging || !!this._grab || this._bar.menuOpen ||
            (this._settings.get_boolean('stay-while-paused') && this._player?.status === 'Paused');
    }

    _syncPointerWatch() {
        const want = !!this._player && this._settings.get_string('pointer-reveal') !== 'never';
        if (want && !this._pointerWatch)
            this._pointerWatch = getPointerWatcher().addWatch(POINTER_INTERVAL, (x, y) => this._pointerMoved(x, y));
        else if (!want)
            this._stopPointerWatch();
    }

    _stopPointerWatch() {
        this._pointerWatch?.remove();
        this._pointerWatch = null;
    }

    _pointerMoved(x, y) {
        const monitor = Main.layoutManager.monitors[this._window.get_monitor()];
        if (!monitor || x < monitor.x || x >= monitor.x + monitor.width ||
            y < monitor.y || y >= monitor.y + monitor.height)
            return;
        if (this._settings.get_string('pointer-reveal') === 'edge' && !this._bar.hovered) {
            const top = this._settings.get_string('bar-position') === 'top';
            const edge = monitor.height * EDGE_FRACTION;
            if (top ? y >= monitor.y + edge : y < monitor.y + monitor.height - edge)
                return;
        }
        this._reveal();
    }

    _syncLength() {
        this._bar.setShowLength(this._settings.get_boolean('show-length'));
    }

    _syncPosition() {
        this._bar.setTop(this._settings.get_string('bar-position') === 'top');
    }

    _syncButtons() {
        this._bar.setButtons(this._settings.get_string('previous-next'), this._settings.get_strv('hidden-buttons'));
    }

    _toggleFocus() {
        if (this._grab)
            this._conceal();
        else
            this._enterFocus();
    }

    _enterFocus() {
        if (!this._player || this._grab)
            return;
        this._reveal();
        this._grab = Main.pushModal(this._bar.panel, {actionMode: Shell.ActionMode.POPUP});
        // Under the grab every press reaches the panel; one outside it closes the bar.
        this._pressId = this._bar.panel.connect('button-press-event', (actor, event) => {
            if (!actor.contains(global.stage.get_event_actor(event)))
                this._conceal();
            return Clutter.EVENT_PROPAGATE;
        });
        this._bar.focusDefault();
        this._armHide();
    }

    _ungrab() {
        if (!this._grab)
            return;
        this._bar.panel.disconnect(this._pressId);
        this._pressId = 0;
        Main.popModal(this._grab);
        this._grab = null;
    }

    // Returns whether a player was there to ask.
    perform(action) {
        const p = this._player;
        if (!p)
            return false;
        const seek = this._settings.get_int('seek-step');
        const volume = this._settings.get_int('volume-step') / 100;
        switch (action) {
        case 'play-pause': p.playPause(); break;
        case 'seek-back': p.seekBy(-seek); break;
        case 'seek-forward': p.seekBy(seek); break;
        case 'previous': p.previous(); break;
        case 'next': p.next(); break;
        case 'volume-up': p.setVolume(p.volume + volume); break;
        case 'volume-down': p.setVolume(p.volume - volume); break;
        case 'mute': p.toggleMute(); break;
        case 'slower': p.setRate(stepRate(p.rate, -1, p.minRate, p.maxRate)); break;
        case 'faster': p.setRate(stepRate(p.rate, 1, p.minRate, p.maxRate)); break;
        case 'quit': this._quit(); return true;
        case 'hide-bar': this._conceal(); return true;
        case 'show-bar': break;
        case 'toggle-length':
            this._settings.set_boolean('show-length', !this._settings.get_boolean('show-length'));
            break;
        case 'navigate': this._toggleFocus(); return true;
        case 'tracks': this._openTracks(); return true;
        // No reveal: the subtitles being timed are under the bar.
        case 'cycle-audio': this._remote?.cycleAudio(); return true;
        case 'cycle-subtitles': this._remote?.cycleSubtitles(); return true;
        case 'subtitles-earlier': this._remote?.shiftSubtitles(-SUBTITLE_SHIFT_MS); return true;
        case 'subtitles-later': this._remote?.shiftSubtitles(SUBTITLE_SHIFT_MS); return true;
        case 'sleep-timer':
            if (!this._settings.get_boolean('sleep-timer'))
                return false;
            this._cycleSleep();
            this._bar.sync();
            break;
        default: return false;
        }
        this._reveal();
        return true;
    }

    _quit() {
        const window = this._window;
        this._conceal();
        if (this._player.canQuit)
            this._player.quit();
        else
            window.delete(global.get_current_time());
    }

    // A VLC still busy with a connection from before (a reload) gets one retry.
    _connectRemote(player, retry = true) {
        this._dropRemote();
        if (!player.pid || !playerNames(player).includes('vlc'))
            return;
        this._remoteTriedAt = clock();
        const remote = new VlcRemote();
        this._remote = remote;
        remote.open(player.pid).then(ok => {
            if (this._remote !== remote)
                return;
            if (!ok) {
                remote.close();
                this._remote = null;
                if (retry && remote.answered === false) {
                    this._remoteRetryId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                        this._remoteRetryId = 0;
                        if (this._player === player && !this._remote)
                            this._connectRemote(player, false);
                        return GLib.SOURCE_REMOVE;
                    });
                }
                return;
            }
            remote.connectObject('lost', () => {
                if (this._remote === remote)
                    this._dropRemote();
            }, this);
            this._bar.setRemote(remote);
            this._readTracks();
        });
    }

    // VLC serves one client, so the connection is closed before anything else.
    _dropRemote() {
        if (this._remoteRetryId) {
            GLib.source_remove(this._remoteRetryId);
            this._remoteRetryId = 0;
        }
        const remote = this._remote;
        if (!remote)
            return;
        this._remote = null;
        remote.close();
        remote.disconnectObject(this);
        this._bar.setRemote(null);
    }

    // VLC lists tracks only while playing: read them for a pop-out opened paused.
    _readTracks() {
        if (this._remote && this._player.playing)
            this._remote.state().catch(() => {});
    }

    _openTracks() {
        this._reveal();
        this._bar.openTracks({focus: !!this._grab});
    }

    // Returns what to repeat while held, or null. Decided at the press: an arrow
    // while the bar holds the focus, an action otherwise.
    _onPadButton(button, action) {
        const player = this._player;
        if (!player)
            return null;
        const navigating = () => !!(this._grab || this._bar.menuOpen);
        const key = NAVIGATION[button];
        if (key && navigating()) {
            const keyval = Clutter[`KEY_${key}`];
            this._pressKey(keyval);
            if (key === 'Return' || key === 'Escape')
                return null;
            return () => {
                if (this._player !== player || !navigating())
                    return false;
                this._pressKey(keyval);
                return true;
            };
        }
        if (action === 'tracks' && this._remote)
            this._enterFocus();
        if (!this.perform(action) || !repeats(action))
            return null;
        return () => this._player === player && !(key && navigating()) && this.perform(action);
    }

    // Only called while the bar or its pop-out holds the grab, so the key lands there.
    _pressKey(keyval) {
        if (!this._keyboard) {
            const seat = Clutter.get_default_backend().get_default_seat();
            this._keyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        }
        const time = GLib.get_monotonic_time();
        this._keyboard.notify_keyval(time, keyval, Clutter.KeyState.PRESSED);
        this._keyboard.notify_keyval(time, keyval, Clutter.KeyState.RELEASED);
    }

    _syncClock() {
        this._bar.setClock(this._settings.get_boolean('show-clock'));
    }

    _syncSleep() {
        const on = this._settings.get_boolean('sleep-timer');
        if (!on)
            this._setSleep(null);
        this._bar.setSleep(on ? () => this._sleepText() : null);
    }

    _sleepText() {
        const sleep = this._sleep;
        if (!sleep || sleep.player !== this._player)
            return '';
        if (sleep.episodes === 1)
            return 'End';
        if (sleep.episodes)
            return `${sleep.episodes} eps`;
        return `${Math.max(1, Math.ceil((sleep.until - clock()) / 60))} min`;
    }

    _cycleSleep() {
        const mine = this._sleep?.player === this._player ? this._sleep : null;
        if (this._settings.get_string('sleep-timer-mode') === 'episodes') {
            const episodes = this._player.length && this._player.url &&
                SLEEP_EPISODES.find(n => n > (mine?.episodes ?? 0));
            this._setSleep(episodes ? {episodes} : null);
            return;
        }
        let at = -1;
        if (mine)
            at = SLEEP_MINUTES.indexOf(mine.episodes ? 'end' : mine.minutes);
        const step = SLEEP_MINUTES[at + 1];
        if (step === undefined || (step === 'end' && !this._player.length))
            this._setSleep(null);
        else
            this._setSleep(step === 'end' ? {episodes: 1} : {minutes: step});
    }

    _setSleep(timer) {
        if (this._sleepId) {
            GLib.source_remove(this._sleepId);
            this._sleepId = 0;
        }
        for (const id of this._sleep?.signals ?? [])
            this._sleep.player.disconnect(id);
        this._sleep = null;
        if (!timer)
            return;
        const player = this._player;
        this._sleep = {...timer, player, url: player.url, signals: []};
        if (timer.episodes) {
            this._sleep.signals = [
                player.connect('changed', () => this._sleepPlayerChanged()),
                player.connect('seeked', () => this._armSleepEnd()),
            ];
            this._armSleepEnd();
        } else {
            this._sleep.until = clock() + timer.minutes * 60;
            this._sleepId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, timer.minutes * 60, () => {
                this._sleepId = 0;
                this._sleepEnded();
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    // A new file counts one episode unless the one before was skipped. A
    // player between files may name none for a moment.
    _sleepPlayerChanged() {
        const sleep = this._sleep;
        const {url, lastFile} = sleep.player;
        if (url && url !== sleep.url) {
            const skipped = lastFile?.length > 0 && lastFile.length - lastFile.reached > SLEEP_WATCHED_MARGIN;
            const counted = !!sleep.url && !skipped;
            sleep.url = url;
            if (counted && --sleep.episodes < 1) {
                this._sleepEnded();
                return;
            }
        }
        this._armSleepEnd();
    }

    _armSleepEnd() {
        if (this._sleepId) {
            GLib.source_remove(this._sleepId);
            this._sleepId = 0;
        }
        const p = this._sleep.player;
        if (this._sleep.episodes !== 1 || !p.playing || !p.length)
            return;
        const left = Math.max(0, (p.length - p.now) / (p.rate || 1) - SLEEP_END_MARGIN);
        this._sleepId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.round(left * 1000), () => {
            this._sleepId = 0;
            this._sleepEnded();
            return GLib.SOURCE_REMOVE;
        });
    }

    _sleepEnded() {
        const {player} = this._sleep;
        this._setSleep(null);
        player.pause();
    }

    _syncGamepads() {
        const want = this._settings.get_boolean('gamepads');
        if (want && !this._pads) {
            this._pads = new Gamepads(this._settings, (button, action) => this._onPadButton(button, action));
            this._pads.enable();
        } else if (!want && this._pads) {
            this._pads.disable();
            this._pads = null;
        }
    }
}
