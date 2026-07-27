"""Tests for the Supabase backup payload and safety checks."""

import unittest

from backup_supabase import build_payload, validate_rows


class BackupSupabaseTests(unittest.TestCase):
    def test_validate_rows_accepts_valid_locations(self):
        rows = [{"id": 1, "name": "A", "lat": 13.7, "lng": 100.5}]
        self.assertEqual(validate_rows(rows), rows)

    def test_validate_rows_rejects_empty_backup(self):
        with self.assertRaisesRegex(ValueError, "Refusing backup"):
            validate_rows([], minimum_count=1)

    def test_validate_rows_rejects_bad_coordinates(self):
        with self.assertRaisesRegex(ValueError, "out-of-range"):
            validate_rows([{"lat": 200, "lng": 100}])

    def test_build_payload_has_stable_checksum(self):
        rows = [{"id": 1, "lat": 13.7, "lng": 100.5}]
        first = build_payload(rows, created_at="2026-01-01T00:00:00+00:00")
        second = build_payload(rows, created_at="2026-01-02T00:00:00+00:00")
        self.assertEqual(first["sha256"], second["sha256"])
        self.assertEqual(first["count"], 1)

    def test_build_payload_keeps_soft_deleted_rows_separate(self):
        active = [{"id": 1, "lat": 13.7, "lng": 100.5}]
        deleted = [
            {
                "id": 2,
                "lat": 13.8,
                "lng": 100.6,
                "deleted_at": "2026-01-01T00:00:00Z",
            }
        ]
        payload = build_payload(active, deleted_rows=deleted)
        self.assertEqual(payload["count"], 1)
        self.assertEqual(payload["deletedCount"], 1)
        self.assertEqual(payload["deletedLocations"], deleted)


if __name__ == "__main__":
    unittest.main()
