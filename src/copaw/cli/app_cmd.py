# -*- coding: utf-8 -*-
from __future__ import annotations

import logging
import os

import click
import uvicorn

from ..constant import LOG_LEVEL_ENV
from ..config.utils import write_last_api
from ..utils.logging import setup_logger, SuppressPathAccessLogFilter


@click.command("app")
@click.option(
    "--host",
    default="127.0.0.1",
    show_default=True,
    help="Bind host",
)
@click.option(
    "--port",
    default=8088,
    type=int,
    show_default=True,
    help="Bind port",
)
@click.option("--reload", is_flag=True, help="Enable auto-reload (dev only)")
@click.option(
    "--workers",
    default=1,
    type=int,
    show_default=True,
    help="Worker processes",
)
@click.option(
    "--log-level",
    default="info",
    type=click.Choice(
        ["critical", "error", "warning", "info", "debug", "trace"],
        case_sensitive=False,
    ),
    show_default=True,
    help="Log level",
)
@click.option(
    "--hide-access-paths",
    multiple=True,
    default=("/console/push-messages",),
    show_default=True,
    help="Path substrings to hide from uvicorn access log (repeatable).",
)
@click.option(
    "--https/--http",
    "use_https",
    default=False,
    show_default=True,
    help="Enable HTTPS (requires cert/key).",
)
@click.option(
    "--ssl-certfile",
    default="certs/cert.pem",
    show_default=True,
    help="SSL cert file path (used when --https).",
)
@click.option(
    "--ssl-keyfile",
    default="certs/key.pem",
    show_default=True,
    help="SSL key file path (used when --https).",
)
def app_cmd(
    host: str,
    port: int,
    reload: bool,
    workers: int,
    log_level: str,
    hide_access_paths: tuple[str, ...],
    use_https: bool,
    ssl_certfile: str,
    ssl_keyfile: str,
) -> None:
    """Run CoPaw FastAPI app."""
    # Persist last used host/port for other terminals
    write_last_api(host, port)
    os.environ[LOG_LEVEL_ENV] = log_level

    # Signal reload mode to browser_control.py for Windows
    # compatibility: use sync Playwright + ThreadPool only when reload=True
    if reload:
        os.environ["COPAW_RELOAD_MODE"] = "1"
    else:
        os.environ.pop("COPAW_RELOAD_MODE", None)

    setup_logger(log_level)
    if log_level in ("debug", "trace"):
        from .main import log_init_timings

        log_init_timings()

    paths = [p for p in hide_access_paths if p]
    if paths:
        logging.getLogger("uvicorn.access").addFilter(
            SuppressPathAccessLogFilter(paths),
        )

    ssl_kwargs = {}
    if use_https:
        if not os.path.exists(ssl_certfile) or not os.path.exists(ssl_keyfile):
            logging.getLogger(__name__).error(
                "SSL cert/key not found: %s, %s", ssl_certfile, ssl_keyfile
            )
            logging.getLogger(__name__).error(
                "Generate with: openssl req -x509 -newkey rsa:2048 "
                "-keyout certs/key.pem -out certs/cert.pem -days 365 -nodes "
                "-subj '/CN=dev'"
            )
            return
        ssl_kwargs = {"ssl_certfile": ssl_certfile, "ssl_keyfile": ssl_keyfile}

    uvicorn.run(
        "copaw.app._app:app",
        host=host,
        port=port,
        reload=reload,
        workers=workers,
        log_level=log_level,
        **ssl_kwargs,
    )
