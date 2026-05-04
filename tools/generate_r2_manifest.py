#!/usr/bin/env python3
"""
Generuje seznam assetů, které jsou příliš velké pro běžné verzování v GitHubu
a proto zatím zůstávají lokálně pro budoucí upload na Cloudflare R2.

Výstupy:
  tools/r2-upload-manifest.json  — metadata + seznam velkých souborů
  tools/r2-upload-paths.txt      — relativní cesty velkých souborů
  .gitignore                     — aktualizovaný managed blok s velkými soubory
"""

from __future__ import annotations

import argparse
import json
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
GITIGNORE = ROOT / ".gitignore"
R2_MANIFEST = ROOT / "tools" / "r2-upload-manifest.json"
R2_PATHS = ROOT / "tools" / "r2-upload-paths.txt"
GITIGNORE_BEGIN = "# BEGIN managed large assets"
GITIGNORE_END = "# END managed large assets"

VIDEO_EXT = {".mp4", ".m4v", ".mov", ".webm"}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".tif", ".tiff", ".webp"}
DOCUMENT_EXT = {".pdf", ".doc", ".docx", ".odt", ".txt", ".ppt", ".pptx", ".xlsx", ".rtf"}
SUPPORTED_EXT = VIDEO_EXT | IMAGE_EXT | DOCUMENT_EXT
IGNORED_DIRS = {"node_modules"}
IGNORED_FILES = {
    ".DS_Store",
    "README_works_vybrani_fianl.md",
    "works_vybrani_fianl.json",
}


def asset_kind(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in VIDEO_EXT:
        return "video"
    if suffix in IMAGE_EXT:
        return "image"
    if suffix in DOCUMENT_EXT:
        return "document"
    return "other"


def bytes_to_human(num_bytes: int) -> str:
    if num_bytes >= 1024**3:
        return f"{num_bytes / (1024**3):.2f} GiB"
    if num_bytes >= 1024**2:
        return f"{num_bytes / (1024**2):.2f} MiB"
    if num_bytes >= 1024:
        return f"{num_bytes / 1024:.2f} KiB"
    return f"{num_bytes} B"


def collect_asset_entries() -> list[dict[str, object]]:
    entries: list[dict[str, object]] = []
    for path in sorted(ASSETS.rglob("*"), key=lambda item: str(item)):
        if not path.is_file() or path.name.startswith("._") or path.name in IGNORED_FILES:
            continue
        rel_path = path.relative_to(ASSETS)
        if any(part in IGNORED_DIRS for part in rel_path.parts):
            continue
        if path.suffix.lower() not in SUPPORTED_EXT:
            continue
        rel = path.relative_to(ROOT).as_posix()
        size = path.stat().st_size
        entries.append(
            {
                "path": rel,
                "bytes": size,
                "bytesHuman": bytes_to_human(size),
                "kind": asset_kind(path),
            }
        )
    return entries


def summarize_by_kind(entries: list[dict[str, object]]) -> dict[str, int]:
    counter = Counter(str(entry["kind"]) for entry in entries)
    return dict(sorted(counter.items()))


def gitignore_path_variants(path: str) -> list[str]:
    """Return exact and accent-tolerant ignore patterns for an asset path."""
    variants = []
    for source in (path, unicodedata.normalize("NFC", path)):
        if source not in variants:
            variants.append(source)

        wildcard = []
        previous_was_wildcard = False
        for char in source:
            if ord(char) < 128:
                wildcard.append(char)
                previous_was_wildcard = False
                continue
            if not previous_was_wildcard:
                wildcard.append("*")
            previous_was_wildcard = True
        wildcard_path = "".join(wildcard)
        if wildcard_path != source and wildcard_path not in variants:
            variants.append(wildcard_path)

    return variants


def rewrite_gitignore(ignored_paths: list[str]) -> None:
    comment_lines = [
        "# Large asset files kept local until uploaded to Cloudflare R2.",
        "# Regenerate with: python3 tools/generate_r2_manifest.py",
    ]
    ignored_patterns = []
    for path in ignored_paths:
        ignored_patterns.extend(gitignore_path_variants(path))
    block_lines = [
        *comment_lines,
        GITIGNORE_BEGIN,
        *ignored_patterns,
        GITIGNORE_END,
    ]
    existing_lines = GITIGNORE.read_text(encoding="utf-8").splitlines()
    updated_lines: list[str] = []
    inside_managed_block = False
    block_replaced = False

    for line in existing_lines:
        if line == GITIGNORE_BEGIN:
            while updated_lines[-len(comment_lines):] == comment_lines:
                del updated_lines[-len(comment_lines):]
            if not block_replaced:
                updated_lines.extend(block_lines)
                block_replaced = True
            inside_managed_block = True
            continue
        if inside_managed_block:
            if line == GITIGNORE_END:
                inside_managed_block = False
            continue
        updated_lines.append(line)

    if inside_managed_block:
        raise RuntimeError(f"Nenalezen ukončovací marker {GITIGNORE_END} v .gitignore")

    if not block_replaced:
        if updated_lines and updated_lines[-1] != "":
            updated_lines.append("")
        updated_lines.extend(block_lines)

    GITIGNORE.write_text("\n".join(updated_lines).rstrip("\n") + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--github-max-mib",
        type=int,
        default=20,
        help="Velikostní limit pro soubory verzované v GitHubu (default 20 MiB).",
    )
    args = parser.parse_args()
    github_max_bytes = max(1, args.github_max_mib) * 1024 * 1024

    all_entries = collect_asset_entries()
    github_eligible = [entry for entry in all_entries if int(entry["bytes"]) < github_max_bytes]
    r2_candidates = [entry for entry in all_entries if int(entry["bytes"]) >= github_max_bytes]
    r2_paths = [str(entry["path"]) for entry in r2_candidates]

    rewrite_gitignore(r2_paths)

    manifest = {
        "description": "Assety ponechané mimo GitHub kvůli velikosti; vhodné pro budoucí upload na Cloudflare R2.",
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "githubMaxBytes": github_max_bytes,
        "githubMaxMib": args.github_max_mib,
        "counts": {
            "scannedFiles": len(all_entries),
            "githubEligible": len(github_eligible),
            "r2Candidates": len(r2_candidates),
        },
        "bytes": {
            "githubEligible": sum(int(entry["bytes"]) for entry in github_eligible),
            "r2Candidates": sum(int(entry["bytes"]) for entry in r2_candidates),
        },
        "kinds": {
            "githubEligible": summarize_by_kind(github_eligible),
            "r2Candidates": summarize_by_kind(r2_candidates),
        },
        "files": r2_candidates,
    }
    manifest["bytesHuman"] = {
        "githubEligible": bytes_to_human(int(manifest["bytes"]["githubEligible"])),
        "r2Candidates": bytes_to_human(int(manifest["bytes"]["r2Candidates"])),
    }

    R2_MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    R2_PATHS.write_text("\n".join(r2_paths) + ("\n" if r2_paths else ""), encoding="utf-8")

    print(
        json.dumps(
            {
                "githubMaxMib": args.github_max_mib,
                "scannedFiles": len(all_entries),
                "githubEligible": len(github_eligible),
                "r2Candidates": len(r2_candidates),
                "r2BytesHuman": manifest["bytesHuman"]["r2Candidates"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
