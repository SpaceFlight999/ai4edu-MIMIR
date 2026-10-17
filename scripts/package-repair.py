#!/usr/bin/env python3
"""Build or validate the private-data-free 0.12.8 source and Windows packages.

Run after install-growth, tests, runtime checks, and the final repair report:
  python scripts/package-repair.py
  python scripts/package-repair.py --source-only
  python scripts/package-repair.py --validate-only

No build, runtime repair, credential loading, or learner-data reading occurs here.
Existing deliveries are never overwritten. ZIP64 and the Python standard library
are sufficient; no additional dependency is required.
"""

from __future__ import annotations

import argparse
from datetime import datetime
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import zipfile
import zlib


VERSION = "0.12.8"
ROOT = Path(__file__).resolve().parents[1]
ROOT_FILES = (
    "README.md", "HANDOFF.md", "package.json", ".gitignore",
    "Start MIMIR.cmd", "Install MIMIR.cmd",
)
TREES = {
    "growth": {".mjs", ".js", ".css", ".html", ".json", ".yml"},
    "scripts": {".mjs", ".ps1", ".py"},
    "docs": {".md"},
    "mimir-wordmark": {".mjs", ".json", ".md", ".png", ".svg"},
}
REQUIRED_REPORTS = (
    "growth-overlay.json", "runtime-verification.json",
    "runtime-portable-verification-20261010.json",
    "unit-tests-0.12.8.json", "installed-growth-check-0.12.8.json",
    "deepseek-live-20261010.json", "live-growth-20261010.json",
    "live-native-20261010.json", "dsh-agent-smoke-0.12.8.json",
    "delivery-preservation-20261010.json", "user-loop-20261010.json",
    "document-smoke.json",
)
OPTIONAL_REPORTS = (
    "live-growth-first-20261010.json",
    "live-growth-before-evidence-20261010.json",
    "live-native-first-20261010.json",
    "live-native-quality-20261010.json",
    "live-research-20261010.json",
    "runtime-original-baseline-20261010.json",
    "growth-ai-local-regression-20261010.json",
    "live-native-diagnostic-attempts-20261010.json",
    "atomic-lock-release-20261010.json",
    "paper-long-smoke-20261010.json",
    "research-chat-fixture-20261010.json",
)
MANIFEST_PATH = "artifacts/package-manifest.json"
REPAIR_REPORT = "docs/repair-validation-2026-10-10.md"
PRIVATE_PARTS = {
    ".git", ".test-data", "data", "browser", "browsers", "browser-profile",
    "profiles", "__pycache__", ".pytest_cache", ".cache", "cache",
}
PRIVATE_NAME = re.compile(
    r"(?:^|[-_.])(?:private|secret|credential|credentials)(?:[-_.]|$)|"
    r"^(?:\.env(?:\..*)?|models\.json|instance\.json|cordis\.yml|"
    r"cookies(?:\..*)?|login data|local state|history|.*\.(?:dpapi|pem|key|"
    r"sqlite|sqlite3|db|log|bak|tmp|zip|wal|shm))$", re.I,
)
SECRET_BYTES = re.compile(
    # Hyphenated sklearn CSS names also start with sk-. API-key payloads use
    # a long token body; optional service/project prefixes are handled first.
    rb"\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_]{24,}\b|"
    rb"-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/=\r\n]{64,}|"
    rb"\bBearer [A-Za-z0-9._-]{24,}|"
    rb"[?&]token=[A-Za-z0-9_-]{24,}"
)
WINDOWS_RESERVED = re.compile(r"^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)", re.I)
CHUNK_SIZE = 1024 * 1024
RUNTIME_TEST_PREFIXES = (".mimir-title-policy-",)


def fail(message: str) -> None:
    raise ValueError(message)


def safe_name(name: str) -> str:
    """Reject traversal, ADS, Windows aliases, and nonportable ZIP names."""
    if not name or "\\" in name or name.startswith("/"):
        fail(f"Unsafe package path: {name!r}")
    parts = name.split("/")
    if any(part in {"", ".", ".."} or part.endswith((".", " ")) or
           re.search(r'[<>:"|?*\x00-\x1f]', part) or WINDOWS_RESERVED.match(part)
           for part in parts):
        fail(f"Unsafe package path: {name!r}")
    return name


def source_allowed(name: str) -> bool:
    path = PurePosixPath(safe_name(name))
    # Public repair explanation; still scanned for secret bytes like every file.
    if name == "docs/windows-credential-lock-repair-2026-10-10.md":
        return True
    if any(part.lower() in PRIVATE_PARTS or PRIVATE_NAME.search(part) for part in path.parts):
        return False
    if name in ROOT_FILES:
        return True
    if name == MANIFEST_PATH:
        return True
    if path.parts[0] == "artifacts":
        return len(path.parts) == 2 and path.name in REQUIRED_REPORTS + OPTIONAL_REPORTS
    return len(path.parts) > 1 and path.parts[0] in TREES and path.suffix.lower() in TREES[path.parts[0]]


def checked_file(root: Path, name: str) -> Path:
    safe_name(name)
    path = root.joinpath(*name.split("/"))
    # Checking every ancestor also excludes directory junctions/reparse points.
    for candidate in (path, *path.parents):
        if candidate == root:
            break
        if candidate.is_symlink() or candidate.is_junction():
            fail(f"Linked file or directory cannot be packaged: {name}")
    if not path.is_file() or not path.resolve().is_relative_to(root.resolve()):
        fail(f"Missing or outside-workspace package file: {name}")
    return path


def read_json(path: Path) -> dict:
    result = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(result, dict):
        fail(f"Expected JSON object: {path.name}")
    return result


def reject_report_credentials(value: object, name: str) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if str(key).lower() in {"apikey", "api_key", "authorization", "accesstoken",
                                   "access_token", "refreshtoken", "refresh_token", "controltoken"}:
                if isinstance(child, str) and child.strip() not in {"", "[redacted]", "REDACTED"}:
                    fail(f"Credential value in selected report: {name}")
            reject_report_credentials(child, name)
    elif isinstance(value, list):
        for child in value:
            reject_report_credentials(child, name)


def runtime_names(inventory: dict, overlay: dict) -> set[str]:
    checksums = inventory.get("checksums")
    files = overlay.get("files")
    if not isinstance(checksums, list) or not isinstance(files, dict):
        fail("Runtime inventory or installed overlay is malformed.")
    names = {safe_name(record["path"]) for record in checksums}
    names.update(safe_name(name) for name in files)
    names.add("system/inventory.json")
    # Runtime library datasets and __pycache__ are public baseline assets. Only
    # paths authorized by the native inventory or installed overlay are used.
    if any(name.split("/")[0] not in {"system", "Mimir.exe", "使用说明.txt"} for name in names):
        fail("Runtime inventory contains an unexpected top-level path.")
    if any(PurePosixPath(name).name.startswith(RUNTIME_TEST_PREFIXES) for name in names):
        fail("Runtime inventory cannot authorize temporary title-policy test modules.")
    return names


def collect_files(root: Path, kind: str) -> dict[str, Path]:
    package = read_json(checked_file(root, "package.json"))
    growth = read_json(checked_file(root, "growth/package.json"))
    overlay = read_json(checked_file(root, "artifacts/growth-overlay.json"))
    if any(record.get("version") != VERSION for record in (package, growth, overlay)):
        fail("Workspace, growth, and installed overlay must all be version 0.12.8.")
    checked_file(root, REPAIR_REPORT)
    result = {name: checked_file(root, name) for name in ROOT_FILES}
    for directory in TREES:
        folder = root / directory
        if not folder.is_dir():
            fail(f"Required source directory missing: {directory}")
        for path in sorted(folder.rglob("*")):
            if not path.is_file():
                continue
            name = path.relative_to(root).as_posix()
            if source_allowed(name):
                result[name] = checked_file(root, name)
            elif directory in {"growth", "scripts"} and path.suffix.lower() != ".pyc":
                fail(f"Unexpected file in source directory: {name}")
    for name in REQUIRED_REPORTS + OPTIONAL_REPORTS:
        relative = "artifacts/" + name
        if name in OPTIONAL_REPORTS and not (root / relative).exists():
            continue
        path = checked_file(root, relative)
        report = read_json(path)
        reject_report_credentials(report, relative)
        result[relative] = path
    for name in ("runtime-verification.json", "runtime-portable-verification-20261010.json"):
        report = read_json(result["artifacts/" + name])
        if (report.get("failures") != [] or report.get("overlayVersion") != VERSION
                or report.get("overlayChecked") != len(overlay["files"])):
            fail(f"Final runtime verification has failures or another version: {name}")
        if datetime.fromisoformat(report["checkedAt"]) < datetime.fromisoformat(overlay["installedAt"]):
            fail(f"Runtime verification predates the final installation: {name}")
    preservation = read_json(result["artifacts/delivery-preservation-20261010.json"])
    if preservation.get("frontendUnchanged") is not True or preservation.get("partnerDataUnchanged") is not True:
        fail("Frontend or partner-data preservation was not confirmed.")
    for name in ("unit-tests-0.12.8.json", "installed-growth-check-0.12.8.json"):
        report = read_json(result["artifacts/" + name])
        if report.get("passed") is not True or report.get("growthVersion") != VERSION:
            fail(f"Required final check did not pass: {name}")
        if name.startswith("installed-") and report.get("checked") != len(overlay["files"]):
            fail("Installed-growth check is stale relative to the final overlay.")
        if datetime.fromisoformat(report["at"]) < datetime.fromisoformat(overlay["installedAt"]):
            fail(f"Required final check predates the final installation: {name}")
    # The editable source and runnable overlay must describe the same revision.
    # Read only literal copy pairs, never evaluate the installer.
    pairs = re.findall(r"\[\s*'(growth/[^']+)'\s*,\s*'(system/[^']+)'\s*\]",
                       checked_file(root, "scripts/install-growth.mjs").read_text("utf-8"))
    for destination in overlay["files"]:
        prefix = "system/engine/node_modules/@mimir/growth-layer/"
        paper_prefix = "system/engine/node_modules/@mimir/dsh-workbench-bundle/paper/viewer/"
        if destination.startswith(prefix):
            pairs.append(("growth/" + destination[len(prefix):], destination))
        elif destination.startswith(paper_prefix):
            pairs.append(("growth/overrides/paper/viewer/" + destination[len(paper_prefix):], destination))
    for source, destination in pairs:
        expected = overlay["files"].get(destination)
        if not expected:
            fail(f"Installer source absent from final overlay: {source}")
        with checked_file(root, source).open("rb") as stream:
            actual = digest_stream(stream, source)
        if actual["bytes"] != expected["bytes"] or actual["sha256"] != expected["sha256"]:
            fail(f"Installed runtime is stale relative to source: {source}")
    if kind == "Windows-x64":
        runtime = root / "runtime"
        inventory = read_json(checked_file(root, "runtime/system/inventory.json"))
        known = runtime_names(inventory, overlay)
        actual = {path.relative_to(runtime).as_posix() for path in runtime.rglob("*")
                  if path.is_file() and not path.name.startswith(RUNTIME_TEST_PREFIXES)}
        if actual != known:
            fail(f"Runtime differs from inventory/overlay: {len(actual - known)} unexpected, {len(known - actual)} missing files.")
        result.update({"runtime/" + name: checked_file(root, "runtime/" + name) for name in sorted(known)})
    folded = [name.casefold() for name in result]
    if len(folded) != len(set(folded)):
        fail("Case-insensitive package path collision.")
    return dict(sorted(result.items()))


def checked_chunks(stream, name: str):
    tail = b""
    while chunk := stream.read(CHUNK_SIZE):
        sample = tail + chunk
        if any(marker in sample for marker in (b"sk-", b"-----BEGIN", b"Bearer ", b"token=")) and SECRET_BYTES.search(sample):
            fail(f"Possible secret in package payload: {name}; value intentionally hidden.")
        tail = chunk[-256:]
        yield chunk


def digest_stream(stream, name: str) -> dict:
    digest, size, crc = hashlib.sha256(), 0, 0
    for chunk in checked_chunks(stream, name):
        digest.update(chunk)
        size += len(chunk)
        crc = zlib.crc32(chunk, crc)
    return {"bytes": size, "sha256": digest.hexdigest(), "crc32": f"{crc & 0xffffffff:08x}"}


def validate_archive(path: Path, kind: str, verify_sidecars: bool = True) -> dict:
    prefix = f"MIMIR-{VERSION}-{kind}/"
    with zipfile.ZipFile(path) as archive:
        infos = archive.infolist()
        names = []
        for info in infos:
            safe_name(info.filename)
            if info.is_dir() or not info.filename.startswith(prefix) or info.flag_bits & 1 or stat.S_ISLNK(info.external_attr >> 16):
                fail(f"Unexpected, encrypted, or linked ZIP entry: {info.filename}")
            names.append(info.filename[len(prefix):])
        if len(names) != len(set(name.casefold() for name in names)):
            fail("Duplicate or case-colliding ZIP entries.")
        manifest = json.loads(archive.read(prefix + MANIFEST_PATH))
        if manifest.get("version") != VERSION or manifest.get("kind") != kind:
            fail("Package manifest version or kind is invalid.")
        records = manifest.get("files")
        if not isinstance(records, dict) or set(names) != set(records) | {MANIFEST_PATH}:
            fail("ZIP payload differs from the package manifest.")
        authorized_runtime = set()
        if kind == "Windows-x64":
            inventory = json.loads(archive.read(prefix + "runtime/system/inventory.json"))
            overlay = json.loads(archive.read(prefix + "artifacts/growth-overlay.json"))
            authorized_runtime = {"runtime/" + name for name in runtime_names(inventory, overlay)}
        for info, name in zip(infos, names):
            if not source_allowed(name) and name not in authorized_runtime:
                fail(f"Unapproved package payload: {name}")
            with archive.open(info) as stream:
                actual = digest_stream(stream, name)  # ZipFile checks each CRC at EOF.
            if name != MANIFEST_PATH and actual != records[name]:
                fail(f"Package checksum differs from manifest: {name}")
            if name.startswith("artifacts/") and name != MANIFEST_PATH:
                report = json.loads(archive.read(info))
                if not isinstance(report, dict):
                    fail(f"Selected report is not a JSON object: {name}")
                reject_report_credentials(report, name)
        required = set(ROOT_FILES) | {REPAIR_REPORT} | {"artifacts/" + name for name in REQUIRED_REPORTS}
        if not required <= set(records) or not authorized_runtime <= set(records):
            fail("Package omits required source, evidence, or runtime files.")
    with path.open("rb") as stream:
        archive_hash = hashlib.file_digest(stream, "sha256").hexdigest()
    summary = {"version": VERSION, "kind": kind, "files": len(records),
               "zipEntries": len(infos), "bytes": path.stat().st_size,
               "sha256": archive_hash, "crcChecked": len(infos),
               "safePaths": True, "credentialPatternScanPassed": True}
    if verify_sidecars:
        expected_line = archive_hash + "  " + path.name
        if path.with_suffix(path.suffix + ".sha256").read_text("utf-8").strip() != expected_line:
            fail("ZIP SHA256 sidecar differs from the archive.")
        external = read_json(path.with_suffix(path.suffix + ".manifest.json"))
        if external.get("archive") != summary or external.get("package") != manifest:
            fail("External manifest differs from ZIP manifest or archive metadata.")
    return {"archive": summary, "package": manifest}


def write_package(root: Path, output: Path, kind: str) -> dict:
    files = collect_files(root, kind)
    destination = output / f"MIMIR-{VERSION}-{kind}.zip"
    partial = destination.with_suffix(".zip.partial")
    prefix = destination.stem + "/"
    overlay = read_json(root / "artifacts/growth-overlay.json")["files"]
    records = {}
    created_partial = False
    try:
        archive = zipfile.ZipFile(partial, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True)
        created_partial = True
        with archive:
            for index, (name, path) in enumerate(files.items(), 1):
                before = path.stat()
                info = zipfile.ZipInfo(prefix + name, date_time=(2026, 10, 10, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = (stat.S_IFREG | 0o644) << 16
                digest, size, crc = hashlib.sha256(), 0, 0
                with path.open("rb") as source, archive.open(info, "w", force_zip64=True) as target:
                    for chunk in checked_chunks(source, name):
                        target.write(chunk)
                        digest.update(chunk)
                        size += len(chunk)
                        crc = zlib.crc32(chunk, crc)
                after = path.stat()
                if before.st_size != after.st_size or before.st_mtime_ns != after.st_mtime_ns or size != after.st_size:
                    fail(f"Package input changed during reading: {name}; rerun after work stops.")
                records[name] = {"bytes": size, "sha256": digest.hexdigest(), "crc32": f"{crc & 0xffffffff:08x}"}
                expected = overlay.get(name.removeprefix("runtime/")) if name.startswith("runtime/") else None
                if expected and (size != expected["bytes"] or digest.hexdigest() != expected["sha256"]):
                    fail(f"Runtime overlay changed after its final verification: {name}")
                if index % 10000 == 0:
                    print(f"{kind}: packed {index}/{len(files)} files", flush=True)
            manifest = {
                "version": VERSION, "kind": kind, "releaseDate": "2026-10-10",
                "model": {"provider": "deepseek-official", "id": "deepseek-flash",
                          "endpoint": "https://api.deepseek.com/anthropic"},
                "dataPolicy": "No learner data, credentials, browser profiles, or .git; Start creates data/student-1 on first launch.",
                "firstLaunch": "Windows package: extract, run Start MIMIR.cmd, configure your own official Key on the new device.",
                "sourcePackage": "Source package needs the separately delivered Windows runtime; install defaults preserve the bundled frontend.",
                "selectedReports": [name for name in files if name.startswith("artifacts/")],
                "files": records,
            }
            manifest_info = zipfile.ZipInfo(prefix + MANIFEST_PATH, date_time=(2026, 10, 10, 0, 0, 0))
            manifest_info.compress_type = zipfile.ZIP_DEFLATED
            manifest_info.external_attr = (stat.S_IFREG | 0o644) << 16
            archive.writestr(manifest_info, json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        result = validate_archive(partial, kind, verify_sidecars=False)
        partial.rename(destination)
        summary = result["archive"]
        destination.with_suffix(".zip.sha256").write_text(summary["sha256"] + "  " + destination.name + "\n", encoding="utf-8")
        destination.with_suffix(".zip.manifest.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(summary, ensure_ascii=False), flush=True)
        return summary
    finally:
        # This nonrecursive delete only removes the exact temporary file created
        # in the explicitly selected output directory, never workspace data.
        if created_partial and partial.exists():
            partial.unlink()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source-only", action="store_true", help="Build or validate only the smaller source package.")
    parser.add_argument("--validate-only", action="store_true", help="Validate existing ZIPs, manifests, SHA256 sidecars, CRCs, paths, and secret patterns without changing them.")
    parser.add_argument("--output-dir", type=Path, default=ROOT.parent / "release", help="Delivery directory (default: workspace parent/release).")
    args = parser.parse_args()
    output = args.output_dir.resolve()
    if output == ROOT or output.is_relative_to(ROOT):
        fail("Output directory must be outside the source workspace.")
    kinds = ("source",) if args.source_only else ("source", "Windows-x64")
    if args.validate_only:
        for kind in kinds:
            path = output / f"MIMIR-{VERSION}-{kind}.zip"
            print(json.dumps(validate_archive(path, kind)["archive"], ensure_ascii=False), flush=True)
        return
    output.mkdir(parents=True, exist_ok=True)
    for kind in kinds:
        destination = output / f"MIMIR-{VERSION}-{kind}.zip"
        for path in (destination, destination.with_suffix(".zip.partial"),
                     destination.with_suffix(".zip.sha256"), destination.with_suffix(".zip.manifest.json")):
            if path.exists():
                fail(f"Existing delivery will not be overwritten: {path.name}")
        collect_files(ROOT, kind)  # Preflight both packages before any ZIP is made.
    for kind in kinds:
        write_package(ROOT, output, kind)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError, zipfile.BadZipFile, json.JSONDecodeError) as error:
        print(f"Packaging stopped: {error}", file=sys.stderr)
        sys.exit(1)
