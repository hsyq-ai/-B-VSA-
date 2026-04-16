# -*- coding: utf-8 -*-
from fastapi import APIRouter

from .agent import router as agent_router
from .config import router as config_router
from .local_models import router as local_models_router
from .providers import router as providers_router
from .skills import router as skills_router
from .workspace import router as workspace_router
from .envs import router as envs_router
from .ollama_models import router as ollama_models_router
from .mcp import router as mcp_router
from .tools import router as tools_router
from ..crons.api import router as cron_router
from ..runner.api import router as runner_router
from .console import router as console_router
from .token_usage import router as token_usage_router
from .auth import router as auth_router
from .chat_files import router as chat_files_router
from .employee import router as employee_router
from .asr import router as asr_router
from .prompt_templates import router as prompt_templates_router
from .dashboard_skills import router as dashboard_skills_router
from .expert_center_skills import router as expert_center_skills_router
from .research_experiments import router as research_experiments_router
from .platform_learning import router as platform_learning_router
from .agent_os import router as agent_os_router
from .sandbox import router as sandbox_router
from .party import router as party_router
from .voice_secretary import router as voice_secretary_router


router = APIRouter()

router.include_router(agent_router)
router.include_router(config_router)
router.include_router(console_router)
router.include_router(auth_router)
router.include_router(chat_files_router)
router.include_router(employee_router)
router.include_router(asr_router)
router.include_router(prompt_templates_router)
router.include_router(dashboard_skills_router)
router.include_router(expert_center_skills_router)
router.include_router(research_experiments_router)
router.include_router(platform_learning_router)
router.include_router(agent_os_router)
router.include_router(sandbox_router)
router.include_router(party_router)
router.include_router(cron_router)
router.include_router(local_models_router)
router.include_router(mcp_router)
router.include_router(ollama_models_router)
router.include_router(providers_router)
router.include_router(runner_router)
router.include_router(skills_router)
router.include_router(tools_router)
router.include_router(workspace_router)
router.include_router(envs_router)
router.include_router(token_usage_router)
router.include_router(voice_secretary_router)

__all__ = ["router"]
