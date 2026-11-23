"""
hosts_redirect.py - Relative hosts file path patch: /etc/hosts -> etc//hosts (length 10 in-place).
Redirects Go net package /etc/hosts to relative etc//hosts so that resolution
of localhost succeeds without requiring root or hitting public DNS.
"""
from typing import Tuple, Dict, Any, List, Union

TARGET = b"/etc/hosts"
REPLACEMENT = b"etc//hosts"
EXPECTED_COUNT = 2

def scan(data: Union[bytes, bytearray, memoryview]) -> Tuple[List[int], List[int]]:
    clean = []
    repl = []
    pos = 0
    while True:
        pos = data.find(TARGET, pos)
        if pos < 0:
            break
        if b"netGo" in data[pos:pos + 35]:
            clean.append(pos)
        pos += len(TARGET)

    pos = 0
    while True:
        pos = data.find(REPLACEMENT, pos)
        if pos < 0:
            break
        if b"netGo" in data[pos:pos + 35]:
            repl.append(pos)
        pos += len(REPLACEMENT)

    return clean, repl

def apply(data: bytearray, verify: bool = False, dry_run: bool = False, allow_missing: bool = False) -> Tuple[bool, Dict[str, Any]]:
    clean, repl = scan(data)
    total = len(clean) + len(repl)

    info = {
        "name": "hosts_redirect",
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
        for pos in clean:
            data[pos:pos + len(REPLACEMENT)] = REPLACEMENT
        info["status"] = "patched"
    else:
        info["status"] = "dry_run"

    return True, info
