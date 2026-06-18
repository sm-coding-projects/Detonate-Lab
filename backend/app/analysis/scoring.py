"""Heuristic threat scoring from real static features.

This produces a defensible 0-100 score and a severity band from observable
properties (entropy, suspicious APIs, embedded C2 indicators, packing). It is a
heuristic — not a verdict from a real detonation — and is labelled as such.
"""
from __future__ import annotations

from dataclasses import dataclass

from .static_analysis import StaticFeatures

LEVEL_BANDS = [
    (85, "critical", "CRITICAL"),
    (65, "high", "HIGH"),
    (40, "medium", "MEDIUM"),
    (15, "low", "LOW"),
    (0, "info", "INFO"),
]

# API name -> (factor label, weight, level)
_API_FACTORS = {
    "CryptEncrypt": ("Destructive — may encrypt data", 22, "critical"),
    "vssadmin": ("Inhibits system recovery", 18, "critical"),
    "wbadmin": ("Inhibits system recovery", 18, "critical"),
    "bcdedit": ("Inhibits system recovery", 12, "high"),
    "WriteProcessMemory": ("Injects into processes", 12, "medium"),
    "CreateRemoteThread": ("Injects into processes", 12, "medium"),
    "NtUnmapViewOfSection": ("Process hollowing", 14, "high"),
    "SetWindowsHookEx": ("Keylogging / input capture", 12, "high"),
    "URLDownloadToFile": ("Downloads remote payloads", 12, "high"),
    "ShellExecute": ("Executes external commands", 8, "medium"),
    "WinExec": ("Executes external commands", 8, "medium"),
    "powershell": ("Uses PowerShell", 8, "medium"),
    "CreateService": ("Persists as a service", 8, "medium"),
    "RegSetValue": ("Modifies the registry", 5, "low"),
    "IsDebuggerPresent": ("Anti-analysis checks", 6, "medium"),
}


@dataclass
class ScoreResult:
    score: int
    level: str
    label: str
    confidence: str
    factors: list[dict]
    classification: str
    reasons: list[str]


def _band(score: int) -> tuple[str, str]:
    for threshold, level, label in LEVEL_BANDS:
        if score >= threshold:
            return level, label
    return "info", "INFO"


def score_features(feats: StaticFeatures) -> ScoreResult:
    score = 0.0
    reasons: list[str] = []
    factor_map: dict[str, tuple[bool, str]] = {}

    # High entropy => packed / encrypted payload.
    if feats.entropy >= 7.2:
        score += 22
        reasons.append(f"High entropy ({feats.entropy}) suggests packing/encryption")
        factor_map["Packed / encrypted payload"] = (True, "high")
    elif feats.entropy >= 6.5:
        score += 8
        reasons.append(f"Elevated entropy ({feats.entropy})")

    # Suspicious imports / API references.
    seen_labels: dict[str, str] = {}
    for api in feats.suspicious_apis:
        info = _API_FACTORS.get(api)
        if not info:
            continue
        label, weight, level = info
        score += weight
        seen_labels[label] = level
        reasons.append(f"References {api}")
    for label, level in seen_labels.items():
        factor_map[label] = (True, level)

    # Network indicators embedded statically.
    if feats.urls or feats.ips:
        score += 10
        factor_map["Contacts remote infrastructure"] = (True, "high")
        reasons.append(f"{len(feats.urls)} URL(s), {len(feats.ips)} IP(s) embedded")

    if feats.reg_keys:
        score += 5
        factor_map["Modifies the registry"] = (True, "low")

    # Tiny or text files are unlikely to be heavy malware.
    if feats.is_pe:
        score += 6
    elif "text" in feats.file_type.lower() or "script" in feats.file_type.lower():
        score = max(score - 4, 0)

    score_int = int(max(0, min(100, round(score))))
    level, label = _band(score_int)

    # Confidence reflects how much signal we had (static-only is never "very high").
    signal = len(feats.suspicious_apis) + len(feats.urls) + (1 if feats.is_pe else 0)
    confidence = "Low" if signal < 2 else ("Medium" if signal < 5 else "High")

    classification = _classify(feats, factor_map)

    # Ensure a stable set of factor rows for the UI (on/off).
    canonical = [
        "Destructive — may encrypt data",
        "Inhibits system recovery",
        "Contacts remote infrastructure",
        "Injects into processes",
        "Persists as a service",
        "Anti-analysis checks",
    ]
    factors = []
    for lbl in canonical:
        on, lvl = factor_map.get(lbl, (False, "high"))
        factors.append({"label": lbl, "on": on, "level": lvl})

    return ScoreResult(
        score=score_int,
        level=level,
        label=label,
        confidence=confidence,
        factors=factors,
        classification=classification,
        reasons=reasons[:12],
    )


def _classify(feats: StaticFeatures, factors: dict) -> str:
    if "Destructive — may encrypt data" in factors:
        return "Likely ransomware (static heuristic)"
    if "Keylogging / input capture" in factors or "Injects into processes" in factors:
        return "Likely infostealer / RAT (static heuristic)"
    if feats.urls or feats.ips:
        return "Suspicious — network-capable binary (static heuristic)"
    if feats.is_pe:
        return "Unverified PE — manual review advised"
    return "Low-risk / inert (static heuristic)"
