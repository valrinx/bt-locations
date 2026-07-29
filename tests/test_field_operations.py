import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
MIGRATION = (ROOT / "supabase_migrations" / "004_field_operations.sql").read_text(
    encoding="utf-8"
).lower()
APP = (ROOT / "docs" / "app.js").read_text(encoding="utf-8")
OPS = (ROOT / "docs" / "field-ops.js").read_text(encoding="utf-8")
INDEX = (ROOT / "docs" / "index.html").read_text(encoding="utf-8")
SW = (ROOT / "docs" / "sw.js").read_text(encoding="utf-8")


class FieldOperationsMigrationTests(unittest.TestCase):
    def test_migration_is_backward_compatible(self):
        self.assertIn("add column if not exists workflow_status", MIGRATION)
        self.assertIn("not null default 'new'", MIGRATION)
        self.assertNotIn("drop table public.locations", MIGRATION)
        self.assertNotIn("truncate public.locations", MIGRATION)

    def test_every_mutating_rpc_checks_database_permission(self):
        expected = {
            "update_location_workflow": ("edit",),
            "bulk_update_locations": ("edit",),
            "merge_locations": ("edit", "delete"),
            "rollback_location": ("restore",),
        }
        for function_name, permissions in expected.items():
            start = MIGRATION.index(f"function public.{function_name}")
            end = MIGRATION.find("$$;", start)
            function_sql = MIGRATION[start:end]
            for permission in permissions:
                self.assertIn(
                    f"private.has_permission('{permission}')",
                    function_sql,
                    f"{function_name} must enforce {permission}",
                )

    def test_revision_log_is_read_only_to_clients(self):
        self.assertIn("alter table public.location_revisions enable row level security", MIGRATION)
        self.assertIn(
            "revoke insert, update, delete, truncate on public.location_revisions",
            MIGRATION,
        )
        self.assertIn("private.capture_location_revision()", MIGRATION)

    def test_bulk_update_has_allowlist_and_hard_limit(self):
        self.assertIn("patch - array[", MIGRATION)
        self.assertIn("array_length(location_ids, 1) > 500", MIGRATION)

    def test_merge_is_soft_delete_and_rollback_is_revisioned(self):
        self.assertIn("set deleted_at = now()", MIGRATION)
        self.assertIn("set_config('bt.revision_action', 'merge'", MIGRATION)
        self.assertIn("set_config('bt.revision_action', 'rollback'", MIGRATION)


class FieldOperationsFrontendTests(unittest.TestCase):
    def test_new_assets_are_loaded_and_network_first(self):
        self.assertIn('href="field-ops.css?v=7.6.1"', INDEX)
        self.assertIn("fieldOps.src = 'field-ops.js?v=' + v", INDEX)
        self.assertIn("'field-ops.js'", SW)
        self.assertIn("'field-ops.css'", SW)

    def test_quality_work_bulk_history_and_offline_tabs_exist(self):
        for tab in ("quality", "work", "bulk", "history", "sync"):
            self.assertIn(f'data-tab="{tab}"', OPS)

    def test_sensitive_actions_check_permissions(self):
        self.assertIn("require('edit', 'รวมข้อมูลซ้ำ')", OPS)
        self.assertIn("require('delete', 'รวมข้อมูลซ้ำ')", OPS)
        self.assertIn("require('edit', 'แก้ไขหลายจุด')", OPS)
        self.assertIn("require('restore', 'ย้อนกลับข้อมูล')", OPS)

    def test_offline_outbox_is_durable_and_does_not_queue_permission_errors(self):
        self.assertIn("const OUTBOX_KEY = 'bt_offline_outbox_v1'", APP)
        self.assertIn("function _isNetworkWriteError(error)", APP)
        self.assertIn("if(_isNetworkWriteError(error))_queueOutbox", APP)
        self.assertIn("window.btOutbox=", APP)

    def test_route_run_is_resumable(self):
        self.assertIn("const ROUTE_RUN_KEY='bt_route_run_v1'", APP)
        self.assertIn("async function _resumeRouteRun()", APP)
        self.assertIn("case 'complete':_routeRunMark", APP)
        self.assertIn("case 'skip':_routeRunMark", APP)

    def test_papago_failure_stays_in_app_and_copies_coordinates(self):
        papago_start = APP.index("function _openPapagoApp")
        papago_end = APP.index("function _getMapAppUrl", papago_start)
        papago = APP[papago_start:papago_end]
        self.assertIn("navigator.clipboard", papago)
        self.assertNotIn("window.location.assign", papago)

    def test_quality_inbox_can_search_filter_and_reveal_more(self):
        self.assertIn('id="fieldOpsQualitySearch"', OPS)
        self.assertIn('id="fieldOpsQualityFilter"', OPS)
        self.assertIn("matchesLocation(item.loc, query)", OPS)
        self.assertIn("data-quality-more", OPS)

    def test_location_rows_can_focus_the_map(self):
        self.assertIn("data-view-index", OPS)
        self.assertIn("window.btMapFocusLocation?.(index)", OPS)
        self.assertIn("window.btMapFocusLocation = function", APP)
        self.assertIn("showLocationDetails(loc, index)", APP)


if __name__ == "__main__":
    unittest.main()
