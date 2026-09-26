import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {MediaControlsApp} from './lib/app.js';

export default class MediaControlsExtension extends Extension {
    enable() {
        this._app = new MediaControlsApp(this);
        this._app.enable();
    }

    disable() {
        this._app.disable();
        this._app = null;
    }
}
