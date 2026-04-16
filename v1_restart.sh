#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/home/featurize/work/aifscie/CoPaw"
WORK_DIR="/home/featurize/work/aifscie/copaw_work"
LOG_FILE="/tmp/copaw_https.log"
PID_FILE="/tmp/copaw_https.pid"
PYTHONPATH_DIR="/home/featurize/work/aifscie/CoPaw/src"
COPAW_BIN="/environment/miniconda3/bin/copaw"
CERT_FILE="$ROOT_DIR/certs/cert.pem"
KEY_FILE="$ROOT_DIR/certs/key.pem"

require_host_machine() {
  if [ -f "/.dockerenv" ] || grep -qaE '/docker/|/containerd/|/kubepods/|/lxc/' /proc/1/cgroup 2>/dev/null; then
    echo "[ERROR] This script must be run on the host machine, not inside a container or sandbox."
    exit 1
  fi
}

check_ready() {
  # Prefer current env, fallback to proxy-less env.
  curl -sk --noproxy '*' https://127.0.0.1:8088/api/version >/dev/null 2>&1 \
    || env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY \
      curl -sk --noproxy '*' https://127.0.0.1:8088/api/version >/dev/null 2>&1
}

check_pid() {
  if [ -n "${COPAW_PID:-}" ] && kill -0 "$COPAW_PID" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

require_host_machine

echo "[1/4] Stopping existing CoPaw..."
pkill -f "copaw app" || true

echo "[2/4] Starting CoPaw on the host machine with HTTPS..."
cd "$ROOT_DIR"
export COPAW_WORKING_DIR="$WORK_DIR"
export COPAW_LOGIN_OUTBOX_DELIVERY=1
export PYTHONPATH="$PYTHONPATH_DIR"

if [ "${COPAW_FOREGROUND:-0}" = "1" ]; then
  echo "[2/4] Foreground mode enabled (COPAW_FOREGROUND=1)."
  exec /usr/bin/stdbuf -oL -eL "$COPAW_BIN" app \
    --host 0.0.0.0 \
    --port 8088 \
    --https \
    --ssl-certfile "$CERT_FILE" \
    --ssl-keyfile "$KEY_FILE"
fi

nohup /usr/bin/stdbuf -oL -eL "$COPAW_BIN" app \
  --host 0.0.0.0 \
  --port 8088 \
  --https \
  --ssl-certfile "$CERT_FILE" \
  --ssl-keyfile "$KEY_FILE" \
  > "$LOG_FILE" 2>&1 < /dev/null &
COPAW_PID=$!
echo "$COPAW_PID" > "$PID_FILE"

echo "[3/4] Health check (HTTPS on 8088)..."
READY=0
for i in $(seq 1 60); do
  if ! check_pid; then
    echo "[3/4] CoPaw process exited early (pid=$COPAW_PID). See log: $LOG_FILE"
    exit 1
  fi
  if check_ready; then
    READY=1
    break
  fi
  sleep 1
done

if [ "$READY" -ne 1 ]; then
  echo "[3/4] Health check failed. See log: $LOG_FILE"
  exit 1
fi

echo "[4/4] Exporting port 8088 if needed..."
if command -v featurize >/dev/null 2>&1; then
  if featurize port list 2>/dev/null | grep -Eq '^[[:space:]]*8088[[:space:]]*->'; then
    echo "[4/4] Port 8088 is already forwarded."
  else
    echo "[4/4] Port 8088 is not mapped, exporting now..."
    featurize port export 8088
  fi
else
  echo "[4/4] featurize command not found, skip port export."
fi

echo "[Done] CoPaw Log: $LOG_FILE"
echo "[Done] CoPaw PID: $COPAW_PID (saved to $PID_FILE)"
