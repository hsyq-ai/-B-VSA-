#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/home/featurize/work/aifscie/CoPaw"
WORK_DIR="/home/featurize/work/aifscie/copaw_work"
LOG_FILE="/tmp/copaw_https.log"
ASR_LOG_FILE="/tmp/vllm_asr.log"
PYTHONPATH_DIR="/home/featurize/work/aifscie/CoPaw/src"
COPAW_BIN="/environment/miniconda3/bin/copaw"
CERT_FILE="$ROOT_DIR/certs/cert.pem"
KEY_FILE="$ROOT_DIR/certs/key.pem"
ASR_MODEL_DIR="/home/featurize/work/aifscie/redai_models/crimson_model/Qwen/Qwen3-ASR-0.6B"
VLLM_BIN="/environment/miniconda3/bin/vllm"

require_host_machine() {
  if [ -f "/.dockerenv" ] || grep -qaE '/docker/|/containerd/|/kubepods/|/lxc/' /proc/1/cgroup 2>/dev/null; then
    echo "[ERROR] This script must be run on the host machine, not inside a container or sandbox."
    exit 1
  fi
}

require_host_machine

echo "[1/5] Stopping existing CoPaw & ASR..."
pkill -f "copaw app" || true
pkill -f "vllm serve .*Qwen3-ASR-0.6B" || true

echo "[2/6] Starting ASR on the host machine (vLLM)..."
setsid /usr/bin/stdbuf -oL -eL "$VLLM_BIN" serve "$ASR_MODEL_DIR" \
  --host 0.0.0.0 \
  --port 8000 \
  > "$ASR_LOG_FILE" 2>&1 < /dev/null &

echo "[3/6] Waiting for ASR to be ready..."
ASR_READY=0
for i in $(seq 1 60); do
  if env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY \
    curl -s --noproxy '*' http://127.0.0.1:8000/v1/models >/dev/null 2>&1; then
    ASR_READY=1
    break
  fi
  sleep 2
done

if [ "$ASR_READY" -ne 1 ]; then
  echo "[3/6] ASR not ready. See log: $ASR_LOG_FILE"
  exit 1
fi

echo "[4/6] Starting CoPaw on the host machine with HTTPS..."
cd "$ROOT_DIR"
export COPAW_WORKING_DIR="$WORK_DIR"
export COPAW_LOGIN_OUTBOX_DELIVERY=1
export PYTHONPATH="$PYTHONPATH_DIR"
export COPAW_ASR_MODEL_DIR="/home/featurize/work/aifscie/redai_models/crimson_model"
# 避免继承旧 shell 中残留的 TTS 配置，确保每次重启都按项目默认值生效。
unset COPAW_TTS_ENABLED COPAW_TTS_PROVIDER COPAW_TTS_VOICE COPAW_TTS_RATE COPAW_TTS_VOLUME COPAW_TTS_PITCH \
  COPAW_TTS_TIMEOUT_SECONDS COPAW_TTS_MAX_CHARS \
  COPAW_TTS_COSYVOICE_TIMEOUT_SECONDS COPAW_TTS_COSYVOICE_REPO_DIR COPAW_TTS_COSYVOICE_MODEL_DIR \
  COPAW_TTS_COSYVOICE_VOICE COPAW_TTS_COSYVOICE_SPEED COPAW_TTS_COSYVOICE_TEXT_FRONTEND \
  COPAW_TTS_FUN_COSYVOICE3_MODEL_DIR COPAW_TTS_FUN_COSYVOICE3_MODE COPAW_TTS_FUN_COSYVOICE3_PROMPT_WAV \
  COPAW_TTS_FUN_COSYVOICE3_PROMPT_TEXT COPAW_TTS_FUN_COSYVOICE3_INSTRUCT_TEXT COPAW_TTS_FUN_COSYVOICE3_VOICE \
  COPAW_TTS_FUN_COSYVOICE3_SPEED COPAW_TTS_FUN_COSYVOICE3_TEXT_FRONTEND \
  COPAW_TTS_VOXCPM_REPO_SRC_DIR COPAW_TTS_VOXCPM_MODEL_DIR COPAW_TTS_VOXCPM_PROMPT_WAV COPAW_TTS_VOXCPM_PROMPT_TEXT \
  COPAW_TTS_VOXCPM_REFERENCE_WAV COPAW_TTS_VOXCPM_USE_PROMPT_AS_REFERENCE COPAW_TTS_VOXCPM_FORCE_STYLE_WITH_CONDITIONING COPAW_TTS_VOXCPM_STYLE COPAW_TTS_VOXCPM_VOICE_LABEL \
  COPAW_TTS_VOXCPM_CFG_VALUE COPAW_TTS_VOXCPM_INFERENCE_TIMESTEPS COPAW_TTS_VOXCPM_MAX_LEN \
  COPAW_TTS_VOXCPM_TIMEOUT_SECONDS COPAW_TTS_VOXCPM_OPTIMIZE COPAW_TTS_VOXCPM_LOAD_DENOISER \
  COPAW_TTS_VOXCPM_NORMALIZE COPAW_TTS_VOXCPM_RETRY_BADCASE COPAW_TTS_VOXCPM_DEVICE COSYVOICE_DISABLE_WETEXT
source "$ROOT_DIR/scripts/voice_secretary_tts_env.sh"

setsid /usr/bin/stdbuf -oL -eL "$COPAW_BIN" app \
  --host 0.0.0.0 \
  --port 8088 \
  --https \
  --ssl-certfile "$CERT_FILE" \
  --ssl-keyfile "$KEY_FILE" \
  > "$LOG_FILE" 2>&1 < /dev/null &

sleep 2

echo "[5/6] Health check (HTTPS on 8088)..."
READY=0
for i in $(seq 1 60); do
  if env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY \
    curl -sk --noproxy '*' https://127.0.0.1:8088/api/version >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done

if [ "$READY" -ne 1 ]; then
  echo "[5/6] Health check failed. See logs:"
  echo "  CoPaw Log: $LOG_FILE"
  echo "  ASR Log: $ASR_LOG_FILE"
  exit 1
fi

echo "[6/6] Exporting port 8088..."
if featurize port list | grep -Eq '^\s*8088\s*->'; then
  echo "[6/6] Port 8088 is already forwarded, skip creating a new public port."
else
  featurize port export 8088
fi

echo "[Done] CoPaw Log: $LOG_FILE"
echo "[Done] ASR Log: $ASR_LOG_FILE"
