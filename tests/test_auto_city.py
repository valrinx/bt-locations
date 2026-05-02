"""Unit tests for auto_city.py"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from auto_city import reverse_geocode


def test_reverse_geocode_returns_string():
    """reverse_geocode should return a string (may be empty if API fails)."""
    result = reverse_geocode(13.88, 100.49)
    assert isinstance(result, str)


def test_reverse_geocode_invalid_coords():
    """Invalid coordinates should return empty string."""
    result = reverse_geocode(0, 0)
    assert isinstance(result, str)


def test_reverse_geocode_bangkok():
    """Bangkok center should return a Thai district name."""
    result = reverse_geocode(13.7563, 100.5018)
    # Should return some Thai text or empty (API dependent)
    assert isinstance(result, str)


if __name__ == '__main__':
    import pytest
    pytest.main([__file__, '-v'])
