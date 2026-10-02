// GObject type names are global and outlive a module: ours are prefixed, and
// apart per load, since development loads lib/ afresh after every edit.

import GLib from 'gi://GLib';

const LOAD = GLib.uuid_string_random().slice(0, 8);

export const typeName = name => `MediaControls${name}_${LOAD}`;
