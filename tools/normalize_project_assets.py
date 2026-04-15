from __future__ import annotations

import hashlib
import json
import re
import shutil
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
ASSETS_DIR = WORKSPACE_ROOT / "assets"
OUTPUT_ROOT = ASSETS_DIR / "projects"
DATA_DIR = WORKSPACE_ROOT / "data"
MANIFEST_PATH = DATA_DIR / "projects-old.json"

LEGACY_ASSETS = {
    "ThisChairDoesNotExist.jpg",
    "From End to End .jpg",
    "VISTA.jpg",
    "Stools Shuttlecock.jpg",
    "Light and Darkness.jpg",
    "BambooWhispers.png",
    "DepoRooms.jpg",
    "mav trailer exp1.mp4",
    "mav trailer exp1.m4v",
}

MEDIA_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".tif",
    ".tiff",
    ".webp",
    ".mp4",
    ".mov",
    ".m4v",
}

DOCUMENT_EXTENSIONS = {
    ".pdf",
    ".doc",
    ".docx",
    ".odt",
    ".txt",
    ".ppt",
    ".pptx",
    ".xlsx",
    ".rtf",
}

ANNOTATION_KEYWORDS = (
    "annotation",
    "annotations",
    "anotation",
    "anotacia",
    "anotacia",
    "description",
    "descirption",
    "review",
    "brief",
    "text",
)


def normalize_text(value: str) -> str:
    cleaned = value.replace("_", " ")
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip(" .-_")


def ascii_fold(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def slugify(value: str) -> str:
    folded = ascii_fold(normalize_text(value)).lower()
    folded = re.sub(r"[^a-z0-9]+", "-", folded)
    return folded.strip("-") or "item"


def is_metadata_file(path: Path) -> bool:
    return path.name == ".DS_Store" or path.name.startswith("._")


def is_phase_segment(segment: str) -> bool:
    folded = ascii_fold(segment).lower().strip()
    return folded in {
        "pre-selection",
        "predvyber",
        "predvyber ",
        "predvyber/",
        "pre selection",
    }


def normalize_dir_segment(segment: str) -> str:
    folded = ascii_fold(segment).lower().strip()
    compact = re.sub(r"\s+", " ", folded)
    if is_phase_segment(segment):
        return "pre-selection"
    if compact in {"media", "photos", "pictures"}:
        return "media"
    if compact in {"render", "renders"}:
        return "renders"
    if compact in {"presentation", "presentations"}:
        return "presentations"
    if compact in {"additional documents", "documents", "document", "new media"}:
        return "documents"
    if any(keyword in compact for keyword in ("annotation", "anotation", "anotacia", "description", "brief", "review")):
        return "annotations"
    return slugify(segment)


def infer_school_from_loose_path(rel_path: Path) -> str | None:
    top = normalize_text(rel_path.parts[0])
    folded = ascii_fold(top).lower()
    if folded.startswith("utb "):
        return "UTB (prvy predvyber)"
    if folded.startswith("fi muni") or folded.startswith("muni"):
        return "MUNI Brno"
    return None


def categorize_file(path_parts: list[str], filename: str) -> str:
    ext = Path(filename).suffix.lower()
    haystack = " / ".join(path_parts + [filename])
    haystack_folded = ascii_fold(haystack).lower()
    if ext in MEDIA_EXTENSIONS:
        return "media"
    if any(keyword in haystack_folded for keyword in ANNOTATION_KEYWORDS):
        return "annotations"
    if ext in DOCUMENT_EXTENSIONS:
        return "documents"
    return "other"


def looks_like_institution_document(filename: str) -> bool:
    folded = ascii_fold(filename).lower()
    return any(
        token in folded
        for token in (
            "upload pre-selection",
            "upload utb pre-selection",
            "vyzva",
            "brief",
            "info",
            "department 2026",
        )
    )


def derive_project_from_filename(filename: str) -> str | None:
    stem = normalize_text(Path(filename).stem)
    lowered = ascii_fold(stem).lower()
    if looks_like_institution_document(filename):
        return None
    if "bdc-" in lowered:
        return normalize_text(stem.split("BDC-", 1)[-1])
    match = re.search(r"(?:^|[_ -])(space to space|toy design|microcosms|rainbow rift|space simulation|resonance in space|mom, i.m not playing, i.m making art|nebula|spider|darwin.s cube)$", lowered)
    if match:
        return normalize_text(match.group(1))
    return stem or None


def detect_project_metadata(school: str, relative_parts: list[str], filename: str) -> dict[str, str | None]:
    dirs = [normalize_text(part) for part in relative_parts]
    studio = None
    phase = None

    working_dirs = dirs[:]
    if working_dirs and working_dirs[0].lower().startswith("ateli"):
        studio = working_dirs.pop(0)
    elif working_dirs and "studenti" in ascii_fold(working_dirs[0]).lower():
        studio = working_dirs.pop(0)

    if working_dirs and is_phase_segment(working_dirs[0]):
        phase = "pre-selection"
        working_dirs.pop(0)

    filtered_dirs = [part for part in working_dirs if normalize_dir_segment(part) not in {"media", "annotations", "documents", "presentations", "renders"}]

    project_name = filtered_dirs[-1] if filtered_dirs else derive_project_from_filename(filename)
    if project_name is not None:
        project_name = normalize_text(project_name)
    if studio is not None:
        studio = normalize_text(studio)

    return {
        "school": normalize_text(school),
        "studio": studio,
        "phase": phase,
        "project": project_name,
    }


def build_target_path(rel_path: Path) -> tuple[str | None, Path | None]:
    parts = list(rel_path.parts)
    if not parts:
        return None, None

    top = parts[0]
    if top == "projects":
        return None, None

    if top in LEGACY_ASSETS:
        return None, None

    if top.startswith("drive-download-"):
        if len(parts) < 3:
            return None, None
        school = normalize_text(parts[1])
        school_slug = slugify(school)
        normalized_parts = [normalize_dir_segment(part) for part in parts[2:-1]]
        target = OUTPUT_ROOT / school_slug
        for segment in normalized_parts:
            target = target / segment
        target = target / parts[-1]
        return school, target

    school = infer_school_from_loose_path(rel_path)
    if school is None:
        return None, None

    school_slug = slugify(school)
    target = OUTPUT_ROOT / school_slug / "loose-imports"
    for segment in parts[:-1]:
        target = target / normalize_dir_segment(segment)
    target = target / parts[-1]
    return school, target


def same_file(left: Path, right: Path) -> bool:
    if left.stat().st_size != right.stat().st_size:
        return False
    left_hash = hashlib.sha1(left.read_bytes()).hexdigest()
    right_hash = hashlib.sha1(right.read_bytes()).hexdigest()
    return left_hash == right_hash


def unique_target_path(target: Path, source: Path) -> Path:
    if not target.exists():
        return target
    if same_file(source, target):
        return target
    stem = target.stem
    suffix = target.suffix
    index = 2
    while True:
        candidate = target.with_name(f"{stem}-{index}{suffix}")
        if not candidate.exists():
            return candidate
        if same_file(source, candidate):
            return candidate
        index += 1


def collect_candidate_files() -> list[Path]:
    files: list[Path] = []
    for file_path in ASSETS_DIR.rglob("*"):
        if not file_path.is_file():
            continue
        rel_path = file_path.relative_to(ASSETS_DIR)
        if is_metadata_file(file_path):
            files.append(file_path)
            continue
        school, target = build_target_path(rel_path)
        if school is None or target is None:
            continue
        files.append(file_path)
    return sorted(files)


def remove_empty_directories(root: Path) -> None:
    for directory in sorted((path for path in root.rglob("*") if path.is_dir()), key=lambda item: len(item.parts), reverse=True):
        if directory == OUTPUT_ROOT:
            continue
        try:
            directory.rmdir()
        except OSError:
            continue


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

    moved_files = 0
    removed_metadata_files = 0
    institutions: dict[str, dict] = {}
    project_index: dict[tuple[str, str, str | None, str | None], dict] = {}

    for source_path in collect_candidate_files():
        rel_path = source_path.relative_to(ASSETS_DIR)
        if is_metadata_file(source_path):
            source_path.unlink(missing_ok=True)
            removed_metadata_files += 1
            continue

        school, target = build_target_path(rel_path)
        if school is None or target is None:
            continue

        target = unique_target_path(target, source_path)
        target.parent.mkdir(parents=True, exist_ok=True)

        if target.exists() and same_file(source_path, target):
            source_path.unlink(missing_ok=True)
        else:
            shutil.move(str(source_path), str(target))
            moved_files += 1

        target_rel = target.relative_to(WORKSPACE_ROOT).as_posix()
        school_slug = slugify(school)
        institution_entry = institutions.setdefault(
            school_slug,
            {
                "slug": school_slug,
                "name": normalize_text(school),
                "path": f"assets/projects/{school_slug}",
                "projectCount": 0,
                "documents": [],
            },
        )

        if rel_path.parts[0].startswith("drive-download-"):
            metadata_parts = list(rel_path.parts[2:-1])
        else:
            metadata_parts = list(rel_path.parts[:-1])

        metadata = detect_project_metadata(school, metadata_parts, rel_path.name)
        category = categorize_file(metadata_parts, rel_path.name)

        file_record = {
            "name": rel_path.name,
            "category": category,
            "path": target_rel,
            "sourcePath": f"assets/{rel_path.as_posix()}",
        }

        if metadata["project"] is None:
            institution_entry["documents"].append(file_record)
            continue

        project_key = (
            school_slug,
            slugify(metadata["project"]),
            metadata["studio"],
            metadata["phase"],
        )
        project_entry = project_index.setdefault(
            project_key,
            {
                "slug": slugify(metadata["project"]),
                "name": metadata["project"],
                "institution": institution_entry["name"],
                "institutionSlug": school_slug,
                "studio": metadata["studio"],
                "phase": metadata["phase"],
                "path": str(Path(f"assets/projects/{school_slug}") / target.relative_to(OUTPUT_ROOT / school_slug).parent.relative_to(Path("."))).replace("\\", "/"),
                "media": [],
                "annotations": [],
                "documents": [],
                "other": [],
            },
        )
        project_entry[category].append(file_record)

    for project in project_index.values():
        institutions[project["institutionSlug"]]["projectCount"] += 1

    projects = sorted(
        project_index.values(),
        key=lambda item: (
            item["institution"].lower(),
            (item["studio"] or "").lower(),
            item["name"].lower(),
        ),
    )
    institution_list = sorted(institutions.values(), key=lambda item: item["name"].lower())
    for institution in institution_list:
        institution["documents"] = sorted(institution["documents"], key=lambda item: item["path"].lower())

    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "assetsRoot": "assets/projects",
        "summary": {
            "institutionCount": len(institution_list),
            "projectCount": len(projects),
            "movedFileCount": moved_files,
            "removedMetadataFileCount": removed_metadata_files,
        },
        "institutions": institution_list,
        "projects": projects,
    }

    MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    for raw_root in ASSETS_DIR.glob("drive-download-*"):
        if raw_root.is_dir():
            remove_empty_directories(raw_root)
            try:
                raw_root.rmdir()
            except OSError:
                pass

    remove_empty_directories(ASSETS_DIR)

    print(json.dumps(manifest["summary"], ensure_ascii=False, indent=2))
    print(f"Manifest written to {MANIFEST_PATH.relative_to(WORKSPACE_ROOT).as_posix()}")


if __name__ == "__main__":
    main()
