// VLC's settings file (vlcrc) and the remote-control socket this extension may
// switch on in it. Pure GLib and Gio: prefs.js imports it too.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// A Unix socket path is at most 107 bytes; $XDG_RUNTIME_DIR is short and private.
// A Flatpak VLC sees its own runtime folder at the same path (lineremote.js hostPath).
export const SOCKET_PATH = GLib.build_filenamev([GLib.get_user_runtime_dir(), 'media-controls-vlc.sock']);

const RC_MODULE = 'oldrc';
// VLC reads an option only under its module's section.
const SECTION = {
    'extraintf': 'core',
    'rc-unix': 'oldrc',
    'rc-fake-tty': 'oldrc',
};

const FLATPAK = 'org.videolan.VLC';

// The Flatpak's own, once it has run, besides the one in $XDG_CONFIG_HOME.
export function vlcrcPaths() {
    const paths = [GLib.build_filenamev([GLib.get_user_config_dir(), 'vlc', 'vlcrc'])];
    const app = GLib.build_filenamev([GLib.get_home_dir(), '.var', 'app', FLATPAK]);
    if (GLib.file_test(app, GLib.FileTest.IS_DIR))
        paths.push(GLib.build_filenamev([app, 'config', 'vlc', 'vlcrc']));
    return paths;
}

function readLines(path) {
    try {
        const [, bytes] = GLib.file_get_contents(path);
        return new TextDecoder().decode(bytes).split('\n');
    } catch {
        return null;
    }
}

// Null where the option is left at VLC's default.
function valueOf(lines, name) {
    for (const line of lines ?? []) {
        if (line.startsWith(`${name}=`))
            return line.slice(name.length + 1);
    }
    return null;
}

const modulesOf = value => (value ?? '').split(/[:,]/).map(m => m.trim()).filter(Boolean);

function isOn(path) {
    const lines = readLines(path);
    return modulesOf(valueOf(lines, 'extraintf')).includes(RC_MODULE) &&
        valueOf(lines, 'rc-unix') === SOCKET_PATH &&
        valueOf(lines, 'rc-fake-tty') === '1';
}

export function readVlcState(paths = vlcrcPaths()) {
    return {trackControl: paths.every(isOn)};
}

// `value` null puts `name` back to VLC's default.
function setValue(lines, name, value) {
    const set = value === null ? null : `${name}=${value}`;
    const at = lines.findIndex(l => l.startsWith(`${name}=`));
    const commented = lines.findIndex(l => l.startsWith(`#${name}=`));
    if (at !== -1) {
        if (set)
            lines[at] = set;
        else if (commented !== -1)
            lines.splice(at, 1);
        else
            lines[at] = `#${lines[at]}`;
    } else if (set) {
        if (commented !== -1) {
            lines.splice(commented + 1, 0, set);
            return;
        }
        const section = SECTION[name];
        const header = lines.findIndex(l => l === `[${section}]` || l.startsWith(`[${section}] `));
        if (header !== -1)
            lines.splice(header + 1, 0, set);
        else
            lines.push('', `[${section}]`, set);
    }
}

// Returns the state the files were left in; throws if one could not be written.
export function writeVlcState(trackControl, paths = vlcrcPaths()) {
    for (const path of paths) {
        const lines = readLines(path) ?? ['# Written by Media Controls; VLC fills in the rest.', ''];
        const others = modulesOf(valueOf(lines, 'extraintf')).filter(m => m !== RC_MODULE);
        const modules = trackControl ? [...others, RC_MODULE] : others;
        setValue(lines, 'extraintf', modules.length ? modules.join(':') : null);
        setValue(lines, 'rc-unix', trackControl ? SOCKET_PATH : null);
        setValue(lines, 'rc-fake-tty', trackControl ? '1' : null);
        GLib.mkdir_with_parents(GLib.path_get_dirname(path), 0o700);
        // VLC drops the last character of every line as its newline, the last
        // line's included: a file that does not end in one loses a letter.
        let text = lines.join('\n');
        if (!text.endsWith('\n'))
            text += '\n';
        Gio.File.new_for_path(path).replace_contents(new TextEncoder().encode(text), null, true,
            Gio.FileCreateFlags.NONE, null);
    }
    return readVlcState(paths);
}
