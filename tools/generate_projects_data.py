from __future__ import annotations

import json
import os
import re
import unicodedata
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
ASSETS_ROOT = ROOT / "assets" / "projects"
SELECTED_PATH = DATA_DIR / "projects-selected.json"
PROJECTS_PATH = DATA_DIR / "projects.json"
PROJECTS_JS_PATH = DATA_DIR / "projects-data.js"
EXTERNAL_MEDIA_PATH = DATA_DIR / "external-media.json"
EXTERNAL_DOCUMENTS_PATH = DATA_DIR / "external-documents.json"
R2_UPLOAD_LIST_PATH = ROOT / "tools" / "r2-upload-paths.txt"
FALLBACK_MENU_ASSET = "assets/site/video-thumbnail.webp"

EXTERNAL_MEDIA_EXTENSIONS = {".mp4", ".m4v", ".mov", ".gif"}
DOCUMENT_EXTENSIONS = {".pdf", ".doc", ".docx", ".odt", ".txt", ".ppt", ".pptx", ".xlsx", ".rtf"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"}
VIDEO_EXTENSIONS = {".mp4", ".m4v", ".mov", ".gif"}
KNOWN_EXTENSIONS = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS | DOCUMENT_EXTENSIONS


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_only = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    compact = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_only.lower()).strip("-")
    return compact or "item"


def classify_source(path: str) -> str:
    suffix = Path(path).suffix.lower()
    if suffix in EXTERNAL_MEDIA_EXTENSIONS:
        return "external-media"
    if suffix in DOCUMENT_EXTENSIONS:
        return "document"
    return "media"


def normalize_for_match(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_only = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", "", ascii_only.lower())


def strip_known_extensions(filename: str) -> str:
    value = filename
    while True:
        suffix = Path(value).suffix
        if suffix.lower() not in KNOWN_EXTENSIONS or not suffix:
            return value
        value = value[: -len(suffix)]


def tokenize(value: str) -> list[str]:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_only = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    return [token for token in re.split(r"[^a-zA-Z0-9]+", ascii_only.lower()) if len(token) >= 4]


def asset_type_for_path(path: str) -> str:
    suffix = Path(path).suffix.lower()
    if suffix in IMAGE_EXTENSIONS:
        return "image"
    if suffix in VIDEO_EXTENSIONS:
        return "video"
    if suffix in DOCUMENT_EXTENSIONS:
        return "document"
    return "other"


def load_r2_upload_paths() -> set[str]:
    """Paths listed for R2 upload (see tools/generate_r2_manifest.py)."""
    if not R2_UPLOAD_LIST_PATH.exists():
        return set()
    text = R2_UPLOAD_LIST_PATH.read_text(encoding="utf-8")
    return {line.strip() for line in text.splitlines() if line.strip()}


def make_media_path_rewrite(media_base: str, r2_paths: set[str]) -> Callable[[str], str]:
    """If SPACE_TO_SPACE_MEDIA_BASE is set, rewrite paths that exist on R2."""
    base = media_base.strip().rstrip("/")
    if not base:

        def identity(path: str) -> str:
            return path

        return identity

    def rewrite(path: str) -> str:
        if not path:
            return path
        lower = path.lower()
        if lower.startswith("http://") or lower.startswith("https://"):
            return path
        if path in r2_paths:
            return f"{base}/{path}"
        return path

    return rewrite


def build_asset_index() -> dict[str, list[dict[str, object]]]:
    index: dict[str, list[dict[str, object]]] = {}
    if not ASSETS_ROOT.exists():
        return index

    for file_path in ASSETS_ROOT.rglob("*"):
        if not file_path.is_file() or file_path.name == ".DS_Store":
            continue
        basename = strip_known_extensions(file_path.name)
        key = normalize_for_match(basename)
        if not key:
            continue
        repo_path = file_path.relative_to(ROOT).as_posix()
        index.setdefault(key, []).append(
            {
                "path": repo_path,
                "pathKey": normalize_for_match(repo_path),
                "basenameKey": key,
                "type": asset_type_for_path(repo_path),
            }
        )
    return index


def resolve_source_path(
    source: str,
    work: dict[str, object],
    asset_index: dict[str, list[dict[str, object]]],
) -> dict[str, object] | None:
    basename = strip_known_extensions(Path(source).name)
    key = normalize_for_match(basename)
    candidates = asset_index.get(key, [])
    if not candidates:
        return None

    school_tokens = tokenize(str(work.get("school", "")))
    title_tokens = tokenize(str(work.get("title", "")))
    author_tokens = tokenize(str(work.get("author", "")))
    source_key = normalize_for_match(source)

    def score(candidate: dict[str, object]) -> tuple[int, int]:
        path_key = str(candidate["pathKey"])
        total = 0
        if str(candidate["basenameKey"]) == key:
            total += 200
        if key and key in source_key:
            total += 60
        for token in school_tokens:
            if token in path_key:
                total += 25
        for token in title_tokens:
            if token in path_key:
                total += 10
        for token in author_tokens:
            if token in path_key:
                total += 6
        return total, -len(str(candidate["path"]))

    return max(candidates, key=score)


def build_project_record(
    work: dict[str, object],
    asset_index: dict[str, list[dict[str, object]]],
    rewrite_path: Callable[[str], str],
) -> dict[str, object]:
    author = str(work.get("author", "")).strip()
    title = str(work.get("title", "")).strip()
    school = str(work.get("school", "")).strip()
    sources = [str(item) for item in work.get("src", []) if isinstance(item, str)]

    media = [path for path in sources if classify_source(path) == "media"]
    external_media = [path for path in sources if classify_source(path) == "external-media"]
    documents = [path for path in sources if classify_source(path) == "document"]

    resolved_assets = []
    for source in sources:
        resolved = resolve_source_path(source, work, asset_index)
        if resolved is None:
            continue
        resolved_assets.append(
            {
                "source": source,
                "path": resolved["path"],
                "type": resolved["type"],
            }
        )

    for asset in resolved_assets:
        asset["path"] = rewrite_path(asset["path"])

    resolved_images = [asset["path"] for asset in resolved_assets if asset["type"] == "image"]
    resolved_videos = [asset["path"] for asset in resolved_assets if asset["type"] == "video"]
    resolved_documents = [asset["path"] for asset in resolved_assets if asset["type"] == "document"]
    menu_asset = resolved_images[0] if resolved_images else (resolved_videos[0] if resolved_videos else rewrite_path(FALLBACK_MENU_ASSET))
    menu_asset_type = "image" if resolved_images else ("video" if resolved_videos else "placeholder")

    return {
        **work,
        "slug": slugify(f"{author}-{title}"),
        "schoolSlug": slugify(school),
        "media": media,
        "externalMedia": external_media,
        "documents": documents,
        "resolvedAssets": resolved_assets,
        "resolvedImages": resolved_images,
        "resolvedVideos": resolved_videos,
        "resolvedDocuments": resolved_documents,
        "menuAsset": menu_asset,
        "menuAssetType": menu_asset_type,
    }


def main() -> None:
    payload = json.loads(SELECTED_PATH.read_text(encoding="utf-8"))
    works = payload.get("works", [])
    asset_index = build_asset_index()
    r2_paths = load_r2_upload_paths()
    media_base = os.environ.get("SPACE_TO_SPACE_MEDIA_BASE", "").strip()
    rewrite_path = make_media_path_rewrite(media_base, r2_paths)
    generated_works = [build_project_record(work, asset_index, rewrite_path) for work in works if isinstance(work, dict)]

    generated_payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "generatedFrom": "data/projects-selected.json",
        "workCount": len(generated_works),
        "works": generated_works,
    }
    if media_base:
        generated_payload["mediaBase"] = media_base
        generated_payload["mediaBasePathRules"] = len(r2_paths)

    external_media = []
    external_documents = []
    for work in generated_works:
        for path in work["externalMedia"]:
            external_media.append(
                {
                    "workId": work.get("id"),
                    "workSlug": work.get("slug"),
                    "school": work.get("school"),
                    "title": work.get("title"),
                    "author": work.get("author"),
                    "path": path,
                    "reason": "selected-source-reference",
                }
            )
        for path in work["documents"]:
            external_documents.append(
                {
                    "workId": work.get("id"),
                    "workSlug": work.get("slug"),
                    "school": work.get("school"),
                    "title": work.get("title"),
                    "author": work.get("author"),
                    "path": path,
                    "reason": "selected-source-reference",
                }
            )

    PROJECTS_PATH.write_text(
        json.dumps(generated_payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    PROJECTS_JS_PATH.write_text(
        "window.SpaceToSpaceProjectsData = "
        + json.dumps(generated_payload, ensure_ascii=False, indent=2)
        + ";\n",
        encoding="utf-8",
    )
    EXTERNAL_MEDIA_PATH.write_text(
        json.dumps(
            {
                "generatedAt": generated_payload["generatedAt"],
                "generatedFrom": "data/projects-selected.json",
                "mediaCount": len(external_media),
                "media": external_media,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    EXTERNAL_DOCUMENTS_PATH.write_text(
        json.dumps(
            {
                "generatedAt": generated_payload["generatedAt"],
                "generatedFrom": "data/projects-selected.json",
                "documentCount": len(external_documents),
                "documents": external_documents,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    summary = {
        "workCount": len(generated_works),
        "externalMediaCount": len(external_media),
        "externalDocumentCount": len(external_documents),
        "projectsPath": PROJECTS_PATH.relative_to(ROOT).as_posix(),
        "projectsJsPath": PROJECTS_JS_PATH.relative_to(ROOT).as_posix(),
        "mediaBase": media_base or None,
        "r2UploadPathRules": len(r2_paths),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
