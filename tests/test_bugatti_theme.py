import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
INDEX = (DOCS / "index.html").read_text(encoding="utf-8")
THEME = (DOCS / "bugatti-theme.css").read_text(encoding="utf-8")
SW = (DOCS / "sw.js").read_text(encoding="utf-8")
APP = (DOCS / "app.js").read_text(encoding="utf-8")


class BugattiThemeTests(unittest.TestCase):
    def test_theme_is_loaded_after_existing_styles(self):
        self.assertLess(INDEX.index("auth.css?v=7.5.4"), INDEX.index("redesign.css?v=7.5.4"))
        self.assertLess(
            INDEX.index("redesign.css?v=7.5.4"),
            INDEX.index("bugatti-theme.css?v=7.5.4"),
        )

    def test_theme_covers_core_surfaces(self):
        for selector in (
            ".topbar",
            ".sidebar",
            ".mob-nav",
            ".mob-drawer-panel",
            ".auth-modal",
            ".list-view",
            ".stats-view",
            ".place-card",
            ".modal",
        ):
            with self.subTest(selector=selector):
                self.assertIn(selector, THEME)

    def test_theme_preserves_dark_identity_in_light_override(self):
        self.assertRegex(THEME, r":root,\s*body\.light\s*\{")
        self.assertIn("--bug-canvas:", THEME)
        self.assertIn("--bug-display:", THEME)
        self.assertIn("--bug-mono:", THEME)

    def test_theme_avoids_reference_anti_patterns(self):
        self.assertNotRegex(THEME.lower(), r"#[0]{3}(?:[0]{3})?\b")
        self.assertNotRegex(THEME.lower(), r"#[f]{3}(?:[f]{3})?\b")
        self.assertNotIn("linear-gradient", THEME)
        self.assertNotIn("radial-gradient", THEME)
        self.assertNotIn("background-clip", THEME)

    def test_release_assets_are_versioned_and_cached(self):
        self.assertIn("const APP_VERSION = 'v7.5.4';", APP)
        self.assertIn("bt-locations-v7.5.4", SW)
        self.assertIn("'bugatti-theme.css'", SW)


if __name__ == "__main__":
    unittest.main()
