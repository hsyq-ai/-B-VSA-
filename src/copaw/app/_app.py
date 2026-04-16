# -*- coding: utf-8 -*-
# pylint: disable=redefined-outer-name,unused-argument
import asyncio
import os
import mimetypes
import time
import uuid
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from pathlib import Path
from collections import defaultdict

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from agentscope_runtime.engine.app import AgentApp
from agentscope_runtime.engine.deployers.adapter.a2a import AgentCardWithRuntimeConfig
from agentscope.memory import InMemoryMemory
from agentscope.message import Msg
from .custom_app import CustomAgentApp #<-- Import our custom app

from .runner import AgentRunner
from ..config import (  # pylint: disable=no-name-in-module
    load_config,
    update_last_dispatch,
    ConfigWatcher,
)
from ..config.utils import get_jobs_path, get_chats_path, get_config_path
from ..constant import DOCS_ENABLED, LOG_LEVEL_ENV, CORS_ORIGINS, WORKING_DIR
from ..__version__ import __version__
from ..utils.logging import setup_logger, add_copaw_file_handler
from .channels import ChannelManager  # pylint: disable=no-name-in-module
from .channels.utils import make_process_from_runner
from .mcp import MCPClientManager, MCPConfigWatcher  # MCP hot-reload support
from .runner.repo.json_repo import JsonChatRepository
from .crons.repo.json_repo import JsonJobRepository
from .crons.manager import CronManager
from .runner.manager import ChatManager
from .runner.models import ChatSpec
from .routers import router as api_router
from .routers.voice import voice_router
from .routers.auth import get_current_user
from .websockets import websocket_manager  # <-- Import the websocket manager
from .message_queue_store import MessageQueueStore
from .agent_os_store import AgentOSStore
from .room_store import RoomStore
from .artifact_store import ArtifactStore
from .observability import ObservabilityStore
from .chat_file_store import ChatFileStore
from .eval_store import EvalStore
from .tts_client import get_tts_client
from .directive_news_service import DirectiveNewsSyncService
from .platform_skill_evolution_service import (
    start_session_evolution_scheduler,
    stop_session_evolution_scheduler,
)
from .auth_db import get_active_users, get_user_context_by_user_id
from .mailbox_watcher import build_mailbox_watcher
from .channels.voice_secretary import DuplugClient, VoiceSecretarySessionManager
from ..envs import load_envs_into_environ
from ..providers.provider_manager import ProviderManager
from ..event_listener import start_event_listener # <-- Import the listener
from .event_consumer import start_event_consumer
from ..agents import notification_agent
from ..agents import stats_agent

# A simple in-memory message queue for polling
# In a real production environment, this should be replaced by Redis, RabbitMQ, etc.
MESSAGE_QUEUE = defaultdict(list)

# Apply log level on load so reload child process gets same level as CLI.
logger = setup_logger(os.environ.get(LOG_LEVEL_ENV, "info"))

# Ensure static assets are served with browser-compatible MIME types across
# platforms (notably Windows may miss .js/.mjs mappings).
mimetypes.init()
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/javascript", ".mjs")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("application/wasm", ".wasm")

# Load persisted env vars into os.environ at module import time
# so they are available before the lifespan starts.
load_envs_into_environ()

runner = AgentRunner()

a2a_host = os.environ.get("COPAW_A2A_HOST", "127.0.0.1")
a2a_port = int(os.environ.get("COPAW_A2A_PORT", "8088"))

agent_app = CustomAgentApp(
    app_name="Friday",
    app_description="A helpful assistant",
    runner=runner,
    a2a_config=AgentCardWithRuntimeConfig(host=a2a_host, port=a2a_port),
)


async def _bootstrap_prebuilt_employee_agents(app: FastAPI) -> None:
    agent_os_store = getattr(app.state, "agent_os_store", None)
    if agent_os_store is None:
        logger.warning("AgentOSStore missing, skip agent bootstrap")
        return
    active_users = get_active_users()
    bootstrapped = 0
    for row in active_users:
        user_id = str(row["id"] or "").strip()
        if not user_id:
            continue
        context = get_user_context_by_user_id(user_id) or {}
        try:
            agent_os_store.ensure_user_pia(
                user_id=user_id,
                profile_id=str(context.get("profile_id") or ""),
                department=str(context.get("department") or ""),
            )
            bootstrapped += 1
        except Exception:
            logger.exception("Failed to bootstrap employee PIA for user %s", user_id)
    logger.info("Bootstrapped %d prebuilt employee agents", bootstrapped)


@asynccontextmanager
async def lifespan(
    app: FastAPI,
):  # pylint: disable=too-many-statements,too-many-branches
    startup_start_time = time.time()
    add_copaw_file_handler(WORKING_DIR / "copaw.log")
    await runner.start()

    # --- MCP client manager init (independent module, hot-reloadable) ---
    config = load_config()
    mcp_manager = MCPClientManager()
    if hasattr(config, "mcp"):
        try:
            await mcp_manager.init_from_config(config.mcp)
            logger.debug("MCP client manager initialized")
        except BaseException as e:
            if isinstance(e, (KeyboardInterrupt, SystemExit)):
                raise
            logger.exception("Failed to initialize MCP manager")
    runner.set_mcp_manager(mcp_manager)

    # --- channel connector init/start (from config.json) ---
    channel_manager = ChannelManager.from_config(
        process=make_process_from_runner(runner),
        config=config,
        on_last_dispatch=update_last_dispatch,
    )
    await channel_manager.start_all()

    # --- cron init/start ---
    repo = JsonJobRepository(get_jobs_path())
    cron_manager = CronManager(
        repo=repo,
        runner=runner,
        channel_manager=channel_manager,
        timezone="UTC",
    )
    await cron_manager.start()

    # --- chat manager init and connect to runner.session ---
    chat_repo = JsonChatRepository(get_chats_path())
    chat_manager = ChatManager(
        repo=chat_repo,
    )

    runner.set_chat_manager(chat_manager)

    # --- config file watcher (channels + heartbeat hot-reload on change) ---
    config_watcher = ConfigWatcher(
        channel_manager=channel_manager,
        cron_manager=cron_manager,
    )
    await config_watcher.start()

    # --- MCP config watcher (auto-reload MCP clients on change) ---
    mcp_watcher = None
    if hasattr(config, "mcp"):
        try:
            mcp_watcher = MCPConfigWatcher(
                mcp_manager=mcp_manager,
                config_loader=load_config,
                config_path=get_config_path(),
            )
            await mcp_watcher.start()
            logger.debug("MCP config watcher started")
        except BaseException as e:
            if isinstance(e, (KeyboardInterrupt, SystemExit)):
                raise
            logger.exception("Failed to start MCP watcher")

    # Inject channel_manager into approval service so it can
    # proactively push approval messages to channels like DingTalk.
    from .approvals import get_approval_service

    get_approval_service().set_channel_manager(channel_manager)

    # --- Model provider manager (non-reloadable, in-memory) ---
    provider_manager = ProviderManager.get_instance()

    # expose to endpoints
    app.state.runner = runner
    app.state.channel_manager = channel_manager
    app.state.cron_manager = cron_manager
    app.state.chat_manager = chat_manager
    app.state.config_watcher = config_watcher
    app.state.mcp_manager = mcp_manager
    app.state.mcp_watcher = mcp_watcher
    app.state.provider_manager = provider_manager
    app.state.websocket_manager = websocket_manager
    app.state.message_queue = MESSAGE_QUEUE #<-- Add message queue to app state
    # Persistent message store for console push notifications
    try:
        app.state.message_store = MessageQueueStore(WORKING_DIR / "push_messages.db")
        logger.debug("MessageQueueStore initialized at %s", WORKING_DIR / "push_messages.db")
    except Exception:
        logger.exception("Failed to initialize MessageQueueStore")
    try:
        app.state.agent_os_store = AgentOSStore(
            WORKING_DIR / "agent_os.db",
            WORKING_DIR / "agent_os_runtime",
        )
        logger.debug("AgentOSStore initialized at %s", WORKING_DIR / "agent_os.db")
    except Exception:
        logger.exception("Failed to initialize AgentOSStore")
    try:
        app.state.room_store = RoomStore(WORKING_DIR / "room_store.db")
        logger.debug("RoomStore initialized at %s", WORKING_DIR / "room_store.db")
    except Exception:
        logger.exception("Failed to initialize RoomStore")
    try:
        app.state.artifact_store = ArtifactStore(WORKING_DIR / "artifact_store.db")
        logger.debug("ArtifactStore initialized at %s", WORKING_DIR / "artifact_store.db")
    except Exception:
        logger.exception("Failed to initialize ArtifactStore")
    try:
        app.state.observability_store = ObservabilityStore(WORKING_DIR / "observability.db")
        logger.debug("ObservabilityStore initialized at %s", WORKING_DIR / "observability.db")
    except Exception:
        logger.exception("Failed to initialize ObservabilityStore")
    try:
        app.state.eval_store = EvalStore(WORKING_DIR / "eval_store.db")
        logger.debug("EvalStore initialized at %s", WORKING_DIR / "eval_store.db")
    except Exception:
        logger.exception("Failed to initialize EvalStore")
    try:
        runner.set_agent_os_context(
            agent_os_store=getattr(app.state, "agent_os_store", None),
            room_store=getattr(app.state, "room_store", None),
        )
    except Exception:
        logger.exception("Failed to inject Agent OS context into runner")
    try:
        await _bootstrap_prebuilt_employee_agents(app)
    except Exception:
        logger.exception("Failed to bootstrap prebuilt employee agents")
    try:
        app.state.chat_file_store = ChatFileStore(WORKING_DIR / "chat_files.db")
        logger.debug("ChatFileStore initialized at %s", WORKING_DIR / "chat_files.db")
    except Exception:
        logger.exception("Failed to initialize ChatFileStore")
    try:
        app.state.directive_news_service = DirectiveNewsSyncService()
        await app.state.directive_news_service.start()
        logger.debug("DirectiveNewsSyncService initialized")
    except Exception:
        app.state.directive_news_service = None
        logger.exception("Failed to initialize DirectiveNewsSyncService")
    # Sandbox overview is exposed via /sandbox/overview and reads Docker status
    # lazily on request, so no app.state object is needed here.
    try:
        await start_session_evolution_scheduler()
    except Exception:
        logger.exception("Failed to start session evolution scheduler")
    try:
        asyncio.create_task(asyncio.to_thread(get_tts_client().preload))
        logger.info("Scheduled background preload for voice secretary TTS")
    except Exception:
        logger.exception("Failed to schedule voice secretary TTS preload")

    _restart_task: asyncio.Task | None = None

    async def _restart_services() -> None:
        """Stop all managers, then rebuild from config (no exit).

        Single-flight: only one restart runs at a time. Concurrent or
        duplicate callers wait for the in-progress restart and return
        successfully. Uses asyncio.shield() so that when the caller
        (e.g. channel request) is cancelled, the restart task keeps
        running and does not propagate cancellation into deep task
        trees (avoids RecursionError on cancel).
        """
        # pylint: disable=too-many-statements
        nonlocal _restart_task
        # Caller task (in _local_tasks) must not be cancelled so it can
        # yield the final "Restart completed" message.
        restart_requester_task = asyncio.current_task()

        async def _run_then_clear() -> None:
            try:
                await _do_restart_services(
                    restart_requester_task=restart_requester_task,
                )
            finally:
                nonlocal _restart_task
                _restart_task = None

        if _restart_task is not None and not _restart_task.done():
            logger.info(
                "_restart_services: waiting for in-progress restart to finish",
            )
            await asyncio.shield(_restart_task)
            return
        if _restart_task is not None and _restart_task.done():
            _restart_task = None
        logger.info("_restart_services: starting restart")
        _restart_task = asyncio.create_task(_run_then_clear())
        await asyncio.shield(_restart_task)

    async def _teardown_new_stack(
        mcp_watcher=None,
        config_watcher=None,
        cron_mgr=None,
        ch_mgr=None,
        mcp_mgr=None,
    ) -> None:
        """Stop new stack in reverse start order (for rollback on failure)."""
        if mcp_watcher is not None:
            try:
                await mcp_watcher.stop()
            except Exception:
                logger.debug(
                    "rollback: mcp_watcher.stop failed",
                    exc_info=True,
                )
        if config_watcher is not None:
            try:
                await config_watcher.stop()
            except Exception:
                logger.debug(
                    "rollback: config_watcher.stop failed",
                    exc_info=True,
                )
        if cron_mgr is not None:
            try:
                await cron_mgr.stop()
            except Exception:
                logger.debug(
                    "rollback: cron_manager.stop failed",
                    exc_info=True,
                )
        if ch_mgr is not None:
            try:
                await ch_mgr.stop_all()
            except Exception:
                logger.debug(
                    "rollback: channel_manager.stop_all failed",
                    exc_info=True,
                )
        if mcp_mgr is not None:
            try:
                await mcp_mgr.close_all()
            except Exception:
                logger.debug(
                    "rollback: mcp_manager.close_all failed",
                    exc_info=True,
                )

    async def _do_restart_services(
        restart_requester_task: asyncio.Task | None = None,
    ) -> None:
        """Cancel in-flight agent requests first (so they can send error to
        channel), then stop old stack, then start new stack and swap.
        """
        # pylint: disable=too-many-statements
        try:
            config = load_config(get_config_path())
        except Exception:
            logger.exception("restart_services: load_config failed")
            return

        # 1) Cancel in-flight agent requests. Do not wait for them so the
        # console restart task never blocks (avoid deadlock when cancelled
        # task is slow to exit).
        local_tasks = getattr(agent_app, "_local_tasks", None)
        if local_tasks:
            to_cancel = [
                t
                for t in list(local_tasks.values())
                if t is not restart_requester_task and not t.done()
            ]
            for t in to_cancel:
                t.cancel()
            if to_cancel:
                logger.info(
                    "restart: cancelled %s in-flight task(s), not waiting",
                    len(to_cancel),
                )

        # 2) Stop old stack
        cfg_w = app.state.config_watcher
        mcp_w = getattr(app.state, "mcp_watcher", None)
        cron_mgr = app.state.cron_manager
        ch_mgr = app.state.channel_manager
        mcp_mgr = app.state.mcp_manager
        try:
            await cfg_w.stop()
        except Exception:
            logger.exception(
                "restart_services: old config_watcher.stop failed",
            )
        if mcp_w is not None:
            try:
                await mcp_w.stop()
            except Exception:
                logger.exception(
                    "restart_services: old mcp_watcher.stop failed",
                )
        try:
            await cron_mgr.stop()
        except Exception:
            logger.exception(
                "restart_services: old cron_manager.stop failed",
            )
        try:
            await ch_mgr.stop_all()
        except Exception:
            logger.exception(
                "restart_services: old channel_manager.stop_all failed",
            )
        if mcp_mgr is not None:
            try:
                await mcp_mgr.close_all()
            except Exception:
                logger.exception(
                    "restart_services: old mcp_manager.close_all failed",
                )

        # 3) Build and start new stack
        new_mcp_manager = MCPClientManager()
        if hasattr(config, "mcp"):
            try:
                await new_mcp_manager.init_from_config(config.mcp)
            except Exception:
                logger.exception(
                    "restart_services: mcp init_from_config failed",
                )
                return

        new_channel_manager = ChannelManager.from_config(
            process=make_process_from_runner(runner),
            config=config,
            on_last_dispatch=update_last_dispatch,
        )
        try:
            await new_channel_manager.start_all()
        except Exception:
            logger.exception(
                "restart_services: channel_manager.start_all failed",
            )
            await _teardown_new_stack(mcp_mgr=new_mcp_manager)
            return

        job_repo = JsonJobRepository(get_jobs_path())
        new_cron_manager = CronManager(
            repo=job_repo,
            runner=runner,
            channel_manager=new_channel_manager,
            timezone="UTC",
        )
        try:
            await new_cron_manager.start()
        except Exception:
            logger.exception(
                "restart_services: cron_manager.start failed",
            )
            await _teardown_new_stack(
                ch_mgr=new_channel_manager,
                mcp_mgr=new_mcp_manager,
            )
            return

        new_config_watcher = ConfigWatcher(
            channel_manager=new_channel_manager,
            cron_manager=new_cron_manager,
        )
        try:
            await new_config_watcher.start()
        except Exception:
            logger.exception(
                "restart_services: config_watcher.start failed",
            )
            await _teardown_new_stack(
                cron_mgr=new_cron_manager,
                ch_mgr=new_channel_manager,
                mcp_mgr=new_mcp_manager,
            )
            return

        new_mcp_watcher = None
        if hasattr(config, "mcp"):
            try:
                new_mcp_watcher = MCPConfigWatcher(
                    mcp_manager=new_mcp_manager,
                    config_loader=load_config,
                    config_path=get_config_path(),
                )
                await new_mcp_watcher.start()
            except Exception:
                logger.exception(
                    "restart_services: mcp_watcher.start failed",
                )
                await _teardown_new_stack(
                    config_watcher=new_config_watcher,
                    cron_mgr=new_cron_manager,
                    ch_mgr=new_channel_manager,
                    mcp_mgr=new_mcp_manager,
                )
                return

        if hasattr(config, "mcp"):
            runner.set_mcp_manager(new_mcp_manager)
            app.state.mcp_manager = new_mcp_manager
            app.state.mcp_watcher = new_mcp_watcher
        else:
            runner.set_mcp_manager(None)
            app.state.mcp_manager = None
            app.state.mcp_watcher = None
        app.state.channel_manager = new_channel_manager
        app.state.cron_manager = new_cron_manager
        app.state.config_watcher = new_config_watcher
        logger.info("Daemon restart (in-process) completed: managers rebuilt")

    setattr(runner, "_restart_callback", _restart_services)

    startup_elapsed = time.time() - startup_start_time
    logger.debug(
        f"Application startup completed in {startup_elapsed:.3f} seconds",
    )

    # Start event bus listener (legacy) or event consumer (v3.1 stream)
    if os.getenv("COPAW_EVENT_CONSUMER", "").strip() == "1":
        logger.info("Starting event stream consumer...")
        asyncio.create_task(start_event_consumer())
    else:
        logger.info("Starting event bus listener...")
        asyncio.create_task(start_event_listener())

    # Pass the app instance to agents
    notification_agent.set_app_instance(app)
    stats_agent.set_app_instance(app)

    mailbox_watcher = None
    mailbox_watcher_task: asyncio.Task | None = None
    try:
        mailbox_watcher = build_mailbox_watcher(app)
        if mailbox_watcher is not None:
            mailbox_watcher_task = asyncio.create_task(mailbox_watcher.run())
            logger.info(
                "Mailbox watcher scheduled for agent container: %s",
                getattr(mailbox_watcher, "_agent_id", ""),
            )
    except Exception:
        logger.exception("Failed to start mailbox watcher")

    try:
        yield
    finally:
        if mailbox_watcher is not None:
            try:
                await mailbox_watcher.stop()
            except Exception:
                pass
        if mailbox_watcher_task is not None:
            try:
                await asyncio.wait_for(mailbox_watcher_task, timeout=5)
            except Exception:
                mailbox_watcher_task.cancel()
        # Stop current app.state refs (post-restart instances if any)
        cfg_w = getattr(app.state, "config_watcher", None)
        mcp_w = getattr(app.state, "mcp_watcher", None)
        cron_mgr = getattr(app.state, "cron_manager", None)
        ch_mgr = getattr(app.state, "channel_manager", None)
        mcp_mgr = getattr(app.state, "mcp_manager", None)
        # stop order: watchers -> cron -> channels -> mcp -> runner
        if cfg_w is not None:
            try:
                await cfg_w.stop()
            except Exception:
                pass
        if mcp_w is not None:
            try:
                await mcp_w.stop()
            except Exception:
                pass
        if cron_mgr is not None:
            try:
                await cron_mgr.stop()
            except Exception:
                pass
        if ch_mgr is not None:
            try:
                await ch_mgr.stop_all()
            except Exception:
                pass
        if mcp_mgr is not None:
            try:
                await mcp_mgr.close_all()
            except Exception:
                pass
        directive_news_service = getattr(app.state, "directive_news_service", None)
        if directive_news_service is not None:
            try:
                await directive_news_service.stop()
            except Exception:
                logger.exception("Failed to stop directive news service")
        try:
            await stop_session_evolution_scheduler()
        except Exception:
            logger.exception("Failed to stop session evolution scheduler")
        await runner.stop()


app = FastAPI(
    lifespan=lifespan,
    docs_url="/docs" if DOCS_ENABLED else None,
    redoc_url="/redoc" if DOCS_ENABLED else None,
    openapi_url="/openapi.json" if DOCS_ENABLED else None,
)

# Apply CORS middleware if CORS_ORIGINS is set
if CORS_ORIGINS:
    origins = [o.strip() for o in CORS_ORIGINS.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


# Sandbox idle tracking: record the last request timestamp per container.
_SANDBOX_ACTIVITY_DIR_ENV = "COPAW_SANDBOX_ACTIVITY_DIR"


def _sandbox_activity_dir() -> Path:
    activity_dir = os.environ.get(_SANDBOX_ACTIVITY_DIR_ENV)
    if activity_dir:
        return Path(activity_dir)
    return WORKING_DIR / "logs"


def _touch_sandbox_activity(path: str = "", method: str = "") -> None:
    try:
        activity_dir = _sandbox_activity_dir()
        activity_dir.mkdir(parents=True, exist_ok=True)
        now = datetime.now(timezone.utc).isoformat()
        (activity_dir / "last_active_at.txt").write_text(
            f"{now}\nmethod={method or '-'}\npath={path or '-'}\n",
            encoding="utf-8",
        )
    except Exception:
        logger.debug("Failed to touch sandbox activity marker", exc_info=True)


@app.middleware("http")
async def sandbox_activity_middleware(request, call_next):
    """Record recent sandbox activity for idle reaping."""
    try:
        return await call_next(request)
    finally:
        _touch_sandbox_activity(
            path=str(getattr(request.url, "path", "")),
            method=str(getattr(request, "method", "")),
        )


# Console static dir: env, or copaw package data (console), or cwd.
_CONSOLE_STATIC_ENV = "COPAW_CONSOLE_STATIC_DIR"


def _resolve_console_static_dir() -> str:
    if os.environ.get(_CONSOLE_STATIC_ENV):
        return os.environ[_CONSOLE_STATIC_ENV]
    # Shipped dist lives in copaw package as static data (not a Python pkg).
    pkg_dir = Path(__file__).resolve().parent.parent
    candidate = pkg_dir / "console"
    if candidate.is_dir() and (candidate / "index.html").exists():
        return str(candidate)
    # the following code can be removed after next release,
    # because the console will be output to copaw's
    # `src/copaw/console/` directory directly by vite.
    cwd = Path(os.getcwd())
    for subdir in ("console/dist", "console_dist"):
        candidate = cwd / subdir
        if candidate.is_dir() and (candidate / "index.html").exists():
            return str(candidate)
    return str(cwd / "console" / "dist")


_CONSOLE_STATIC_DIR = _resolve_console_static_dir()
_CONSOLE_INDEX = (
    Path(_CONSOLE_STATIC_DIR) / "index.html" if _CONSOLE_STATIC_DIR else None
)
logger.info(f"STATIC_DIR: {_CONSOLE_STATIC_DIR}")


def _console_index_response() -> FileResponse:
    return FileResponse(
        _CONSOLE_INDEX,
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


@app.get("/")
def read_root():
    if _CONSOLE_INDEX and _CONSOLE_INDEX.exists():
        return _console_index_response()
    return {
        "message": (
            "CoPaw Web Console is not available. "
            "If you installed CoPaw from source code, please run "
            "`npm ci && npm run build` in CoPaw's `console/` "
            "directory, and restart CoPaw to enable the web console."
        ),
    }


@app.get("/api/version")
def get_version():
    """Return the current CoPaw version."""
    return {"version": __version__}


@app.websocket("/api/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await app.state.websocket_manager.connect(websocket, user_id)
    try:
        while True:
            await websocket.receive_text()  # Keep connection alive
    except WebSocketDisconnect:
        app.state.websocket_manager.disconnect(user_id)


@app.get("/api/messages/pull")
async def pull_messages(current_user: dict = Depends(get_current_user)):
    # JWT payload 使用 user_id，不是 id
    user_id = str(current_user.get("user_id", ""))
    if not user_id:
        return JSONResponse(content={"messages": []})

    store = getattr(app.state, "message_store", None)
    if store is None:
        logger.warning("Message store not available; returning empty messages")
        return JSONResponse(content={"messages": []})

    try:
        try:
            from .login_notifications import enqueue_inbox_notifications

            await enqueue_inbox_notifications(
                store=store,
                user_id=user_id,
                user_name=str(current_user.get("name", "")),
                status="inbox_poll",
            )
        except Exception:
            logger.exception("Failed to enqueue inbox notifications for user %s", user_id)
        messages = store.pull_messages(user_id)
    except Exception:
        logger.exception("Failed to pull messages for user %s", user_id)
        messages = []

    # Ensure push message sessions are persisted for user-to-user chats.
    chat_manager = getattr(app.state, "chat_manager", None)
    runner_ref = getattr(app.state, "runner", None)
    session_store = getattr(runner_ref, "session", None) if runner_ref else None
    if chat_manager and messages:
        current_user_name = str(current_user.get("name", ""))
        for msg in messages:
            if not isinstance(msg, dict):
                continue
            source_user_id = str(msg.get("source_user_id") or "")
            message_id = str(msg.get("message_id") or "")
            if not message_id:
                message_id = str(uuid.uuid4())
                msg["message_id"] = message_id
            trace_id = str(msg.get("trace_id") or message_id)
            intent_type = str(msg.get("intent_type") or "notify.legacy")
            source_agent_id = str(msg.get("source_agent_id") or "")
            target_agent_id = str(msg.get("target_agent_id") or "")
            source_user_name = str(msg.get("source_user_name") or "")
            if not source_user_name:
                if source_agent_id == "so:enterprise":
                    source_user_name = "系统Agent"
                elif source_agent_id.startswith("pia:"):
                    source_user_name = f"虚拟员工{source_agent_id.split(':', 1)[1]}"
                else:
                    source_user_name = "系统"
            business_meta = {
                key: str(msg.get(key) or "").strip()
                for key in [
                    "biz_domain",
                    "module",
                    "task_id",
                    "status",
                    "party_module",
                    "party_item_id",
                    "party_title",
                    "party_status",
                    "party_stage",
                    "party_priority",
                    "party_reminder_status",
                    "party_receipt_status",
                    "party_deadline",
                ]
                if str(msg.get(key) or "").strip()
            }
            if business_meta.get("party_module") and not business_meta.get("biz_domain"):
                business_meta["biz_domain"] = "party"
            if business_meta.get("party_module") and not business_meta.get("module"):
                business_meta["module"] = business_meta["party_module"]
            if business_meta.get("party_status") and not business_meta.get("status"):
                business_meta["status"] = business_meta["party_status"]
            push_chat_id = str(msg.get("push_chat_id") or "")
            push_session_id = str(msg.get("push_session_id") or "")
            if not push_session_id:
                if message_id:
                    push_session_id = f"console:notif:{message_id}"
                elif source_user_id:
                    low, high = sorted([str(user_id), source_user_id])
                    push_session_id = f"console:dm:{low}:{high}"
                else:
                    push_session_id = f"console:notif:{message_id}"
            conversation_key = str(msg.get("push_conversation_key") or "")
            if not conversation_key:
                if message_id:
                    conversation_key = f"notif:{message_id}"
                elif source_user_id:
                    ids = sorted([str(user_id), source_user_id])
                    conversation_key = f"{ids[0]}:{ids[1]}"
                else:
                    conversation_key = f"notif:{message_id}"
            display_name = (
                f"{source_user_name} ↔ {current_user_name}"
                if source_user_name and current_user_name
                else (source_user_name or "系统通知")
            )
            try:
                spec = None
                if push_chat_id:
                    spec = await chat_manager.get_chat(push_chat_id)
                    if not spec:
                        spec = ChatSpec(
                            id=push_chat_id,
                            session_id=push_session_id,
                            user_id=str(user_id),
                            channel="console",
                            name=display_name,
                            meta={
                                "push_source_user_id": source_user_id,
                                "push_source_user_name": source_user_name,
                                "push_conversation_key": conversation_key,
                                "push_message_id": message_id,
                                "push_trace_id": trace_id,
                                "push_intent_type": intent_type,
                                "source_agent_id": source_agent_id,
                                "target_agent_id": target_agent_id,
                                **business_meta,
                            },
                        )
                        await chat_manager.create_chat(spec)
                if not spec:
                    spec = await chat_manager.get_or_create_chat(
                        push_session_id,
                        str(user_id),
                        "console",
                        name=display_name,
                    )
                    push_chat_id = str(spec.id)

                # Ensure meta includes push source for reply-forward on refresh.
                if spec is not None:
                    meta = dict(getattr(spec, "meta", {}) or {})
                    changed = False
                    if source_user_id and meta.get("push_source_user_id") != source_user_id:
                        meta["push_source_user_id"] = source_user_id
                        changed = True
                    if source_user_name and meta.get("push_source_user_name") != source_user_name:
                        meta["push_source_user_name"] = source_user_name
                        changed = True
                    if conversation_key and meta.get("push_conversation_key") != conversation_key:
                        meta["push_conversation_key"] = conversation_key
                        changed = True
                    if message_id and meta.get("push_message_id") != message_id:
                        meta["push_message_id"] = message_id
                        changed = True
                    if trace_id and meta.get("push_trace_id") != trace_id:
                        meta["push_trace_id"] = trace_id
                        changed = True
                    if intent_type and meta.get("push_intent_type") != intent_type:
                        meta["push_intent_type"] = intent_type
                        changed = True
                    if source_agent_id and meta.get("source_agent_id") != source_agent_id:
                        meta["source_agent_id"] = source_agent_id
                        changed = True
                    if target_agent_id and meta.get("target_agent_id") != target_agent_id:
                        meta["target_agent_id"] = target_agent_id
                        changed = True
                    for key, value in business_meta.items():
                        if value and meta.get(key) != value:
                            meta[key] = value
                            changed = True
                    if display_name and getattr(spec, "name", "") != display_name:
                        spec.name = display_name
                        changed = True
                    if changed:
                        spec.meta = meta
                        await chat_manager.update_chat(spec)

                msg["push_chat_id"] = push_chat_id
                msg["push_session_id"] = push_session_id
                msg["push_conversation_key"] = conversation_key
                msg["trace_id"] = trace_id
                msg["intent_type"] = intent_type
                msg["source_agent_id"] = source_agent_id
                msg["target_agent_id"] = target_agent_id
            except Exception:
                logger.exception(
                    "Failed to ensure push session chat for user %s", user_id
                )

            # Persist push message into session history for refresh.
            if session_store:
                text = str(msg.get("text") or "")
                if text:
                    try:
                        state = await session_store.get_session_state_dict(
                            push_session_id,
                            user_id=str(user_id),
                        )
                        memories = state.get("agent", {}).get("memory", {})
                        memory = InMemoryMemory()
                        if isinstance(memories, dict) and "content" in memories:
                            try:
                                memory.load_state_dict(memories)
                            except Exception:
                                logger.warning(
                                    "Ignore invalid memory state for session=%s user=%s",
                                    push_session_id,
                                    user_id,
                                    exc_info=True,
                                )
                        elif memories:
                            logger.warning(
                                "Skip incompatible memory state for session=%s user=%s keys=%s",
                                push_session_id,
                                user_id,
                                list(memories.keys()) if isinstance(memories, dict) else type(memories).__name__,
                            )
                        message_id = str(msg.get("message_id") or "")
                        already = False
                        if message_id:
                            for existing_msg, _marks in memory.content:
                                if getattr(existing_msg, "id", "") == message_id:
                                    already = True
                                    break
                        if not already:
                            mem_msg = Msg(
                                name="Friday",
                                role="assistant",
                                content=text,
                            )
                            if message_id:
                                try:
                                    mem_msg.id = message_id
                                except Exception:
                                    pass
                            await memory.add(mem_msg)
                            await session_store.update_session_state(
                                push_session_id,
                                "agent.memory",
                                memory.state_dict(),
                                user_id=str(user_id),
                            )
                    except Exception:
                        logger.exception(
                            "Failed to persist push message into session state for user %s",
                            user_id,
                        )

    logger.info(f"Pulled {len(messages)} messages for user {user_id}")
    return JSONResponse(content={"messages": messages})


@app.get("/api/messages/debug")
def debug_messages(current_user: dict = Depends(get_current_user)):
    """调试用：返回当前用户 user_id 及待拉取消息数，用于验证推送链路"""
    user_id = str(current_user.get("user_id", ""))
    if not user_id:
        return JSONResponse(content={"user_id": "", "pending_count": 0, "has_messages": False})
    store = getattr(app.state, "message_store", None)
    if store is None:
        return JSONResponse(content={"user_id": user_id, "pending_count": 0, "has_messages": False})
    try:
        pending = store.pending_count(user_id)
    except Exception:
        logger.exception("Failed to get pending_count for user %s", user_id)
        pending = 0
    return JSONResponse(content={"user_id": user_id, "pending_count": pending, "has_messages": pending > 0})


@app.post("/api/messages/test-push")
def test_push(current_user: dict = Depends(get_current_user)):
    """测试用：向当前用户队列注入一条测试消息，用于验证推送链路"""
    user_id = str(current_user.get("user_id", ""))
    if not user_id:
        return JSONResponse(content={"error": "no user_id"}, status_code=400)
    store = getattr(app.state, "message_store", None)
    if store is None:
        return JSONResponse(content={"error": "message store unavailable"}, status_code=500)
    msg = "【测试】这是一条测试推送消息，用于验证链路是否正常"
    try:
        store.enqueue_message(user_id, {"text": msg})
        logger.info(f"Test push: injected 1 message for user {user_id}")
        return JSONResponse(content={"ok": True, "user_id": user_id})
    except Exception:
        logger.exception("Failed to enqueue test message for user %s", user_id)
        return JSONResponse(content={"error": "enqueue failed"}, status_code=500)


app.include_router(api_router, prefix="/api")

app.include_router(
    agent_app.router,
    prefix="/api/agent",
    tags=["agent"],
)

# Voice channel: Twilio-facing endpoints at root level (not under /api/).
# POST /voice/incoming, WS /voice/ws, POST /voice/status-callback
app.include_router(voice_router, tags=["voice"])

# Mount console: root static files (logo.png etc.) then assets, then SPA
# fallback.
if os.path.isdir(_CONSOLE_STATIC_DIR):
    _console_path = Path(_CONSOLE_STATIC_DIR)

    @app.get("/logo.png")
    def _console_logo():
        f = _console_path / "logo.png"
        if f.is_file():
            return FileResponse(f, media_type="image/png")

        raise HTTPException(status_code=404, detail="Not Found")

    @app.get("/copaw-symbol.svg")
    def _console_icon():
        f = _console_path / "copaw-symbol.svg"
        if f.is_file():
            return FileResponse(f, media_type="image/svg+xml")

        raise HTTPException(status_code=404, detail="Not Found")

    _assets_dir = _console_path / "assets"
    if _assets_dir.is_dir():
        app.mount(
            "/assets",
            StaticFiles(directory=str(_assets_dir)),
            name="assets",
        )

    @app.get("/{full_path:path}")
    def _console_spa(full_path: str):
        if _CONSOLE_INDEX and _CONSOLE_INDEX.exists():
            return _console_index_response()

        raise HTTPException(status_code=404, detail="Not Found")
