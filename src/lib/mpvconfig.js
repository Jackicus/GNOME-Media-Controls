// The script that gives mpv and Celluloid a control socket of their own, for
// the bar's tracks. Pure GLib: prefs.js imports it too.

import GLib from 'gi://GLib';

const SCRIPT = 'media-controls.lua';
// Their Flatpaks keep a config folder of their own under ~/.var/app.
const FLATPAKS = [['io.mpv.Mpv', 'mpv'], ['io.github.celluloid_player.Celluloid', 'celluloid']];

// A socket the user set is left alone. Each mpv core has its own, since
// Celluloid runs several in one process. The name is short: a Unix socket path
// is at most 107 bytes, and a sandbox's folder is 70 of them on the host.
const LUA = `-- Written by Media Controls: a control socket for the bar's tracks.
local utils = require 'mp.utils'
local runtime = os.getenv('XDG_RUNTIME_DIR')
if runtime and mp.get_property('input-ipc-server') == '' then
    math.randomseed(os.time() + math.floor(os.clock() * 1000000))
    mp.set_property('input-ipc-server', string.format('%s/mc-mpv-%d-%d.sock', runtime, utils.getpid(), math.random(1000000)))
end
`;

function scriptDirs() {
    const config = GLib.get_user_config_dir();
    const dirs = [GLib.build_filenamev([config, 'mpv', 'scripts'])];
    if (GLib.file_test(GLib.build_filenamev([config, 'celluloid']), GLib.FileTest.IS_DIR))
        dirs.push(GLib.build_filenamev([config, 'celluloid', 'scripts']));
    for (const [id, name] of FLATPAKS) {
        const app = GLib.build_filenamev([GLib.get_home_dir(), '.var', 'app', id]);
        if (GLib.file_test(app, GLib.FileTest.IS_DIR))
            dirs.push(GLib.build_filenamev([app, 'config', name, 'scripts']));
    }
    return dirs;
}

export const readMpvState = () =>
    scriptDirs().some(dir => GLib.file_test(GLib.build_filenamev([dir, SCRIPT]), GLib.FileTest.EXISTS));

// Returns the state the folders were left in; throws if one could not be written.
export function writeMpvState(on) {
    for (const dir of scriptDirs()) {
        const path = GLib.build_filenamev([dir, SCRIPT]);
        if (on) {
            GLib.mkdir_with_parents(dir, 0o755);
            GLib.file_set_contents(path, LUA);
        } else {
            GLib.unlink(path);
        }
    }
    return readMpvState();
}
