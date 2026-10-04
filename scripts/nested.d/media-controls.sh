# Media Controls' own nested.sh commands, sourced by the kit's scripts/nested.sh.
#
#   ./scripts/nested.sh player [--qt] [--windowed] [--plain] [FILE] [-- VLC ARGS...]
#                                     play FILE (default: a generated test video) in VLC
#                                     inside the nested shell, full screen, silent, with
#                                     MPRIS on; --qt uses VLC's Qt
#                                     interface instead of cvlc. Its vlcrc, the nested
#                                     session's own, gets the tracks socket (the Players
#                                     page's switch) unless --plain
#   ./scripts/nested.sh mpris [METHOD [ARGS]|get PROP|set PROP VALUE]
#                                     talk to the first MPRIS player on the nested bus:
#                                     no argument prints its state; Quit ends it
#   ./scripts/nested.sh pad [HOLD] BUTTON...
#                                     plug in a virtual Xbox 360 pad, wait HOLD seconds
#                                     (default 1.5) for it to be picked up, press each
#                                     BUTTON (south, west, dpad-up, left-trigger, ...: the
#                                     gamepad-buttons ids; BUTTON:SECS holds it), unplug it
#   ./scripts/nested.sh preview       start if needed, play the test clip, bring the bar
#                                     up and screenshot it to dist/preview.png
#

FAKEPAD="$REPO_DIR/scripts/fakepad.py"
TEST_VIDEO="$REPO_DIR/dist/test-video.mkv"

# The bar over the test clip, in one shot.
cmd_preview() {
    cmd_start
    cmd_player
    local shot="$REPO_DIR/dist/preview.png"
    cmd_do "say Media Controls preview" "move 700 400" "move 760 430" "wait 0.6" "shot $shot" >/dev/null
    ok "Screenshot: $shot"
}

# The clip `player` plays by default: ten minutes of SMPTE bars with the
# running time burned in (so a screenshot shows where playback really is), two
# silent audio tracks (Japanese, English), two subtitle tracks (English
# "Second N", Spanish "Segundo N", one a second, so timing shows at a glance)
# and a chapter every two minutes — everything the tracks pop-out can show.
# Static bars compress to a few MB.
ensure_test_video() {
    [[ -s "$TEST_VIDEO" ]] && return 0
    command -v ffmpeg >/dev/null || die "'ffmpeg' not found; pass a video file to 'player' instead."
    mkdir -p "$(dirname "$TEST_VIDEO")"
    info "Generating $TEST_VIDEO (10 min, two audio and two subtitle tracks, chapters)..."
    local work
    work="$(mktemp -d)"
    # The path goes into the trap now: it runs at exit, when this local is gone.
    # shellcheck disable=SC2064
    trap "rm -rf $(printf %q "$work")" EXIT
    python3 - "$work" <<'PY'
import sys
work = sys.argv[1]
stamp = lambda s: f'{s // 3600:02d}:{s % 3600 // 60:02d}:{s % 60:02d},000'
for lang, word in (('eng', 'Second'), ('spa', 'Segundo')):
    with open(f'{work}/{lang}.srt', 'w') as f:
        for i in range(600):
            f.write(f'{i + 1}\n{stamp(i)} --> {stamp(i + 1)}\n{word} {i}\n\n')
with open(f'{work}/chapters', 'w') as f:
    f.write(';FFMETADATA1\n')
    for i in range(5):
        f.write(f'[CHAPTER]\nTIMEBASE=1/1\nSTART={i * 120}\nEND={(i + 1) * 120}\ntitle=Part {i + 1}\n')
PY
    ffmpeg -loglevel error -y -f lavfi -i "smptehdbars=size=1280x720:rate=24:duration=600" \
        -f lavfi -t 600 -i "anullsrc=r=48000:cl=stereo" -f lavfi -t 600 -i "anullsrc=r=48000:cl=stereo" \
        -i "$work/eng.srt" -i "$work/spa.srt" -i "$work/chapters" \
        -map 0:v -map 1:a -map 2:a -map 3:s -map 4:s -map_chapters 5 \
        -vf "drawtext=text='%{pts\\:hms}':fontsize=64:fontcolor=white:box=1:boxcolor=black@0.6:x=(w-tw)/2:y=80" \
        -c:v libx264 -preset veryfast -crf 30 -c:a libopus -b:a 16k -c:s srt \
        -metadata title="Media Controls test pattern" \
        -metadata:s:a:0 language=jpn -metadata:s:a:0 title=Japanese \
        -metadata:s:a:1 language=eng -metadata:s:a:1 title=English \
        -metadata:s:s:0 language=eng -metadata:s:s:0 title=English \
        -metadata:s:s:1 language=spa -metadata:s:s:1 title=Spanish \
        "$TEST_VIDEO" || die "ffmpeg could not make the test video."
}

cmd_player() {
    require_running
    local qt=0 fullscreen=1 plain=0 file="" extra=()
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --qt) qt=1 ;;
            --windowed) fullscreen=0 ;;
            --plain) plain=1 ;;
            --) shift; extra=("$@"); break ;;
            *) file="$1" ;;
        esac
        shift
    done
    # The test clip's sound is silence, so it goes to the real sound server,
    # the one output VLC gives a volume for (its dummy output reports 0 and
    # ignores a new one). Any other file plays with no audio at all.
    local audio=(--no-audio)
    if [[ -z "$file" ]]; then
        ensure_test_video
        file="$TEST_VIDEO"
        audio=(--aout=pulse)
    fi
    [[ -e "$file" ]] || die "No such file: $file"
    # The headless shell has no GPU for Xwayland: VLC's GL outputs fail there
    # and leave it playing with no window, so it draws with plain X11 and
    # decodes in software.
    local args=("${audio[@]}" --dbus --qt-continue=0 --no-video-title-show --loop
                --vout=xcb_x11 --avcodec-hw=none)
    (( fullscreen )) && args+=(--fullscreen)
    local vlc=cvlc
    (( qt )) && vlc=vlc
    # VLC's settings are the nested session's own ($(config_dir)/vlc/vlcrc,
    # through nested_env's XDG_CONFIG_HOME): the file the nested extension
    # applies hide-vlc-controls to and the nested preferences' switches write,
    # never ~/.config/vlc. Its data goes under the run directory: VLC's Qt
    # interface otherwise puts the file at the top of the user's own
    # recent-media list, and remembers the volume it was left at.
    mkdir -p "$(config_dir)/vlc" "$RUN_DIR/vlc/data"
    if (( ! plain )); then
        # The socket path is the real one ($XDG_RUNTIME_DIR is shared), and
        # the first VLC to start holds it: a VLC on the real desktop would
        # leave this one without a tracks button.
        [[ -S "$RUNTIME/media-controls-vlc.sock" ]] \
            && warn "Another VLC already holds the tracks socket; this one will have no tracks button."
        XDG_CONFIG_HOME="$(config_dir)" gjs -m "$REPO_DIR/scripts/vlc-setup.js" on >/dev/null \
            || warn "Could not write the nested VLC settings; no tracks socket."
    fi
    # Waited for as one more VLC on the bus than before, so a second player
    # (the two-player check) is waited for as the first was. setsid so the
    # player outlives this command; 'stop' finds it again by the nested bus
    # address in its environment.
    local before waited=0
    before="$(vlc_count)"
    nested_env XDG_DATA_HOME="$RUN_DIR/vlc/data" \
        setsid "$vlc" "${args[@]}" "${extra[@]}" "$file" \
        >>"$RUN_DIR/player-log" 2>&1 < /dev/null &
    until (( $(vlc_count) > before )); do
        (( waited >= 100 )) && { warn "VLC did not appear on the nested bus. Its output:"; tail -5 "$RUN_DIR/player-log" >&2; return 1; }
        sleep 0.1; waited=$((waited + 1))
    done
    ok "$vlc is playing $(basename "$file") in the nested shell."
}

# How many MPRIS names VLCs hold on the nested bus (one or two each; what
# matters is that a new VLC adds to it).
vlc_count() {
    nested_env gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus \
        --method org.freedesktop.DBus.ListNames 2>/dev/null \
        | grep -o "'org\.mpris\.MediaPlayer2\.vlc[^']*'" | wc -l || true
}

# The first MPRIS player on the nested bus -- enough for checking what a click
# on the bar did to it.
cmd_mpris() {
    require_running
    local dest prop
    dest="$(nested_env gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus \
        --method org.freedesktop.DBus.ListNames | grep -oE "org\.mpris\.MediaPlayer2\.[A-Za-z0-9_.-]+" | head -1 || true)"
    [[ -n "$dest" ]] || die "No MPRIS player on the nested bus. Start one with: ./scripts/nested.sh player"
    local call=(nested_env gdbus call --session --dest "$dest" --object-path /org/mpris/MediaPlayer2)
    local iface=org.mpris.MediaPlayer2.Player
    case "${1:-}" in
        "")
            for prop in PlaybackStatus Position Volume Rate; do
                printf '%-15s %s\n' "$prop" "$("${call[@]}" --method org.freedesktop.DBus.Properties.Get $iface "$prop")"
            done
            printf '%-15s %s\n' Title "$("${call[@]}" --method org.freedesktop.DBus.Properties.Get $iface Metadata \
                | grep -oE "'xesam:title': <'[^']*'>" || true)"
            ;;
        get) "${call[@]}" --method org.freedesktop.DBus.Properties.Get $iface "$2" ;;
        Quit|Raise) "${call[@]}" --method "org.mpris.MediaPlayer2.$1" ;;
        set) "${call[@]}" --method org.freedesktop.DBus.Properties.Set $iface "$2" "$3" ;;
        *)   "${call[@]}" --method "$iface.$1" "${@:2}" ;;
    esac
}

# A virtual pad is a kernel device, so the REAL session sees it too -- harmless
# for the shell, which does nothing with a pad unless this extension is enabled
# there and a player is focused full screen. 'stop' sweeps one left behind
# (NESTED_STRAYS).
cmd_pad() {
    require_running
    local hold=1.5
    [[ "${1:-}" =~ ^[0-9.]+$ ]] && { hold="$1"; shift; }
    [[ $# -gt 0 ]] || die "Usage: ./scripts/nested.sh pad [HOLD] south [dpad-right west ...]"
    python3 -c 'import evdev' 2>/dev/null || die "A virtual pad needs python-evdev (the python-evdev package)."
    python3 "$FAKEPAD" "$hold" "$@"
}
