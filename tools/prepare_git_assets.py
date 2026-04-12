from __future__ import annotations

import json
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROJECTS_JSON_PATH = ROOT / "data" / "projects.json"
EXTERNAL_MEDIA_PATH = ROOT / "data" / "external-media.json"
PROJECTS_ASSETS_ROOT = ROOT / "assets" / "projects"
TEXT_FILES_TO_REWRITE = [*ROOT.glob("*.html"), *ROOT.glob("*.js")]

RASTER_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}
PRUNED_MEDIA_EXTENSIONS = {".mp4", ".m4v", ".mov", ".gif"}
ROOT_ASSET_IMAGES = [
    "assets/video-thumbnail.png",
    "assets/VISTA.jpg",
    "assets/Stools Shuttlecock.jpg",
    "assets/Light and Darkness.jpg",
    "assets/BambooWhispers.png",
    "assets/DepoRooms.jpg",
]


@dataclass(frozen=True)
class ConversionResult:
    source: Path
    output: Path
    created: bool


def run_command(args: list[str]) -> None:
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def convert_with_cwebp(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    run_command(
        [
            "cwebp",
            "-quiet",
            "-mt",
            "-q",
            "82",
            str(source),
            "-o",
            str(destination),
        ]
    )


def convert_raster_image(source: Path) -> ConversionResult | None:
    suffix = source.suffix.lower()
    if suffix not in RASTER_EXTENSIONS:
        return None

    destination = source.with_suffix(".webp")
    if destination.exists():
        return ConversionResult(source=source, output=destination, created=False)

    try:
        convert_with_cwebp(source, destination)
        return ConversionResult(source=source, output=destination, created=True)
    except subprocess.CalledProcessError:
        pass

    with tempfile.TemporaryDirectory() as tmp_dir:
        temporary_png = Path(tmp_dir) / f"{source.stem}.png"
        run_command(["sips", "-s", "format", "png", str(source), "--out", str(temporary_png)])
        convert_with_cwebp(temporary_png, destination)
    return ConversionResult(source=source, output=destination, created=True)


def collect_raster_files() -> list[Path]:
    files: list[Path] = []
    for path in PROJECTS_ASSETS_ROOT.rglob("*"):
        if not path.is_file():
            continue
        if path.name == ".DS_Store":
            continue
        if path.suffix.lower() in RASTER_EXTENSIONS:
            files.append(path)

    for relative in ROOT_ASSET_IMAGES:
        path = ROOT / relative
        if path.is_file():
            files.append(path)

    files.sort()
    return files


def to_repo_path(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def rewrite_text_asset_paths(path_mapping: dict[str, str]) -> int:
    rewritten_files = 0
    for file_path in TEXT_FILES_TO_REWRITE:
        text = file_path.read_text(encoding="utf-8")
        updated = text
        for old_path, new_path in path_mapping.items():
            updated = updated.replace(old_path, new_path)
        if updated != text:
            file_path.write_text(updated, encoding="utf-8")
            rewritten_files += 1
    return rewritten_files


def rewrite_projects_manifest(path_mapping: dict[str, str]) -> tuple[int, int]:
    payload = json.loads(PROJECTS_JSON_PATH.read_text(encoding="utf-8"))
    converted_records = 0
    pruned_records = 0
    external_media: list[dict[str, object]] = []

    for project in payload.get("projects", []):
        media_records = []
        for record in project.get("media", []):
            old_path = record.get("path")
            if not isinstance(old_path, str):
                media_records.append(record)
                continue

            suffix = Path(old_path).suffix.lower()
            if suffix in PRUNED_MEDIA_EXTENSIONS:
                external_record = {
                    "institutionSlug": project.get("institutionSlug"),
                    "projectSlug": project.get("slug"),
                    "projectName": project.get("name"),
                    "path": old_path,
                    "sourcePath": record.get("sourcePath"),
                    "reason": "excluded-from-git",
                }
                external_media.append(external_record)
                pruned_records += 1
                continue

            new_path = path_mapping.get(old_path)
            if new_path is not None:
                record["path"] = new_path
                record["name"] = Path(new_path).name
                converted_records += 1

            media_records.append(record)

        project["media"] = media_records

    PROJECTS_JSON_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    external_media_payload = {
        "generatedFrom": "data/projects.json",
        "mediaCount": len(external_media),
        "media": external_media,
    }
    EXTERNAL_MEDIA_PATH.write_text(
        json.dumps(external_media_payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    return converted_records, pruned_records


def main() -> None:
    path_mapping: dict[str, str] = {}
    created_webp_count = 0

    for source in collect_raster_files():
        result = convert_raster_image(source)
        if result is None:
            continue
        source_repo_path = to_repo_path(result.source)
        output_repo_path = to_repo_path(result.output)
        path_mapping[source_repo_path] = output_repo_path
        if result.created:
            created_webp_count += 1

    rewritten_text_files = rewrite_text_asset_paths(path_mapping)
    converted_manifest_records, pruned_manifest_records = rewrite_projects_manifest(path_mapping)

    summary = {
        "createdWebpCount": created_webp_count,
        "mappedAssetCount": len(path_mapping),
        "rewrittenTextFiles": rewritten_text_files,
        "convertedManifestRecords": converted_manifest_records,
        "prunedManifestRecords": pruned_manifest_records,
        "externalMediaManifest": to_repo_path(EXTERNAL_MEDIA_PATH),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
