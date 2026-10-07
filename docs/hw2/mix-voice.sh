#!/usr/bin/env bash
# Mix the per-scene voice-over clips onto the demo video.
#
#   docs/hw2/mix-voice.sh
#
# Reads   docs/hw2/scenes.json                 scene start times (ms) + total length
#         docs/hw2/voiceover/s1.mp3 … sN.mp3   one clip per scene (see voiceover/SUNO.md)
#         docs/hw2/voiceover/bg.mp3            optional background bed, mixed at volume 0.12
#         docs/hw2/hw2-demo.mp4                the silent recording
# Writes  docs/hw2/hw2-demo-voiced.mp4         video stream copied, audio AAC
#
# Each clip is trimmed of leading/trailing silence, loudness-normalised
# (I=-16 LUFS, TP=-1.5 dB) and placed at its scene's start_ms. A clip longer than
# its scene is still mixed, with a warning: it will talk over the next scene.
#
# Needs the system ffmpeg + ffprobe and python3 (to read the JSON).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCENES="${SCENES:-$HERE/scenes.json}"
VOICE_DIR="${VOICE_DIR:-$HERE/voiceover}"
VIDEO="${VIDEO:-$HERE/hw2-demo.mp4}"
OUT="${OUT:-$HERE/hw2-demo-voiced.mp4}"
BG="$VOICE_DIR/bg.mp3"
BG_VOLUME="0.12"

for bin in ffmpeg ffprobe python3; do
  command -v "$bin" >/dev/null || { echo "✗ $bin is not on PATH" >&2; exit 1; }
done
[ -f "$SCENES" ] || { echo "✗ $SCENES not found — record the video first" >&2; exit 1; }
[ -f "$VIDEO" ] || { echo "✗ $VIDEO not found — record the video first" >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# One "<scene> <start_ms> <length_ms>" line per scene, then "total <total_ms>".
mapfile -t ROWS < <(python3 - "$SCENES" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
s = d["scenes"]
for i, sc in enumerate(s):
    end = s[i + 1]["start_ms"] if i + 1 < len(s) else d["total_ms"]
    print(sc["scene"], sc["start_ms"], end - sc["start_ms"])
print("total", d["total_ms"])
PY
)

TOTAL_MS=""
INPUTS=()
FILTER=""
LABELS=""
N=0
WARNINGS=0

for row in "${ROWS[@]}"; do
  read -r scene start len <<<"$row"
  if [ "$scene" = "total" ]; then TOTAL_MS="$start"; continue; fi

  src="$VOICE_DIR/s$scene.mp3"
  [ -f "$src" ] || { echo "✗ missing clip: $src" >&2; exit 1; }

  # Trim silence at both ends (the second pass runs on the reversed clip), then normalise.
  clean="$TMP/s$scene.wav"
  ffmpeg -hide_banner -loglevel error -y -i "$src" -af "\
silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,\
areverse,\
silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,\
areverse,\
loudnorm=I=-16:TP=-1.5:LRA=11" -ar 48000 -ac 2 "$clean"

  dur_ms="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$clean" | awk '{printf "%d", $1 * 1000}')"
  printf 'scene %s  start %6.1fs  scene %5.1fs  clip %5.1fs' \
    "$scene" "$(awk "BEGIN{print $start/1000}")" "$(awk "BEGIN{print $len/1000}")" "$(awk "BEGIN{print $dur_ms/1000}")"
  if [ "$dur_ms" -gt "$len" ]; then
    printf '   ⚠ clip is %.1fs longer than its scene\n' "$(awk "BEGIN{print ($dur_ms-$len)/1000}")"
    WARNINGS=$((WARNINGS + 1))
  else
    printf '\n'
  fi

  INPUTS+=(-i "$clean")
  N=$((N + 1))
  # Input 0 is the video, so clip k is input k.
  FILTER+="[$N:a]adelay=${start}:all=1[v$N];"
  LABELS+="[v$N]"
done

[ -n "$TOTAL_MS" ] || { echo "✗ $SCENES has no total_ms" >&2; exit 1; }
[ "$N" -gt 0 ] || { echo "✗ $SCENES lists no scenes" >&2; exit 1; }
TOTAL_S="$(awk "BEGIN{printf \"%.3f\", $TOTAL_MS/1000}")"

MIX_INPUTS="$N"
if [ -f "$BG" ]; then
  echo "background: $BG at volume $BG_VOLUME"
  INPUTS+=(-stream_loop -1 -i "$BG")
  FILTER+="[$((N + 1)):a]volume=${BG_VOLUME}[bg];"
  LABELS+="[bg]"
  MIX_INPUTS=$((N + 1))
fi

# normalize=0: amix must not scale the clips down — they are already at -16 LUFS.
# apad + atrim make the track exactly as long as the picture.
FILTER+="${LABELS}amix=inputs=${MIX_INPUTS}:normalize=0:duration=longest,apad,atrim=0:${TOTAL_S}[out]"

ffmpeg -hide_banner -loglevel error -y -i "$VIDEO" "${INPUTS[@]}" \
  -filter_complex "$FILTER" -map 0:v:0 -map "[out]" \
  -c:v copy -c:a aac -b:a 192k -movflags +faststart "$OUT"

echo "✓ $OUT ($(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT" | awk '{printf "%.1f", $1}')s)"
if [ "$WARNINGS" -gt 0 ]; then
  echo "⚠ $WARNINGS clip(s) run past their scene — shorten the text or regenerate at a faster pace."
fi
