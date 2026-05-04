#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import shutil
import unicodedata
from collections.abc import Iterable
from pathlib import Path

from deploy_asset_paths import build_asset_deploy_map, should_skip_asset


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = Path.home() / "Downloads" / "webglobe"
R2_UPLOAD_LIST_PATH = ROOT / "tools" / "r2-upload-paths.txt"
TEXT_SUFFIXES = {".html", ".css", ".js", ".json", ".txt", ".xml", ".svg"}
SCAN_SUFFIXES = TEXT_SUFFIXES | {".md"}
R2_URL_PATTERN = re.compile(r"https://[^\"'\s)]+\.r2\.dev")
ABSOLUTE_URL_PATTERN = re.compile(r"https?://[^\"'\s<>()]+")
UNUSED_ASSET_SUFFIXES = {".zip"}
UNUSED_RUNTIME_PATHS = {
    "data/external-documents.json",
    "data/external-media.json",
    "data/projects-old.json",
}
UNUSED_ASSET_PATHS = {
    "assets/node_modules",
    "assets/README_works_vybrani_fianl.md",
    "assets/works_vybrani_fianl.json",
}


def load_r2_paths() -> set[str]:
    if not R2_UPLOAD_LIST_PATH.exists():
        return set()
    return {
        line.strip()
        for line in R2_UPLOAD_LIST_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    }


def iter_copy_sources(root: Path) -> Iterable[Path]:
    yield from sorted(root.glob("*.html"))
    for name in ("css", "js", "data", "assets"):
        path = root / name
        if path.exists():
            yield path


def should_skip_relative_path(relative: str, excluded_paths: set[str]) -> bool:
    return any(relative == excluded or relative.startswith(f"{excluded}/") for excluded in excluded_paths)


def copy_tree(source: Path, destination: Path, excluded_paths: set[str], root: Path) -> tuple[int, int]:
    copied_files = 0
    skipped_files = 0

    for item in sorted(source.rglob("*")):
        if item.name == ".DS_Store":
            continue
        relative = item.relative_to(root).as_posix()
        if should_skip_relative_path(relative, excluded_paths):
            skipped_files += 1
            continue
        if item.is_dir():
            (destination / item.relative_to(source)).mkdir(parents=True, exist_ok=True)
            continue
        target = destination / item.relative_to(source)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(item, target)
        copied_files += 1

    return copied_files, skipped_files


def copy_assets_with_mapping(
    output_dir: Path,
    excluded_paths: set[str],
    deploy_path_map: dict[str, str],
) -> tuple[int, int]:
    copied_files = 0
    skipped_files = 0
    assets_root = ROOT / "assets"

    if not assets_root.exists():
        return copied_files, skipped_files

    for source_path in sorted(assets_root.rglob("*"), key=lambda item: item.as_posix()):
        if should_skip_asset(source_path):
            continue
        if source_path.suffix.lower() in UNUSED_ASSET_SUFFIXES:
            skipped_files += 1
            continue
        raw_relative = source_path.relative_to(ROOT).as_posix()
        if should_skip_relative_path(raw_relative, excluded_paths):
            skipped_files += 1
            continue

        safe_relative = deploy_path_map.get(raw_relative, raw_relative)
        target = output_dir / safe_relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_path, target)
        copied_files += 1

    return copied_files, skipped_files


def copy_sources(output_dir: Path, excluded_paths: set[str], deploy_path_map: dict[str, str]) -> dict[str, int]:
    copied_files = 0
    skipped_files = 0

    for source in iter_copy_sources(ROOT):
        destination = output_dir / source.name
        if source.is_dir():
            if source.name == "assets":
                tree_copied, tree_skipped = copy_assets_with_mapping(output_dir, excluded_paths, deploy_path_map)
                copied_files += tree_copied
                skipped_files += tree_skipped
                continue
            tree_copied, tree_skipped = copy_tree(source, destination, excluded_paths, ROOT)
            copied_files += tree_copied
            skipped_files += tree_skipped
            continue
        relative = source.relative_to(ROOT).as_posix()
        if relative in excluded_paths or source.name == ".DS_Store":
            skipped_files += 1
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        copied_files += 1

    return {
        "copiedFiles": copied_files,
        "skippedFiles": skipped_files,
    }


def iter_text_files(root: Path) -> Iterable[Path]:
    for path in sorted(root.rglob("*")):
        if path.is_file() and path.suffix.lower() in TEXT_SUFFIXES:
            yield path


def protect_absolute_urls(text: str) -> tuple[str, dict[str, str]]:
    replacements: dict[str, str] = {}

    def replacer(match: re.Match[str]) -> str:
        key = f"__ABSOLUTE_URL_{len(replacements)}__"
        replacements[key] = match.group(0)
        return key

    protected = ABSOLUTE_URL_PATTERN.sub(replacer, text)
    return protected, replacements


def restore_absolute_urls(text: str, replacements: dict[str, str]) -> str:
    restored = text
    for key, value in replacements.items():
        restored = restored.replace(key, value)
    return restored


def path_text_variants(path: str) -> list[str]:
    variants: list[str] = []
    for variant in (path, unicodedata.normalize("NFC", path), unicodedata.normalize("NFD", path)):
        if variant not in variants:
            variants.append(variant)
    return variants


def detect_media_base() -> str:
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in SCAN_SUFFIXES:
            continue
        if path.name == ".DS_Store":
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        match = R2_URL_PATTERN.search(text)
        if match:
            return match.group(0).rstrip("/")
    return ""


def rewrite_asset_references(
    output_dir: Path,
    deploy_path_map: dict[str, str],
    excluded_paths: set[str],
    media_base: str,
) -> int:
    rewritten_files = 0
    base = media_base.rstrip("/")

    for path in iter_text_files(output_dir):
        original = path.read_text(encoding="utf-8")
        updated = original

        for raw_path, safe_path in sorted(deploy_path_map.items(), key=lambda item: len(item[0]), reverse=True):
            raw_variants = path_text_variants(raw_path)
            if any(variant in excluded_paths for variant in raw_variants):
                if base:
                    for variant in raw_variants:
                        updated = updated.replace(f"{base}/{variant}", f"{base}/{safe_path}")
                        updated = updated.replace(variant, f"{base}/{safe_path}")
                continue
            for variant in raw_variants:
                updated = updated.replace(variant, safe_path)

        if updated != original:
            path.write_text(updated, encoding="utf-8")
            rewritten_files += 1

    return rewritten_files


def find_unresolved_references(output_dir: Path, excluded_paths: set[str]) -> list[dict[str, object]]:
    issues: list[dict[str, object]] = []
    for path in iter_text_files(output_dir):
        text = path.read_text(encoding="utf-8")
        protected_text, _ = protect_absolute_urls(text)
        matches = [
            relative
            for relative in excluded_paths
            if any(variant in protected_text for variant in path_text_variants(relative))
        ]
        if matches:
            issues.append(
                {
                    "file": path.relative_to(output_dir).as_posix(),
                    "references": sorted(matches),
                }
            )
    return issues


def write_build_report(
    output_dir: Path,
    summary: dict[str, object],
) -> None:
    report_path = output_dir / "webglobe-build-report.json"
    report_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Vytvori FTP-ready export pro Webglobe bez git-only souborů a bez assetů určených pro R2."
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT_DIR),
        help="Cílová složka exportu (default: ~/Downloads/webglobe).",
    )
    parser.add_argument(
        "--media-base",
        default="",
        help="Veřejná base URL pro assety na R2; pokud chybí, zkusí se autodetekce z projektu.",
    )
    args = parser.parse_args()

    output_dir = Path(args.output).expanduser()
    if not output_dir.is_absolute():
        output_dir = (ROOT / output_dir).resolve()

    excluded_paths = load_r2_paths()
    deploy_path_map = build_asset_deploy_map()
    skipped_copy_paths = excluded_paths | UNUSED_RUNTIME_PATHS | UNUSED_ASSET_PATHS
    media_base = args.media_base.strip() or detect_media_base()

    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    copy_summary = copy_sources(output_dir, skipped_copy_paths, deploy_path_map)
    rewritten_files = rewrite_asset_references(output_dir, deploy_path_map, excluded_paths, media_base)
    unresolved = find_unresolved_references(output_dir, excluded_paths)

    summary: dict[str, object] = {
        **copy_summary,
        "outputDir": output_dir.relative_to(ROOT).as_posix() if output_dir.is_relative_to(ROOT) else str(output_dir),
        "excludedR2Assets": len(excluded_paths),
        "excludedUnusedRuntimeFiles": len(UNUSED_RUNTIME_PATHS),
        "excludedUnusedAssetEntries": len(UNUSED_ASSET_PATHS),
        "detectedMediaBase": media_base,
        "safeAssetMappings": len(deploy_path_map),
        "rewrittenFiles": rewritten_files,
        "unresolvedReferenceFiles": len(unresolved),
        "unresolvedReferences": unresolved,
    }
    write_build_report(output_dir, summary)

    if unresolved:
        raise SystemExit(json.dumps(summary, ensure_ascii=False, indent=2))

    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
