// GObject type names are global to the shell, so ours carry the extension's
// prefix. They also last as long as the process, and under the development
// link lib/ is loaded afresh after every edit (scripts/dev-extension.js), so
// each load of this module names its classes apart. An install loads it once.

import GLib from 'gi://GLib';

const LOAD = GLib.uuid_string_random().slice(0, 8);

export const typeName = name => `MediaControls${name}_${LOAD}`;
