"""In-process pub/sub for SSE status events.

Each repo_id maps to a list of asyncio.Queue subscribers.
Publishers push JSON status events; SSE endpoints consume them.
"""

import asyncio
import json
from collections import defaultdict

_subscribers: dict[str, list[asyncio.Queue[str]]] = defaultdict(list)


async def publish(repo_id: str, event: dict) -> None:
    """Push a status event to all subscribers for the given repo."""
    message = json.dumps(event)
    queues = _subscribers.get(repo_id, [])
    dead: list[asyncio.Queue[str]] = []
    for q in queues:
        try:
            q.put_nowait(message)
        except asyncio.QueueFull:
            dead.append(q)
    for q in dead:
        queues.remove(q)


async def subscribe(repo_id: str) -> asyncio.Queue[str]:
    """Create and register a subscription queue for a repo."""
    q: asyncio.Queue[str] = asyncio.Queue(maxsize=128)
    _subscribers[repo_id].append(q)
    return q


def unsubscribe(repo_id: str, q: asyncio.Queue[str]) -> None:
    """Remove a subscription. Safe to call on already-removed queues."""
    queues = _subscribers.get(repo_id, [])
    try:
        queues.remove(q)
    except ValueError:
        pass
