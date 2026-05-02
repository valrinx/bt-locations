"""
Import Google Takeout files (GeoJSON or CSV) into all_locations.json

วิธีใช้:
1. ไปที่ https://takeout.google.com/
2. เลือก "Saved" (บันทึกไว้) แล้ว Export
3. แตก zip จะได้โฟลเดอร์ที่มีไฟล์ .geojson หรือ .csv
4. รัน: python import_takeout.py path/to/Saved
   หรือ: python import_takeout.py path/to/folder
   หรือ: python import_takeout.py file1.csv file2.geojson
"""

import json
import os
import sys
import glob
import csv
import re

# Config
JSON_FILE = 'all_locations.json'
TAKEOUT_DIR = 'takeout'

# ไฟล์ CSV ที่ไม่ใช่ข้อมูลหมุดจริง (ข้ามไป)
SKIP_LISTS = {
    'Favorite places', 'Want to go',
}
# ไฟล์ขนาดเล็กมาก (33 bytes = empty) ข้ามเลย
MIN_FILE_SIZE = 50


def extract_coords_from_url(url):
    """Extract lat,lng from Google Maps URL."""
    if not url:
        return None, None
    # Pattern: /search/lat,lng or /place/.../data or @lat,lng
    m = re.search(r'/search/([-\d.]+),([-\d.]+)', url)
    if m:
        return float(m.group(1)), float(m.group(2))
    m = re.search(r'@([-\d.]+),([-\d.]+)', url)
    if m:
        return float(m.group(1)), float(m.group(2))
    return None, None


def load_csv(filepath):
    """Parse a Google Takeout CSV file and extract location entries."""
    list_name = os.path.splitext(os.path.basename(filepath))[0]

    entries = []
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            title = (row.get('Title') or '').strip()
            url = (row.get('URL') or '').strip()
            note = (row.get('Note') or '').strip()

            lat, lng = extract_coords_from_url(url)
            if lat is None or lng is None:
                continue
            if lat == 0 and lng == 0:
                continue

            name = title if title else ''

            entries.append({
                'name': name,
                'lat': lat,
                'lng': lng,
                'list': list_name,
                'city': ''
            })

    return entries


def load_geojson(filepath):
    """Parse a GeoJSON file and extract location entries."""
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # ชื่อ list = ชื่อไฟล์ (ไม่รวม extension)
    list_name = os.path.splitext(os.path.basename(filepath))[0]

    entries = []
    features = data.get('features', [])
    for feat in features:
        props = feat.get('properties', {})
        geom = feat.get('geometry', {})

        # Google Takeout format: geometry.coordinates = [lng, lat]
        coords = geom.get('coordinates', [])
        if not coords or len(coords) < 2:
            continue

        lng = float(coords[0])
        lat = float(coords[1])

        if lat == 0 and lng == 0:
            continue

        # ชื่อจุด: ลอง properties.name, Title, หรือ address
        name = (props.get('name')
                or props.get('Title')
                or props.get('google_maps_url', '')
                or props.get('address', '')
                or '')

        # เขต/เมือง: ลอง properties.address
        address = props.get('address', '')

        entries.append({
            'name': name.strip(),
            'lat': lat,
            'lng': lng,
            'list': list_name,
            'city': ''
        })

    return entries


def main():
    # หา GeoJSON files
    geojson_files = []

    all_files = []

    if len(sys.argv) > 1:
        for arg in sys.argv[1:]:
            if os.path.isdir(arg):
                all_files.extend(glob.glob(os.path.join(arg, '*.geojson')))
                all_files.extend(glob.glob(os.path.join(arg, '*.json')))
                all_files.extend(glob.glob(os.path.join(arg, '*.csv')))
            elif os.path.isfile(arg):
                all_files.append(arg)
    else:
        if os.path.isdir(TAKEOUT_DIR):
            all_files.extend(glob.glob(os.path.join(TAKEOUT_DIR, '*.geojson')))
            all_files.extend(glob.glob(os.path.join(TAKEOUT_DIR, '*.json')))
            all_files.extend(glob.glob(os.path.join(TAKEOUT_DIR, '*.csv')))

    # Filter out small/empty files and skip lists
    all_files = [f for f in all_files if os.path.getsize(f) >= MIN_FILE_SIZE]
    all_files = [f for f in all_files
                 if os.path.splitext(os.path.basename(f))[0] not in SKIP_LISTS]

    if not all_files:
        print(f'ไม่พบไฟล์ GeoJSON/CSV')
        print(f'ระบุ path: python import_takeout.py path/to/Saved')
        sys.exit(1)

    geojson_files = all_files

    # โหลด all_locations.json
    if os.path.exists(JSON_FILE):
        with open(JSON_FILE, 'r', encoding='utf-8') as f:
            all_locs = json.load(f)
    else:
        all_locs = []

    # Ensure city field
    for loc in all_locs:
        if 'city' not in loc:
            loc['city'] = ''

    # ดึง existing coords เพื่อเช็คซ้ำ (ใช้ lat,lng round 6 ตำแหน่ง)
    existing = set()
    for loc in all_locs:
        key = (round(loc['lat'], 6), round(loc['lng'], 6))
        existing.add(key)

    total_added = 0
    total_skipped = 0

    for filepath in geojson_files:
        basename = os.path.basename(filepath)
        ext = os.path.splitext(filepath)[1].lower()
        print(f'\nกำลังอ่าน: {basename}')
        if ext == '.csv':
            entries = load_csv(filepath)
        else:
            entries = load_geojson(filepath)
        added = 0
        skipped = 0

        for entry in entries:
            key = (round(entry['lat'], 6), round(entry['lng'], 6))
            if key in existing:
                skipped += 1
                continue
            all_locs.append(entry)
            existing.add(key)
            added += 1

        print(f'  พบ {len(entries)} จุด → เพิ่ม {added}, ซ้ำ {skipped}')
        total_added += added
        total_skipped += skipped

    # บันทึก
    with open(JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(all_locs, f, ensure_ascii=False, indent=2)

    print(f'\n=== สรุป ===')
    print(f'เพิ่มใหม่: {total_added} จุด')
    print(f'ซ้ำ (ข้าม): {total_skipped} จุด')
    print(f'รวมทั้งหมด: {len(all_locs)} จุด')
    print(f'บันทึกลง {JSON_FILE} เรียบร้อย')
    print(f'\nอย่าลืมรัน: python build_html.py')


if __name__ == '__main__':
    main()
