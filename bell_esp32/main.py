# DING bell button for the ESP32 DevKit (MicroPython). Same behaviour as bell_esp32.ino.
# Wiring: momentary push button between GPIO 4 (D4) and GND (diagonal legs on a 4-leg
#         tactile button). Internal pull-up, so contact = LOW. No resistor needed.
#
# Reports clean contact edges to the hub over USB serial (115200); the hub
# (code/hub/bell.py) turns them into PRESS / HOLD / RAPID exactly like the Enter key.
#   READY level=<0|1>  - after boot (0 = contact closed)
#   DOWN               - contact made
#   UP                 - contact released
# The on-board LED (GPIO 2) is lit while contact is closed, for checking wiring.
#
# Flash: see "Bell button on an ESP32 DevKit" in code/README.md.

import time
from machine import Pin

CONTACT_PIN = 4
LED_PIN = 2
PRESS_MS = 3     # continuous LOW this long = contact made
RELEASE_MS = 30  # continuous HIGH this long = contact released (rides over bounce)

contact = Pin(CONTACT_PIN, Pin.IN, Pin.PULL_UP)
led = Pin(LED_PIN, Pin.OUT, value=0)

print()
print("READY level=%d" % contact.value())

closed = False
low_run = high_run = 0
last = time.ticks_ms()
while True:
    time.sleep_ms(1)
    now = time.ticks_ms()
    dt = time.ticks_diff(now, last)
    last = now
    if contact.value() == 0:
        low_run, high_run = min(low_run + dt, 60000), 0
    else:
        high_run, low_run = min(high_run + dt, 60000), 0

    if not closed and low_run >= PRESS_MS:
        closed = True
        led.value(1)
        print("DOWN")
    elif closed and high_run >= RELEASE_MS:
        closed = False
        led.value(0)
        print("UP")
