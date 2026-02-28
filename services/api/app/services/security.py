import re


INJECTION_PATTERNS = [
    re.compile(r"ignore\s+all\s+previous\s+instructions", re.IGNORECASE),
    re.compile(r"reveal\s+system\s+prompt", re.IGNORECASE),
    re.compile(r"jailbreak", re.IGNORECASE),
]


def sanitize_user_input(text: str) -> str:
    cleaned = text.strip()
    for pattern in INJECTION_PATTERNS:
        cleaned = pattern.sub("[filtered]", cleaned)
    return cleaned


def detect_argument_tag(content: str) -> str:
    lowered = content.lower()
    if any(token in lowered for token in ["however", "but", "disagree", "incorrect"]):
        return "REBUT"
    if any(token in lowered for token in ["because", "evidence", "data"]):
        return "SUPPORT"
    if len(content.split()) > 4:
        return "CLAIM"
    return "OTHER"
