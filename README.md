# BT Locations Map

แผนที่แสดงจุด BT Locations แบบ interactive ใช้ Leaflet.js + MarkerCluster

## โครงสร้างไฟล์

| ไฟล์ | คำอธิบาย |
|------|----------|
| `all_locations.json` | ข้อมูลหมุดทั้งหมด (source of truth) |
| `build_html.py` | สร้าง `docs/index.html` จาก JSON |
| `merge_sheet.py` | รวมข้อมูลจาก Google Sheet CSV เข้า JSON |
| `import_takeout.py` | Import GeoJSON จาก Google Takeout |
| `docs/index.html` | หน้าเว็บ (generated) — UI, map, CRUD, GitHub save |
| `docs/locations.js` | ข้อมูลหมุดแยกไฟล์ (generated จาก build) |
| `docs/all_locations.json` | สำเนา JSON สำหรับ GitHub Pages |

## ฟีเจอร์ปัจจุบัน

- แสดงหมุดบนแผนที่ พร้อม MarkerCluster + แยกสีตาม list
- ค้นหา + กรองตามรายการ (list) + เขต (city) แบบ multi-filter
- CRUD: เพิ่ม/แก้ไข/ลบ จุดบนแผนที่ + Undo (สูงสุด 20 ครั้ง)
- Bulk delete จุดที่กรองอยู่
- Export / Import JSON
- Heatmap mode แสดงความหนาแน่นของจุด
- Stats dashboard (สถิติจำนวนจุดตามรายการ/เขต)
- Reset พร้อม popup คำเตือน
- Save to GitHub ผ่าน API (เก็บ token ใน localStorage)
- Background sync ข้อมูลข้ามเครื่อง
- ข้อมูลหมุดแยกไฟล์ `locations.js` เพื่อให้ `index.html` เบาลง

## วิธี Build

```bash
python build_html.py
```

จะสร้าง `docs/index.html` ใหม่จาก `all_locations.json`

**หมายเหตุ:** หลัง build ต้อง copy ข้อมูลหมุดไปไว้ใน `docs/locations.js` ด้วย (ตอนนี้ build_html.py ยังไม่ได้ generate locations.js อัตโนมัติ)

## วิธีรัน local

```bash
cd docs
python -m http.server 8080
```

เปิด http://localhost:8080

## ⚠️ กฎสำคัญ (ต้องทำทุกครั้ง)

1. **แก้ไขอะไรก็ตาม → บันทึกไฟล์ทันที**
2. **ทำเสร็จ → push ขึ้น GitHub เสมอ**
   ```bash
   git add -A
   git commit -m "อธิบายสิ่งที่ทำ"
   git pull --rebase origin main
   git push origin main
   ```
3. **หลัง push → restart server**
   ```bash
   # หยุด server เดิม แล้วรันใหม่
   cd docs
   python -m http.server 8080
   ```
4. **เปิด preview → Ctrl+Shift+R (hard refresh)** เพื่อเลี่ยง cache

## สิ่งที่ต้องทำในอนาคต (TODO)

- [x] ให้ `build_html.py` generate `docs/locations.js` อัตโนมัติ
- [x] Sync ข้อมูลข้ามเครื่อง (background fetch `all_locations.json`)
- [x] ปรับปรุง UI ของ popup / modal ให้สวยขึ้น

**ควรทำ:**
- [x] สร้าง `import_takeout.py` — import GeoJSON จาก Google Takeout อัตโนมัติ
- [x] ลบไฟล์ test ที่ไม่ใช้ (`docs/test.html`, `test_html.js`)

**น่าทำ:**
- [x] ค้นหา/กรองแบบ multi-filter (ชื่อ + เขต + รายการ พร้อมกัน)
- [x] แสดงสถิติ dashboard (จำนวนจุดต่อเขต, ต่อรายการ)
- [x] ปรับ Mobile responsive ให้ใช้งานง่ายขึ้น
- [x] เพิ่มปุ่ม Undo ย้อนการแก้ไขล่าสุด

**Nice-to-have:**
- [x] แยกสี marker ตาม list (CircleMarker + color palette)
- [x] Bulk delete (ลบจุดที่กรองอยู่ทั้งหมด)
- [x] Heatmap mode แสดงความหนาแน่นของจุด (leaflet.heat)

**ด้านข้อมูล:**
- [ ] Auto-detect city จาก GPS (reverse geocoding จาก Nominatim)
- [ ] ตรวจจุดซ้ำ (Duplicate Detection) — เตือนจุดที่ห่างกัน < 50 เมตร
- [ ] ตรวจจุดผิดปกติ — lat/lng = 0, นอกประเทศไทย, ไม่มีชื่อ

**ด้าน UI/UX:**
- [ ] แสดง Legend สี — อธิบายว่าสีไหนคือ list อะไร
- [ ] Zoom to filtered — กด filter แล้ว map zoom ไปที่กลุ่มจุดอัตโนมัติ
- [ ] Dark mode — สลับ theme มืด/สว่าง
- [ ] แสดง route/ระยะทาง ระหว่าง 2 จุด

**ด้านระบบ:**
- [ ] Auto build + deploy (GitHub Actions รัน `build_html.py` เมื่อ push)
- [ ] Backup อัตโนมัติ ก่อนทุกการแก้ไข
- [ ] รองรับหลาย map tile (OpenStreetMap, Satellite, Terrain)

## บันทึกการเปลี่ยนแปลง (Changelog)

### 2026-05-02
- สร้าง `import_takeout.py` สำหรับ import GeoJSON จาก Google Takeout
- เพิ่ม multi-filter: กรองตามรายการ + เขต พร้อมกัน
- เพิ่ม Stats dashboard (สถิติจุดตามรายการ/เขต)
- ปรับ Mobile responsive ให้ใช้งานง่ายขึ้น
- เพิ่มปุ่ม Undo (เก็บ history สูงสุด 20 ครั้ง)
- แยกสี marker ตาม list ด้วย CircleMarker + color palette
- เพิ่ม Bulk delete (ลบจุดที่กรองอยู่ทั้งหมด)
- เพิ่ม Heatmap mode (leaflet.heat)
- ลบไฟล์ test ที่ไม่ใช้
- `build_html.py` สร้าง `docs/locations.js` + copy `all_locations.json` อัตโนมัติ
- เพิ่ม background sync: fetch `all_locations.json` เพื่อ sync ข้อมูลข้ามเครื่อง
- ปรับ UI: popup มี gradient header, modal มี animation + backdrop blur + gradient buttons
- แยกข้อมูลหมุดออกจาก `index.html` → `locations.js` (ลดจาก 1,664 เหลือ ~535 บรรทัด)
- เพิ่ม popup คำเตือนตอนกด Reset
- เพิ่มปุ่ม Save to GitHub + Token modal
- เพิ่ม CRUD (เพิ่ม/แก้ไข/ลบ จุด) + Export/Import JSON
- เพิ่ม city field ใน location data
- สร้าง `merge_sheet.py` สำหรับรวมข้อมูลจาก Google Sheet
