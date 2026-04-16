# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import threading
import time
from pathlib import Path
from typing import Any, Dict, List

from ..config.utils import get_dashboard_skill_rules_path
from .prompt_templates_store import list_templates


_LOCK = threading.Lock()

_DEFAULT_RULES = {
    "default": ["dashboard-doc", "dashboard-party", "dashboard-psy"],
    "departments": {
        "科研部": [
            "dashboard-research-topic",
            "dashboard-research-quality",
            "dashboard-research-brainstorm",
            "dashboard-research-search",
            "dashboard-research-data",
            "dashboard-research-writing",
            "dashboard-research-paper-gen",
            "dashboard-research-tracking",
        ],
    },
}


def _dashboard_templates() -> List[Dict[str, Any]]:
    items = [t for t in list_templates() if str(t.get("category") or "") == "dashboard"]
    # Keep stable order by trigger_key
    return sorted(items, key=lambda x: str(x.get("trigger_key") or ""))


def _normalize_rules(data: Any, allowed: List[str]) -> Dict[str, Any]:
    rules = {"default": [], "departments": {}}
    if isinstance(data, dict):
        raw_rules = data.get("rules", data)
        if isinstance(raw_rules, dict):
            default_list = raw_rules.get("default", [])
            if isinstance(default_list, list):
                rules["default"] = [str(x) for x in default_list if str(x)]
            dept_map = raw_rules.get("departments", {})
            if isinstance(dept_map, dict):
                normalized_dept = {}
                for dept, values in dept_map.items():
                    if not dept:
                        continue
                    if isinstance(values, list):
                        normalized_dept[str(dept)] = [str(x) for x in values if str(x)]
                rules["departments"] = normalized_dept

    allowed_set = set(allowed)
    rules["default"] = [x for x in rules["default"] if x in allowed_set]
    rules["departments"] = {
        k: [x for x in v if x in allowed_set] for k, v in rules["departments"].items()
    }
    if not rules["default"]:
        rules["default"] = list(_DEFAULT_RULES["default"])
    return rules


def _load_rules(path: Path, allowed: List[str]) -> Dict[str, Any]:
    if not path.exists():
        _save_rules(path, _DEFAULT_RULES)
        return _normalize_rules(_DEFAULT_RULES, allowed)
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        rules = _normalize_rules(data, allowed)
        return rules
    except Exception:
        _save_rules(path, _DEFAULT_RULES)
        return _normalize_rules(_DEFAULT_RULES, allowed)


def _save_rules(path: Path, rules: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": 1,
        "rules": rules,
        "updated_at": time.time(),
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def get_rules() -> Dict[str, Any]:
    allowed = [t.get("trigger_key") for t in _dashboard_templates() if t.get("trigger_key")]
    path = get_dashboard_skill_rules_path()
    with _LOCK:
        return _load_rules(path, allowed)


def save_rules(rules: Dict[str, Any]) -> Dict[str, Any]:
    allowed = [t.get("trigger_key") for t in _dashboard_templates() if t.get("trigger_key")]
    normalized = _normalize_rules({"rules": rules}, allowed)
    path = get_dashboard_skill_rules_path()
    with _LOCK:
        _save_rules(path, normalized)
    return normalized


def resolve_for_department(department: str) -> List[str]:
    rules = get_rules()
    dept = str(department or "").strip()
    if dept and dept in rules.get("departments", {}):
        return list(rules["departments"][dept])
    return list(rules.get("default", []))


def list_dashboard_templates() -> List[Dict[str, Any]]:
    return _dashboard_templates()
