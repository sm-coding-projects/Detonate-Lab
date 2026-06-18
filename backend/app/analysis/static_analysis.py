"""Static analysis of a sample file.

Everything here is *safe*: we hash, measure, sniff magic bytes, compute entropy,
and extract printable strings. We never execute the sample. PE structure parsing
(via the pure-python ``pefile``) only reads bytes; it is wrapped defensively.
"""
from __future__ import annotations

import hashlib
import math
import re
from dataclasses import dataclass, field
from pathlib import Path

# Cap how much we scan for strings (hashing still covers the whole file).
_STRING_SCAN_LIMIT = 8 * 1024 * 1024
_MIN_STRING = 5

# Magic-byte signatures -> friendly type. Order matters (most specific first).
_SIGNATURES: list[tuple[bytes, str]] = [
    (b"MZ", "PE executable (Windows)"),
    (b"\x7fELF", "ELF executable (Linux)"),
    (b"\xca\xfe\xba\xbe", "Mach-O / Java class"),
    (b"\xfe\xed\xfa\xce", "Mach-O executable (macOS)"),
    (b"\xfe\xed\xfa\xcf", "Mach-O 64-bit (macOS)"),
    (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1", "OLE compound (DOC/XLS/MSI)"),
    (b"%PDF", "PDF document"),
    (b"PK\x03\x04", "ZIP / Office / APK archive"),
    (b"Rar!\x1a\x07", "RAR archive"),
    (b"\x1f\x8b", "GZIP archive"),
    (b"#!", "Script (shebang)"),
    (b"\xef\xbb\xbf", "UTF-8 text"),
]

_SUSPICIOUS_API = re.compile(
    rb"(VirtualAlloc|VirtualProtect|WriteProcessMemory|CreateRemoteThread|"
    rb"LoadLibrary|GetProcAddress|WinExec|ShellExecute|URLDownloadToFile|"
    rb"CryptEncrypt|RegSetValue|CreateService|SetWindowsHookEx|"
    rb"NtUnmapViewOfSection|IsDebuggerPresent|vssadmin|wbadmin|bcdedit|powershell)",
    re.IGNORECASE,
)
_URL_RE = re.compile(rb"https?://[\w\-\.:/%#\?&=]{4,}")
_IP_RE = re.compile(rb"\b(?:\d{1,3}\.){3}\d{1,3}\b")
_REGKEY_RE = re.compile(rb"(HKLM|HKCU|HKEY_[A-Z_]+)\\[\w\\\-]+", re.IGNORECASE)


@dataclass
class StaticFeatures:
    size: int
    sha256: str
    md5: str
    file_type: str
    entropy: float
    is_pe: bool = False
    pe_sections: int = 0
    pe_imports: list[str] = field(default_factory=list)
    suspicious_apis: list[str] = field(default_factory=list)
    urls: list[str] = field(default_factory=list)
    ips: list[str] = field(default_factory=list)
    reg_keys: list[str] = field(default_factory=list)
    string_count: int = 0

    @property
    def size_human(self) -> str:
        return _human_size(self.size)


def _human_size(n: int) -> str:
    if n < 1024:
        return f"{n} B"
    for unit in ("KB", "MB", "GB", "TB"):
        n /= 1024.0
        if n < 1024 or unit == "TB":
            return f"{n:.1f} {unit}"
    return f"{n:.1f} TB"


def _shannon_entropy(data: bytes) -> float:
    if not data:
        return 0.0
    counts = [0] * 256
    for b in data:
        counts[b] += 1
    length = len(data)
    entropy = 0.0
    for c in counts:
        if c:
            p = c / length
            entropy -= p * math.log2(p)
    return round(entropy, 2)


def _detect_type(head: bytes, name: str) -> str:
    for sig, label in _SIGNATURES:
        if head.startswith(sig):
            return label
    # Heuristic: mostly-printable -> text
    sample = head[:512]
    if sample and sum(32 <= b < 127 or b in (9, 10, 13) for b in sample) / len(sample) > 0.9:
        return "Plain text / script"
    ext = Path(name).suffix.lower().lstrip(".")
    return f"Unknown binary ({ext})" if ext else "Unknown binary"


def _dedup(seq: list[str], limit: int) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for s in seq:
        if s not in seen:
            seen.add(s)
            out.append(s)
        if len(out) >= limit:
            break
    return out


def analyze_file(path: str | Path) -> StaticFeatures:
    path = Path(path)
    sha = hashlib.sha256()
    md5 = hashlib.md5()  # noqa: S324 - identification only, not security
    size = 0
    head = b""
    scan_buf = bytearray()

    with path.open("rb") as fh:
        while True:
            chunk = fh.read(1024 * 1024)
            if not chunk:
                break
            if not head:
                head = chunk[:64]
            sha.update(chunk)
            md5.update(chunk)
            size += len(chunk)
            if len(scan_buf) < _STRING_SCAN_LIMIT:
                scan_buf.extend(chunk[: _STRING_SCAN_LIMIT - len(scan_buf)])

    scan = bytes(scan_buf)
    entropy = _shannon_entropy(scan[: 1024 * 1024])
    strings = re.findall(rb"[\x20-\x7e]{%d,}" % _MIN_STRING, scan)

    feats = StaticFeatures(
        size=size,
        sha256=sha.hexdigest(),
        md5=md5.hexdigest(),
        file_type=_detect_type(head, path.name),
        entropy=entropy,
        string_count=len(strings),
        urls=_dedup([m.decode("latin-1") for m in _URL_RE.findall(scan)], 25),
        ips=_dedup([m.decode("latin-1") for m in _IP_RE.findall(scan)], 25),
        reg_keys=_dedup([m.decode("latin-1") for m in _REGKEY_RE.findall(scan)], 25),
        suspicious_apis=_dedup(
            sorted({m.decode("latin-1") for m in _SUSPICIOUS_API.findall(scan)}), 30
        ),
    )

    if head.startswith(b"MZ"):
        feats.is_pe = True
        _enrich_pe(path, feats)

    return feats


def _enrich_pe(path: Path, feats: StaticFeatures) -> None:
    try:
        import pefile  # type: ignore
    except Exception:
        return
    try:
        pe = pefile.PE(str(path), fast_load=True)
        pe.parse_data_directories(
            directories=[pefile.DIRECTORY_ENTRY["IMAGE_DIRECTORY_ENTRY_IMPORT"]]
        )
        feats.pe_sections = len(pe.sections)
        imports: list[str] = []
        for entry in getattr(pe, "DIRECTORY_ENTRY_IMPORT", []) or []:
            for imp in entry.imports:
                if imp.name:
                    imports.append(imp.name.decode("latin-1", "ignore"))
        feats.pe_imports = _dedup(imports, 60)
        pe.close()
    except Exception:
        # Malformed / packed PE — non-fatal for analysis.
        return
