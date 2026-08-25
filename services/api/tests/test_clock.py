from datetime import datetime, timedelta, timezone

from app.games.clock import decrement, elapsed_ms, timeout_side


def test_elapsed_ms():
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    now = start + timedelta(seconds=2.5)
    assert elapsed_ms(start, now) == 2500


def test_elapsed_clamped_at_zero():
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    assert elapsed_ms(start, start - timedelta(seconds=1)) == 0


def test_decrement():
    assert decrement(600_000, 1_000) == 599_000
    assert decrement(500, 1_000) == 0


def test_timeout_side():
    assert timeout_side(500, 1_000) is True
    assert timeout_side(1_000, 999) is False
