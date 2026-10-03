#!/usr/bin/env bash
# Start DING.  ./code/run.sh        -> hub serves the built UI on http://127.0.0.1:8000
#              ./code/run.sh dev    -> hub + Vite dev server (hot reload) on http://127.0.0.1:5173
set -e
cd "$(dirname "$0")"
PY=../.venv/bin/python
[ -x "$PY" ] || { echo "Create the venv first: python3 -m venv .venv && .venv/bin/pip install -r code/requirements.txt"; exit 1; }
[ -d ui/node_modules ] || (cd ui && npm install)

if [ "$1" = "dev" ]; then
  (cd ui && npx vite --host 127.0.0.1) &
  VITE=$!
  trap 'kill $VITE 2>/dev/null' EXIT
  echo "Bell Screen: http://127.0.0.1:5173   Sim panel: http://127.0.0.1:5173/#/sim"
else
  (cd ui && npx vite build --logLevel warn)
  echo "Bell Screen: http://127.0.0.1:8000   Sim panel: http://127.0.0.1:8000/#/sim"
fi
"$PY" -m hub
