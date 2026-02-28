import time
from collections import defaultdict, deque


class InMemoryRateLimiter:
    def __init__(self, limit: int = 120, window_seconds: int = 60) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._windows: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        now = time.time()
        window = self._windows[key]

        while window and now - window[0] > self.window_seconds:
            window.popleft()

        if len(window) >= self.limit:
            return False

        window.append(now)
        return True


rate_limiter = InMemoryRateLimiter()
