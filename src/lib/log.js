// Development log lines: only the development entry point turns them on.

let verbose = false;

export function setVerbose(on) {
    verbose = on;
}

export function note(message) {
    if (verbose)
        console.log(`[Media Controls] ${message}`);
}
