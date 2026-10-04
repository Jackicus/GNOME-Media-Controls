// Sets VLC's settings file with the extension's own module
// (src/lib/vlcconfig.js): its remote-control socket on, as the Players
// page's switch does. Which file is $XDG_CONFIG_HOME/vlc/vlcrc, so
// `nested.sh player` runs this with XDG_CONFIG_HOME set to the nested
// session's own; run as is, it changes the real one.
//
//     gjs -m scripts/vlc-setup.js [on|off]
import {writeVlcState, vlcrcPath} from '../src/lib/vlcconfig.js';

const on = (ARGV[0] ?? 'on') !== 'off';
const state = writeVlcState(on);
print(`${vlcrcPath()}: track control ${state.trackControl}`);
