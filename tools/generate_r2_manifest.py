#!/usr/bin/env python3
"""
Generuje manifest souborů pro nahrání na Cloudflare R2:
  - všechna videa pod assets/ (mp4, m4v, mov, webm)
  - PDF větší než --pdf-min-kib (default 512 KiB)

Výstupy:
  tools/r2-upload-manifest.json  — metadata + přeskočené malé PDF
  tools/r2-upload-paths.txt      — jedna relativní cesta na řádek
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
VIDEO_EXT = {".mp4", ".m4v", ".mov", ".webm"}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--pdf-min-kib",
        type=int,
        default=512,
        help="Minimální velikost PDF v KiB pro zařazení (default 512).",
    )
    args = parser.parse_args()
    pdf_min = max(0, args.pdf_min_kib) * 1024

    videos: list[dict[str, object]] = []
    pdfs: list[dict[str, object]] = []

    for path in sorted(ASSETS.rglob("*"), key=lambda p: str(p)):
        if not path.is_file():
            continue
        suf = path.suffix.lower()
        rel = path.relative_to(ROOT).as_posix()
        size = path.stat().st_size
        if suf in VIDEO_EXT:
            videos.append({"path": rel, "bytes": size, "kind": "video"})
        elif suf == ".pdf":
            pdfs.append({"path": rel, "bytes": size, "kind": "pdf"})

    large_pdfs = [e for e in pdfs if int(e["bytes"]) >= pdf_min]
    small_pdfs = [e for e in pdfs if int(e["bytes"]) < pdf_min]

    upload = videos + sorted(large_pdfs, key=lambda x: str(x["path"]))
    total_bytes = sum(int(e["bytes"]) for e in upload)

    manifest = {
        "description": "Soubory vhodné pro Cloudflare R2 (videa + větší PDF).",
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "pdfMinBytes": pdf_min,
        "pdfMinKib": args.pdf_min_kib,
        "counts": {
            "video": len(videos),
            "pdfLarge": len(large_pdfs),
            "pdfSkippedSmall": len(small_pdfs),
            "totalFiles": len(upload),
        },
        "totalBytes": total_bytes,
        "totalBytesHuman": f"{total_bytes / (1024**3):.2f} GiB",
        "files": upload,
        "skippedSmallPdfs": sorted(small_pdfs, key=lambda x: -int(x["bytes"])),
    }

    out_json = ROOT / "tools" / "r2-upload-manifest.json"
    out_txt = ROOT / "tools" / "r2-upload-paths.txt"
    out_json.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    out_txt.write_text("\n".join(str(e["path"]) for e in upload) + "\n", encoding="utf-8")

    print(f"Napsáno {out_json.name}: {len(upload)} souborů, ~{manifest['totalBytesHuman']}")
    print(f"Napsáno {out_txt.name}")
    print(
        f"PDF: {len(large_pdfs)} velkých (≥{args.pdf_min_kib} KiB), "
        f"{len(small_pdfs)} menších přeskočeno"
    )


if __name__ == "__main__":
    main()
