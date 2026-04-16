#!/usr/bin/env bash
# ============================================================
# CoPaw 一键重启脚本 (2025-04-15)
# 用法: bash /home/featurize/work/aifscie/CoPaw/4_15_restart.sh
#
# 做了什么：
#   [1/6] 杀旧进程 — 先 pkill copaw，再用 sudo kill 容器内 /app/venv/bin/copaw 残留进程
#   [2/6] 启动 SoulX-Duplug (port 8000) — 等待健康检查通过
#   [3/6] 启动 CoPaw HTTPS (port 8088) — 带 SSL 证书、TTS环境变量、PYTHONPATH
#   [4/6] 等待健康检查 — 轮询 https://127.0.0.1:8088/api/version 直到就绪
#   [5/6] 暴露外网端口 — featurize port export 8088（已暴露则跳过）
#   [6/6] 输出外网访问地址
#
# 注意事项：
#   - 必须在宿主机运行（不能在 Docker 容器里执行）
#   - 需要 sudo 权限来清理容器内残留的 copaw 进程
#   - 日志: /tmp/copaw_https.log, /tmp/soulx_duplug.log
#   - PID 文件: /tmp/copaw_https.pid, /tmp/soulx_duplug.pid
# ============================================================
set -euo pipefail

ROOT_DIR="/home/featurize/work/aifscie/CoPaw"
WORK_DIR="/home/featurize/work/aifscie/copaw_work"
LOG_FILE="/tmp/copaw_https.log"
PID_FILE="/tmp/copaw_https.pid"
PYTHONPATH_DIR="/home/featurize/work/aifscie/CoPaw/src"
COPAW_BIN="/environment/miniconda3/bin/copaw"
CERT_FILE="$ROOT_DIR/certs/cert.pem"
KEY_FILE="$ROOT_DIR/certs/key.pem"
PORT=8088

DUPLUG_DIR="/home/featurize/work/aifscie/SoulX-Duplug"
DUPLUG_LOG_FILE="/tmp/soulx_duplug.log"
DUPLUG_PID_FILE="/tmp/soulx_duplug.pid"
DUPLUG_PYTHON_BIN="/environment/miniconda3/bin/python"

# ── 工具函数 ──────────────────────────────────────────────

require_host_machine() {
  if [ -f "/.dockerenv" ] || grep -qaE '/docker/|/containerd/|/kubepods/|/lxc/' /proc/1/cgroup 2>/dev/null; then
    echo "[ERROR] 此脚本必须在宿主机上运行, 不能在容器或沙盒内执行."
    exit 1
  fi
}

check_copaw_ready() {
  curl -sk --noproxy '*' "https://127.0.0.1:${PORT}/api/version" >/dev/null 2>&1 \
    || env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY \
      curl -sk --noproxy '*' "https://127.0.0.1:${PORT}/api/version" >/dev/null 2>&1
}

check_duplug_ready() {
  python3 - <<'PY'
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
  [ -n "$pid" ] && kill -0 "$pid" >/dev/null 2>&1
}

# ── 主流程 ────────────────────────────────────────────────

require_host_machine

# ── [1/6] 停止所有旧进程 ──
echo "[1/6] 停止旧进程..."

# 1a. 普通方式杀掉宿主机的 copaw 进程
pkill -f "copaw app" 2>/dev/null || true
pkill -f "uvicorn server:app --host 127.0.0.1 --port 8000" 2>/dev/null || true
sleep 2

# 1b. 强制杀掉容器内残留的 /app/venv/bin/copaw（这些没有 HTTPS, 会抢占端口）
LEGACY_PIDS=$(pgrep -f "/app/venv/bin/copaw" 2>/dev/null || true)
if [ -n "$LEGACY_PIDS" ]; then
  echo "  发现容器残留进程 (无HTTPS): $LEGACY_PIDS, 使用 sudo kill -9 清理..."
  echo "$LEGACY_PIDS" | xargs -r sudo kill -9 2>/dev/null || true
  sleep 1
else
  echo "  无容器残留进程"
fi

# 确认端口已释放
if lsof -i :"$PORT" -t >/dev/null 2>&1; then
  lsof -i :"$PORT" -t | xargs -r sudo kill -9 2>/dev/null || true
  sleep 1
  if lsof -i :"$PORT" -t >/dev/null 2>&1; then
    echo "  ❌ 端口 ${PORT} 仍被占用, 无法释放!"
    exit 1
  fi
fi
echo "  ✓ 端口 ${PORT} 已释放"

# ── [2/6] 启动 SoulX-Duplug ──
echo "[2/6] 启动 SoulX-Duplug (port 8000)..."
cd "$DUPLUG_DIR"
nohup /usr/bin/stdbuf -oL -eL "$DUPLUG_PYTHON_BIN" -m uvicorn server:app \
  --host 127.0.0.1 \
  --port 8000 \
  --workers 1 \
  > "$DUPLUG_LOG_FILE" 2>&1 < /dev/null &
DUPLUG_PID=$!
echo "$DUPLUG_PID" > "$DUPLUG_PID_FILE"

# ── [3/6] 等待 Duplug 就绪 ──
echo "[3/6] 等待 SoulX-Duplug 健康检查..."
for _ in $(seq 1 150); do
  if ! check_pid "$DUPLUG_PID"; then
    echo "  ❌ SoulX-Duplug 提前退出 (pid=$DUPLUG_PID), 日志: $DUPLUG_LOG_FILE"
    exit 1
  fi
  if check_duplug_ready; then
    break
  fi
  sleep 2
done
echo "  ✓ SoulX-Duplug 就绪 (pid=$DUPLUG_PID)"

# ── [4/6] 启动 CoPaw (HTTPS) ──
echo "[4/6] 启动 CoPaw (HTTPS on port ${PORT})..."
cd "$ROOT_DIR"
export COPAW_WORKING_DIR="$WORK_DIR"
export COPAW_LOGIN_OUTBOX_DELIVERY=1
export PYTHONPATH="$PYTHONPATH_DIR"
unset COPAW_TTS_ENABLED COPAW_TTS_PROVIDER COPAW_TTS_VOICE COPAW_TTS_RATE COPAW_TTS_VOLUME COPAW_TTS_PITCH COPAW_TTS_TIMEOUT_SECONDS COPAW_TTS_MAX_CHARS COPAW_TTS_COSYVOICE_REPO_DIR COPAW_TTS_FUN_COSYVOICE3_MODEL_DIR COPAW_TTS_FUN_COSYVOICE3_MODE COPAW_TTS_FUN_COSYVOICE3_PROMPT_WAV COPAW_TTS_FUN_COSYVOICE3_PROMPT_TEXT COPAW_TTS_FUN_COSYVOICE3_INSTRUCT_TEXT COPAW_TTS_FUN_COSYVOICE3_VOICE COPAW_TTS_FUN_COSYVOICE3_SPEED COPAW_TTS_FUN_COSYVOICE3_TEXT_FRONTEND COPAW_TTS_COSYVOICE_TIMEOUT_SECONDS COPAW_TTS_COSYVOICE_MODEL_DIR COPAW_TTS_COSYVOICE_VOICE COPAW_TTS_COSYVOICE_SPEED COPAW_TTS_COSYVOICE_TEXT_FRONTEND COPAW_TTS_VOXCPM_REPO_SRC_DIR COPAW_TTS_VOXCPM_MODEL_DIR COPAW_TTS_VOXCPM_PROMPT_WAV COPAW_TTS_VOXCPM_PROMPT_TEXT COPAW_TTS_VOXCPM_REFERENCE_WAV COPAW_TTS_VOXCPM_USE_PROMPT_AS_REFERENCE COPAW_TTS_VOXCPM_FORCE_STYLE_WITH_CONDITIONING COPAW_TTS_VOXCPM_STYLE COPAW_TTS_VOXCPM_VOICE_LABEL COPAW_TTS_VOXCPM_CFG_VALUE COPAW_TTS_VOXCPM_INFERENCE_TIMESTEPS COPAW_TTS_VOXCPM_MAX_LEN COPAW_TTS_VOXCPM_TIMEOUT_SECONDS COPAW_TTS_VOXCPM_OPTIMIZE COPAW_TTS_VOXCPM_LOAD_DENOISER COPAW_TTS_VOXCPM_NORMALIZE COPAW_TTS_VOXCPM_RETRY_BADCASE COPAW_TTS_VOXCPM_DEVICE COSYVOICE_DISABLE_WETEXT
source "$ROOT_DIR/scripts/voice_secretary_tts_env.sh"

nohup /usr/bin/stdbuf -oL -eL "$COPAW_BIN" app \
  --host 0.0.0.0 \
  --port "$PORT" \
  --https \
  --ssl-certfile "$CERT_FILE" \
  --ssl-keyfile "$KEY_FILE" \
  > "$LOG_FILE" 2>&1 < /dev/null &
COPAW_PID=$!
echo "$COPAW_PID" > "$PID_FILE"

# ── [5/6] 等待 CoPaw 健康检查 + 暴露外网 ──
echo "[5/6] 等待 CoPaw 健康检查..."
READY=0
for _ in $(seq 1 60); do
  if ! check_pid "$COPAW_PID"; then
    echo "  ❌ CoPaw 提前退出 (pid=$COPAW_PID), 日志: $LOG_FILE"
    tail -30 "$LOG_FILE" 2>/dev/null
    exit 1
  fi
  if check_copaw_ready; then
    READY=1
    break
  fi
  sleep 1
done

if [ "$READY" -ne 1 ]; then
  echo "  ❌ CoPaw 健康检查超时, 日志: $LOG_FILE"
  tail -30 "$LOG_FILE" 2>/dev/null
  exit 1
fi
echo "  ✓ CoPaw 就绪 (pid=$COPAW_PID)"

# ── [6/6] 外网端口暴露 ──
echo "[6/6] 检查外网端口映射..."
EXPORTED=$(featurize port list 2>/dev/null | grep "^ *${PORT} ->" || true)
if [ -n "$EXPORTED" ]; then
  EXTERNAL_PORT=$(echo "$EXPORTED" | head -1 | awk '{print $NF}' | tr -d '[:space:]')
  echo "  端口 ${PORT} 已暴露 → ${EXTERNAL_PORT}, 跳过重复暴露"
else
  EXPORT_OUTPUT=$(featurize port export "$PORT" 2>&1) || {
    echo "  ⚠️ featurize port export 失败: $EXPORT_OUTPUT"
    echo "  请手动执行: featurize port export ${PORT}"
  }
  # 提取新暴露的端口号
  EXTERNAL_PORT=$(echo "${EXPORT_OUTPUT:-}" | grep -oP ':\K[0-9]+' | head -1 || echo "")
fi

# ── 完成 ──
echo ""
echo "========================================="
echo "✅ 重启完成!"
echo "========================================="
echo "  CoPaw      PID: $COPAW_PID  日志: $LOG_FILE"
echo "  Duplug     PID: $DUPLUG_PID  日志: $DUPLUG_LOG_FILE"

if [ -n "${EXTERNAL_PORT:-}" ]; then
  echo "  外网地址: https://workspace.featurize.cn:${EXTERNAL_PORT}"
else
  echo "  外网地址: 请查看 'featurize port list' 确认端口映射"
fi
echo ""
