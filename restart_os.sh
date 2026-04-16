#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/home/featurize/work/aifscie/CoPaw"
WORK_DIR="/home/featurize/work/aifscie/copaw_work"
LOG_FILE="/tmp/copaw.log"
PID_FILE="/tmp/copaw.pid"
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

echo "[1/5] Stopping existing CoPaw..."
pkill -f "copaw app" || true

echo "[2/5] Starting CoPaw with HTTPS..."
cd "$ROOT_DIR"
export COPAW_WORKING_DIR="$WORK_DIR"
export COPAW_LOGIN_OUTBOX_DELIVERY=1
export PYTHONPATH="$PYTHONPATH_DIR"
source "$ROOT_DIR/scripts/voice_secretary_tts_env.sh"

nohup /usr/bin/stdbuf -oL -eL "$COPAW_BIN" app \
  --host 0.0.0.0 \
  --port 8088 \
  --https \
  --ssl-certfile "$CERT_FILE" \
  --ssl-keyfile "$KEY_FILE" \
  > "$LOG_FILE" 2>&1 < /dev/null &
COPAW_PID=$!
echo "$COPAW_PID" > "$PID_FILE"

echo "[3/5] Health check (HTTPS on 8088)..."
READY=0
for i in $(seq 1 60); do
  if ! check_pid; then
    echo "[3/5] CoPaw process exited early (pid=$COPAW_PID). See log: $LOG_FILE"
    exit 1
  fi
  if check_ready; then
    READY=1
    break
  fi
  sleep 1
done

if [ "$READY" -ne 1 ]; then
  echo "[3/5] Health check failed. See log: $LOG_FILE"
  exit 1
fi

echo "[4/5] Exporting port 8088..."
if command -v featurize >/dev/null 2>&1; then
  if featurize port list 2>/dev/null | grep -Eq '^[[:space:]]*8088[[:space:]]*->'; then
    echo "[4/5] Port 8088 is already forwarded."
  else
    featurize port export 8088
  fi
fi

echo "[5/5] Done."
echo "Log: $LOG_FILE | PID: $COPAW_PID (saved to $PID_FILE)"
