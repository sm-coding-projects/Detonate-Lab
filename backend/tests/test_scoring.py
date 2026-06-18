from app.analysis.sandbox import DemoSandbox
from app.analysis.scoring import score_features
from app.analysis.static_analysis import StaticFeatures


def _feats(**kw) -> StaticFeatures:
    base = dict(size=1000, sha256="a" * 64, md5="b" * 32, file_type="PE executable (Windows)", entropy=4.0)
    base.update(kw)
    return StaticFeatures(**base)


def test_ransomware_like_scores_critical():
    feats = _feats(entropy=7.6, is_pe=True, suspicious_apis=["CryptEncrypt", "vssadmin"], urls=["http://x/y"])
    result = score_features(feats)
    assert result.score >= 70
    assert result.level in ("critical", "high")
    assert any(f["label"].startswith("Destructive") and f["on"] for f in result.factors)


def test_inert_text_scores_low():
    feats = _feats(file_type="Plain text / script", entropy=3.1, is_pe=False)
    result = score_features(feats)
    assert result.score < 40
    assert result.level in ("low", "info", "medium")


def test_factors_always_six_rows():
    result = score_features(_feats())
    assert len(result.factors) == 6


def test_sandbox_synthesizes_sections():
    feats = _feats(is_pe=True, suspicious_apis=["powershell", "RegSetValue"], urls=["http://c2.example/a"], ips=["1.2.3.4"])
    score = score_features(feats)
    behav = DemoSandbox().detonate(__import__("pathlib").Path("."), feats, score, display="x")
    assert behav["killchain"], "expected killchain stages"
    assert behav["timeline"], "expected timeline events"
    assert len(behav["blast"]) == 6
    assert "ips" in behav["network"]
