// Sets VLC's settings file with the extension's own module
// (src/lib/vlcconfig.js): its remote-control socket on, as the Players
// page's switch does, to $XDG_CONFIG_HOME/vlc/vlcrc alone (never a Flatpak
// VLC's). `nested.sh player` runs this with XDG_CONFIG_HOME set to the nested
// session's own; run as is, it changes the real one.
//
//     gjs -m scripts/vlc-setup.js [on|off]
import {vlcrcPaths, writeVlcState} from '../src/lib/vlcconfig.js';

const on = (ARGV[0] ?? 'on') !== 'off';
const [path] = vlcrcPaths();
const state = writeVlcState(on, [path]);
print(`${path}: track control ${state.trackControl}`);
