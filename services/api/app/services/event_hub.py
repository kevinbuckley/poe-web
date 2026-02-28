import asyncio
from collections import defaultdict
from datetime import datetime
from typing import Any


class SessionEventHub:
    def __init__(self) -> None:
        self._queues: dict[str, list[asyncio.Queue[dict[str, Any]]]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def subscribe(self, session_id: str) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=200)
        async with self._lock:
            self._queues[session_id].append(queue)
        return queue

    async def unsubscribe(self, session_id: str, queue: asyncio.Queue[dict[str, Any]]) -> None:
        async with self._lock:
            queues = self._queues.get(session_id, [])
            if queue in queues:
                queues.remove(queue)
            if not queues and session_id in self._queues:
                del self._queues[session_id]

    async def publish(self, session_id: str, event_type: str, payload: dict[str, Any]) -> None:
        event = {
            "type": event_type,
            "session_id": session_id,
            "payload": payload,
            "ts": datetime.utcnow().isoformat(),
        }
        async with self._lock:
            queues = list(self._queues.get(session_id, []))

        for queue in queues:
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                _ = queue.get_nowait()
                queue.put_nowait(event)


event_hub = SessionEventHub()
