# BT Locations Map

แผนที่แสดงจุด BT Locations แบบ interactive ใช้ Leaflet.js + MarkerCluster

## โครงสร้างไฟล์

| ไฟล์ | คำอธิบาย |
| --- | --- |
| `all_locations.json` | ข้อมูลหมุดทั้งหมด (source of truth) |
| `build_html.py` | สร้าง `docs/index.html` จาก JSON |
| `merge_sheet.py` | รวมข้อมูลจาก Google Sheet CSV เข้า JSON |
| `import_takeout.py` | Import GeoJSON จาก Google Takeout |
| `auto_city.py` | Auto-detect city จาก GPS (Nominatim) |
| `validate_data.py` | ตรวจจุดซ้ำ/ผิดปกติ |
| `backups/` | Backup อัตโนมัติก่อนทุก build |
| `.github/workflows/build.yml` | GitHub Actions auto build+deploy |
| `docs/index.html` | หน้าเว็บ (generated) — UI, map, CRUD, GitHub save |
| `docs/locations.js` | ข้อมูลหมุดแยกไฟล์ (generated จาก build + GitHub save) |
| `docs/all_locations.json` | สำเนา JSON สำหรับ GitHub Pages |

## ฟีเจอร์ปัจจุบัน

* แสดงหมุดบนแผนที่ พร้อม MarkerCluster + แยกสีตาม list
* ค้นหา + กรองตามรายการ (list) + เขต (city) แบบ multi-filter
* CRUD: เพิ่ม/แก้ไข/ลบ จุดบนแผนที่ + Undo (สูงสุด 20 ครั้ง)
* Bulk delete จุดที่กรองอยู่
* Export / Import JSON
* Heatmap mode แสดงความหนาแน่นของจุด
* Stats dashboard (สถิติจำนวนจุดตามรายการ/เขต)
* Reset พร้อม popup คำเตือน + ดึงข้อมูลใหม่จาก GitHub
* Save to GitHub ผ่าน API (เก็บ token ใน localStorage) — อัปเดท 3 ไฟล์แบบ sequential
* Background sync ข้อมูลข้ามเครื่อง (fetch `all_locations.json` ตอนโหลด)
* Legend สีอธิบาย list + Dark mode + 4 map tiles (Street/Satellite/Terrain/Dark)
* วัดระยะทางระหว่าง 2 จุด (haversine)
* Zoom to filtered อัตโนมัติเมื่อเลือก filter
* Backup อัตโนมัติก่อนทุก build + GitHub Actions auto build
* ข้อมูลหมุดแยกไฟล์ `locations.js` เพื่อให้ `index.html` เบาลง
* Tooltip ชื่อจุดแสดงอัตโนมัติเมื่อ zoom ≥ 15

## วิธี Build

```
python build_html.py
```

จะสร้าง `docs/index.html`, `docs/locations.js`, และ `docs/all_locations.json` ใหม่จาก `all_locations.json`

## วิธีรัน local

```
cd docs
python -m http.server 8080
```

เปิด <http://localhost:8080>

## ⚠️ กฎสำคัญ (ต้องทำทุกครั้ง)

1. **แก้ไขอะไรก็ตาม → บันทึกไฟล์ทันที**
2. **ทำเสร็จ → push ขึ้น GitHub เสมอ**

   ```
   git add -A
   git commit -m "อธิบายสิ่งที่ทำ"
   git pull --rebase origin main
   git push origin main
   ```
3. **หลัง push → restart server**

   ```
   # หยุด server เดิม แล้วรันใหม่
   cd docs
   python -m http.server 8080
   ```
4. **เปิด preview → Ctrl+Shift+R (hard refresh)** เพื่อเลี่ยง cache

## สิ่งที่ต้องทำในอนาคต (TODO)

**ยังค้างอยู่:**

* ปรับปรุง UI ของ popup / modal ให้สวยขึ้นต่อเนื่อง
* ปรับ Mobile responsive ให้ใช้งานง่ายขึ้น (โดยเฉพาะ list panel บนมือถือ)
* เพิ่ม route/ทิศทางระหว่าง 2 จุด (ปัจจุบันวัดเฉพาะระยะทาง)

**Nice-to-have:**

* รองรับ import หลายรูปแบบ (CSV, KML)
* Share link พร้อม filter ที่เลือกอยู่ (URL params)
* ค้นหาชื่อสถานที่จาก Nominatim (geocoding)

## บันทึกการเปลี่ยนแปลง (Changelog)

### 2026-05-02

* สร้าง `import_takeout.py` สำหรับ import GeoJSON จาก Google Takeout
* เพิ่ม multi-filter: กรองตามรายการ + เขต พร้อมกัน
* เพิ่ม Stats dashboard (สถิติจุดตามรายการ/เขต)
* ปรับ Mobile responsive ให้ใช้งานง่ายขึ้น
* เพิ่มปุ่ม Undo (เก็บ history สูงสุด 20 ครั้ง)
* แยกสี marker ตาม list ด้วย CircleMarker + color palette
* เพิ่ม Bulk delete (ลบจุดที่กรองอยู่ทั้งหมด)
* เพิ่ม Heatmap mode (leaflet.heat)
* ลบไฟล์ test ที่ไม่ใช้
* สร้าง `auto_city.py` (reverse geocoding) + `validate_data.py` (ตรวจซ้ำ/ผิดปกติ)
* เพิ่ม Legend สี, Dark mode, 4 map tiles, Zoom to filtered
* เพิ่มวัดระยะทางระหว่าง 2 จุด (📏)
* เพิ่ม GitHub Actions auto build + Backup อัตโนมัติ
* `build_html.py` สร้าง `docs/locations.js` + copy `all_locations.json` อัตโนมัติ
* เพิ่ม background sync: fetch `all_locations.json` เพื่อ sync ข้อมูลข้ามเครื่อง
* ปรับ UI: popup มี gradient header, modal มี animation + backdrop blur + gradient buttons
* แยกข้อมูลหมุดออกจาก `index.html` → `locations.js` (ลดจาก 1,664 เหลือ ~535 บรรทัด)
* เพิ่ม popup คำเตือนตอนกด Reset + ดึงข้อมูลล่าสุดจาก GitHub หลัง reset
* เพิ่มปุ่ม Save to GitHub (sequential PUT ป้องกัน SHA mismatch)
* เพิ่ม CRUD (เพิ่ม/แก้ไข/ลบ จุด) + Export/Import JSON
* เพิ่ม city field ใน location data
* สร้าง `merge_sheet.py` สำหรับรวมข้อมูลจาก Google Sheet
* Tooltip ชื่อจุดแสดงอัตโนมัติเมื่อ zoom ≥ 15
* แก้ไข GitHub Save ให้ทำงานแบบ sequential เพื่อป้องกัน SHA mismatch
