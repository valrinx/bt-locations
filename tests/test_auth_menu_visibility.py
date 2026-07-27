import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "docs" / "index.html").read_text(encoding="utf-8")
AUTH = (ROOT / "docs" / "auth.js").read_text(encoding="utf-8")
REDESIGN = (ROOT / "docs" / "redesign.css").read_text(encoding="utf-8")


class AuthMenuVisibilityTests(unittest.TestCase):
    def assert_hidden_permission(self, action, permission):
        pattern = (
            rf'<button[^>]*data-auth-permission="{permission}"'
            rf'[^>]*data-auth-hide[^>]*hidden[^>]*'
            rf'onclick="{re.escape(action)}'
        )
        self.assertRegex(INDEX, pattern)

    def test_sensitive_mobile_actions_are_hidden_until_authorized(self):
        for action, permission in (
            ("doUndo();", "restore"),
            ("doRedo();", "restore"),
            ("protectedDataAction('import');", "import"),
            ("protectedDataAction('restore');", "restore"),
            ("protectedDataAction('deleteAll');", "delete"),
        ):
            with self.subTest(action=action):
                self.assert_hidden_permission(action, permission)

    def test_auth_renderer_controls_visibility_from_permissions(self):
        self.assertIn("node.hidden = !allowed", AUTH)
        self.assertIn("node.hasAttribute('data-auth-hide')", AUTH)

    def test_hidden_menu_items_cannot_be_overridden_by_component_display(self):
        self.assertIn(".mob-menu-item[data-auth-hide][hidden]", REDESIGN)
        self.assertRegex(
            REDESIGN,
            r"\.mob-menu-item\[data-auth-hide\]\[hidden\]\s*\{\s*"
            r"display:\s*none\s*!important;",
        )


if __name__ == "__main__":
    unittest.main()
