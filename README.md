# BT Locations Map

แผนที่แสดงจุด BT Locations แบบ interactive ใช้ Leaflet.js + MarkerCluster

## โครงสร้างไฟล์

| ไฟล์ | คำอธิบาย |
|------|----------|
| `all_locations.json` | ข้อมูลหมุดทั้งหมด (source of truth) |
| `build_html.py` | สร้าง `docs/index.html` จาก JSON |
| `merge_sheet.py` | รวมข้อมูลจาก Google Sheet CSV เข้า JSON |
| `docs/index.html` | หน้าเว็บ (generated) — UI, map, CRUD, GitHub save |
| `docs/locations.js` | ข้อมูลหมุดแยกไฟล์ (generated จาก build) |
| `docs/all_locations.json` | สำเนา JSON สำหรับ GitHub Pages |

## ฟีเจอร์ปัจจุบัน

- แสดงหมุดบนแผนที่ พร้อม MarkerCluster
- ค้นหา + กรองตามรายการ (list)
- CRUD: เพิ่ม/แก้ไข/ลบ จุดบนแผนที่
- Export / Import JSON
- Reset พร้อม popup คำเตือน
- Save to GitHub ผ่าน API (เก็บ token ใน localStorage)
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
- [ ] สร้าง `import_takeout.py` — import GeoJSON จาก Google Takeout อัตโนมัติ
- [ ] ลบไฟล์ test ที่ไม่ใช้ (`docs/test.html`, `test_html.js`)

**น่าทำ:**
- [ ] ค้นหา/กรองแบบ multi-filter (ชื่อ + เขต + รายการ พร้อมกัน)
- [ ] แสดงสถิติ dashboard (จำนวนจุดต่อเขต, ต่อรายการ)
- [ ] ปรับ Mobile responsive ให้ใช้งานง่ายขึ้น
- [ ] เพิ่มปุ่ม Undo ย้อนการแก้ไขล่าสุด

**Nice-to-have:**
- [ ] แยกสี marker ตาม list
- [ ] Bulk edit/delete (เลือกหลายจุดแล้วแก้ไข/ลบทีเดียว)
- [ ] Heatmap mode แสดงความหนาแน่นของจุด

## บันทึกการเปลี่ยนแปลง (Changelog)

### 2026-05-02
- `build_html.py` สร้าง `docs/locations.js` + copy `all_locations.json` อัตโนมัติ
- เพิ่ม background sync: fetch `all_locations.json` เพื่อ sync ข้อมูลข้ามเครื่อง
- ปรับ UI: popup มี gradient header, modal มี animation + backdrop blur + gradient buttons
- แยกข้อมูลหมุดออกจาก `index.html` → `locations.js` (ลดจาก 1,664 เหลือ ~535 บรรทัด)
- เพิ่ม popup คำเตือนตอนกด Reset
- เพิ่มปุ่ม Save to GitHub + Token modal
- เพิ่ม CRUD (เพิ่ม/แก้ไข/ลบ จุด) + Export/Import JSON
- เพิ่ม city field ใน location data
- สร้าง `merge_sheet.py` สำหรับรวมข้อมูลจาก Google Sheet
