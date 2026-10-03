#!/usr/bin/env python3
# Read serial lines from the bell logger and save them to a file.
# Stops after MAX_S seconds, or after IDLE_S seconds of silence once activity was seen.
import os, sys, termios, time, select

PORT  = sys.argv[1] if len(sys.argv) > 1 else "/dev/cu.usbserial-1420"
OUT   = sys.argv[2] if len(sys.argv) > 2 else "capture.log"
MAX_S, IDLE_S = 240, 15
MIN_EDGES = int(sys.argv[3]) if len(sys.argv) > 3 else 20

fd = os.open(PORT, os.O_RDWR | os.O_NOCTTY)
attrs = termios.tcgetattr(fd)
attrs[0] = 0                                   # iflag
attrs[1] = 0                                   # oflag
attrs[2] = termios.CS8 | termios.CREAD | termios.CLOCAL
attrs[3] = 0                                   # lflag (raw)
attrs[4] = attrs[5] = termios.B115200
termios.tcsetattr(fd, termios.TCSANOW, attrs)

start = last = time.time()
edges, buf = 0, b""
with open(OUT, "w") as f:
    while True:
        now = time.time()
        if now - start > MAX_S or (edges >= MIN_EDGES and now - last > IDLE_S):
            break
        r, _, _ = select.select([fd], [], [], 0.5)
        if not r:
            continue
        buf += os.read(fd, 4096)
        while b"\n" in buf:
            line, buf = buf.split(b"\n", 1)
            line = line.decode(errors="replace").strip()
            if not line:
                continue
            f.write(f"{time.time() - start:.3f} {line}\n"); f.flush()
            if not line.startswith("#"):
                edges += 1
                last = time.time()
print(f"captured {edges} edges in {time.time() - start:.1f}s -> {OUT}")
