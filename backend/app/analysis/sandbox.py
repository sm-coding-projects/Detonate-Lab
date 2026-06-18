"""Pluggable sandbox layer.

Real dynamic detonation requires an isolated, instrumented VM (e.g. CAPE/Cuckoo)
which cannot be shipped inside a portable docker-compose safely. So we define a
``Sandbox`` interface and ship two implementations:

* ``NullSandbox``  — honest empty behavioral report (connect a real sandbox).
* ``DemoSandbox``  — synthesizes a *plausible, clearly-labelled* behavioral
  report from the real static features, so the UI is populated for any upload.

To integrate a real sandbox later, implement ``Sandbox.detonate`` and select it
via ``get_sandbox``. Nothing else in the app changes.
"""
from __future__ import annotations

import random
from pathlib import Path
from typing import Protocol

from .scoring import ScoreResult
from .static_analysis import StaticFeatures

# (api substring) -> killchain stage contribution
_API_TO_STAGE = [
    ("CryptEncrypt", ("Impact", "TA0040", "critical", "Impact", "Encrypts user files.", [("T1486", "Data Encrypted for Impact", "Cryptographic routines referenced.")])),
    ("vssadmin", ("Impact", "TA0040", "critical", "Impact", "Inhibits recovery by deleting shadow copies.", [("T1490", "Inhibit System Recovery", "vssadmin reference found.")])),
    ("SetWindowsHookEx", ("Collection", "TA0009", "high", "Collect", "Captures user input.", [("T1056.001", "Keylogging", "Input hook API referenced.")])),
    ("WriteProcessMemory", ("Defense Evasion", "TA0005", "medium", "Evade", "Injects code into another process.", [("T1055", "Process Injection", "Memory-write API referenced.")])),
    ("URLDownloadToFile", ("Command and Control", "TA0011", "high", "C2", "Downloads remote payloads.", [("T1105", "Ingress Tool Transfer", "Download API referenced.")])),
    ("RegSetValue", ("Persistence", "TA0003", "medium", "Persist", "Persists via the registry.", [("T1547.001", "Registry Run Key", "Registry-write API referenced.")])),
    ("powershell", ("Execution", "TA0002", "high", "Exec", "Executes commands via PowerShell.", [("T1059.001", "PowerShell", "PowerShell reference found.")])),
]


class Sandbox(Protocol):
    name: str

    def detonate(self, path: Path, feats: StaticFeatures, score: ScoreResult, *, display: str) -> dict:
        ...


class NullSandbox:
    name = "null"

    def detonate(self, path: Path, feats: StaticFeatures, score: ScoreResult, *, display: str) -> dict:
        return {
            "killchain": [],
            "timeline": [],
            "blast": [
                {"key": "origin", "label": "Sandbox", "sub": "No behavioral engine connected", "level": "info",
                 "stats": [{"n": 0, "t": "events captured"}]},
            ],
            "network": {
                "victim": "—", "domain": "—", "proto": "—", "beacon": "—", "exfil": "—",
                "ja3": "—", "ips": [], "log": [],
            },
        }


class DemoSandbox:
    """Synthesizes a labelled heuristic behavioral report from static features."""

    name = "demo"

    def detonate(self, path: Path, feats: StaticFeatures, score: ScoreResult, *, display: str) -> dict:
        rng = random.Random(int(feats.sha256[:12], 16))
        killchain = self._killchain(feats)
        timeline = self._timeline(killchain, rng)
        blast = self._blast(feats, score, rng)
        network = self._network(feats, rng)
        return {"killchain": killchain, "timeline": timeline, "blast": blast, "network": network}

    def _killchain(self, feats: StaticFeatures) -> list[dict]:
        stages: dict[str, dict] = {}
        # Always-present front of the chain (the file was submitted & opened).
        order = ["TA0001", "TA0002", "TA0003", "TA0005", "TA0006", "TA0009", "TA0011", "TA0040"]
        stages["TA0001"] = {"tactic": "Initial Access", "id": "TA0001", "level": "medium", "short": "Access",
                            "plain": "The sample was submitted to the lab for detonation.",
                            "techniques": [{"id": "T1204.002", "name": "User Execution", "desc": "Operator-submitted sample."}]}
        stages["TA0002"] = {"tactic": "Execution", "id": "TA0002", "level": "high", "short": "Exec",
                            "plain": "The sample's entry point was loaded for analysis.",
                            "techniques": [{"id": "T1106", "name": "Native API", "desc": f"{feats.file_type}."}]}
        for api in feats.suspicious_apis:
            for needle, (tactic, taid, level, short, plain, techs) in _API_TO_STAGE:
                if needle.lower() in api.lower():
                    cur = stages.get(taid)
                    new_techs = [{"id": t[0], "name": t[1], "desc": t[2]} for t in techs]
                    if cur:
                        have = {t["id"] for t in cur["techniques"]}
                        cur["techniques"].extend(t for t in new_techs if t["id"] not in have)
                    else:
                        stages[taid] = {"tactic": tactic, "id": taid, "level": level, "short": short,
                                        "plain": plain, "techniques": new_techs}
        if feats.urls or feats.ips:
            stages.setdefault("TA0011", {"tactic": "Command and Control", "id": "TA0011", "level": "high",
                                         "short": "C2", "plain": "Network indicators embedded in the binary.",
                                         "techniques": [{"id": "T1071.001", "name": "Web Protocols",
                                                         "desc": f"{len(feats.urls)} URL(s) / {len(feats.ips)} IP(s) found."}]})
        return [stages[k] for k in order if k in stages]

    def _timeline(self, killchain: list[dict], rng: random.Random) -> list[dict]:
        events: list[dict] = []
        t = 0.0
        for stage in killchain:
            for tech in stage["techniques"]:
                events.append({"t": round(t, 1), "label": stage["tactic"],
                               "detail": f"{tech['id']} {tech['name']} — {tech['desc']}",
                               "level": stage["level"]})
                t += round(rng.uniform(0.6, 2.4), 1)
        return events

    def _blast(self, feats: StaticFeatures, score: ScoreResult, rng: random.Random) -> list[dict]:
        return [
            {"key": "origin", "label": "SANDBOX-VM", "sub": "Isolated detonation host", "level": score.level,
             "stats": [{"n": 1, "t": "host detonated"}]},
            {"key": "process", "label": "Process", "sub": "Static-derived", "level": "medium",
             "stats": [{"n": len(feats.suspicious_apis) or 1, "t": "suspicious APIs"},
                       {"n": feats.pe_sections, "t": "PE sections"}]},
            {"key": "host", "label": "Host", "sub": "Heuristic estimate", "level": score.level,
             "stats": [{"n": feats.string_count, "t": "strings extracted"},
                       {"n": len(feats.reg_keys), "t": "registry refs"}]},
            {"key": "network", "label": "Network", "sub": "Embedded indicators", "level": "high" if feats.urls or feats.ips else "low",
             "stats": [{"n": len(feats.urls), "t": "URLs"}, {"n": len(feats.ips), "t": "IP addresses"}]},
            {"key": "identity", "label": "Data", "sub": "Entropy / packing", "level": "high" if feats.entropy >= 7.2 else "low",
             "stats": [{"n": feats.entropy, "t": "Shannon entropy"}]},
            {"key": "c2", "label": "Internet / C2", "sub": "Adversary infrastructure", "level": "high" if feats.ips else "info",
             "stats": [{"n": len(feats.ips), "t": "candidate C2 IPs"}]},
        ]

    def _network(self, feats: StaticFeatures, rng: random.Random) -> dict:
        domain = "—"
        if feats.urls:
            host = feats.urls[0].split("//", 1)[-1].split("/", 1)[0]
            domain = host.replace(".", "[.]", 1) if "." in host else host
        ips = [{"ip": ip, "role": "Embedded indicator", "geo": "—"} for ip in feats.ips[:6]]
        log = [{"t": "00:00.0", "e": "Static indicators extracted (no live detonation)"}]
        for i, u in enumerate(feats.urls[:4]):
            log.append({"t": f"00:0{i}.0", "e": f"URL reference: {u[:80]}"})
        return {
            "victim": "SANDBOX-VM",
            "domain": domain,
            "proto": "Unknown (static)",
            "beacon": "—",
            "exfil": "—",
            "ja3": "—",
            "ips": ips,
            "log": log,
        }


def get_sandbox(name: str = "demo") -> Sandbox:
    return {"null": NullSandbox(), "demo": DemoSandbox()}.get(name, DemoSandbox())
