#!/usr/bin/env bash
#
# Builds docs/media/big-buck-bunny-demo.mkv, the film the README screenshots
# are taken over: Big Buck Bunny (Blender Foundation, CC BY 3.0) with its
# stereo and 5.1 audio tracks and the English and Spanish captions in
# docs/media/captions/, so the tracks pop-out has something to show. The
# captions sit in their own folder under names unlike the film's: beside it,
# VLC would load them a second time as side files.
#
#   ./scripts/demo-clip.sh          download (about 275 MB) and build
#   ./scripts/demo-clip.sh FILE     build from an already downloaded
#                                   bbb_sunflower_1080p_30fps_normal.mp4
#
set -euo pipefail

URL="https://download.blender.org/demo/movies/BBB/bbb_sunflower_1080p_30fps_normal.mp4.zip"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MEDIA_DIR="$REPO_DIR/docs/media"
OUT="$MEDIA_DIR/big-buck-bunny-demo.mkv"

info() { printf '\033[1;34m→\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

for tool in ffmpeg curl unzip; do
    command -v "$tool" >/dev/null 2>&1 || die "'$tool' not found in PATH."
done

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

if [[ -n "${1:-}" ]]; then
    src="$1"
    [[ -f "$src" ]] || die "No such file: $src"
else
    info "Downloading Big Buck Bunny from download.blender.org..."
    curl -fL --progress-bar -o "$tmp/bbb.zip" "$URL"
    unzip -q "$tmp/bbb.zip" -d "$tmp"
    src="$(find "$tmp" -name '*.mp4' -print -quit)"
    [[ -n "$src" ]] || die "The download held no .mp4."
fi

# The source carries two audio streams, stereo MP3 and 5.1 AC3; both are
# copied as they are. The bar shows a track as "title · language".
info "Building $OUT..."
ffmpeg -loglevel error -y \
    -i "$src" \
    -i "$MEDIA_DIR/captions/en.srt" \
    -i "$MEDIA_DIR/captions/es.srt" \
    -map 0:v:0 -map 0:a:0 -map 0:a:1 -map 1:0 -map 2:0 \
    -c copy -c:s srt \
    -metadata title="Big Buck Bunny" \
    -metadata artist="Blender Foundation" \
    -metadata:s:a:0 title="Stereo" -metadata:s:a:0 language=eng \
    -metadata:s:a:1 title="5.1 Surround" -metadata:s:a:1 language=eng \
    -metadata:s:s:0 title="English" -metadata:s:s:0 language=eng \
    -metadata:s:s:1 title="Español" -metadata:s:s:1 language=spa \
    -disposition:a:0 default -disposition:a:1 0 \
    -disposition:s:0 0 -disposition:s:1 0 \
    "$OUT"

ok "Built $OUT"
