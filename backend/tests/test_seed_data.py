from app.analysis.seed_data import GHOSTFEED, SEED_SAMPLES, WRAITHLOCK, to_report
from app.schemas import Report


def test_to_report_builds_six_tiles():
    report = to_report(WRAITHLOCK)
    assert len(report["tiles"]) == 6
    # First three are computed meta tiles.
    assert report["tiles"][0]["l"] == "MITRE tactics"
    assert report["tiles"][0]["v"] == str(len(WRAITHLOCK["killchain"]))
    assert report["synthetic"] is False


def test_all_seed_samples_validate_against_schema():
    for raw in SEED_SAMPLES:
        report = to_report(raw)
        # Pydantic validation ensures the report matches the API contract.
        Report.model_validate(report)


def test_ghostfeed_has_disabled_factors():
    report = to_report(GHOSTFEED)
    off = [f for f in report["factors"] if not f["on"]]
    assert off, "GHOSTFEED should have some 'not seen' factors"
