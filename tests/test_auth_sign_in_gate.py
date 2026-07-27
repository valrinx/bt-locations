import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
AUTH = (ROOT / "docs" / "auth.js").read_text(encoding="utf-8")
INDEX = (ROOT / "docs" / "index.html").read_text(encoding="utf-8")


class AuthSignInGateTests(unittest.TestCase):
    def test_guest_state_requires_sign_in(self):
        self.assertIn(
            "const signInRequired = () => state.ready && !state.user;",
            AUTH,
        )
        self.assertIn("document.body.classList.toggle('auth-required', required)", AUTH)
        self.assertIn("app.inert = required", AUTH)
        self.assertIn("setOpen(el('authModalOverlay'), true)", AUTH)

    def test_required_sign_in_cannot_be_dismissed(self):
        close_guard = AUTH.index("if (signInRequired())")
        close_action = AUTH.index("setOpen(el('authModalOverlay'), false)", close_guard)
        self.assertLess(close_guard, close_action)
        self.assertIn("closeButton.hidden = required", AUTH)

    def test_sign_out_immediately_restores_gate(self):
        self.assertIn("await applySession(null);", AUTH)

    def test_gate_explains_new_account_permissions(self):
        self.assertIn('class="auth-gate-note"', INDEX)
        self.assertIn("บัญชีใหม่จะเริ่มด้วยสิทธิ์ดูข้อมูล", INDEX)


if __name__ == "__main__":
    unittest.main()
