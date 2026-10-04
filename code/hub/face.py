"""Facial expression + attention from a camera, fully on-device.

Pipeline: OpenCV frame -> MediaPipe Face Landmarker (52 blendshape scores,
~3.7 MB model, runs on CPU) -> hand-written rules -> smoothed label.

Labels: neutral, happy, sad, uncomfortable, tired.
Attention: ok, eyes_closed, looking_away, no_face (the scanner pauses on these).

Camera source is CAMERA_SOURCE: "0" for the laptop camera, or later the
ESP32-CAM stream URL (http://<ip>:81/stream); nothing else changes.

Frames never leave this process except the optional local preview for the
operator panel. Only the label goes to the LLM.

The rules are a starting point: generic thresholds misread faces affected by
ALS, so "Calibrate neutral" records the user's resting face and every score is
measured relative to it. Thresholds still need tuning with our user.
"""
from __future__ import annotations

import logging
import threading
import time
import urllib.request
from typing import Callable, Dict, Optional

from . import config

log = logging.getLogger("face")

LABELS = ("neutral", "happy", "sad", "uncomfortable", "tired")

EYES_CLOSED_S = 2.0     # eyes shut this long -> pause scanning
AWAY_S = 1.5            # face turned / missing this long -> pause scanning
LABEL_HOLD_S = 0.8      # a new label must stay on top this long before it's reported
PUBLISH_EVERY_S = 0.25
PREVIEW_WIDTH = 320       # the preview is a glance, not a video: small, rough and slow is fine
PREVIEW_EVERY_S = 0.2     # ~5 fps
PREVIEW_QUALITY = 45      # JPEG quality, ~5 KB a frame

# Preview overlay colours (BGR), from the screen palette: mesh in cream, features in clay, irises in green.
MESH_BGR, FEATURE_BGR, IRIS_BGR = (120, 128, 132), (79, 119, 217), (155, 194, 143)
_mesh_lines: Optional[dict] = None  # MediaPipe face-mesh connections, loaded with mediapipe


def _connections() -> dict:
    global _mesh_lines
    if _mesh_lines is None:
        from mediapipe.tasks.python.vision import FaceLandmarksConnections as C
        pairs = lambda conns: [(c.start, c.end) for c in conns]
        _mesh_lines = {
            "mesh": pairs(C.FACE_LANDMARKS_TESSELATION),
            "features": pairs(C.FACE_LANDMARKS_FACE_OVAL + C.FACE_LANDMARKS_LEFT_EYE + C.FACE_LANDMARKS_RIGHT_EYE
                              + C.FACE_LANDMARKS_LEFT_EYEBROW + C.FACE_LANDMARKS_RIGHT_EYEBROW + C.FACE_LANDMARKS_LIPS),
            "irises": pairs(C.FACE_LANDMARKS_LEFT_IRIS + C.FACE_LANDMARKS_RIGHT_IRIS),
        }
    return _mesh_lines


def _avg(bs: Dict[str, float], *names: str) -> float:
    return sum(bs.get(n, 0.0) for n in names) / len(names)


def _clamp(x: float) -> float:
    return max(0.0, min(1.0, x))


def expression_scores(bs: Dict[str, float], eye_slow: float) -> Dict[str, float]:
    """Blendshapes (already relative to the calibrated baseline) -> label scores 0..1."""
    smile = _avg(bs, "mouthSmileLeft", "mouthSmileRight")
    frown = _avg(bs, "mouthFrownLeft", "mouthFrownRight")
    brow_down = _avg(bs, "browDownLeft", "browDownRight")
    brow_inner_up = bs.get("browInnerUp", 0.0)
    squint = _avg(bs, "eyeSquintLeft", "eyeSquintRight")
    sneer = _avg(bs, "noseSneerLeft", "noseSneerRight")
    press = _avg(bs, "mouthPressLeft", "mouthPressRight")
    stretch = _avg(bs, "mouthStretchLeft", "mouthStretchRight")
    shrug_lower = bs.get("mouthShrugLower", 0.0)
    jaw = bs.get("jawOpen", 0.0)
    eye = _avg(bs, "eyeBlinkLeft", "eyeBlinkRight")

    yawn = 0.5 if (jaw > 0.5 and eye > 0.3) else 0.0
    s = {
        "happy": _clamp(smile * 1.3),
        "sad": _clamp(frown * 1.6 + brow_inner_up * 0.8 + shrug_lower * 0.5 - smile),
        "uncomfortable": _clamp(brow_down * 1.2 + sneer * 1.2 + squint * 0.5
                                + stretch * 0.8 + press * 0.6 - smile),
        "tired": _clamp((eye_slow - 0.25) * 1.6 + yawn),
    }
    s["neutral"] = _clamp(1.0 - max(s.values()) * 1.4)
    return s


class FaceSensor:
    def __init__(self, on_update: Callable[[dict], None]):
        self.on_update = on_update
        self.status = "off"
        self.error = ""
        self.override: Optional[str] = None  # set from the sim panel; wins over the camera
        self.preview_clients = 0
        self.latest_jpeg: Optional[bytes] = None
        self._last_preview = 0.0
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._baseline: Dict[str, float] = {}
        self._calib_until = 0.0
        self._calib_samples: list = []
        self._reset_tracking()

    def _reset_tracking(self) -> None:
        self._ema = {k: 0.0 for k in LABELS}
        self._ema["neutral"] = 1.0
        self._eye_slow = 0.0
        self._label = "neutral"
        self._candidate = "neutral"
        self._candidate_since = time.monotonic()
        self._eyes_closed_since: Optional[float] = None
        self._away_since: Optional[float] = None
        self._last_face = time.monotonic()
        self._last_publish = 0.0

    # --- control -------------------------------------------------------------
    def start(self) -> None:
        if not config.FACE_ENABLED:
            self.status = "disabled"
            return
        self._thread = threading.Thread(target=self._run, name="face", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def calibrate(self, seconds: float = 3.0) -> None:
        """Record the user's resting face; scores are then relative to it."""
        self._calib_samples = []
        self._calib_until = time.monotonic() + seconds

    def snapshot(self) -> dict:
        return self._snapshot_from(self._ema, "neutral" if self.status != "running" else self._label,
                                   self._attention(time.monotonic()) if self.status == "running" else "ok")

    # --- worker thread ---------------------------------------------------------
    def _run(self) -> None:
        try:
            import cv2
            import mediapipe as mp
        except ImportError as e:
            self._fail(f"missing dependency: {e.name}")
            return
        try:
            self._ensure_model()
        except Exception as e:
            self._fail(f"could not download face model: {e}")
            return

        vision = mp.tasks.vision
        options = vision.FaceLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=str(config.FACE_MODEL_PATH)),
            running_mode=vision.RunningMode.VIDEO,
            num_faces=1,
            output_face_blendshapes=True,
        )
        source = int(config.CAMERA_SOURCE) if config.CAMERA_SOURCE.isdigit() else config.CAMERA_SOURCE

        with vision.FaceLandmarker.create_from_options(options) as landmarker:
            while not self._stop.is_set():
                cap = cv2.VideoCapture(source)
                if not cap.isOpened():
                    self._fail(f"camera {config.CAMERA_SOURCE!r} unavailable "
                               "(on macOS, allow camera access for your terminal app)")
                    time.sleep(5)
                    continue
                self.status, self.error = "running", ""
                self._reset_tracking()
                log.info("camera %s opened", config.CAMERA_SOURCE)
                t0 = time.monotonic()
                last_ts = -1
                while not self._stop.is_set():
                    ok, frame = cap.read()
                    if not ok:
                        self._fail("camera stopped sending frames")
                        break
                    ts = int((time.monotonic() - t0) * 1000)
                    if ts <= last_ts:  # detect_for_video needs strictly increasing timestamps
                        continue
                    last_ts = ts
                    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    result = landmarker.detect_for_video(
                        mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), ts)
                    self._process(result)
                    if self.preview_clients > 0 and time.monotonic() - self._last_preview >= PREVIEW_EVERY_S:
                        self._last_preview = time.monotonic()
                        self._make_preview(cv2, frame, result.face_landmarks[0] if result.face_landmarks else None)
                    time.sleep(0.03)  # ~15-20 fps is plenty
                cap.release()

    def _ensure_model(self) -> None:
        path = config.FACE_MODEL_PATH
        if path.exists():
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        self.status = "downloading model"
        log.info("downloading face model to %s", path)
        tmp = path.with_suffix(".part")
        urllib.request.urlretrieve(config.FACE_MODEL_URL, tmp)
        tmp.rename(path)

    def _fail(self, msg: str) -> None:
        if self.error != msg:
            log.warning("face: %s", msg)
        self.status, self.error = "unavailable", msg
        self.on_update(self.snapshot())

    # --- per-frame logic -------------------------------------------------------
    def _process(self, result) -> None:
        now = time.monotonic()
        if result.face_blendshapes:
            self._last_face = now
            raw = {c.category_name: c.score for c in result.face_blendshapes[0]}

            if now < self._calib_until:
                self._calib_samples.append(raw)
            elif self._calib_samples:
                n = len(self._calib_samples)
                self._baseline = {k: sum(s[k] for s in self._calib_samples) / n for k in raw}
                self._calib_samples = []
                log.info("face calibrated on %d frames", n)

            bs = {k: max(0.0, v - self._baseline.get(k, 0.0)) for k, v in raw.items()}
            eye_raw = _avg(raw, "eyeBlinkLeft", "eyeBlinkRight")  # closure is absolute, not relative
            self._eye_slow += (_avg(bs, "eyeBlinkLeft", "eyeBlinkRight") - self._eye_slow) * 0.05

            scores = expression_scores(bs, self._eye_slow)
            for k in LABELS:
                self._ema[k] += (scores[k] - self._ema[k]) * 0.3

            self._eyes_closed_since = (self._eyes_closed_since or now) if eye_raw > 0.6 else None
            lm = result.face_landmarks[0]
            nose, left_eye, right_eye = lm[1], lm[33], lm[263]
            eye_dist = abs(right_eye.x - left_eye.x) or 1e-6
            yaw_ratio = (nose.x - (left_eye.x + right_eye.x) / 2) / eye_dist
            self._away_since = (self._away_since or now) if abs(yaw_ratio) > 0.35 else None

            top = max(self._ema, key=self._ema.get)
            if top != self._candidate:
                self._candidate, self._candidate_since = top, now
            elif top != self._label and now - self._candidate_since >= LABEL_HOLD_S:
                self._label = top

        if now - self._last_publish >= PUBLISH_EVERY_S:
            self._last_publish = now
            self.on_update(self.snapshot())

    def _attention(self, now: float) -> str:
        if now - self._last_face > AWAY_S:
            return "no_face"
        if self._eyes_closed_since and now - self._eyes_closed_since >= EYES_CLOSED_S:
            return "eyes_closed"
        if self._away_since and now - self._away_since >= AWAY_S:
            return "looking_away"
        return "ok"

    def _snapshot_from(self, ema: dict, label: str, attention: str) -> dict:
        calibrating = time.monotonic() < self._calib_until
        if self.override:
            return {"label": self.override, "confidence": 1.0, "attention": "ok",
                    "source": "override", "status": self.status, "error": self.error,
                    "calibrated": bool(self._baseline), "calibrating": calibrating,
                    "scores": {k: (1.0 if k == self.override else 0.0) for k in LABELS}}
        return {
            "label": label,
            "confidence": round(ema.get(label, 0.0), 2),
            "attention": attention,
            "source": "camera",
            "status": self.status,
            "error": self.error,
            "calibrated": bool(self._baseline),
            "calibrating": calibrating,
            "scores": {k: round(v, 2) for k, v in ema.items()},
        }

    def _make_preview(self, cv2, frame, landmarks=None) -> None:
        """Mirrored frame with the MediaPipe face mesh and the current reading drawn on it."""
        h, w = frame.shape[:2]
        pw, ph = PREVIEW_WIDTH, int(PREVIEW_WIDTH * h / w)
        small = cv2.resize(cv2.flip(frame, 1), (pw, ph), interpolation=cv2.INTER_AREA)
        if landmarks:
            pts = [(int((1 - p.x) * pw), int(p.y * ph)) for p in landmarks]  # mirrored like the frame
            lines = _connections()
            for a, b in lines["mesh"]:  # thin and grey, no anti-aliasing: cheap, and the face stays readable
                cv2.line(small, pts[a], pts[b], MESH_BGR, 1)
            for a, b in lines["features"]:
                cv2.line(small, pts[a], pts[b], FEATURE_BGR, 1, cv2.LINE_AA)
            for a, b in lines["irises"]:
                if a < len(pts) and b < len(pts):
                    cv2.line(small, pts[a], pts[b], IRIS_BGR, 1, cv2.LINE_AA)
        snap = self.snapshot()
        text = f"{snap['label']} {snap['confidence']:.2f}  |  {snap['attention'].replace('_', ' ')}"
        cv2.rectangle(small, (0, ph - 22), (pw, ph), (28, 30, 31), -1)
        cv2.putText(small, text if landmarks else "no face found", (8, ph - 7),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.42, (230, 236, 240), 1, cv2.LINE_AA)
        ok, jpg = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, PREVIEW_QUALITY])
        if ok:
            self.latest_jpeg = jpg.tobytes()
