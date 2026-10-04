// A player's control socket that speaks lines: connected only if the peer is the
// player's own process, read a line at a time and written one write at a time.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {EventEmitter} from 'resource:///org/gnome/shell/misc/signals.js';

import {isCancelled} from './mpris.js';

const encoder = new TextEncoder();

export class LineRemote extends EventEmitter {
    constructor() {
        super();
        this._cancellable = new Gio.Cancellable();
        this._connection = null;
        this._input = null;
        this._output = null;
        this._writes = [];
    }

    // Resolves true once connected to `path` and the socket's peer is process `pid`.
    // Not `connect`, which connectObject builds on.
    _dial(path, pid) {
        return new Promise(resolve => {
            const client = new Gio.SocketClient();
            client.connect_async(Gio.UnixSocketAddress.new(path), this._cancellable, (_c, result) => {
                let connection, peer;
                try {
                    connection = client.connect_finish(result);
                    peer = connection.get_socket().get_credentials().get_unix_pid();
                } catch {
                    // No socket: the player is not set up for it, or not running.
                    resolve(false);
                    return;
                }
                if (this._cancellable.is_cancelled() || peer !== pid) {
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
                resolve(true);
            });
        });
    }

    close() {
        this._shut();
        this._fail(new Error('closed'));
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
        if (text === undefined)
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
            if (this._cancellable.is_cancelled())
                return;
            this._writes.shift();
            this._write();
        });
    }

    _readLine() {
        this._input.read_line_async(GLib.PRIORITY_DEFAULT, this._cancellable, (stream, result) => {
            let line;
            try {
                [line] = stream.read_line_finish_utf8(result);
            } catch (e) {
                if (!isCancelled(e))
                    this._lost();
                return;
            }
            if (this._cancellable.is_cancelled())
                return;
            if (line === null) {
                this._lost();
                return;
            }
            this._onLine(line.replace(/\r$/, ''));
            this._readLine();
        });
    }

    _lost(error = new Error('The player closed the connection')) {
        if (this._cancellable.is_cancelled())
            return;
        this._shut();
        this._fail(error);
        this.emit('lost');
    }

    // Closing at once frees a player that serves one client at a time.
    _shut() {
        this._cancellable.cancel();
        this._writes = [];
        this._connection?.close_async(GLib.PRIORITY_DEFAULT, null, null);
        this._connection = null;
        this._input = null;
        this._output = null;
    }
}
