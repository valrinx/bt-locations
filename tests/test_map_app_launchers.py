import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / "docs" / "app.js").read_text(encoding="utf-8")
THEME = (ROOT / "docs" / "bugatti-theme.css").read_text(encoding="utf-8")


class MapAppLauncherTests(unittest.TestCase):
    def test_place_card_opens_an_accessible_map_chooser(self):
        self.assertIn('id="mapAppTrigger"', APP)
        self.assertIn('aria-haspopup="menu"', APP)
        self.assertIn('aria-controls="mapAppPicker"', APP)
        self.assertIn('role="menu"', APP)
        self.assertIn("toggleMapAppPicker(event)", APP)
        for app in ("google", "waze", "apple", "papago"):
            with self.subTest(app=app):
                self.assertIn(f"openMapApp('{app}',${{idx}})", APP)

    def test_each_provider_uses_an_official_deep_link(self):
        self.assertIn("https://www.google.com/maps/dir/", APP)
        self.assertIn("https://www.waze.com/ul?", APP)
        self.assertIn("https://maps.apple.com/?", APP)
        self.assertIn("com.aveiro.papago", APP)
        self.assertIn(
            "https://play.google.com/store/apps/details?id=com.aveiro.papago",
            APP,
        )
        self.assertIn("scheme=compapago", APP)
        self.assertIn("route/plan/?sourceApplication=bt-locations", APP)
        self.assertIn("dlat=${encodeURIComponent(lat)}", APP)
        self.assertIn("dlon=${encodeURIComponent(lng)}", APP)
        self.assertIn("<strong>papagoMaps</strong><small>Android</small>", APP)
        self.assertIn("userAgent = navigator.userAgent", APP)
        self.assertIn("navigate=yes", APP)
        self.assertIn("travelmode=driving", APP)

    def test_invalid_coordinates_do_not_open_a_link(self):
        self.assertIn("Number.isFinite(lat)", APP)
        self.assertIn("Math.abs(lat) > 90", APP)
        self.assertIn("Math.abs(lng) > 180", APP)
        self.assertIn("if(!url)", APP)

    def test_papago_destination_name_falls_back_to_location_metadata(self):
        self.assertIn("const destinationName = [loc.name, loc.list, loc.city]", APP)
        self.assertIn(".find(Boolean) || coords", APP)
        self.assertIn("papago: _getPapagoUrl(coords, destinationName)", APP)

    def test_launcher_has_compact_popover_styles(self):
        self.assertIn(".map-app-launcher", THEME)
        self.assertIn(".map-app-trigger", THEME)
        self.assertIn(".map-app-popover", THEME)
        self.assertIn(".map-app-options", THEME)
        self.assertIn(".map-app-btn", THEME)
        self.assertIn("grid-template-columns: repeat(2, minmax(0, 1fr))", THEME)
        self.assertIn("transition: opacity 160ms ease", THEME)

    def test_each_map_provider_has_a_distinct_visual_identity(self):
        for app in ("google", "waze", "apple", "papago"):
            with self.subTest(app=app):
                self.assertIn(f"map-app-btn map-app-{app}", APP)
                self.assertIn(f".map-app-{app}", THEME)
        self.assertIn("--map-app-accent:", THEME)
        self.assertIn("--map-app-surface:", THEME)

    def test_chooser_closes_on_escape_and_outside_click(self):
        self.assertIn("if(!event.target.closest('.map-app-launcher'))", APP)
        self.assertIn("if(event.key === 'Escape')", APP)
        self.assertIn("closeMapAppPicker(true)", APP)


if __name__ == "__main__":
    unittest.main()
