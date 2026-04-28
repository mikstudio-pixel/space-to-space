from __future__ import annotations

import hashlib
import re
import unicodedata
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSETS_ROOT = ROOT / "assets"
IGNORED_DIRS = {"node_modules"}
IGNORED_FILES = {
    ".DS_Store",
    "README_works_vybrani_fianl.md",
    "works_vybrani_fianl.json",
}


def should_skip_asset(file_path: Path) -> bool:
    if not file_path.is_file() or file_path.name.startswith("._") or file_path.name in IGNORED_FILES:
        return True
    rel_path = file_path.relative_to(ASSETS_ROOT)
    return any(part in IGNORED_DIRS for part in rel_path.parts)


def _ascii_fold(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def _slugify(value: str) -> str:
    folded = _ascii_fold(value)
    compact = re.sub(r"[^A-Za-z0-9]+", "-", folded).strip("-").lower()
    return compact or "item"


def safe_repo_path_for_asset(repo_relative_path: str | Path) -> str:
    path = Path(repo_relative_path)
    parts = list(path.parts)
    if not parts:
        return ""

    safe_parts: list[str] = []
    for index, part in enumerate(parts):
        if index == 0:
            safe_parts.append(part)
            continue
        if index == len(parts) - 1:
            suffix = "".join(Path(part).suffixes).lower()
            stem = part[: -len(suffix)] if suffix else part
            safe_stem = _slugify(stem)
            safe_parts.append(f"{safe_stem}{suffix}")
            continue
        safe_parts.append(_slugify(part))
    return Path(*safe_parts).as_posix()


def build_asset_deploy_map() -> dict[str, str]:
    mapping: dict[str, str] = {}
    reverse: dict[str, str] = {}

    if not ASSETS_ROOT.exists():
        return mapping

    for file_path in sorted(ASSETS_ROOT.rglob("*"), key=lambda item: item.as_posix()):
        if should_skip_asset(file_path):
            continue

        raw_repo_path = file_path.relative_to(ROOT).as_posix()
        safe_repo_path = safe_repo_path_for_asset(raw_repo_path)

        if safe_repo_path in reverse and reverse[safe_repo_path] != raw_repo_path:
            safe_path = Path(safe_repo_path)
            suffix = "".join(safe_path.suffixes)
            stem = safe_path.name[: -len(suffix)] if suffix else safe_path.name
            digest = hashlib.sha1(raw_repo_path.encode("utf-8")).hexdigest()[:8]
            safe_repo_path = safe_path.with_name(f"{stem}-{digest}{suffix}").as_posix()

        mapping[raw_repo_path] = safe_repo_path
        reverse[safe_repo_path] = raw_repo_path

    return mapping
