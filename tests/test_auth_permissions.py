import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase_migrations" / "003_auth_permissions.sql"


class AuthPermissionMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = MIGRATION.read_text(encoding="utf-8").lower()

    def test_owner_email_is_not_committed(self):
        self.assertNotRegex(
            self.sql,
            r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}",
        )

    def test_anonymous_users_only_receive_location_select(self):
        self.assertIn(
            "grant select on public.locations to anon, authenticated", self.sql
        )
        self.assertIn(
            "revoke insert, update, delete on public.locations "
            "from anon, authenticated",
            self.sql,
        )
        self.assertNotIn("grant insert on public.locations to anon", self.sql)
        self.assertNotIn("grant update on public.locations to anon", self.sql)
        self.assertNotIn("grant delete on public.locations to anon", self.sql)

    def test_all_requested_permissions_are_database_enforced(self):
        for permission in ("edit", "delete", "import", "restore"):
            self.assertIn(f"can_{permission} boolean", self.sql)
            self.assertIn(f"when '{permission}'", self.sql)

    def test_sensitive_rpcs_are_not_granted_to_anon(self):
        for function_name in (
            "admin_set_permissions",
            "soft_delete_locations",
            "import_locations",
            "restore_locations",
            "restore_remove_locations",
        ):
            self.assertIn(
                f"revoke all on function public.{function_name}", self.sql
            )


if __name__ == "__main__":
    unittest.main()
