"""SIMULATED vital signs. Each vital drifts around a target (mean-reverting random
walk), and scenarios move the targets so the team can demo alerts on cue.
Swap this module for real sensors later; keep the snapshot() shape."""
from __future__ import annotations

import random

# name: (baseline, noise per tick, decimals, unit)
VITALS = {
    "heart_rate": (76.0, 1.2, 0, "bpm"),
    "spo2": (97.0, 0.25, 0, "%"),
    "bp_sys": (122.0, 1.0, 0, "mmHg"),
    "bp_dia": (79.0, 0.7, 0, "mmHg"),
    "resp_rate": (15.0, 0.4, 0, "/min"),
    "body_temp": (36.8, 0.02, 1, "°C"),
}

# Thresholds: (critical_low, warn_low, warn_high, critical_high)
LIMITS = {
    "heart_rate": (45, 55, 105, 125),
    "spo2": (90, 94, 101, 101),
    "bp_sys": (85, 95, 145, 165),
    "bp_dia": (50, 58, 92, 102),
    "resp_rate": (8, 10, 22, 28),
    "body_temp": (35.0, 35.8, 37.6, 38.3),
}

SCENARIOS = {
    "normal": {},
    "tachycardia": {"heart_rate": 134},
    "bradycardia": {"heart_rate": 42},
    "low_spo2": {"spo2": 87, "heart_rate": 98, "resp_rate": 23},
    "hypertension": {"bp_sys": 174, "bp_dia": 106, "heart_rate": 92},
    "fever": {"body_temp": 38.7, "heart_rate": 102, "resp_rate": 20},
    "distress": {"heart_rate": 121, "resp_rate": 27, "spo2": 93, "bp_sys": 152},
}


class HealthMock:
    def __init__(self):
        self.values = {k: v[0] for k, v in VITALS.items()}
        self.targets = dict(self.values)
        self.scenario = "normal"

    def set_scenario(self, name: str) -> None:
        if name not in SCENARIOS:
            raise ValueError(f"unknown health scenario {name!r}")
        self.scenario = name
        self.targets = {k: v[0] for k, v in VITALS.items()}
        self.targets.update(SCENARIOS[name])

    def tick(self) -> None:
        for k, (_, noise, _, _) in VITALS.items():
            v = self.values[k]
            v += (self.targets[k] - v) * 0.12 + random.gauss(0, noise)
            if k == "spo2":
                v = min(v, 100.0)
            self.values[k] = v

    def status(self, k: str) -> str:
        v = round(self.values[k], VITALS[k][2])
        cl, wl, wh, ch = LIMITS[k]
        if v <= cl or v >= ch:
            return "critical"
        if v <= wl or v >= wh:
            return "warn"
        return "normal"

    def snapshot(self) -> dict:
        vitals = {}
        for k, (_, _, dec, unit) in VITALS.items():
            v = round(self.values[k], dec)
            vitals[k] = {"value": int(v) if dec == 0 else v, "unit": unit, "status": self.status(k)}
        worst = "normal"
        for v in vitals.values():
            if v["status"] == "critical":
                worst = "critical"
            elif v["status"] == "warn" and worst == "normal":
                worst = "warn"
        return {"simulated": True, "scenario": self.scenario, "overall": worst, "vitals": vitals}

    def critical_summary(self) -> str:
        names = {"heart_rate": "Heart rate", "spo2": "Oxygen", "bp_sys": "Blood pressure",
                 "bp_dia": "Blood pressure", "resp_rate": "Breathing rate", "body_temp": "Temperature"}
        snap = self.snapshot()["vitals"]
        parts = []
        for k, v in snap.items():
            if v["status"] == "critical":
                label = f"{names[k]} {v['value']}{v['unit']}"
                if label not in parts and not (k == "bp_dia" and any("Blood pressure" in p for p in parts)):
                    parts.append(label)
        return ", ".join(parts)
