#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import posixpath
from pathlib import Path

from deploy_asset_paths import build_asset_deploy_map


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ENV_FILE = ROOT / ".env.r2"
DEFAULT_PATHS_FILE = ROOT / "tools" / "r2-upload-paths.txt"


def parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        values[key] = value
    return values


def load_config(env_file: Path | None) -> dict[str, str]:
    config = {}
    if env_file is not None:
        config.update(parse_env_file(env_file))
    config.update(os.environ)
    return config


def resolve_env_file(raw_path: str | None) -> Path | None:
    if raw_path:
        path = Path(raw_path).expanduser()
        return path if path.is_absolute() else (ROOT / path).resolve()
    if DEFAULT_ENV_FILE.exists():
        return DEFAULT_ENV_FILE
    return None


def require_config(config: dict[str, str], bucket_override: str | None, prefix_override: str | None) -> dict[str, str]:
    bucket_name = (bucket_override or config.get("R2_BUCKET_NAME", "")).strip()
    account_id = config.get("CLOUDFLARE_ACCOUNT_ID", "").strip()
    access_key_id = config.get("R2_ACCESS_KEY_ID", "").strip()
    secret_access_key = config.get("R2_SECRET_ACCESS_KEY", "").strip()
    endpoint_url = config.get("R2_ENDPOINT_URL", "").strip() or (
        f"https://{account_id}.r2.cloudflarestorage.com" if account_id else ""
    )
    key_prefix = (prefix_override if prefix_override is not None else config.get("R2_UPLOAD_PREFIX", "")).strip().strip("/")

    missing = [
        name
        for name, value in (
            ("CLOUDFLARE_ACCOUNT_ID", account_id),
            ("R2_ACCESS_KEY_ID", access_key_id),
            ("R2_SECRET_ACCESS_KEY", secret_access_key),
            ("R2_BUCKET_NAME", bucket_name),
        )
        if not value
    ]
    if missing:
        raise SystemExit(f"Missing configuration: {', '.join(missing)}")

    return {
        "account_id": account_id,
        "access_key_id": access_key_id,
        "secret_access_key": secret_access_key,
        "bucket_name": bucket_name,
        "endpoint_url": endpoint_url,
        "key_prefix": key_prefix,
    }


def build_s3_client(settings: dict[str, str]):
    try:
        import boto3
        from botocore.config import Config
    except ImportError as exc:
        raise SystemExit(
            "Missing dependency 'boto3'. Install it with: python3 -m pip install -r tools/requirements-r2.txt"
        ) from exc

    return boto3.client(
        "s3",
        region_name="auto",
        endpoint_url=settings["endpoint_url"],
        aws_access_key_id=settings["access_key_id"],
        aws_secret_access_key=settings["secret_access_key"],
        config=Config(signature_version="s3v4"),
    )


def load_upload_paths(paths_file: Path, filters: list[str]) -> list[str]:
    if not paths_file.exists():
        raise SystemExit(f"Paths file not found: {paths_file}")

    filters = [item for item in filters if item]
    paths = []
    for raw_line in paths_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if filters and not any(token in line for token in filters):
            continue
        paths.append(line)
    return paths


def build_object_key(relative_path: str, key_prefix: str) -> str:
    return f"{key_prefix}/{relative_path}" if key_prefix else relative_path


def object_matches_size(client, bucket_name: str, object_key: str, file_size: int) -> bool:
    try:
        response = client.head_object(Bucket=bucket_name, Key=object_key)
    except Exception:
        return False
    return int(response.get("ContentLength", -1)) == file_size


def guess_content_type(path: Path) -> str | None:
    content_type, _ = mimetypes.guess_type(path.name)
    return content_type


def build_desired_object_keys(relative_paths: list[str], key_prefix: str) -> list[str]:
    return [build_object_key(relative_path, key_prefix) for relative_path in relative_paths]


def normalize_prefix(prefix: str | None) -> str:
    value = (prefix or "").strip().strip("/")
    return f"{value}/" if value else ""


def derive_delete_prefix(object_keys: list[str]) -> str:
    if not object_keys:
        return ""
    common = posixpath.commonpath(object_keys)
    if common in object_keys:
        common = posixpath.dirname(common)
    return normalize_prefix(common)


def iter_bucket_keys(client, bucket_name: str, prefix: str):
    continuation_token = None
    while True:
        kwargs = {
            "Bucket": bucket_name,
            "Prefix": prefix,
            "MaxKeys": 1000,
        }
        if continuation_token:
            kwargs["ContinuationToken"] = continuation_token
        response = client.list_objects_v2(**kwargs)
        for item in response.get("Contents", []):
            key = item.get("Key")
            if isinstance(key, str):
                yield key
        if not response.get("IsTruncated"):
            break
        continuation_token = response.get("NextContinuationToken")


def delete_stale_objects(
    client,
    bucket_name: str,
    desired_keys: set[str],
    delete_prefix: str,
    dry_run: bool,
) -> dict[str, object]:
    existing_keys = list(iter_bucket_keys(client, bucket_name, delete_prefix))
    stale_keys = sorted(key for key in existing_keys if key not in desired_keys)

    summary: dict[str, object] = {
        "deletePrefix": delete_prefix,
        "existingInScope": len(existing_keys),
        "staleFound": len(stale_keys),
        "staleDeleted": 0,
    }

    if dry_run or not stale_keys:
        if stale_keys:
            summary["staleKeys"] = stale_keys
        return summary

    deleted_count = 0
    failed: list[dict[str, str]] = []
    for index in range(0, len(stale_keys), 1000):
        batch = stale_keys[index:index + 1000]
        response = client.delete_objects(
            Bucket=bucket_name,
            Delete={"Objects": [{"Key": key} for key in batch], "Quiet": True},
        )
        deleted_count += len(response.get("Deleted", []))
        for item in response.get("Errors", []):
            failed.append(
                {
                    "key": str(item.get("Key", "")),
                    "code": str(item.get("Code", "")),
                    "message": str(item.get("Message", "")),
                }
            )

    summary["staleDeleted"] = deleted_count
    if failed:
        summary["deleteErrors"] = failed
    return summary


def upload_assets(
    client,
    settings: dict[str, str],
    relative_paths: list[str],
    deploy_path_map: dict[str, str],
    dry_run: bool,
    overwrite: bool,
) -> dict[str, object]:
    uploaded: list[str] = []
    skipped: list[str] = []
    missing: list[str] = []
    failed: list[dict[str, str]] = []

    for relative_path in relative_paths:
        source_path = ROOT / relative_path
        if not source_path.exists():
            missing.append(relative_path)
            continue

        deploy_relative_path = deploy_path_map.get(relative_path, relative_path)
        object_key = build_object_key(deploy_relative_path, settings["key_prefix"])
        file_size = source_path.stat().st_size

        if not dry_run and not overwrite and object_matches_size(client, settings["bucket_name"], object_key, file_size):
            skipped.append(relative_path)
            continue

        if dry_run:
            uploaded.append(deploy_relative_path)
            continue

        extra_args = {}
        content_type = guess_content_type(source_path)
        if content_type:
            extra_args["ExtraArgs"] = {"ContentType": content_type}

        try:
            client.upload_file(str(source_path), settings["bucket_name"], object_key, **extra_args)
            uploaded.append(deploy_relative_path)
        except Exception as exc:
            failed.append({"path": relative_path, "objectKey": object_key, "error": str(exc)})

    summary: dict[str, object] = {
        "bucket": settings["bucket_name"],
        "endpoint": settings["endpoint_url"],
        "keyPrefix": settings["key_prefix"] or None,
        "requested": len(relative_paths),
        "uploaded": len(uploaded),
        "skipped": len(skipped),
        "missing": len(missing),
        "failed": len(failed),
        "dryRun": dry_run,
    }
    if missing:
        summary["missingPaths"] = missing
    if failed:
        summary["failedPaths"] = failed
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Upload files from tools/r2-upload-paths.txt to Cloudflare R2 using S3 credentials."
    )
    parser.add_argument(
        "--env-file",
        default="",
        help="Path to env file (default: .env.r2 when present).",
    )
    parser.add_argument(
        "--paths-file",
        default=str(DEFAULT_PATHS_FILE),
        help="Path to list of relative files to upload.",
    )
    parser.add_argument(
        "--bucket",
        default="",
        help="Override bucket name from env.",
    )
    parser.add_argument(
        "--prefix",
        default=None,
        help="Optional object key prefix inside the bucket.",
    )
    parser.add_argument(
        "--only",
        action="append",
        default=[],
        help="Upload only paths containing this substring. Can be repeated.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Force upload even when object with same size already exists.",
    )
    parser.add_argument(
        "--delete-stale",
        action="store_true",
        help="Delete objects under the upload prefix that are not present in the current manifest.",
    )
    parser.add_argument(
        "--delete-prefix",
        default="",
        help="Explicit bucket prefix scope for stale object deletion. Defaults to the common path of current upload keys.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be uploaded without sending files to R2.",
    )
    args = parser.parse_args()

    env_file = resolve_env_file(args.env_file or None)
    config = load_config(env_file)
    settings = require_config(config, args.bucket or None, args.prefix)

    paths_file = Path(args.paths_file).expanduser()
    if not paths_file.is_absolute():
        paths_file = (ROOT / paths_file).resolve()
    relative_paths = load_upload_paths(paths_file, args.only)
    deploy_path_map = build_asset_deploy_map()

    desired_object_keys = build_desired_object_keys(
        [deploy_path_map.get(relative_path, relative_path) for relative_path in relative_paths],
        settings["key_prefix"],
    )

    delete_prefix = ""
    if args.delete_stale:
        delete_prefix = normalize_prefix(args.delete_prefix) or derive_delete_prefix(desired_object_keys)
        if not delete_prefix:
            raise SystemExit(
                "Refusing to delete stale objects without a scoped prefix. "
                "Set --delete-prefix or ensure uploaded keys share a common directory prefix."
            )

    requires_client = args.delete_stale or not args.dry_run
    client = build_s3_client(settings) if requires_client else None

    delete_summary = None
    if args.delete_stale:
        delete_summary = delete_stale_objects(
            client=client,
            bucket_name=settings["bucket_name"],
            desired_keys=set(desired_object_keys),
            delete_prefix=delete_prefix,
            dry_run=args.dry_run,
        )

    summary = upload_assets(
        client=client,
        settings=settings,
        relative_paths=relative_paths,
        deploy_path_map=deploy_path_map,
        dry_run=args.dry_run,
        overwrite=args.overwrite,
    )
    if delete_summary is not None:
        summary["delete"] = delete_summary
    print(json.dumps(summary, ensure_ascii=False, indent=2))

    delete_failed = 0
    if delete_summary is not None:
        delete_failed = len(delete_summary.get("deleteErrors", []))

    if int(summary["missing"]) > 0 or int(summary["failed"]) > 0 or delete_failed > 0:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
