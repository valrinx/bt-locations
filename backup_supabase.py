"""Export the live Supabase locations table to a validated JSON backup.

Usage:
    python backup_supabase.py --output backup.json

SUPABASE_URL and SUPABASE_ANON_KEY may override the public project defaults.
The script is read-only and refuses to create an empty or malformed backup.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen


DEFAULT_SUPABASE_URL = "https://uemvtttfedpvofqhnwoo.supabase.co"
DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_2MH9_WZUfdAiBqtDwSFuOg_QeiWkPyh"
PAGE_SIZE = 1000
REQUIRED_FIELDS = ("lat", "lng")


def validate_rows(rows: object, minimum_count: int = 1) -> list[dict]:
    if not isinstance(rows, list):
        raise ValueError("Supabase response is not a list")
    if len(rows) < minimum_count:
        raise ValueError(
            f"Refusing backup: received {len(rows)} rows, minimum is {minimum_count}"
        )

    validated = []
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            raise ValueError(f"Row {index} is not an object")
        missing = [field for field in REQUIRED_FIELDS if field not in row]
        if missing:
            raise ValueError(f"Row {index} is missing: {', '.join(missing)}")
        try:
            lat = float(row["lat"])
            lng = float(row["lng"])
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Row {index} has invalid coordinates") from exc
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            raise ValueError(f"Row {index} has out-of-range coordinates")
        validated.append(row)
    return validated


def build_payload(
    rows: list[dict],
    created_at: str | None = None,
    deleted_rows: list[dict] | None = None,
) -> dict:
    deleted_rows = deleted_rows or []
    canonical = json.dumps(
        {"locations": rows, "deletedLocations": deleted_rows},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return {
        "schema": "bt-locations-supabase-backup",
        "backupVersion": 1,
        "createdAt": created_at or datetime.now(timezone.utc).isoformat(),
        "source": "supabase.locations",
        "count": len(rows),
        "deletedCount": len(deleted_rows),
        "sha256": hashlib.sha256(canonical).hexdigest(),
        "locations": rows,
        "deletedLocations": deleted_rows,
    }


def fetch_all_rows(base_url: str, anon_key: str) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    while True:
        query = urlencode(
            {
                "select": "*",
                "order": "created_at.asc",
                "offset": offset,
                "limit": PAGE_SIZE,
            }
        )
        request = Request(
            f"{base_url.rstrip('/')}/rest/v1/locations?{query}",
            headers={
                "apikey": anon_key,
                "Authorization": f"Bearer {anon_key}",
                "Accept": "application/json",
                "User-Agent": "bt-locations-backup/1.0",
            },
        )
        with urlopen(request, timeout=30) as response:
            page = json.load(response)
        if not isinstance(page, list):
            raise ValueError("Unexpected Supabase response")
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows


def write_backup(output: Path, payload: dict) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary.replace(output)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument(
        "--minimum-count",
        type=int,
        default=int(os.environ.get("BACKUP_MINIMUM_COUNT", "1000")),
    )
    args = parser.parse_args()

    base_url = os.environ.get("SUPABASE_URL", DEFAULT_SUPABASE_URL)
    anon_key = os.environ.get("SUPABASE_ANON_KEY", DEFAULT_SUPABASE_ANON_KEY)
    try:
        all_rows = fetch_all_rows(base_url, anon_key)
        active_rows = [row for row in all_rows if not row.get("deleted_at")]
        deleted_rows = [row for row in all_rows if row.get("deleted_at")]
        rows = validate_rows(active_rows, minimum_count=args.minimum_count)
        payload = build_payload(rows, deleted_rows=deleted_rows)
        write_backup(args.output, payload)
    except Exception as exc:
        print(f"Backup failed: {exc}", file=sys.stderr)
        return 1

    print(
        f"Backup complete: {payload['count']} locations, "
        f"sha256={payload['sha256']}, output={args.output}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
