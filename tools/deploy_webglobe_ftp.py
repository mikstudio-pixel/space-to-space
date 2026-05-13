#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ftplib
import json
import os
import posixpath
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BUNDLE_DIR = ROOT / "build" / "webglobe"
BUILD_SCRIPT = ROOT / "tools" / "build_webglobe_bundle.py"


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def normalize_remote_dir(remote_dir: str) -> str:
    remote_dir = remote_dir.strip().replace("\\", "/")
    if not remote_dir or remote_dir == ".":
        return "/"
    if not remote_dir.startswith("/"):
        remote_dir = f"/{remote_dir}"
    return remote_dir.rstrip("/") or "/"


def ftp_connect(host: str, user: str, password: str, port: int, use_tls: bool) -> ftplib.FTP:
    ftp_class = ftplib.FTP_TLS if use_tls else ftplib.FTP
    ftp = ftp_class()
    ftp.connect(host, port, timeout=30)
    ftp.login(user, password)
    if isinstance(ftp, ftplib.FTP_TLS):
        ftp.prot_p()
    return ftp


def ensure_remote_dir(ftp: ftplib.FTP, remote_dir: str, dry_run: bool) -> None:
    if remote_dir == "/":
        return

    current = ""
    for part in remote_dir.strip("/").split("/"):
        current = posixpath.join(current, part)
        path = f"/{current}"
        if dry_run:
            continue
        try:
            ftp.mkd(path)
        except ftplib.error_perm as error:
            if not str(error).startswith("550"):
                raise


def remote_files(ftp: ftplib.FTP, remote_root: str) -> set[str]:
    files: set[str] = set()

    def walk(path: str) -> None:
        try:
            entries = list(ftp.mlsd(path))
        except (ftplib.error_perm, AttributeError):
            return

        for name, facts in entries:
            if name in {".", ".."}:
                continue
            child = posixpath.join(path, name)
            if facts.get("type") == "dir":
                walk(child)
            elif facts.get("type") == "file":
                files.add(child)

    walk(remote_root)
    return files


def iter_local_files(local_root: Path) -> list[Path]:
    return sorted(path for path in local_root.rglob("*") if path.is_file())


def upload_bundle(
    ftp: ftplib.FTP,
    local_root: Path,
    remote_root: str,
    dry_run: bool,
    delete_stale: bool,
) -> dict[str, object]:
    uploaded: list[str] = []
    local_remote_paths: set[str] = set()

    for local_path in iter_local_files(local_root):
        relative = local_path.relative_to(local_root).as_posix()
        remote_path = posixpath.join(remote_root, relative)
        remote_parent = posixpath.dirname(remote_path)
        local_remote_paths.add(remote_path)
        ensure_remote_dir(ftp, remote_parent, dry_run)

        if dry_run:
            uploaded.append(relative)
            continue

        with local_path.open("rb") as file:
            ftp.storbinary(f"STOR {remote_path}", file)
        uploaded.append(relative)

    deleted: list[str] = []
    if delete_stale:
        for remote_path in sorted(remote_files(ftp, remote_root) - local_remote_paths, reverse=True):
            relative = posixpath.relpath(remote_path, remote_root)
            if dry_run:
                deleted.append(relative)
                continue
            ftp.delete(remote_path)
            deleted.append(relative)

    return {
        "uploaded": len(uploaded),
        "deleted": len(deleted),
        "dryRun": dry_run,
        "deleteStale": delete_stale,
        "remoteRoot": remote_root,
    }


def build_bundle(output_dir: Path, media_base: str) -> None:
    command = [sys.executable, str(BUILD_SCRIPT), "--output", str(output_dir)]
    if media_base:
        command.extend(["--media-base", media_base])
    subprocess.run(command, cwd=ROOT, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build and upload the Webglobe static bundle over FTP/FTPS."
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_BUNDLE_DIR),
        help="Local bundle directory to build and upload.",
    )
    parser.add_argument(
        "--media-base",
        default="",
        help="Optional public Cloudflare R2 base URL passed through to build_webglobe_bundle.py.",
    )
    parser.add_argument(
        "--remote-dir",
        default=os.environ.get("WEBGLOBE_FTP_REMOTE_DIR", "/"),
        help="Remote directory on Webglobe. Can also be set with WEBGLOBE_FTP_REMOTE_DIR.",
    )
    parser.add_argument(
        "--plain-ftp",
        action="store_true",
        help="Use plain FTP instead of FTPS. FTPS is the default.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Build locally and print what would be uploaded without changing the server.",
    )
    parser.add_argument(
        "--skip-build",
        action="store_true",
        help="Upload the existing bundle directory without rebuilding it first.",
    )
    parser.add_argument(
        "--delete-stale",
        action="store_true",
        help="Delete remote files under the remote directory that are not in the current bundle.",
    )
    args = parser.parse_args()

    output_dir = Path(args.output).expanduser()
    if not output_dir.is_absolute():
        output_dir = (ROOT / output_dir).resolve()

    if not args.skip_build:
        build_bundle(output_dir, args.media_base.strip())

    host = require_env("WEBGLOBE_FTP_HOST")
    user = require_env("WEBGLOBE_FTP_USER")
    password = require_env("WEBGLOBE_FTP_PASSWORD")
    port = int(os.environ.get("WEBGLOBE_FTP_PORT", "21"))
    remote_dir = normalize_remote_dir(args.remote_dir)

    ftp = ftp_connect(
        host=host,
        user=user,
        password=password,
        port=port,
        use_tls=not args.plain_ftp,
    )
    try:
        ensure_remote_dir(ftp, remote_dir, args.dry_run)
        summary = upload_bundle(
            ftp=ftp,
            local_root=output_dir,
            remote_root=remote_dir,
            dry_run=args.dry_run,
            delete_stale=args.delete_stale,
        )
    finally:
        try:
            ftp.quit()
        except ftplib.Error:
            ftp.close()

    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
