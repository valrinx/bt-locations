"""Tests for additive Supabase restore planning."""

import unittest

from restore_supabase import plan_restore


class RestoreSupabaseTests(unittest.TestCase):
    def test_plan_separates_active_deleted_and_missing(self):
        backup = [
            {"id": "active", "lat": 13.1, "lng": 100.1},
            {"id": "deleted", "lat": 13.2, "lng": 100.2},
            {"id": "missing", "lat": 13.3, "lng": 100.3},
        ]
        live = [
            {"id": "active", "lat": 13.1, "lng": 100.1, "deleted_at": None},
            {
                "id": "deleted",
                "lat": 13.2,
                "lng": 100.2,
                "deleted_at": "2026-01-01T00:00:00Z",
            },
        ]
        result = plan_restore(backup, live)
        self.assertEqual(len(result["unchanged"]), 1)
        self.assertEqual(len(result["reactivate"]), 1)
        self.assertEqual(len(result["insert"]), 1)

    def test_plan_matches_legacy_rows_by_coordinate(self):
        backup = [{"lat": 13.1234564, "lng": 100.6543214}]
        live = [{"id": "new-id", "lat": 13.12345649, "lng": 100.65432149}]
        result = plan_restore(backup, live)
        self.assertEqual(len(result["unchanged"]), 1)


if __name__ == "__main__":
    unittest.main()
