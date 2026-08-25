from datetime import datetime


def elapsed_ms(last_turn_started_at: datetime, now: datetime) -> int:
    delta = (now - last_turn_started_at).total_seconds() * 1000
    return max(0, int(delta))


def decrement(clock_ms: int, elapsed: int) -> int:
    return max(0, clock_ms - elapsed)


def timeout_side(clock_ms: int, elapsed: int) -> bool:
    return clock_ms - elapsed <= 0
