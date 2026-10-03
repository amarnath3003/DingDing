"""Run the hub:  cd code && ../.venv/bin/python -m hub"""
import uvicorn

from . import config


def request_camera_access() -> None:
    """macOS only asks for camera permission from the main thread; do it before
    the face thread starts so the system prompt can appear."""
    if not (config.FACE_ENABLED and config.CAMERA_SOURCE.isdigit()):
        return
    try:
        import cv2
        cap = cv2.VideoCapture(int(config.CAMERA_SOURCE))
        cap.release()
    except Exception:
        pass


if __name__ == "__main__":
    request_camera_access()
    uvicorn.run("hub.main:app", host=config.HUB_HOST, port=config.HUB_PORT, log_level="warning")
