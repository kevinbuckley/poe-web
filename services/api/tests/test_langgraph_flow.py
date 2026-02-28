from app.services.langgraph_flow import extract_mentions, plan_next_turn


def test_extract_mentions_parses_valid_persona_ids() -> None:
    text = "I disagree with @socrates and @niels-bohr, but not with @x."
    assert extract_mentions(text) == ["socrates", "niels-bohr"]


def test_plan_next_turn_respects_hard_user_mention(monkeypatch) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    plan = plan_next_turn(
        user_text="@socrates answer first",
        persona_ids=["socrates", "mark-vc", "niels-bohr"],
        turn_counts={},
        recent_speakers=[],
        hard_mention="socrates",
        soft_mentions=[],
        distinct_speakers=set(),
        turn_index=1,
        min_turns=2,
        target_turns=3,
        max_turns=5,
        last_speaker=None,
    )

    assert plan.continue_cycle is True
    assert plan.next_speaker_id == "socrates"


def test_plan_next_turn_avoids_immediate_repeat_speaker(monkeypatch) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    plan = plan_next_turn(
        user_text="debate this claim",
        persona_ids=["socrates", "mark-vc"],
        turn_counts={"socrates": 1, "mark-vc": 0},
        recent_speakers=["socrates"],
        hard_mention=None,
        soft_mentions=[],
        distinct_speakers={"socrates"},
        turn_index=2,
        min_turns=2,
        target_turns=3,
        max_turns=5,
        last_speaker="socrates",
    )

    assert plan.continue_cycle is True
    assert plan.next_speaker_id == "mark-vc"


def test_plan_next_turn_stops_when_target_depth_and_diversity_met(monkeypatch) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    plan = plan_next_turn(
        user_text="continue?",
        persona_ids=["socrates", "mark-vc", "niels-bohr"],
        turn_counts={"socrates": 1, "mark-vc": 1},
        recent_speakers=["socrates", "mark-vc"],
        hard_mention=None,
        soft_mentions=[],
        distinct_speakers={"socrates", "mark-vc"},
        turn_index=3,
        min_turns=2,
        target_turns=3,
        max_turns=5,
        last_speaker="mark-vc",
    )

    assert plan.continue_cycle is False
    assert plan.next_speaker_id is None
