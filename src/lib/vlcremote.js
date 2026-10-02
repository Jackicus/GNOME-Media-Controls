// VLC's oldrc remote-control socket: lines of text, a reply ending in
// "<command>: returned". Paused, VLC answers "Press pause to continue." to
// almost everything but still takes hotkeys, so the lists read while playing are kept.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {EventEmitter} from 'resource:///org/gnome/shell/misc/signals.js';

import {SOCKET_PATH} from './vlcconfig.js';

const REPLY_TIMEOUT_MS = 2000;
const PAUSED = 'Press pause to continue.';
const encoder = new TextEncoder();

// Paused before any tracks were read.
export class PausedError extends Error {}
// VLC's own subtitle-delay hotkeys move it by 50 ms a press.
const SUBTITLE_STEP_MS = 50;

function isCancelled(e) {
    return e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
}

// "Japanese - [Japanese]" → "Japanese"; "Track 1 - [English]" → "English";
// "Signs & Songs - [English]" → "Signs & Songs · English".
function trackLabel(raw) {
    const match = raw.match(/^(.*?) - \[(.*)\]$/);
    if (!match)
        return raw;
    const [, title, language] = match;
    if (!language || title === language)
        return title || language;
    if (/^Track \d+$/.test(title))
        return language;
    return `${title} · ${language}`;
}

// "| <id> - <name>[ *]" lines of an atrack or strack reply.
function parseTracks(lines) {
    const tracks = [];
    for (const line of lines) {
        const match = line.match(/^\| (-?\d+) - (.*?)( \*)?$/);
        if (!match)
            continue;
        const id = Number(match[1]);
        tracks.push({
            id,
            label: id === -1 ? 'Off' : trackLabel(match[2]),
            current: !!match[3],
        });
    }
    return tracks;
}

export class VlcRemote extends EventEmitter {
    constructor() {
        super();
        this._cancellable = new Gio.Cancellable();
        this._connection = null;
        this._input = null;
        this._output = null;
        this._pending = null;     // {verb, lines, resolve, reject, timeoutId}
        this._queue = [];
        this._writes = [];
        this._closed = false;
        // False when VLC was ours but busy with a connection from before.
        this.answered = null;
        // {audio, subtitles, chapter} as last read while playing this file.
        this._last = null;
        this._inputs = 0;
        // In ms. VLC cannot be asked, so changes made with VLC's own keys are not in it.
        this.subtitleDelay = 0;
    }

    // Resolves true once connected to the VLC with process id `pid`. Not
    // `connect`, which connectObject builds on.
    open(pid) {
        return new Promise(resolve => {
            const client = new Gio.SocketClient();
            client.connect_async(Gio.UnixSocketAddress.new(SOCKET_PATH), this._cancellable, (_c, result) => {
                let connection;
                try {
                    connection = client.connect_finish(result);
                } catch {
                    // No socket: VLC is not set up for it, or not running.
                    resolve(false);
                    return;
                }
                let peer = 0;
                try {
                    peer = connection.get_socket().get_credentials().get_unix_pid();
                } catch {
                    // Credentials unavailable: treat as not ours.
                }
                if (this._closed || peer !== pid) {
                    connection.close_async(GLib.PRIORITY_DEFAULT, null, null);
                    resolve(false);
                    return;
                }
                this._connection = connection;
                this._input = new Gio.DataInputStream({
                    base_stream: connection.get_input_stream(),
                    close_base_stream: false,
                });
                this._output = connection.get_output_stream();
                this._readLine();
                this._command('atrack').then(() => resolve(true), () => {
                    // Connected, and ours, but not answered.
                    this.answered = false;
                    this.close();
                    resolve(false);
                });
            });
        });
    }

    close() {
        this._shut();
        this._fail(new Error('closed'));
    }

    // {audio, subtitles, chapter}: fresh while playing, the last reading while
    // paused. Read again if the file changed meanwhile.
    async state() {
        const input = this._inputs;
        const audioReply = await this._command('atrack');
        if (audioReply.includes(PAUSED)) {
            if (this._last)
                return this._last;
            throw new PausedError('VLC lists its tracks only while playing');
        }
        const audio = parseTracks(audioReply);
        const subtitles = parseTracks(await this._command('strack'));
        const chapter = await this._readChapter();
        if (this._inputs !== input)
            return this.state();
        this._last = {audio, subtitles, chapter};
        return this._last;
    }

    // VLC counts from 0, and answers only while playing.
    async _readChapter() {
        const match = (await this._command('chapter')).join('\n').match(/chapter (\d+)\/(\d+)/);
        return match ? {current: Number(match[1]), count: Number(match[2])} : {current: 0, count: 0};
    }

    setAudio(id) {
        return this._setTrack('audio', 'atrack', 'key-audio-track', id);
    }

    setSubtitles(id) {
        return this._setTrack('subtitles', 'strack', 'key-subtitle-track', id);
    }

    async _setTrack(kind, command, hotkey, id) {
        const reply = await this._command(`${command} ${id}`);
        if (reply.includes(PAUSED)) {
            // Press VLC's cycle hotkey until it gets there. Audio cycling skips
            // Disable; subtitle cycling goes through Off.
            const list = (this._last?.[kind] ?? []).filter(t => kind !== 'audio' || t.id !== -1);
            const from = list.findIndex(t => t.current);
            const to = list.findIndex(t => t.id === id);
            if (from === -1 || to === -1)
                return;
            for (let i = 0; i < (to - from + list.length) % list.length; i++)
                this._send(`key ${hotkey}`);
        }
        for (const track of this._last?.[kind] ?? [])
            track.current = track.id === id;
    }

    // Positive `ms` is later, in steps of SUBTITLE_STEP_MS.
    shiftSubtitles(ms) {
        const steps = Math.round(ms / SUBTITLE_STEP_MS);
        const key = steps > 0 ? 'key-subdelay-up' : 'key-subdelay-down';
        for (let i = 0; i < Math.abs(steps); i++)
            this._send(`key ${key}`);
        this.subtitleDelay += steps * SUBTITLE_STEP_MS;
        this.emit('changed');
    }

    resetSubtitles() {
        this._send('key key-subsync-reset');
        this.subtitleDelay = 0;
        this.emit('changed');
    }

    cycleAudio() {
        this._send('key key-audio-track');
    }

    cycleSubtitles() {
        this._send('key key-subtitle-track');
    }

    // Paused, VLC cannot be asked where it landed: the count is moved on here.
    async chapter(delta) {
        const reply = await this._command(delta > 0 ? 'chapter_n' : 'chapter_p');
        if (!reply.includes(PAUSED)) {
            const chapter = await this._readChapter();
            if (this._last)
                this._last.chapter = chapter;
            return chapter;
        }
        this._send(delta > 0 ? 'key key-chapter-next' : 'key key-chapter-prev');
        const chapter = this._last?.chapter;
        if (chapter)
            chapter.current = Math.max(0, Math.min(chapter.count - 1, chapter.current + Math.sign(delta)));
        return chapter ?? null;
    }

    // One write at a time: a GIO stream refuses a second while one is pending.
    _send(text) {
        if (!this._output)
            return;
        this._writes.push(text);
        if (this._writes.length === 1)
            this._write();
    }

    _write() {
        const text = this._writes[0];
        if (text === undefined || !this._output)
            return;
        const bytes = new GLib.Bytes(encoder.encode(`${text}\n`));
        this._output.write_bytes_async(bytes, GLib.PRIORITY_DEFAULT, this._cancellable, (stream, result) => {
            try {
                stream.write_bytes_finish(result);
            } catch (e) {
                this._writes = [];
                if (!isCancelled(e))
                    this._lost();
                return;
            }
            if (this._closed)
                return;
            this._writes.shift();
            this._write();
        });
    }

    // One command at a time: replies are matched to commands by verb.
    _command(text) {
        return new Promise((resolve, reject) => {
            if (!this._connection) {
                reject(new Error('not connected'));
                return;
            }
            this._queue.push({text, verb: text.split(' ')[0], lines: [], resolve, reject});
            this._next();
        });
    }

    _next() {
        if (this._pending || !this._queue.length)
            return;
        const pending = this._pending = this._queue.shift();
        pending.timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, REPLY_TIMEOUT_MS, () => {
            pending.timeoutId = 0;
            if (this._pending === pending)
                this._lost(new Error(`VLC did not answer ${pending.text}`));
            return GLib.SOURCE_REMOVE;
        });
        this._send(pending.text);
    }

    _readLine() {
        this._input?.read_line_async(GLib.PRIORITY_DEFAULT, this._cancellable, (stream, result) => {
            let line;
            try {
                [line] = stream.read_line_finish_utf8(result);
            } catch (e) {
                if (!isCancelled(e))
                    this._lost();
                return;
            }
            if (this._closed)
                return;
            if (line === null) {
                this._lost();
                return;
            }
            this._onLine(line.replace(/\r$/, '').replace(/^> ?/, ''));
            this._readLine();
        });
    }

    _onLine(line) {
        if (line.startsWith('status change:')) {
            if (line.includes('new input:')) {
                this._inputs++;
                this._last = null;
                this.subtitleDelay = 0;
                this.emit('changed');
                this.emit('new-input');
            }
            return;
        }
        const pending = this._pending;
        if (!pending)
            return;
        if (line.startsWith(`${pending.verb}: returned`)) {
            this._pending = null;
            if (pending.timeoutId)
                GLib.source_remove(pending.timeoutId);
            pending.resolve(pending.lines);
            this._next();
        } else {
            pending.lines.push(line);
        }
    }

    _lost(error = new Error('VLC closed the connection')) {
        if (this._closed || !this._connection)
            return;
        this._shut();
        this._fail(error);
        this.emit('lost');
    }

    // Closing at once frees VLC for its next client.
    _shut() {
        this._closed = true;
        this._cancellable.cancel();
        this._writes = [];
        this._connection?.close_async(GLib.PRIORITY_DEFAULT, null, null);
        this._connection = this._input = this._output = null;
    }

    _fail(error) {
        const all = [this._pending, ...this._queue].filter(Boolean);
        this._pending = null;
        this._queue = [];
        for (const pending of all) {
            if (pending.timeoutId)
                GLib.source_remove(pending.timeoutId);
            pending.reject(error);
        }
    }
}
