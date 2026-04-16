#!/usr/bin/env bash
# ============================================================
# Aifscie Agent OS — 前端构建 + 服务重启一键脚本 (2026-04-16)
# 用法: bash /home/featurize/work/aifscie/CoPaw/4_16_build_restart.sh [--skip-build]
#
# 流程：
#   [1/7] 前端构建 — cd console && npm install && npm run build
#   [2/7] 停止旧进程 — pkill copaw + 清理容器残留 + 释放端口
#   [3/7] 启动 SoulX-Duplug (port 8000) — 语音去重服务
#   [4/7] 等待 Duplug 就绪
#   [5/7] 启动 CoPaw HTTPS (port 8088) — 带 COPAW_WORKING_DIR + SSL + TTS
#   [6/7] 等待 CoPaw 就绪
#   [7/7] 暴露外网端口（Featurize 平台）或输出访问地址
#
# 选项：
#   --skip-build    跳过前端构建步骤，仅重启服务
# ============================================================
set -euo pipefail

# ── 可配置路径 ────────────────────────────────────────────
ROOT_DIR="/home/featurize/work/aifscie/CoPaw"
WORK_DIR="/home/featurize/work/aifscie/copaw_work"
CONSOLE_DIR="$ROOT_DIR/console"
PYTHONPATH_DIR="$ROOT_DIR/src"
COPAW_BIN="/environment/miniconda3/bin/copaw"
CERT_FILE="$ROOT_DIR/certs/cert.pem"
KEY_FILE="$ROOT_DIR/certs/key.pem"
PORT=8088
LOG_FILE="/tmp/copaw_https.log"
PID_FILE="/tmp/copaw_https.pid"

DUPLUG_DIR="/home/featurize/work/aifscie/SoulX-Duplug"
DUPLUG_LOG_FILE="/tmp/soulx_duplug.log"
DUPLUG_PID_FILE="/tmp/soulx_duplug.pid"
DUPLUG_PYTHON_BIN="/environment/miniconda3/bin/python"

SKIP_BUILD=0
[[ "${1:-}" == "--skip-build" ]] && SKIP_BUILD=1

# ── 工具函数 ──────────────────────────────────────────────

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

step() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  $1"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# ── 主流程 ────────────────────────────────────────────────

# [1/7] 前端构建
if [ "$SKIP_BUILD" -eq 1 ]; then
  step "[1/7] 跳过前端构建 (--skip-build)"
else
  step "[1/7] 前端构建"
  cd "$CONSOLE_DIR"
  echo "  npm install..."
  npm install --prefer-offline 2>&1 | tail -3
  echo "  npm run build..."
  npm run build 2>&1 | tail -5
  if [ ! -d "$CONSOLE_DIR/dist" ]; then
    echo "  ❌ 前端构建失败, dist 目录不存在!"
    exit 1
  fi
  echo "  ✓ 前端构建完成"
fi

# [2/7] 停止旧进程
step "[2/7] 停止旧进程"
pkill -f "copaw app" 2>/dev/null || true
pkill -f "uvicorn server:app --host 127.0.0.1 --port 8000" 2>/dev/null || true
sleep 2

LEGACY_PIDS=$(pgrep -f "/app/venv/bin/copaw" 2>/dev/null || true)
if [ -n "$LEGACY_PIDS" ]; then
  echo "  发现容器残留进程: $LEGACY_PIDS, 清理..."
  echo "$LEGACY_PIDS" | xargs -r sudo kill -9 2>/dev/null || true
  sleep 1
fi

if lsof -i :"$PORT" -t >/dev/null 2>&1; then
  lsof -i :"$PORT" -t | xargs -r sudo kill -9 2>/dev/null || true
  sleep 1
  if lsof -i :"$PORT" -t >/dev/null 2>&1; then
    echo "  ❌ 端口 ${PORT} 无法释放!"
    exit 1
  fi
fi
echo "  ✓ 端口 ${PORT} 已释放"

# [3/7] 启动 SoulX-Duplug
step "[3/7] 启动 SoulX-Duplug (port 8000)"
cd "$DUPLUG_DIR"
nohup /usr/bin/stdbuf -oL -eL "$DUPLUG_PYTHON_BIN" -m uvicorn server:app \
  --host 127.0.0.1 \
  --port 8000 \
  --workers 1 \
  > "$DUPLUG_LOG_FILE" 2>&1 < /dev/null &
DUPLUG_PID=$!
echo "$DUPLUG_PID" > "$DUPLUG_PID_FILE"

# [4/7] 等待 Duplug 就绪
step "[4/7] 等待 SoulX-Duplug 健康检查"
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

# [5/7] 启动 CoPaw
step "[5/7] 启动 CoPaw (HTTPS on port ${PORT})"
cd "$ROOT_DIR"
export COPAW_WORKING_DIR="$WORK_DIR"
export COPAW_LOGIN_OUTBOX_DELIVERY=1
export PYTHONPATH="$PYTHONPATH_DIR"
# 先清除所有 TTS 环境变量，再由 TTS 脚本按需加载
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

# [6/7] 等待 CoPaw 就绪
step "[6/7] 等待 CoPaw 健康检查"
READY=0
for _ in $(seq 1 120); do
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

# [7/7] 外网端口暴露（Featurize 平台自动，其他环境需手动配置）
step "[7/7] 端口与访问地址"
if command -v featurize &>/dev/null; then
  EXPORTED=$(featurize port list 2>/dev/null | grep "^ *${PORT} ->" || true)
  if [ -n "$EXPORTED" ]; then
    EXTERNAL_PORT=$(echo "$EXPORTED" | head -1 | awk '{print $NF}' | tr -d '[:space:]')
    echo "  端口 ${PORT} 已暴露 → ${EXTERNAL_PORT}"
  else
    EXPORT_OUTPUT=$(featurize port export "$PORT" 2>&1) || {
      echo "  ⚠️ featurize port export 失败: $EXPORT_OUTPUT"
    }
    EXTERNAL_PORT=$(echo "${EXPORT_OUTPUT:-}" | grep -oP ':\K[0-9]+' | head -1 || echo "")
  fi
  if [ -n "${EXTERNAL_PORT:-}" ]; then
    echo "  外网地址: https://workspace.featurize.cn:${EXTERNAL_PORT}"
  fi
else
  echo "  本地访问: https://localhost:${PORT}"
  echo "  外网部署请自行配置反向代理 (nginx/caddy) 或端口转发"
fi

# ── 完成 ──────────────────────────────────────────────────
echo ""
echo "========================================="
echo "  ✅ 构建重启完成!"
echo "========================================="
echo "  CoPaw      PID: $COPAW_PID  日志: $LOG_FILE"
echo "  Duplug     PID: $DUPLUG_PID  日志: $DUPLUG_LOG_FILE"
echo "  COPAW_WORKING_DIR: $WORK_DIR"
echo ""
