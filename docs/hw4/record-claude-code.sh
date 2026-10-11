#!/usr/bin/env bash
# DevDigest — homework #4 demo, step ґ: a real Claude Code session on video.
#
#   docs/hw4/record-claude-code.sh        writes docs/hw4/claude-code-clip.mp4
#   node docs/hw4/record-hw4.mjs --splice puts it between the browser parts
#
# xterm runs on a nested X server (Xephyr, so it works under Wayland too) and
# ffmpeg grabs that display. type-claude-session.py types what a person would:
# the claude command, /mcp, the question. Nothing is faked — the session, the
# MCP call and the answer are live; only the two waits (start-up, the model
# thinking) are cut out. Needs: Xephyr, xterm, python3, the HW1 rig's ffmpeg,
# and the API on :3001. The repo folder must already be trusted in Claude Code.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
FF="$ROOT/Claude outputs/screencast/node_modules/ffmpeg-static/ffmpeg"
RAW="$HERE/.video-raw/claude-code-raw.mkv"
EVENTS="$HERE/.video-raw/claude-code-events.json"
OUT="$HERE/claude-code-clip.mp4"
D=:99
W=1440; H=900; FPS=25

CMD="claude --mcp-config .mcp.json --strict-mcp-config --setting-sources project,local"
PROMPT="покажи карту впливу PR 13 через devdigest"

mkdir -p "$HERE/.video-raw"
rm -f "$RAW" "$EVENTS"
DISPLAY="${HOST_DISPLAY:-:0}" Xephyr $D -screen ${W}x${H} -ac -br -noreset >/dev/null 2>&1 &
XE=$!
trap 'kill ${FFP:-0} 2>/dev/null || true; kill $XE 2>/dev/null || true' EXIT
sleep 1.5
FF_START=$(date +%s.%N)
"$FF" -y -hide_banner -loglevel error -f x11grab -draw_mouse 0 -framerate $FPS -video_size ${W}x${H} -i $D \
  -c:v libx264 -preset ultrafast -crf 16 -pix_fmt yuv420p "$RAW" &
FFP=$!
sleep 0.8

cd "$ROOT"
# A fresh session, not a child of whatever launched this script.
for v in $(env | grep -o -E "^(CLAUDE[A-Z_]*|ANTHROPIC[A-Z_]*)"); do unset "$v"; done
export COLORTERM=truecolor
DISPLAY=$D xterm -fa "DejaVu Sans Mono" -fs 15 -bg "#0d1117" -fg "#e6edf3" -bw 0 -b 6 +sb -geometry 143x46+0+0 \
  -e python3 "$HERE/type-claude-session.py" "$CMD" "$PROMPT" "$EVENTS"
sleep 0.5
kill -INT $FFP; wait $FFP 2>/dev/null || true

# Cut: before the shell prompt, the start-up wait, most of the thinking, the exit.
python3 - "$EVENTS" "$FF_START" "$RAW" "$OUT" "$FF" "$FPS" <<'PY'
import json, subprocess, sys
events, ff_start, raw, out, ff, fps = sys.argv[1:]
ev = {e["name"]: e["epoch"] - float(ff_start) - 0.35 for e in json.load(open(events))}
for need in ("claude_ready", "mcp_open", "prompt_sent", "answer_done", "end"):
    if need not in ev:
        sys.exit(f"✗ the session never reached '{need}' — look at {raw}")
keep = [
    (ev["shell"] - 0.4, ev["claude_start"] + 0.8),
    (ev["claude_ready"] - 0.8, ev["prompt_sent"] + 2.0),
    (ev["answer_done"] - 11.0, ev["end"]),
]
keep[2] = (max(keep[2][0], keep[1][1]), keep[2][1])
sel = "+".join(f"between(t,{a:.3f},{b:.3f})" for a, b in keep)
subprocess.run([ff, "-y", "-hide_banner", "-loglevel", "error", "-i", raw,
    "-vf", f"fps={fps},select='{sel}',setpts=N/{fps}/TB", "-an", "-c:v", "libx264", "-preset", "slow",
    "-crf", "21", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], check=True)
print(f"✓ {out} · {sum(b - a for a, b in keep):.1f}s")
PY
