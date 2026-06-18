from pathlib import Path

from app.analysis.static_analysis import analyze_file


def test_analyze_pe_like_file(tmp_path: Path):
    p = tmp_path / "sample.exe"
    body = b"MZ" + b"\x00" * 64 + b"http://evil.example/c2 " + b"VirtualAlloc WriteProcessMemory " * 4
    p.write_bytes(body)

    feats = analyze_file(p)
    assert feats.is_pe is True
    assert feats.size == len(body)
    assert len(feats.sha256) == 64
    assert "PE executable" in feats.file_type
    assert any("evil.example" in u for u in feats.urls)
    assert "VirtualAlloc" in feats.suspicious_apis
    assert "WriteProcessMemory" in feats.suspicious_apis


def test_analyze_text_file(tmp_path: Path):
    p = tmp_path / "note.txt"
    p.write_text("just a harmless note with some words in it\n" * 5)
    feats = analyze_file(p)
    assert feats.is_pe is False
    assert "text" in feats.file_type.lower()


def test_entropy_high_for_random(tmp_path: Path):
    import os

    p = tmp_path / "packed.bin"
    p.write_bytes(os.urandom(200_000))
    feats = analyze_file(p)
    assert feats.entropy >= 7.0
