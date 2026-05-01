"""
Auto-detect city/district from GPS coordinates using OpenStreetMap Nominatim.
Updates all_locations.json with detected city names.

Usage: python auto_city.py
       python auto_city.py --force   (overwrite existing city values)

Note: Nominatim has a rate limit of 1 request/second.
"""

import json
import sys
import time
import urllib.request
import urllib.parse

JSON_FILE = 'all_locations.json'
NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse'
USER_AGENT = 'bt-locations-app/1.0'
DELAY = 1.1  # seconds between requests (respect rate limit)


def reverse_geocode(lat, lng):
    """Get district/city name from lat,lng using Nominatim."""
    params = urllib.parse.urlencode({
        'format': 'json',
        'lat': lat,
        'lon': lng,
        'zoom': 14,
        'addressdetails': 1,
        'accept-language': 'th'
    })
    url = f'{NOMINATIM_URL}?{params}'
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            addr = data.get('address', {})
            # Try district > city_district > suburb > county > city
            return (addr.get('district')
                    or addr.get('city_district')
                    or addr.get('suburb')
                    or addr.get('county')
                    or addr.get('city')
                    or addr.get('town')
                    or addr.get('village')
                    or '')
    except Exception as e:
        print(f'  Error: {e}')
        return ''


def main():
    force = '--force' in sys.argv

    with open(JSON_FILE, 'r', encoding='utf-8') as f:
        locs = json.load(f)

    # Filter locations that need city
    if force:
        targets = [l for l in locs if l.get('lat') and l.get('lng')]
    else:
        # Only update if city is empty or city == list (was auto-copied)
        targets = [l for l in locs if not l.get('city', '')
                   or l['city'] == l['list']]

    print(f'Total locations: {len(locs)}')
    print(f'Targets to geocode: {len(targets)}')

    if not targets:
        print('Nothing to update!')
        return

    updated = 0
    errors = 0

    for i, loc in enumerate(targets):
        lat, lng = loc['lat'], loc['lng']
        if lat == 0 and lng == 0:
            continue

        print(f'[{i+1}/{len(targets)}] {loc["name"] or loc["list"]} ({lat}, {lng})...', end=' ')

        city = reverse_geocode(lat, lng)
        if city:
            loc['city'] = city
            updated += 1
            print(f'-> {city}')
        else:
            errors += 1
            print('-> (not found)')

        time.sleep(DELAY)

    with open(JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(locs, f, ensure_ascii=False, indent=2)

    print(f'\n=== สรุป ===')
    print(f'อัปเดต city: {updated}')
    print(f'ไม่พบ: {errors}')
    print(f'บันทึกลง {JSON_FILE}')
    print(f'\nอย่าลืมรัน: python build_html.py')


if __name__ == '__main__':
    main()
