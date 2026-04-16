#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Scene smoke test:
1) Login with identifier/password
2) Fetch /api/models and /api/models/active
3) (Optional) Call /api/agent/process once to verify response

Usage:
  python tools/scene_smoke_test.py \
    --base http://workspace.featurize.cn:32673 \
    --user 刘杰 --password 123456 \
    --prompt "请基于我的记忆档案梳理当前任务"
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request


def http_request(
    url: str,
    method: str = "GET",
    headers: dict | None = None,
    data: bytes | None = None,
    timeout: int = 20,
):
    req = urllib.request.Request(url, method=method, headers=headers or {}, data=data)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read()
        status = resp.getcode()
        return status, resp.headers, body


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", required=True, help="Base URL, e.g. http://host:port")
    parser.add_argument("--user", required=True, help="登录账号（姓名或手机号）")
    parser.add_argument("--password", required=True, help="登录密码")
    parser.add_argument(
        "--prompt",
        default="请基于我的记忆档案梳理当前任务，列出重点与下一步建议。",
        help="发送给 /api/agent/process 的测试提示",
    )
    parser.add_argument(
        "--run-agent",
        action="store_true",
        help="是否调用 /api/agent/process（可能耗时）",
    )
    args = parser.parse_args()

    base = args.base.rstrip("/")

    login_qs = urllib.parse.urlencode(
        {"identifier": args.user, "password": args.password}
    )
    login_url = f"{base}/api/auth/login?{login_qs}"
    try:
        status, headers, body = http_request(login_url, method="POST")
    except Exception as exc:
        print("[login] request failed:", exc)
        return 2

    print("[login] status:", status)
    if status != 200:
        print("[login] body:", body[:400])
        return 3
    data = json.loads(body.decode("utf-8"))
    token = data.get("token")
    print("[login] token OK:", bool(token))

    # models/active
    try:
        status, _, body = http_request(f"{base}/api/models/active")
        print("[models/active] status:", status)
        print("[models/active] body:", body[:400])
    except Exception as exc:
        print("[models/active] request failed:", exc)

    # models list
    try:
        status, _, body = http_request(f"{base}/api/models")
        print("[models] status:", status)
        print("[models] body:", body[:400])
    except Exception as exc:
        print("[models] request failed:", exc)

    if args.run_agent:
        if not token:
            print("[agent/process] skipped (no token)")
            return 0
        payload = {
            "input": [
                {
                    "role": "user",
                    "content": [{"type": "text", "text": args.prompt}],
                }
            ],
            "session_id": f"scene-smoke-{int(time.time())}",
            "user_id": "1",
            "channel": "console",
            "stream": False,
        }
        body_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        }
        try:
            status, _, body = http_request(
                f"{base}/api/agent/process",
                method="POST",
                headers=headers,
                data=body_bytes,
                timeout=60,
            )
            print("[agent/process] status:", status)
            print("[agent/process] body:", body[:600])
        except Exception as exc:
            print("[agent/process] request failed:", exc)

    return 0


if __name__ == "__main__":
    sys.exit(main())

