# BT Locations Map

แผนที่แสดงจุด BT Locations แบบ interactive ใช้ Leaflet.js + MarkerCluster

🌐 **Live site:** [https://valrinx.github.io/bt-locations](https://valrinx.github.io/bt-locations)

---

## โครงสร้างไฟล์

| ไฟล์ | คำอธิบาย |
| --- | --- |
| `all_locations.json` | ข้อมูลหมุดทั้งหมด (source of truth) |
| `build_html.py` | สร้าง `docs/index.html` + `docs/locations.js` จาก JSON |
| `merge_sheet.py` | รวมข้อมูลจาก Google Sheet CSV เข้า JSON |
| `import_takeout.py` | Import GeoJSON จาก Google Takeout |
| `auto_city.py` | Auto-detect city จาก GPS (reverse geocoding Nominatim) |
| `validate_data.py` | ตรวจจุดซ้ำ (< 50m) และจุดผิดปกติ (lat/lng=0, นอกไทย, ไม่มีชื่อ) |
| `backups/` | Backup อัตโนมัติก่อนทุก build |
| `.github/workflows/build.yml` | GitHub Actions auto build + deploy |
| `docs/index.html` | หน้าเว็บ (generated) — UI, map, CRUD, GitHub save |
| `docs/locations.js` | ข้อมูลหมุดแยกไฟล์ (generated จาก build) |
| `docs/all_locations.json` | สำเนา JSON สำหรับ GitHub Pages |

---

## ฟีเจอร์ปัจจุบัน

- แสดงหมุดบนแผนที่พร้อม MarkerCluster + แยกสีตาม list (CircleMarker + color palette)
- ค้นหา + กรองตามรายการ (list) + เขต (city) แบบ multi-filter
- CRUD: เพิ่ม / แก้ไข / ลบจุดบนแผนที่ + Undo สูงสุด 20 ครั้ง
- Bulk delete จุดที่กรองอยู่
- Export JSON แบบเลือกกรองได้ (ตามรายการ / เขต / ทั้งหมด) พร้อมรองรับ Share API และดาวน์โหลด
- Import JSON แบบ **Merge** (เพิ่มจุดใหม่ ไม่ลบของเดิม) หรือ **Replace** (แทนที่ทั้งหมด)
- Heatmap mode แสดงความหนาแน่นของจุด (leaflet.heat)
- Stats dashboard (สถิติจำนวนจุดตามรายการ/เขต)
- Reset พร้อม popup คำเตือน
- Save to GitHub ผ่าน API (เก็บ token ใน localStorage)
- Background sync ข้อมูลข้ามเครื่อง (fetch `all_locations.json`)
- Legend สี + Dark mode + 4 map tiles (Street / Satellite / Terrain / Dark)
- วัดระยะทางระหว่าง 2 จุด (haversine)
- Zoom to filtered อัตโนมัติเมื่อเลือก filter
- Backup อัตโนมัติก่อนทุก build + GitHub Actions auto build + deploy
- UI: popup มี gradient header, modal มี animation + backdrop blur + gradient buttons

---

## วิธี Build

```bash
python build_html.py
```

สร้าง `docs/index.html` และ `docs/locations.js` ใหม่จาก `all_locations.json` พร้อม copy `all_locations.json` ไปไว้ใน `docs/` อัตโนมัติ

---

## วิธีรัน local

```bash
cd docs
python -m http.server 8080
```

เปิด [http://localhost:8080](http://localhost:8080)

---

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

---

## สิ่งที่ต้องทำต่อไป (TODO)

### 🔴 สำคัญ (ควรทำก่อน)

- [ ] **PWA / Offline support** — ให้ใช้งานได้แม้ไม่มีอินเทอร์เน็ต (Service Worker + cache)
- [ ] **รองรับ import หลายรูปแบบ** — นอกจาก GeoJSON: KML, GPX, CSV with lat/lng columns
- [ ] **ป้องกัน token หลุด** — ย้าย GitHub token ออกจาก localStorage ไปเป็น session-only หรือใช้ OAuth flow แทน

### 🟡 น่าทำ (ปรับปรุง UX)

- [ ] **Mobile UX ปรับปรุงต่อ** — panel กรอง/ค้นหาควร collapsible บนหน้าจอเล็ก, ปุ่มใหญ่ขึ้น
- [ ] **Cluster click → zoom + แสดง list** — กด cluster แล้วดู popup รายชื่อจุดทั้งหมดใน cluster
- [ ] **ค้นหาตามพิกัด** — ให้ผู้ใช้ paste lat,lng แล้ว jump ไปยังจุดนั้น
- [ ] **Permalink per location** — URL ที่ share แล้ว zoom ตรงไปหมุดนั้นได้
- [ ] **Photo/attachment support** — แนบรูปภาพให้แต่ละจุดได้

### 🟢 Nice-to-have (ฟีเจอร์เพิ่ม)

- [ ] **Export เป็น PDF หรือ image** — สั่งพิมพ์แผนที่ตามกรอบที่เห็น
- [ ] **Route planning** — เลือกหลายจุดแล้วคำนวณเส้นทางที่สั้นที่สุด (TSP แบบง่าย)
- [ ] **Tag/label system** — เพิ่ม tag อิสระต่อจุด นอกเหนือจาก list/city
- [ ] **Changelog UI** — ดู history การแก้ไขข้อมูลแต่ละจุดในหน้าเว็บ
- [ ] **Multi-user collaboration** — sync แบบ realtime ผ่าน GitHub หรือ backend

### 🔧 ด้านระบบ / code quality

- [ ] **Unit test สำหรับ Python scripts** — ครอบ `validate_data.py`, `merge_sheet.py`, `auto_city.py`
- [ ] **Lint + format** — เพิ่ม pre-commit hook (black, flake8 สำหรับ Python; ESLint สำหรับ JS)
- [ ] **แยก JS ออกจาก HTML** — refactor `docs/index.html` ให้โหลด `app.js` แยก เพื่อบำรุงรักษาง่ายขึ้น
- [ ] **Versioning สำหรับ locations.js** — เพิ่ม cache-busting query string เมื่อ build (`locations.js?v=<hash>`)

---

## บันทึกการเปลี่ยนแปลง (Changelog)

### 2026-05-02 (ล่าสุด)

- **แก้ไข Export/Share API** — แก้ bug `id` ซ้ำใน Share modal, จัดการ `AbortError` ถูกต้อง, ส่งไฟล์เป็น File object แทน text string
- **Export เลือกขอบเขตได้** — เปิด modal Export แล้วกรองตาม **รายการ (List)** และ/หรือ **เขต (City)** ก่อน export พร้อมแสดงจำนวนจุดแบบ real-time
- **Import Merge mode** — Import ไม่ทับข้อมูลเดิมอีกต่อไป: เลือกได้ระหว่าง **Merge** (เพิ่มเฉพาะจุดใหม่ที่ยังไม่มี ตรวจ duplicate ด้วย lat+lng+name) หรือ **Replace** (แทนที่ทั้งหมด พร้อม confirm)
- สร้าง `import_takeout.py` สำหรับ import GeoJSON จาก Google Takeout
- เพิ่ม multi-filter: กรองตามรายการ + เขต พร้อมกัน
- เพิ่ม Stats dashboard (สถิติจุดตามรายการ/เขต)
- ปรับ Mobile responsive ให้ใช้งานง่ายขึ้น
- เพิ่มปุ่ม Undo (เก็บ history สูงสุด 20 ครั้ง)
- แยกสี marker ตาม list ด้วย CircleMarker + color palette
- เพิ่ม Bulk delete (ลบจุดที่กรองอยู่ทั้งหมด)
- เพิ่ม Heatmap mode (leaflet.heat)
- ลบไฟล์ test ที่ไม่ใช้ (`docs/test.html`, `test_html.js`)
- สร้าง `auto_city.py` (reverse geocoding Nominatim) + `validate_data.py` (ตรวจซ้ำ/ผิดปกติ)
- เพิ่ม Legend สี, Dark mode, 4 map tiles, Zoom to filtered
- เพิ่มวัดระยะทางระหว่าง 2 จุด (📏)
- เพิ่ม GitHub Actions auto build + Backup อัตโนมัติ
- `build_html.py` สร้าง `docs/locations.js` + copy `all_locations.json` อัตโนมัติ
- เพิ่ม background sync: fetch `all_locations.json` เพื่อ sync ข้อมูลข้ามเครื่อง
- ปรับ UI: popup มี gradient header, modal มี animation + backdrop blur + gradient buttons
- แยกข้อมูลหมุดออกจาก `index.html` → `locations.js` (ลดจาก ~1,664 เหลือ ~535 บรรทัด)
- เพิ่ม popup คำเตือนตอนกด Reset
- เพิ่มปุ่ม Save to GitHub + Token modal
- เพิ่ม CRUD (เพิ่ม/แก้ไข/ลบจุด) + Export/Import JSON
- เพิ่ม city field ใน location data
- สร้าง `merge_sheet.py` สำหรับรวมข้อมูลจาก Google Sheet
