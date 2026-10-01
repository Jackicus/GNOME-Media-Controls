# Media Controls' own dev.sh commands, sourced by the kit's scripts/dev.sh.
#
#   ./scripts/dev.sh devices    list the media players on the session bus and the
#                               game controllers plugged in, as the extension sees them
#   ./scripts/dev.sh stalls [LOG]
#                               watch for desktop freezes: shell main-loop stalls and
#                               processes stuck in the kernel, with timestamps
#

# What the extension would see: every MPRIS player on the bus (read-only
# property reads, never a method call) and every pad libmanette opens. Runs
# against whichever session bus the environment names, so under
# `./scripts/nested.sh run` it lists the nested session's players.
cmd_devices() {
    require gjs
    gjs -m "$REPO_DIR/scripts/devices.js"
}

# A freeze is over by the time anyone looks; this leaves a log of what stalled.
cmd_stalls() {
    require python3
    info "Watching for freezes (Ctrl+C to stop); reproduce one, then read the log."
    python3 "$REPO_DIR/scripts/stallwatch.py" "$@"
}

# The status line of our own: without libmanette the bar works and the pads do not.
dev_status() {
    if gjs -c 'imports.gi.versions.Manette = "0.2"; imports.gi.Manette;' >/dev/null 2>&1; then
        echo "pads:     libmanette available"
    else
        echo "pads:     libmanette missing -- game controllers will not work"
    fi
}
