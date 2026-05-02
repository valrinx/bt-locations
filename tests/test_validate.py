"""Unit tests for validate_data.py"""
import sys, os, json, tempfile, math
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from validate_data import haversine


def test_haversine_zero_distance():
    assert haversine(13.88, 100.49, 13.88, 100.49) == 0


def test_haversine_known_distance():
    # Bangkok to Chiang Mai ≈ 586km
    d = haversine(13.7563, 100.5018, 18.7883, 98.9853)
    assert 580_000 < d < 600_000, f"Expected ~586km, got {d/1000:.0f}km"


def test_haversine_short_distance():
    # ~111m per 0.001 degree lat at equator-ish
    d = haversine(13.0, 100.0, 13.001, 100.0)
    assert 100 < d < 120, f"Expected ~111m, got {d:.1f}m"


def test_haversine_symmetry():
    d1 = haversine(13.0, 100.0, 14.0, 101.0)
    d2 = haversine(14.0, 101.0, 13.0, 100.0)
    assert abs(d1 - d2) < 0.01


class TestValidation:
    """Test the validation checks from validate_data.py"""

    def _make_loc(self, name="Test", lat=13.88, lng=100.49, lst="TestList", city="TestCity"):
        return {"name": name, "lat": lat, "lng": lng, "list": lst, "city": city}

    def test_zero_coord_detection(self):
        locs = [self._make_loc(lat=0, lng=0), self._make_loc()]
        zeros = [i for i, l in enumerate(locs) if l['lat'] == 0 and l['lng'] == 0]
        assert len(zeros) == 1
        assert zeros[0] == 0

    def test_outside_thailand(self):
        TH_LAT_MIN, TH_LAT_MAX = 5.5, 20.5
        TH_LNG_MIN, TH_LNG_MAX = 97.0, 106.0
        locs = [
            self._make_loc(lat=35.0, lng=139.0),   # Tokyo
            self._make_loc(lat=13.88, lng=100.49),  # Bangkok
        ]
        outside = [i for i, l in enumerate(locs)
                    if not (TH_LAT_MIN <= l['lat'] <= TH_LAT_MAX and TH_LNG_MIN <= l['lng'] <= TH_LNG_MAX)]
        assert len(outside) == 1
        assert outside[0] == 0

    def test_no_name_detection(self):
        locs = [self._make_loc(name=""), self._make_loc(name="  "), self._make_loc(name="Valid")]
        no_name = [i for i, l in enumerate(locs) if not l.get('name', '').strip()]
        assert len(no_name) == 2

    def test_duplicate_detection(self):
        loc1 = self._make_loc(lat=13.88, lng=100.49)
        loc2 = self._make_loc(lat=13.880001, lng=100.490001)  # < 1m apart
        loc3 = self._make_loc(lat=14.0, lng=101.0)            # far away
        locs = [loc1, loc2, loc3]
        dupes = []
        for i in range(len(locs)):
            for j in range(i+1, len(locs)):
                if haversine(locs[i]['lat'], locs[i]['lng'], locs[j]['lat'], locs[j]['lng']) < 50:
                    dupes.append((i, j))
        assert len(dupes) == 1
        assert dupes[0] == (0, 1)

    def test_no_city_detection(self):
        locs = [self._make_loc(city=""), self._make_loc(city="Bangkok")]
        no_city = [i for i, l in enumerate(locs) if not l.get('city', '').strip()]
        assert len(no_city) == 1


if __name__ == '__main__':
    import pytest
    pytest.main([__file__, '-v'])
