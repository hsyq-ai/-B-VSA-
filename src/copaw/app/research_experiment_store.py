# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
import re
import time
import uuid
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ExperimentJobStatus(str, Enum):
    CREATED = "created"
    DIAGNOSED = "diagnosed"
    REPAIRED = "repaired"
    VERIFIED = "verified"
    FAILED = "failed"


class ExperimentJob(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    department: str
    created_by_user_id: str
    created_by_name: str
    experiment_goal: str = ""
    error_log: str = ""
    code_snippet: str = ""
    reproduce_command: str = ""
    attachments: List[str] = Field(default_factory=list)
    status: ExperimentJobStatus = ExperimentJobStatus.CREATED
    business_state: str = "active"
    running_state: str = "待运行"
    diagnosis: str = ""
    repair_plan: str = ""
    result_feedback: str = ""
    stage_summary: str = ""
    suggested_patch: str = ""
    reproduce_script: str = ""
    verification_summary: str = ""
    confidence: str = "low"
    followup_chat_id: str = ""
    followup_session_id: str = ""
    created_at: float = Field(default_factory=time.time)
    updated_at: float = Field(default_factory=time.time)
    history: List[Dict[str, Any]] = Field(default_factory=list)


_jobs: Dict[str, ExperimentJob] = {}
_running_tasks: Dict[str, asyncio.Task[Any]] = {}
_lock = asyncio.Lock()
_BUSINESS_ACTIVE = "active"
_BUSINESS_PAUSED = "paused"
_BUSINESS_CLOSED = "closed"
_BUSINESS_ALLOWED = {_BUSINESS_ACTIVE, _BUSINESS_PAUSED, _BUSINESS_CLOSED}


def _append_history(job: ExperimentJob, event: str, detail: str) -> None:
    job.history.append(
        {
            "ts": time.time(),
            "event": event,
            "detail": detail,
        }
    )


def _append_history_if_changed(job: ExperimentJob, event: str, detail: str) -> None:
    if job.history:
        last = job.history[-1]
        if str(last.get("event") or "") == event and str(last.get("detail") or "") == detail:
            return
    _append_history(job, event, detail)


def _running_state_by_business_state(business_state: str) -> str:
    if business_state == _BUSINESS_PAUSED:
        return "已暂停"
    if business_state == _BUSINESS_CLOSED:
        return "已关闭"
    return "待运行"


def _confidence_from_signals(experiment_goal: str, error_log: str, code_snippet: str) -> str:
    score = 0
    if len((experiment_goal or "").strip()) >= 20:
        score += 1
    if error_log.strip():
        score += 1
    if len(error_log.strip()) >= 80:
        score += 1
    if code_snippet.strip():
        score += 1
    if re.search(r"(指标|metric|accuracy|f1|auc|loss|验收)", experiment_goal, flags=re.IGNORECASE):
        score += 1
    if re.search(r"(traceback|exception|error)", error_log, flags=re.IGNORECASE):
        score += 1
    if score >= 3:
        return "high"
    if score == 2:
        return "medium"
    return "low"


def _infer_focus(title: str, experiment_goal: str) -> str:
    text = f"{title} {experiment_goal}".lower()
    if any(k in text for k in ["进展", "趋势", "文献", "综述", "调研", "最新"]):
        return "行业进展检索与证据汇总"
    if any(k in text for k in ["实验", "复现", "参数", "训练", "模型"]):
        return "实验方案编排与执行优化"
    if any(k in text for k in ["数据", "统计", "分析", "图像", "表格"]):
        return "数据分析与结果解释"
    return "科研任务自动化推进"


def _generate_diagnosis(title: str, experiment_goal: str, error_log: str, code_snippet: str) -> str:
    log = (error_log or "").strip()
    code = (code_snippet or "").strip()
    goal = (experiment_goal or "").strip()
    task_name = (title or "科研任务").strip()
    if not log:
        if goal:
            return (
                f"任务「{task_name}」已完成立项研判。"
                "当前按“目标澄清→约束识别→里程碑拆解→结果验收”推进，"
                "建议优先锁定数据口径、实验范围与验收指标。"
            )
        return (
            f"任务「{task_name}」已创建。尚未填写详细目标，"
            "系统将先按通用实验推进模板进行任务拆解，建议补充目标与验收口径以提升编排精度。"
        )
    if "ModuleNotFoundError" in log:
        return "依赖模块缺失：当前运行环境未安装代码所需包，或 Python 环境与安装环境不一致。"
    if "CUDA out of memory" in log:
        return "显存不足：训练/推理批量过大，或显存碎片导致分配失败。"
    if "shape" in log.lower() and "mismatch" in log.lower():
        return "张量维度不匹配：数据预处理输出与模型输入预期不一致。"
    if "KeyError" in log:
        return "字段缺失：代码读取了不存在的列名/键名，可能与数据版本不一致。"
    if "FileNotFoundError" in log:
        return "路径错误：输入数据或模型权重路径无效，或工作目录与预期不一致。"
    if "SyntaxError" in log:
        return "代码语法问题：脚本存在语法错误，需先完成静态修复后再运行。"
    if code and ("train_loader" in code or "DataLoader" in code):
        return "疑似数据管道问题：建议优先核对样本格式、batch 组装逻辑和标签对齐。"
    if goal:
        focus = _infer_focus(task_name, goal)
        return (
            f"已识别任务方向为「{focus}」。\n"
            "系统将按“目标澄清 -> 证据整理 -> 结果反馈 -> 阶段总结”自动推进。"
        )
    return "通用运行任务：建议先补充目标、约束条件和验收标准。"


def _generate_repair_plan(title: str, experiment_goal: str, error_log: str, reproduce_command: str) -> str:
    log = (error_log or "").strip()
    goal = (experiment_goal or "").strip()
    task_name = (title or "科研任务").strip()
    steps: List[str] = [
        f"确认任务边界：统一「{task_name}」的输入数据、产出物和验收标准。",
        "建立任务看板：按周拆分里程碑，并记录每轮实验假设与结论。",
    ]
    if not log:
        if goal:
            steps.append("基于任务目标生成实验矩阵：对关键变量做单因子和组合对比。")
            steps.append("设置统一记录模板，沉淀每轮参数、结果和结论，便于追溯。")
        else:
            steps.append("先补充任务目标与验收指标，再自动生成更细粒度执行计划。")
            steps.append("在目标补充前，先执行通用可行性验证与基线结果采集。")
    elif "ModuleNotFoundError" in log:
        steps.append("补齐缺失依赖并锁定版本，例如写入 requirements.txt 或 environment.yml。")
    elif "CUDA out of memory" in log:
        steps.append("降低 batch size，开启梯度累积/混合精度，必要时减少输入分辨率。")
    elif "shape" in log.lower() and "mismatch" in log.lower():
        steps.append("在模型前向前打印关键张量 shape，逐层定位维度漂移点。")
    elif "KeyError" in log:
        steps.append("统一数据 schema，补充字段映射表并增加列存在性校验。")
    else:
        steps.append("补充结构化日志，加入阶段性断点输出（数据加载、前向、损失、回传）。")
    if reproduce_command.strip():
        steps.append(f"基线命令（可选）：`{reproduce_command.strip()}`")
    steps.append("每轮实验结束后更新任务进展，形成可审阅的阶段总结。")
    return "\n".join(f"{idx + 1}. {step}" for idx, step in enumerate(steps))


def _generate_result_feedback(title: str, experiment_goal: str) -> str:
    task_name = (title or "科研任务").strip()
    goal = (experiment_goal or "").strip()
    focus = _infer_focus(task_name, goal)
    goal_line = goal if goal else "未填写详细目标，已按通用模板执行。"
    return (
        f"任务：{task_name}\n"
        f"目标：{goal_line}\n"
        f"反馈：已完成「{focus}」的自动化处理，并生成可追溯阶段结果。\n"
        "建议：优先审阅阶段研判，再根据结果反馈决定下一轮任务拆解。"
    )


def _generate_stage_summary(title: str, experiment_goal: str, confidence: str) -> str:
    task_name = (title or "科研任务").strip()
    goal_line = (experiment_goal or "").strip() or "未填写"
    return (
        f"工单《{task_name}》已完成本轮自动化处理。\n"
        f"任务目标：{goal_line}\n"
        f"自动化评级：{confidence}\n"
        "请基于结果反馈发起下一轮补充指令，以持续迭代工单结论。"
    )


def _generate_patch_hint(error_log: str, experiment_goal: str) -> str:
    if not (error_log or "").strip():
        goal = (experiment_goal or "").strip()
        if goal:
            return (
                "建议补充：\n"
                "1. 任务优先级与完成时限；\n"
                "2. 数据来源、版本与负责人；\n"
                "3. 验收指标阈值与复盘时间点。"
            )
        return (
            "建议先补充任务目标与验收标准，系统将据此输出更细粒度的自动化推进建议。"
        )
    if "ModuleNotFoundError" in error_log:
        return (
            "```bash\n"
            "pip install -r requirements.txt\n"
            "python -c \"import <missing_module>\"\n"
            "```\n"
            "并在项目根目录补充依赖锁定文件。"
        )
    if "CUDA out of memory" in error_log:
        return (
            "```python\n"
            "# 降低显存占用\n"
            "batch_size = max(1, batch_size // 2)\n"
            "torch.cuda.empty_cache()\n"
            "```\n"
            "必要时启用 gradient accumulation。"
        )
    if "shape" in error_log.lower() and "mismatch" in error_log.lower():
        return (
            "```python\n"
            "print('x shape:', x.shape)\n"
            "print('y shape:', y.shape)\n"
            "assert x.shape[0] == y.shape[0]\n"
            "```\n"
            "先加断言再逐层定位。"
        )
    return (
        "```python\n"
        "# 在关键节点加日志，定位阶段性失败点\n"
        "logger.info('stage=data_load ok')\n"
        "logger.info('stage=forward ok')\n"
        "logger.info('stage=backward ok')\n"
        "```\n"
        "将异常定位粒度从任务级收敛到函数级。"
    )


def _generate_reproduce_script(command: str) -> str:
    cmd = (command or "").strip() or "python train.py --config configs/default.yaml"
    return (
        "#!/usr/bin/env bash\n"
        "set -euo pipefail\n\n"
        "echo '[1/3] setup env'\n"
        "python -m venv .venv\n"
        "source .venv/bin/activate\n"
        "pip install -U pip\n"
        "if [ -f requirements.txt ]; then pip install -r requirements.txt; fi\n\n"
        "echo '[2/3] run baseline'\n"
        f"{cmd}\n\n"
        "echo '[3/3] collect artifacts'\n"
        "mkdir -p outputs/experiment_artifacts\n"
        "cp -r logs outputs/experiment_artifacts/ 2>/dev/null || true\n"
        "cp -r checkpoints outputs/experiment_artifacts/ 2>/dev/null || true\n"
    )


async def create_experiment_job(data: Dict[str, Any]) -> ExperimentJob:
    async with _lock:
        item = ExperimentJob(**data)
        _append_history(item, "created", "实验工单已创建")
        _jobs[item.id] = item
        return item


async def list_experiment_jobs(*, department: str, created_by_user_id: Optional[str] = None) -> List[ExperimentJob]:
    async with _lock:
        values = list(_jobs.values())
    filtered = [x for x in values if x.department == department]
    if created_by_user_id:
        filtered = [x for x in filtered if x.created_by_user_id == created_by_user_id]
    filtered.sort(key=lambda x: x.updated_at, reverse=True)
    return filtered


async def get_experiment_job(job_id: str) -> Optional[ExperimentJob]:
    async with _lock:
        return _jobs.get(job_id)


async def delete_experiment_job(job_id: str) -> Optional[ExperimentJob]:
    running_task: Optional[asyncio.Task[Any]] = None
    async with _lock:
        item = _jobs.pop(job_id, None)
        running_task = _running_tasks.pop(job_id, None)
    if running_task and not running_task.done():
        running_task.cancel()
    return item


async def update_experiment_job_business_state(
    job_id: str,
    business_state: str,
    actor_name: str = "",
) -> Optional[ExperimentJob]:
    next_state = str(business_state or "").strip().lower()
    if next_state not in _BUSINESS_ALLOWED:
        raise ValueError(f"Unsupported business_state: {next_state}")

    running_task: Optional[asyncio.Task[Any]] = None
    async with _lock:
        job = _jobs.get(job_id)
        if job is None:
            return None
        if job.business_state == next_state:
            return job

        actor = actor_name or "用户"
        prev_state = job.business_state
        job.business_state = next_state
        job.updated_at = time.time()

        if next_state == _BUSINESS_PAUSED:
            job.running_state = "已暂停"
            _append_history_if_changed(job, "paused", f"{actor}已暂停任务")
        elif next_state == _BUSINESS_CLOSED:
            job.running_state = "已关闭"
            _append_history_if_changed(job, "closed", f"{actor}已关闭任务")
        else:
            if job.status == ExperimentJobStatus.VERIFIED:
                job.running_state = "已完成"
            elif job.status == ExperimentJobStatus.FAILED:
                job.running_state = "运行失败"
            else:
                job.running_state = "待运行"
            detail = "恢复任务" if prev_state == _BUSINESS_PAUSED else "激活任务"
            _append_history_if_changed(job, "resumed", f"{actor}已{detail}")

        running_task = _running_tasks.get(job_id)

    if running_task and not running_task.done() and next_state in {_BUSINESS_PAUSED, _BUSINESS_CLOSED}:
        running_task.cancel()

    if next_state == _BUSINESS_ACTIVE:
        current = await get_experiment_job(job_id)
        if current and current.status not in {ExperimentJobStatus.VERIFIED, ExperimentJobStatus.FAILED}:
            await run_experiment_pipeline(job_id)

    return await get_experiment_job(job_id)


async def _run_experiment_pipeline(job_id: str) -> None:
    try:
        async with _lock:
            job = _jobs.get(job_id)
            if job is None:
                return
            if job.business_state != _BUSINESS_ACTIVE:
                job.running_state = _running_state_by_business_state(job.business_state)
                job.updated_at = time.time()
                return
            job.status = ExperimentJobStatus.DIAGNOSED
            job.running_state = "阶段研判中"
            job.updated_at = time.time()
            _append_history_if_changed(job, "diagnosed", "系统开始阶段研判")

        await asyncio.sleep(1.2)

        async with _lock:
            job = _jobs.get(job_id)
            if job is None:
                return
            if job.business_state != _BUSINESS_ACTIVE:
                job.running_state = _running_state_by_business_state(job.business_state)
                job.updated_at = time.time()
                if job.business_state == _BUSINESS_PAUSED:
                    _append_history_if_changed(job, "paused", "任务在阶段研判后被暂停")
                if job.business_state == _BUSINESS_CLOSED:
                    _append_history_if_changed(job, "closed", "任务在阶段研判后被关闭")
                return
            job.diagnosis = _generate_diagnosis(
                job.title,
                job.experiment_goal,
                job.error_log,
                job.code_snippet,
            )
            job.confidence = _confidence_from_signals(job.experiment_goal, job.error_log, job.code_snippet)
            job.running_state = "结果反馈生成中"
            job.updated_at = time.time()
            _append_history_if_changed(job, "diagnosed", "阶段研判完成，进入结果反馈生成")

            job.status = ExperimentJobStatus.REPAIRED
            job.repair_plan = _generate_repair_plan(
                job.title,
                job.experiment_goal,
                job.error_log,
                job.reproduce_command,
            )

        await asyncio.sleep(1.2)

        async with _lock:
            job = _jobs.get(job_id)
            if job is None:
                return
            if job.business_state != _BUSINESS_ACTIVE:
                job.running_state = _running_state_by_business_state(job.business_state)
                job.updated_at = time.time()
                if job.business_state == _BUSINESS_PAUSED:
                    _append_history_if_changed(job, "paused", "任务在结果反馈阶段被暂停")
                if job.business_state == _BUSINESS_CLOSED:
                    _append_history_if_changed(job, "closed", "任务在结果反馈阶段被关闭")
                return
            job.result_feedback = _generate_result_feedback(job.title, job.experiment_goal)
            job.suggested_patch = _generate_patch_hint(job.error_log, job.experiment_goal)
            job.reproduce_script = _generate_reproduce_script(job.reproduce_command)
            job.running_state = "阶段总结生成中"
            job.updated_at = time.time()
            _append_history_if_changed(job, "repaired", "结果反馈已生成，进入阶段总结")

        await asyncio.sleep(1.0)

        async with _lock:
            job = _jobs.get(job_id)
            if job is None:
                return
            if job.business_state != _BUSINESS_ACTIVE:
                job.running_state = _running_state_by_business_state(job.business_state)
                job.updated_at = time.time()
                if job.business_state == _BUSINESS_PAUSED:
                    _append_history_if_changed(job, "paused", "任务在阶段总结前被暂停")
                if job.business_state == _BUSINESS_CLOSED:
                    _append_history_if_changed(job, "closed", "任务在阶段总结前被关闭")
                return
            summary = _generate_stage_summary(job.title, job.experiment_goal, job.confidence)
            job.stage_summary = summary
            job.verification_summary = summary
            job.status = ExperimentJobStatus.VERIFIED
            job.running_state = "已完成"
            job.updated_at = time.time()
            _append_history_if_changed(job, "verified", "自动化流程完成")
    except asyncio.CancelledError:
        async with _lock:
            job = _jobs.get(job_id)
            if job is not None:
                job.running_state = _running_state_by_business_state(job.business_state)
                job.updated_at = time.time()
                if job.business_state == _BUSINESS_PAUSED:
                    _append_history_if_changed(job, "paused", "后台流程已停止（任务暂停）")
                elif job.business_state == _BUSINESS_CLOSED:
                    _append_history_if_changed(job, "closed", "后台流程已停止（任务关闭）")
                else:
                    _append_history_if_changed(job, "failed", "后台流程被中断")
        raise
    except Exception as exc:
        async with _lock:
            job = _jobs.get(job_id)
            if job is not None:
                job.status = ExperimentJobStatus.FAILED
                job.running_state = "运行失败"
                job.result_feedback = f"系统执行异常：{exc}"
                job.stage_summary = "本轮工单执行失败，请重试或补充更明确目标。"
                job.updated_at = time.time()
                _append_history(job, "failed", f"执行失败：{exc}")
    finally:
        async with _lock:
            _running_tasks.pop(job_id, None)


async def run_experiment_pipeline(job_id: str) -> Optional[ExperimentJob]:
    async with _lock:
        job = _jobs.get(job_id)
        if job is None:
            return None
        if job.business_state == _BUSINESS_CLOSED:
            job.running_state = "已关闭"
            job.updated_at = time.time()
            return job
        if job.business_state == _BUSINESS_PAUSED:
            job.running_state = "已暂停"
            job.updated_at = time.time()
            return job
        running_task = _running_tasks.get(job_id)
        if running_task and not running_task.done():
            return job
        job.status = ExperimentJobStatus.CREATED
        job.running_state = "已排队"
        job.updated_at = time.time()
        _append_history_if_changed(job, "created", "已进入后台自动化队列")
        _running_tasks[job_id] = asyncio.create_task(_run_experiment_pipeline(job_id))
        return job
