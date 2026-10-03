"""SIMULATED room sensors plus the (real) clock. Light and noise react to the
light/TV state, so switching a device visibly changes the room."""
from __future__ import annotations

import math
import random
from datetime import datetime, timedelta
from typing import Optional

SENSORS = {
    # name: (baseline, noise, decimals, unit)
    "room_temp": (27.0, 0.05, 1, "°C"),
    "humidity": (58.0, 0.3, 0, "%"),
    "light": (0.0, 4.0, 0, "lux"),      # baseline computed from time of day + devices
    "noise": (36.0, 1.0, 0, "dB"),
    "co2": (620.0, 6.0, 0, "ppm"),
}

SCENARIOS = {
    "normal": {},
    "hot": {"room_temp": 33.5, "humidity": 70},
    "cold": {"room_temp": 18.5},
    "noisy": {"noise": 72},
    "stuffy": {"co2": 1600, "room_temp": 29.5},
}


def part_of_day(hour: int) -> str:
    if 5 <= hour < 12:
        return "morning"
    if 12 <= hour < 17:
        return "afternoon"
    if 17 <= hour < 21:
        return "evening"
    return "night"


class EnvironmentMock:
    def __init__(self):
        self.values = {k: v[0] for k, v in SENSORS.items()}
        self.offsets: dict = {}
        self.scenario = "normal"
        self.time_offset = timedelta(0)

    # --- clock (real, but can be shifted for demos: "pretend it's 21:30") ---
    def now(self) -> datetime:
        return datetime.now() + self.time_offset

    def set_time(self, hhmm: Optional[str]) -> None:
        if not hhmm:
            self.time_offset = timedelta(0)
            return
        h, m = (int(x) for x in hhmm.split(":"))
        real = datetime.now()
        target = real.replace(hour=h, minute=m, second=real.second)
        self.time_offset = target - real

    def set_scenario(self, name: str) -> None:
        if name not in SCENARIOS:
            raise ValueError(f"unknown environment scenario {name!r}")
        self.scenario = name
        self.offsets = dict(SCENARIOS[name])

    def _target(self, k: str, devices: dict) -> float:
        if k in self.offsets:
            return float(self.offsets[k])
        if k == "light":
            t = self.now()
            hour = t.hour + t.minute / 60
            daylight = max(0.0, math.sin(math.pi * (hour - 6) / 13)) * 260 if 6 <= hour <= 19 else 2
            return daylight + (320 if devices.get("light") else 0) + (35 if devices.get("tv") else 0)
        if k == "noise":
            return SENSORS[k][0] + (22 if devices.get("tv") else 0)
        return SENSORS[k][0]

    def tick(self, devices: dict) -> None:
        for k, (_, noise, _, _) in SENSORS.items():
            v = self.values[k]
            rate = 0.5 if k == "light" else 0.1  # lights change fast, temperature slowly
            v += (self._target(k, devices) - v) * rate + random.gauss(0, noise)
            self.values[k] = max(v, 0.0)

    def snapshot(self) -> dict:
        t = self.now()
        sensors = {}
        for k, (_, _, dec, unit) in SENSORS.items():
            v = round(self.values[k], dec)
            sensors[k] = {"value": int(v) if dec == 0 else v, "unit": unit}
        return {
            "simulated": True,
            "scenario": self.scenario,
            "time": t.strftime("%H:%M"),
            "day": t.strftime("%A"),
            "date": t.strftime("%d %b %Y"),
            "part_of_day": part_of_day(t.hour),
            "time_shifted": self.time_offset != timedelta(0),
            "sensors": sensors,
        }
