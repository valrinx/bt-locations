import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / "docs" / "app.js").read_text(encoding="utf-8")
THEME = (ROOT / "docs" / "bugatti-theme.css").read_text(encoding="utf-8")


class MapAppLauncherTests(unittest.TestCase):
    def test_place_card_offers_compact_map_apps(self):
        self.assertIn('aria-label="เปิดเส้นทางด้วยแอปแผนที่"', APP)
        for app in ("google", "waze", "apple"):
            with self.subTest(app=app):
                self.assertIn(f"openMapApp('{app}',${{idx}})", APP)

    def test_each_provider_uses_an_official_deep_link(self):
        self.assertIn("https://www.google.com/maps/dir/", APP)
        self.assertIn("https://www.waze.com/ul?", APP)
        self.assertIn("https://maps.apple.com/?", APP)
        self.assertIn("navigate=yes", APP)
        self.assertIn("travelmode=driving", APP)

    def test_invalid_coordinates_do_not_open_a_link(self):
        self.assertIn("Number.isFinite(lat)", APP)
        self.assertIn("Math.abs(lat) > 90", APP)
        self.assertIn("Math.abs(lng) > 180", APP)
        self.assertIn("if(!url)", APP)

    def test_launcher_has_compact_responsive_styles(self):
        self.assertIn(".map-app-launcher", THEME)
        self.assertIn(".map-app-options", THEME)
        self.assertIn(".map-app-btn", THEME)
        self.assertIn("min-height: 32px", THEME)
        self.assertIn("flex-wrap: wrap", THEME)


if __name__ == "__main__":
    unittest.main()
