#!/bin/bash
# -*- coding: utf-8 -*-
# rebuild_pia_containers.sh — 为 PIA 容器添加 agent_os_runtime 共享挂载
#
# 用法: bash scripts/rebuild_pia_containers.sh [--dry-run]
#   --dry-run   只打印 docker run 命令，不实际执行
#
# 改动：在每个 PIA 容器上新增只读挂载：
#   -v <主机 copaw_work>/agent_os_runtime:/app/agent_os_shared:ro
# 让容器内 MailboxWatcher 能读到主机的 IAP inbox 数据

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../" && pwd)"
HOSTNAME="$(hostname)"

IMAGE="aifscie/copaw-sandbox:latest"
SHARED_AGENT_OS="${PROJECT_ROOT}/../copaw_work/agent_os_runtime"
SRC_DIR="${PROJECT_ROOT}/src"
ORG_DIR="${PROJECT_ROOT}/../env/organization"
SHARED_DIR="${PROJECT_DIR:-${PROJECT_ROOT}/../env/shared}"

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN=true
fi

log_info() { echo "[INFO] $*"; }
log_warn() { echo "[WARN] $*"; }
log_err() { echo "[ERROR] $*"; }

# ---- 前置检查 ----

if ! command -v docker &>/dev/null; then
    log_err "docker not found"; exit 1
fi

if [[ ! -d "$SHARED_AGENT_OS" ]]; then
    log_err "Shared agent_os dir not found: $SHARED_AGENT_OS"; exit 1
fi

if [[ ! -d "$SRC_DIR" ]]; then
    log_err "Source dir not found: $SRC_DIR"; exit 1
fi

# ---- 获取当前运行的 PIA 容器列表 ----

get_pia_containers() {
    docker ps --filter "label=aifscie.sandbox.role=employee" \
              --filter "label=aifscie.sandbox.managed=true" \
              --format "{{.ID}}\t{{.Names}}\t{{.Label \"aifscie.sandbox.user_id\"}}"
}

rebuild_one() {
    local cid="$1" name="$2" user_id="$3"
    local port working_dir secret_dir

    # 从现有容器提取端口映射（格式: 8088/tcp -> 127.0.0.1:XXXX）
    port=$(docker port "$cid" 2>/dev/null | head -1 | grep -oE '[0-9]+$' || echo "")
    if [[ -z "$port" ]]; then
        log_warn "Cannot determine port for $name, skipping"; return 0
    fi

    working_dir="${PROJECT_ROOT}/../env/users/${user_id}/working"
    secret_dir="${PROJECT_ROOT}/../env/users/${user_id}/working.secret"

    if [[ ! -d "$working_dir" ]]; then
        log_warn "Working dir not found: $working_dir, skipping $name"; return 0
    fi

    log_info "Rebuilding container: $name (user=$user_id, port=$port)"

    local cmd=(
        docker run -d
        --name "$name"
        --restart unless-stopped
        --label "aifscie.sandbox.managed=true"
        --label "aifscie.sandbox.role=employee"
        --label "aifscie.sandbox.user_id=${user_id}"
        -p "127.0.0.1:${port}:8088"
        -v "${SRC_DIR}:/app/copaw-src:ro"
        -v "${ORG_DIR}:/app/organization:ro"
        -v "${PROJECT_ROOT}/../env/shared:/app/shared:ro"
        -v "${working_dir}:/app/working"
        -v "${secret_dir}:/app/working.secret"
        # ===== 新增共享挂载 =====
        -v "${SHARED_AGENT_OS}:/app/agent_os_shared:ro"
        # ===== 环境变量（保持与原容器一致）=====
        -e "PYTHONPATH=/app/copaw-src"
        -e "COPAW_PORT=8088"
        -e "COPAW_WORKING_DIR=/app/working"
        -e "COPAW_SECRET_DIR=/app/working.secret"
        -e "COPAW_LOGIN_OUTBOX_DELIVERY=1"
        -e "COPAW_SANDBOX_ACTIVITY_DIR=/app/working/logs"
        -e "AGENT_ROLE=employee"
        -e "OWNER_USER_ID=${user_id}"
        -e "COPAW_ENABLED_CHANNELS=discord,telegram,dingtalk,feishu,qq,console"
        -e "PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium"
        -e "PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1"
        -e "COPAW_RUNNING_IN_CONTAINER=1"
        -e "NODE_VERSION=25.6.0"
        -e "YARN_VERSION=1.22.22"
        -e "NODE_ENV=production"
        -e "WORKSPACE_DIR=/app"
        "${IMAGE}"
    )

    if $DRY_RUN; then
        echo "# --- DRY RUN: ${name} ---"
        printf '%s\n' "${cmd[@]}"
        echo ""
        return 0
    fi

    # 停掉旧容器
    log_info "  Stopping old container $name ..."
    docker stop "$cid" &>/dev/null || true
    docker rm "$cid" &>/dev/null || true

    # 创建新容器
    "${cmd[@]}"

    # 验证挂载是否生效
    sleep 2
    if docker exec "$name" test -d /app/agent_os_shared &>/dev/null; then
        log_info "  ✓ Shared mount verified at /app/agent_os_shared"
    else
        log_err "  ✗ Shared mount NOT found in $name!"
    fi
}

# ---- 主流程 ----

main() {
    log_info "PIA Container Rebuild Script"
    log_info "Shared agent_os path: ${SHARED_AGENT_OS}"
    log_info ""

    local count=0
    while IFS=$'\t' read -r cid name user_id; do
        [[ -z "$cid" ]] && continue
        rebuild_one "$cid" "$name" "$user_id"
        count=$((count + 1))
    done < <(get_pia_containers)

    if [[ $count -eq 0 ]]; then
        log_warn "No running PIA containers found."
    else
        log_info "Done. Rebuilt $count container(s)."
    fi
}

main "$@"
