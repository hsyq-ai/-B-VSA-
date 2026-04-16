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
DUPLUG_DIR="/home/featurize/work/aifscie/SoulX-Duplug"
DUPLUG_LOG_FILE="/tmp/soulx_duplug.log"
DUPLUG_PID_FILE="/tmp/soulx_duplug.pid"
DUPLUG_PYTHON_BIN="/environment/miniconda3/bin/python"

require_host_machine() {
  if [ -f "/.dockerenv" ] || grep -qaE '/docker/|/containerd/|/kubepods/|/lxc/' /proc/1/cgroup 2>/dev/null; then
    echo "[ERROR] This script must be run on the host machine, not inside a container or sandbox."
    exit 1
  fi
}

check_copaw_ready() {
  curl -sk --noproxy '*' https://127.0.0.1:8088/api/version >/dev/null 2>&1 \
    || env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY \
      curl -sk --noproxy '*' https://127.0.0.1:8088/api/version >/dev/null 2>&1
}

check_duplug_ready() {
  python - <<'PY'
import socket
sock = socket.socket()
sock.settimeout(1.5)
try:
    sock.connect(("127.0.0.1", 8000))
except Exception:
    raise SystemExit(1)
finally:
    sock.close()
raise SystemExit(0)
PY
}

check_pid() {
  local pid="${1:-}"
  if [ -n "$pid" ] && kill -0 "$pid" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

require_host_machine

echo "[1/5] Stopping existing CoPaw and SoulX-Duplug..."
pkill -f "copaw app" || true
pkill -f "uvicorn server:app --host 127.0.0.1 --port 8000" || true

echo "[2/5] Starting SoulX-Duplug on the host machine..."
cd "$DUPLUG_DIR"
nohup /usr/bin/stdbuf -oL -eL "$DUPLUG_PYTHON_BIN" -m uvicorn server:app \
  --host 127.0.0.1 \
  --port 8000 \
  --workers 1 \
  > "$DUPLUG_LOG_FILE" 2>&1 < /dev/null &
DUPLUG_PID=$!
echo "$DUPLUG_PID" > "$DUPLUG_PID_FILE"

echo "[3/5] Waiting SoulX-Duplug health check (8000)..."
DUPLUG_READY=0
for _ in $(seq 1 150); do
  if ! check_pid "$DUPLUG_PID"; then
    echo "[3/5] SoulX-Duplug exited early (pid=$DUPLUG_PID). See log: $DUPLUG_LOG_FILE"
    exit 1
  fi
  if check_duplug_ready; then
    DUPLUG_READY=1
    break
  fi
  sleep 2
done

if [ "$DUPLUG_READY" -ne 1 ]; then
  echo "[3/5] SoulX-Duplug health check failed. See log: $DUPLUG_LOG_FILE"
  exit 1
fi

echo "[4/5] Starting CoPaw on the host machine with HTTPS..."
cd "$ROOT_DIR"
export COPAW_WORKING_DIR="$WORK_DIR"
export COPAW_LOGIN_OUTBOX_DELIVERY=1
export PYTHONPATH="$PYTHONPATH_DIR"
unset COPAW_TTS_ENABLED COPAW_TTS_PROVIDER COPAW_TTS_VOICE COPAW_TTS_RATE COPAW_TTS_VOLUME COPAW_TTS_PITCH COPAW_TTS_TIMEOUT_SECONDS COPAW_TTS_MAX_CHARS COPAW_TTS_COSYVOICE_REPO_DIR COPAW_TTS_FUN_COSYVOICE3_MODEL_DIR COPAW_TTS_FUN_COSYVOICE3_MODE COPAW_TTS_FUN_COSYVOICE3_PROMPT_WAV COPAW_TTS_FUN_COSYVOICE3_PROMPT_TEXT COPAW_TTS_FUN_COSYVOICE3_INSTRUCT_TEXT COPAW_TTS_FUN_COSYVOICE3_VOICE COPAW_TTS_FUN_COSYVOICE3_SPEED COPAW_TTS_FUN_COSYVOICE3_TEXT_FRONTEND COPAW_TTS_COSYVOICE_TIMEOUT_SECONDS COPAW_TTS_COSYVOICE_MODEL_DIR COPAW_TTS_COSYVOICE_VOICE COPAW_TTS_COSYVOICE_SPEED COPAW_TTS_COSYVOICE_TEXT_FRONTEND COPAW_TTS_VOXCPM_REPO_SRC_DIR COPAW_TTS_VOXCPM_MODEL_DIR COPAW_TTS_VOXCPM_PROMPT_WAV COPAW_TTS_VOXCPM_PROMPT_TEXT COPAW_TTS_VOXCPM_REFERENCE_WAV COPAW_TTS_VOXCPM_USE_PROMPT_AS_REFERENCE COPAW_TTS_VOXCPM_FORCE_STYLE_WITH_CONDITIONING COPAW_TTS_VOXCPM_STYLE COPAW_TTS_VOXCPM_VOICE_LABEL COPAW_TTS_VOXCPM_CFG_VALUE COPAW_TTS_VOXCPM_INFERENCE_TIMESTEPS COPAW_TTS_VOXCPM_MAX_LEN COPAW_TTS_VOXCPM_TIMEOUT_SECONDS COPAW_TTS_VOXCPM_OPTIMIZE COPAW_TTS_VOXCPM_LOAD_DENOISER COPAW_TTS_VOXCPM_NORMALIZE COPAW_TTS_VOXCPM_RETRY_BADCASE COPAW_TTS_VOXCPM_DEVICE COSYVOICE_DISABLE_WETEXT
source "$ROOT_DIR/scripts/voice_secretary_tts_env.sh"

if [ "${COPAW_FOREGROUND:-0}" = "1" ]; then
  echo "[4/5] Foreground mode enabled (COPAW_FOREGROUND=1)."
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

echo "[5/5] Health check (HTTPS on 8088)..."
READY=0
for _ in $(seq 1 60); do
  if ! check_pid "$COPAW_PID"; then
    echo "[5/5] CoPaw process exited early (pid=$COPAW_PID). See log: $LOG_FILE"
    exit 1
  fi
  if check_copaw_ready; then
    READY=1
    break
  fi
  sleep 1
done

if [ "$READY" -ne 1 ]; then
  echo "[5/5] CoPaw health check failed. See log: $LOG_FILE"
  exit 1
fi

echo "[5/5] Port export skipped by script design."

echo "[Done] SoulX-Duplug Log: $DUPLUG_LOG_FILE"
echo "[Done] SoulX-Duplug PID: $DUPLUG_PID (saved to $DUPLUG_PID_FILE)"
echo "[Done] CoPaw Log: $LOG_FILE"
echo "[Done] CoPaw PID: $COPAW_PID (saved to $PID_FILE)"
