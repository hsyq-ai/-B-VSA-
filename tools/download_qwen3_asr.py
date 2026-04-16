# -*- coding: utf-8 -*-
from __future__ import annotations

import os
import sys


def main() -> int:
    try:
        from modelscope.hub.snapshot_download import snapshot_download
    except Exception as exc:
        print(f"Failed to import modelscope: {exc}")
        return 1

    model_id = "Qwen/Qwen3-ASR-0.6B"
    target_dir = os.getenv("COPAW_ASR_MODEL_DIR", "").strip() or None
    kwargs = {}
    if target_dir:
        kwargs["cache_dir"] = target_dir

    print(f"Downloading {model_id} ...")
    path = snapshot_download(model_id, **kwargs)
    print(f"Downloaded to: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
