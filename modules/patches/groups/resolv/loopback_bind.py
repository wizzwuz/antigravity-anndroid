"""
loopback_bind.py - Retargets core listener and OAuth callback bind addresses:
1. Core HTTPS server: localhost (9 bytes) -> 127.0.0.1 (9 bytes)
2. OAuth listener: localhost:0 (11 bytes) -> 127.0.0.1:0 (11 bytes)
Note: OAuth callback URL (http://localhost:%d/auth/callback) is kept untouched
so Google OAuth token exchange redirect_uri matches authorized client registration.
"""
from typing import Tuple, Dict, Any, List, Union

PAIRS = [
    (b"GEMINI.mdAGENTS.mdlocalhostPageToken", b"GEMINI.mdAGENTS.md127.0.0.1PageToken"),
    (b"listPluginslocalhost:0", b"listPlugins127.0.0.1:0")
]
EXPECTED_COUNT = len(PAIRS)

def scan(data: Union[bytes, bytearray, memoryview]) -> Tuple[List[int], List[int]]:
    clean = []
    repl = []
    for target, replacement in PAIRS:
        pos = data.find(target)
        if pos >= 0:
            clean.append(pos)
        pos_r = data.find(replacement)
        if pos_r >= 0:
            repl.append(pos_r)
    return clean, repl

def apply(data: bytearray, verify: bool = False, dry_run: bool = False, allow_missing: bool = False) -> Tuple[bool, Dict[str, Any]]:
    clean, repl = scan(data)
    total = len(clean) + len(repl)

    info = {
        "name": "loopback_bind",
        "expected": EXPECTED_COUNT,
        "clean_count": len(clean),
        "replacement_count": len(repl),
        "clean_offsets": [hex(x) for x in clean],
        "replacement_offsets": [hex(x) for x in repl]
    }

    if total == 0:
        if allow_missing:
            info["status"] = "skipped_missing"
            return True, info
        info["status"] = "missing_signature"
        return False, info

    if total != EXPECTED_COUNT:
        info["status"] = f"unexpected_count_{total}"
        return False, info

    if verify:
        ok = (len(clean) == 0 and len(repl) == EXPECTED_COUNT)
        info["status"] = "verified" if ok else "unverified"
        return ok, info

    if len(clean) == 0:
        info["status"] = "already_patched"
        return True, info

    if not dry_run:
        for target, replacement in PAIRS:
            pos = data.find(target)
            if pos >= 0:
                data[pos:pos + len(replacement)] = replacement
        info["status"] = "patched"
    else:
        info["status"] = "dry_run"

    return True, info
