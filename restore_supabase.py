"""Safely restore missing locations from a Supabase backup artifact.

The default is a dry run. Pass --apply to reactivate soft-deleted rows and
insert rows that are missing from the live table. Existing active rows are
never deleted or overwritten.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from urllib.request import Request, urlopen

from backup_supabase import (
    DEFAULT_SUPABASE_ANON_KEY,
    DEFAULT_SUPABASE_URL,
    build_payload,
    fetch_all_rows,
    validate_rows,
)


def coordinate_key(row: dict) -> tuple[str, str]:
    return (f"{float(row['lat']):.6f}", f"{float(row['lng']):.6f}")


def load_backup(path: Path) -> dict:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("schema") != "bt-locations-supabase-backup":
        raise ValueError("Unsupported backup schema")
    locations = validate_rows(payload.get("locations"), minimum_count=1)
    deleted = payload.get("deletedLocations") or []
    expected = build_payload(
        locations,
        created_at=payload.get("createdAt"),
        deleted_rows=deleted,
    )["sha256"]
    if payload.get("sha256") != expected:
        raise ValueError("Backup checksum mismatch")
    return payload


def plan_restore(backup_rows: list[dict], live_rows: list[dict]) -> dict:
    active = [row for row in live_rows if not row.get("deleted_at")]
    deleted = [row for row in live_rows if row.get("deleted_at")]
    active_ids = {row.get("id") for row in active if row.get("id")}
    active_coords = {coordinate_key(row) for row in active}
    deleted_by_id = {row.get("id"): row for row in deleted if row.get("id")}
    deleted_by_coord = {coordinate_key(row): row for row in deleted}

    unchanged = []
    reactivate = []
    insert = []
    for row in backup_rows:
        if row.get("id") in active_ids or coordinate_key(row) in active_coords:
            unchanged.append(row)
            continue
        deleted_row = deleted_by_id.get(row.get("id")) or deleted_by_coord.get(
            coordinate_key(row)
        )
        if deleted_row:
            reactivate.append((deleted_row, row))
        else:
            insert.append(row)
    return {"unchanged": unchanged, "reactivate": reactivate, "insert": insert}


def request_json(
    method: str,
    url: str,
    anon_key: str,
    body: object | None = None,
    access_token: str | None = None,
) -> object | None:
    data = None
    headers = {
        "apikey": anon_key,
        "Authorization": f"Bearer {access_token or anon_key}",
        "Accept": "application/json",
        "Prefer": "return=minimal",
        "User-Agent": "bt-locations-restore/1.0",
    }
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = Request(url, data=data, headers=headers, method=method)
    with urlopen(request, timeout=30) as response:
        raw = response.read()
        return json.loads(raw) if raw else None


def restore_row(row: dict) -> dict:
    return {
        key: value
        for key, value in row.items()
        if key not in {"created_at", "deleted_at", "deleted_by"}
    }


def sign_in(base_url: str, anon_key: str, email: str, password: str) -> str:
    result = request_json(
        "POST",
        f"{base_url.rstrip('/')}/auth/v1/token?grant_type=password",
        anon_key,
        {"email": email, "password": password},
    )
    if not isinstance(result, dict) or not result.get("access_token"):
        raise ValueError("Supabase sign-in did not return an access token")
    return str(result["access_token"])


def apply_restore(
    base_url: str,
    anon_key: str,
    access_token: str,
    restore_plan: dict,
    batch_size: int = 100,
) -> None:
    endpoint = f"{base_url.rstrip('/')}/rest/v1/rpc/restore_locations"
    rows = [
        restore_row(backup_row)
        for _, backup_row in restore_plan["reactivate"]
    ] + [restore_row(row) for row in restore_plan["insert"]]
    for start in range(0, len(rows), batch_size):
        request_json(
            "POST",
            endpoint,
            anon_key,
            {"rows_json": rows[start : start + batch_size]},
            access_token=access_token,
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("backup", type=Path)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply the additive restore; otherwise only print the plan.",
    )
    args = parser.parse_args()

    base_url = os.environ.get("SUPABASE_URL", DEFAULT_SUPABASE_URL)
    anon_key = os.environ.get("SUPABASE_ANON_KEY", DEFAULT_SUPABASE_ANON_KEY)
    try:
        payload = load_backup(args.backup)
        live_rows = fetch_all_rows(base_url, anon_key)
        restore_plan = plan_restore(payload["locations"], live_rows)
        print(
            f"Restore plan: {len(restore_plan['unchanged'])} already active, "
            f"{len(restore_plan['reactivate'])} to reactivate, "
            f"{len(restore_plan['insert'])} to insert"
        )
        if args.apply:
            access_token = os.environ.get("SUPABASE_ACCESS_TOKEN")
            if not access_token:
                email = os.environ.get("SUPABASE_AUTH_EMAIL")
                password = os.environ.get("SUPABASE_AUTH_PASSWORD")
                if not email or not password:
                    raise ValueError(
                        "--apply requires SUPABASE_ACCESS_TOKEN or both "
                        "SUPABASE_AUTH_EMAIL and SUPABASE_AUTH_PASSWORD"
                    )
                access_token = sign_in(base_url, anon_key, email, password)
            apply_restore(base_url, anon_key, access_token, restore_plan)
            print("Restore applied. Run the backup command again to verify.")
        else:
            print("Dry run only. Re-run with --apply after reviewing these counts.")
    except Exception as exc:
        print(f"Restore failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
