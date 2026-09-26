// Lines that say what the extension is doing: which player the bar attached
// to, which controllers came and went. The shipped extension logs only
// failures; the development entry point, scripts/dev-extension.js, turns
// these on.

let verbose = false;

export function setVerbose(on) {
    verbose = on;
}

export function note(message) {
    if (verbose)
        console.log(`[Media Controls] ${message}`);
}
