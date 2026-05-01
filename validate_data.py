"""
Validate all_locations.json — ตรวจจุดซ้ำ, จุดผิดปกติ

Usage: python validate_data.py
       python validate_data.py --fix   (auto-fix where possible)
"""

import json
import sys
import math

JSON_FILE = 'all_locations.json'

# Thailand bounding box (approximate)
TH_LAT_MIN, TH_LAT_MAX = 5.5, 20.5
TH_LNG_MIN, TH_LNG_MAX = 97.0, 106.0

DUPLICATE_THRESHOLD_METERS = 50


def haversine(lat1, lng1, lat2, lng2):
    """Distance in meters between two GPS points."""
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def main():
    fix_mode = '--fix' in sys.argv

    with open(JSON_FILE, 'r', encoding='utf-8') as f:
        locs = json.load(f)

    print(f'Total locations: {len(locs)}')
    issues = []

    # === Check 1: lat/lng = 0 ===
    zero_coords = [i for i, l in enumerate(locs) if l['lat'] == 0 and l['lng'] == 0]
    if zero_coords:
        print(f'\n❌ จุดที่ lat/lng = 0: {len(zero_coords)}')
        for i in zero_coords:
            print(f'  [{i}] {locs[i]["name"]} (list: {locs[i]["list"]})')
            issues.append(('zero_coords', i))

    # === Check 2: Outside Thailand ===
    outside = []
    for i, l in enumerate(locs):
        if l['lat'] == 0 and l['lng'] == 0:
            continue
        if not (TH_LAT_MIN <= l['lat'] <= TH_LAT_MAX and TH_LNG_MIN <= l['lng'] <= TH_LNG_MAX):
            outside.append(i)
    if outside:
        print(f'\n⚠️ จุดนอกประเทศไทย: {len(outside)}')
        for i in outside:
            print(f'  [{i}] {locs[i]["name"]} ({locs[i]["lat"]}, {locs[i]["lng"]}) list: {locs[i]["list"]}')
            issues.append(('outside_th', i))

    # === Check 3: No name ===
    no_name = [i for i, l in enumerate(locs) if not l.get('name', '').strip()]
    if no_name:
        print(f'\n⚠️ จุดไม่มีชื่อ: {len(no_name)}')
        for i in no_name:
            print(f'  [{i}] lat:{locs[i]["lat"]}, lng:{locs[i]["lng"]} list: {locs[i]["list"]}')
            issues.append(('no_name', i))

    # === Check 4: Duplicates (< threshold meters) ===
    print(f'\nกำลังตรวจจุดซ้ำ (< {DUPLICATE_THRESHOLD_METERS}m)...')
    duplicates = []
    for i in range(len(locs)):
        if locs[i]['lat'] == 0:
            continue
        for j in range(i + 1, len(locs)):
            if locs[j]['lat'] == 0:
                continue
            dist = haversine(locs[i]['lat'], locs[i]['lng'], locs[j]['lat'], locs[j]['lng'])
            if dist < DUPLICATE_THRESHOLD_METERS:
                duplicates.append((i, j, dist))
    if duplicates:
        print(f'\n🔄 จุดที่อาจซ้ำ: {len(duplicates)} คู่')
        for i, j, dist in duplicates[:20]:
            print(f'  [{i}] {locs[i]["name"]} <-> [{j}] {locs[j]["name"]}  ({dist:.1f}m)')
        if len(duplicates) > 20:
            print(f'  ... และอีก {len(duplicates) - 20} คู่')
    else:
        print('✅ ไม่พบจุดซ้ำ')

    # === Check 5: Empty city ===
    no_city = [i for i, l in enumerate(locs) if not l.get('city', '').strip()]
    if no_city:
        print(f'\n⚠️ จุดไม่มีเขต (city): {len(no_city)}')

    # === Summary ===
    total_issues = len(issues) + len(duplicates) + len(no_city)
    print(f'\n=== สรุป ===')
    print(f'จุด lat/lng=0: {len(zero_coords)}')
    print(f'จุดนอกไทย: {len(outside)}')
    print(f'จุดไม่มีชื่อ: {len(no_name)}')
    print(f'จุดอาจซ้ำ: {len(duplicates)} คู่')
    print(f'จุดไม่มีเขต: {len(no_city)}')
    print(f'รวมปัญหา: {total_issues}')

    if fix_mode and zero_coords:
        print(f'\n🔧 ลบจุด lat/lng=0 ({len(zero_coords)} จุด)...')
        locs = [l for i, l in enumerate(locs) if i not in set(zero_coords)]
        with open(JSON_FILE, 'w', encoding='utf-8') as f:
            json.dump(locs, f, ensure_ascii=False, indent=2)
        print(f'เหลือ {len(locs)} จุด — บันทึกแล้ว')


if __name__ == '__main__':
    main()
