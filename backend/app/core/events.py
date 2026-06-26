"""In-process pub/sub for SSE status events.

Each repo_id maps to a list of asyncio.Queue subscribers.
Publishers push JSON status events; SSE endpoints consume them.

Includes a background heartbeat task that periodically removes
subscribers that have been inactive for more than 5 minutes.
"""

from __future__ import annotations

import asyncio
import json
import time
from collections import defaultdict

_subscribers: dict[str, list[asyncio.Queue[str]]] = defaultdict(list)
_last_active: dict[int, float] = {}  # id(q) -> timestamp

_CLEANUP_INTERVAL = 60  # seconds between cleanup sweeps
_INACTIVE_TIMEOUT = 300  # 5 minutes


async def publish(repo_id: str, event: dict) -> None:
    """Push a status event to all subscribers for the given repo."""
    message = json.dumps(event)
    queues = _subscribers.get(repo_id, [])
    dead: list[asyncio.Queue[str]] = []
    for q in queues:
        _last_active[id(q)] = time.monotonic()
        try:
            q.put_nowait(message)
        except asyncio.QueueFull:
            dead.append(q)
    for q in dead:
        queues.remove(q)
        _last_active.pop(id(q), None)


async def subscribe(repo_id: str) -> asyncio.Queue[str]:
    """Create and register a subscription queue for a repo."""
    q: asyncio.Queue[str] = asyncio.Queue(maxsize=128)
    _subscribers[repo_id].append(q)
    _last_active[id(q)] = time.monotonic()
    return q


def unsubscribe(repo_id: str, q: asyncio.Queue[str]) -> None:
    """Remove a subscription. Safe to call on already-removed queues."""
    queues = _subscribers.get(repo_id, [])
    try:
        queues.remove(q)
    except ValueError:
        pass
    _last_active.pop(id(q), None)


async def _cleanup_dead_subscribers() -> None:
    """Remove subscribers that have been inactive for >5 minutes."""
    now = time.monotonic()
    for repo_id, queues in list(_subscribers.items()):
        dead: list[asyncio.Queue[str]] = []
        for q in queues:
            last_seen = _last_active.get(id(q), 0)
            if now - last_seen > _INACTIVE_TIMEOUT:
                dead.append(q)
        for q in dead:
            queues.remove(q)
            _last_active.pop(id(q), None)
        if not queues:
            del _subscribers[repo_id]


async def _heartbeat_loop() -> None:
    """Periodic background task that sweeps dead subscribers."""
    while True:
        await asyncio.sleep(_CLEANUP_INTERVAL)
        try:
            await _cleanup_dead_subscribers()
        except Exception:
            pass  # never let the heartbeat crash


# Background cleanup task. Must be started from within a running event loop
# (e.g. the FastAPI lifespan), not at import time.
_heartbeat_task: asyncio.Task[None] | None = None


def start_heartbeat() -> None:
    """Start the background cleanup task. Idempotent; requires a running loop."""
    global _heartbeat_task
    if _heartbeat_task is None or _heartbeat_task.done():
        _heartbeat_task = asyncio.create_task(_heartbeat_loop())


def stop_heartbeat() -> None:
    """Cancel the background cleanup task if running."""
    global _heartbeat_task
    if _heartbeat_task is not None and not _heartbeat_task.done():
        _heartbeat_task.cancel()
    _heartbeat_task = None
