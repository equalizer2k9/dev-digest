#!/usr/bin/env python3
"""Types a scripted Claude Code session into the terminal it runs in.

Spawns bash in a pty, relays everything to stdout (the xterm), and sends the
keystrokes a person would: the claude command, /mcp, the prompt. Writes the
moment of every step to events.json so the waits can be cut from the video.
"""
import fcntl, json, os, pty, select, struct, sys, termios, time, tty

CMD = sys.argv[1]
PROMPT = sys.argv[2]
EVENTS = sys.argv[3]
T0 = time.time()
events = []
buf = b""

def mark(name):
    events.append({"name": name, "t": round(time.time() - T0, 2), "epoch": round(time.time(), 3)})
    json.dump(events, open(EVENTS, "w"))

rows, cols = struct.unpack("hhhh", fcntl.ioctl(1, termios.TIOCGWINSZ, b"\0" * 8))[:2]
pid, fd = pty.fork()
if pid == 0:
    os.environ["PS1"] = "\\[\\e[32m\\]dev-digest\\[\\e[0m\\] $ "
    os.execvp("bash", ["bash", "--norc", "--noprofile"])
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("hhhh", rows, cols, 0, 0))
tty.setraw(0)  # the terminal's own replies to queries must reach the child

def pump(seconds):
    """Relay output for `seconds`; return how long the tail has been silent."""
    global buf
    end = time.time() + seconds
    last = time.time()
    while time.time() < end:
        r, _, _ = select.select([fd, 0], [], [], 0.05)
        if 0 in r:
            os.write(fd, os.read(0, 4096))
        if fd in r:
            try:
                data = os.read(fd, 65536)
            except OSError:
                return 999
            if not data:
                return 999
            os.write(1, data)
            buf = (buf + data)[-200000:]
            last = time.time()
    return time.time() - last

def until_idle(idle, at_least, at_most):
    start = time.time()
    quiet_since = time.time()
    while time.time() - start < at_most:
        silent = pump(0.25)
        if silent < 0.25:
            quiet_since = time.time()
        if time.time() - start >= at_least and time.time() - quiet_since >= idle:
            return True
    return False

import random
random.seed(4)
NEIGHBOURS = {"а": "п", "к": "л", "р": "о", "и": "м", "е": "н", "в": "а"}

def type_(text, typos=0):
    """Type like a person: uneven key gaps, a breath between words, and a
    couple of slips that are noticed and fixed with Backspace."""
    slip_at = set(random.sample([i for i, ch in enumerate(text) if ch in NEIGHBOURS], typos)) if typos else set()
    for i, ch in enumerate(text):
        if i in slip_at:
            os.write(fd, NEIGHBOURS[ch].encode())
            pump(random.uniform(0.16, 0.3))
            os.write(fd, b"")
            pump(random.uniform(0.12, 0.22))
        os.write(fd, ch.encode())
        gap = max(0.04, random.gauss(0.11, 0.045))
        if ch == " ":
            gap += random.uniform(0.05, 0.22)
        elif ch in "-./,":
            gap += random.uniform(0.04, 0.12)
        if random.random() < 0.04:
            gap += random.uniform(0.25, 0.5)
        pump(gap)

pump(1.2)
mark("shell")
type_(CMD)
pump(0.6)
os.write(fd, b"\r")
mark("claude_start")
until_idle(2.5, 5, 60)
mark("claude_ready")
pump(1.0)
type_("/mcp")
pump(0.8)
os.write(fd, b"\r")
mark("mcp_open")
until_idle(1.5, 3, 15)
pump(2.5)
os.write(fd, b"\x1b")
mark("mcp_close")
pump(1.2)
type_(PROMPT, typos=2)
pump(0.8)
mark("prompt_typed")
os.write(fd, b"\r")
mark("prompt_sent")
seen = len(buf)
answered = False
called_at = None
recent = []
start = time.time()
quiet_since = time.time()
while time.time() - start < 150:
    silent = pump(0.25)
    if silent < 0.25:
        quiet_since = time.time()
    tail = buf[seen:]
    if not answered and (b"Do you want" in tail or b"Yes, and don" in tail):
        mark("permission_prompt")
        pump(2.0)
        os.write(fd, b"\r")
        answered = True
        mark("permission_yes")
        seen = len(buf)
    if called_at is None and (b"Called devdigest" in tail or b"Called " in tail):
        called_at = time.time()
    recent.append((time.time(), len(buf)))
    recent[:] = [x for x in recent if time.time() - x[0] <= 3.0]
    if called_at and time.time() - called_at > 4 and recent[-1][1] - recent[0][1] < 400:
        break
mark("answer_done")
pump(4.0)
mark("end")
os.write(fd, b"\x03")
pump(0.3)
os.write(fd, b"\x03")
pump(1.0)
