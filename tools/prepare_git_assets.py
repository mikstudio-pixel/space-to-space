from __future__ import annotations

import json
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROJECTS_ASSETS_ROOT = ROOT / "assets" / "projects"
SITE_ASSETS_ROOT = ROOT / "assets" / "site"
TEXT_FILES_TO_REWRITE = [*ROOT.glob("*.html"), *(ROOT / "js").glob("*.js")]

RASTER_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}
SITE_ASSET_IMAGES = [
    "assets/site/video-thumbnail.png",
    "assets/site/VISTA.jpg",
    "assets/site/Stools Shuttlecock.jpg",
    "assets/site/Light and Darkness.jpg",
    "assets/site/BambooWhispers.png",
    "assets/site/DepoRooms.jpg",
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
    if source.suffix.lower() not in RASTER_EXTENSIONS:
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
        if path.is_file() and path.name != ".DS_Store" and path.suffix.lower() in RASTER_EXTENSIONS:
            files.append(path)

    for relative in SITE_ASSET_IMAGES:
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

    summary = {
        "createdWebpCount": created_webp_count,
        "mappedAssetCount": len(path_mapping),
        "rewrittenTextFiles": rewritten_text_files,
        "siteAssetsRoot": to_repo_path(SITE_ASSETS_ROOT),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
