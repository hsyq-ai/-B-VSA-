
import asyncio
import logging
import re
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from pathlib import Path
from copaw.constant import WORKING_DIR

# Import agent handlers
from copaw.agents.notification_agent import handle_notification_task
from copaw.agents.stats_agent import handle_stats_task

logger = logging.getLogger(__name__)

# This should point to the actual event bus file under WORKING_DIR
EVENT_BUS_FILE = WORKING_DIR / "event_bus.md"

# A simple dispatcher mapping agent names to handler functions
AGENT_DISPATCHER = {
    "@文件处理Agent": handle_notification_task,
    "@通知Agent": handle_notification_task,
    "@统计Agent": handle_stats_task,
}

class EventBusHandler(FileSystemEventHandler):
    def __init__(self, loop):
        self.loop = loop
        self.last_position = 0
        if EVENT_BUS_FILE.exists():
            self.last_position = EVENT_BUS_FILE.stat().st_size

    def on_modified(self, event):
        # Absolute check to ensure we only process the target file
        if Path(event.src_path).resolve() != EVENT_BUS_FILE.resolve():
            return

        logger.info(f"on_modified triggered for event: {event.src_path}")
        # Use run_coroutine_threadsafe to safely schedule the coroutine
        asyncio.run_coroutine_threadsafe(self.process_new_events(), self.loop)

    async def process_new_events(self):
        try:
            with open(EVENT_BUS_FILE, "r+", encoding="utf-8") as f:
                f.seek(self.last_position)
                current_position = self.last_position
                new_lines = f.readlines()
                if not new_lines:
                    return

                processed_lines = []
                for line in new_lines:
                    original_line = line
                    line = line.strip()
                    if line.startswith("- [ ]"):
                        task_id_match = re.search(r"task_id:([0-9a-fA-F-]+)", line)
                        task_id = task_id_match.group(1) if task_id_match else "-"
                        logger.info("New event detected: task_id=%s %s", task_id, line)
                        processed = await self.dispatch_event(line)
                        if processed:
                            processed_lines.append(original_line.replace("- [ ]", "- [x]", 1))
                        else:
                            processed_lines.append(original_line)
                    else:
                        processed_lines.append(original_line)

                f.seek(current_position)
                f.writelines(processed_lines)
                self.last_position = f.tell()

        except Exception as e:
            logger.error(f"Error processing event bus file: {e}")

    async def dispatch_event(self, task_content: str) -> bool:
        match = re.search(r"^-\s*\[\s*\]\s*(@\w+):", task_content)
        if not match:
            logger.warning(f"Could not find agent name in task: {task_content}")
            return False

        agent_name = match.group(1)
        handler = AGENT_DISPATCHER.get(agent_name)

        if handler:
            task_id_match = re.search(r"task_id:([0-9a-fA-F-]+)", task_content)
            task_id = task_id_match.group(1) if task_id_match else "-"
            logger.info("Dispatching to agent: %s task_id=%s", agent_name, task_id)
            try:
                await handler(task_content)
                return True
            except Exception as e:
                logger.error("Error executing agent %s task_id=%s: %s", agent_name, task_id, e)
                return False
        else:
            logger.warning(f"No handler found for agent: {agent_name}")
            return False

async def start_event_listener():
    # Ensure the event bus file and its parent directory exist BEFORE starting the observer
    if not EVENT_BUS_FILE.parent.exists():
        EVENT_BUS_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not EVENT_BUS_FILE.exists():
        EVENT_BUS_FILE.touch()
        logger.info(f"Created event bus file at: {EVENT_BUS_FILE}")

    loop = asyncio.get_running_loop()
    event_handler = EventBusHandler(loop)
    observer = Observer()
    observer.schedule(event_handler, str(EVENT_BUS_FILE.parent), recursive=False)
    observer.start()
    logger.info(f"Event listener started, watching file: {EVENT_BUS_FILE}")

    try:
        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(start_event_listener())
