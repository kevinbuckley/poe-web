from worker.tasks import evaluate_persona_drift, generate_summary_handoff


def test_generate_summary_handoff_shape() -> None:
    result = generate_summary_handoff("session-1")
    assert result["session_id"] == "session-1"
    assert result["status"] == "queued"


def test_evaluate_persona_drift_shape() -> None:
    result = evaluate_persona_drift("session-1", "persona-1")
    assert result["session_id"] == "session-1"
    assert result["persona_id"] == "persona-1"
    assert result["status"] == "evaluated"
