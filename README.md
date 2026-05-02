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
| `docs/locations.js` | ข้อมูลหมุดแยกไฟล์ (generated จาก build) |
| `docs/all_locations.json` | สำเนา JSON สำหรับ GitHub Pages |

## ฟีเจอร์ปัจจุบัน

* แสดงหมุดบนแผนที่ พร้อม MarkerCluster + แยกสีตาม list
* ค้นหา + กรองตามรายการ (list) + เขต (city) แบบ multi-filter
* CRUD: เพิ่ม/แก้ไข/ลบ จุดบนแผนที่ + Undo (สูงสุด 20 ครั้ง)
* Bulk delete จุดที่กรองอยู่
* Export / Import JSON
* Heatmap mode แสดงความหนาแน่นของจุด
* Stats dashboard (สถิติจำนวนจุดตามรายการ/เขต)
* Reset พร้อม popup คำเตือน
* Save to GitHub ผ่าน API (เก็บ token ใน localStorage)
* Background sync ข้อมูลข้ามเครื่อง
* Legend สีอธิบาย list + Dark mode + 4 map tiles (Street/Satellite/Terrain/Dark)
* วัดระยะทางระหว่าง 2 จุด (haversine)
* Zoom to filtered อัตโนมัติเมื่อเลือก filter
* Backup อัตโนมัติก่อนทุก build + GitHub Actions auto build
* ข้อมูลหมุดแยกไฟล์ `locations.js` เพื่อให้ `index.html` เบาลง
* **GPS 2-Phase** — coarse (IP) ก่อนเสมอ (<2 วิ) แล้ว refine ด้วย high-accuracy watchPosition อัตโนมัติ
* **Triple-ring pulse marker** — แสดงตำแหน่งด้วยวง ripple 3 ชั้น + แสดงความแม่นยำ ±Xม. ใน popup
* **Smooth flyTo/flyToBounds** — map เคลื่อนไหวลื่นทุกจุด (ไม่กระโดด)
* **Animated modals & cards** — place card fade+slide, modal spring bounce, action button hover lift

## วิธี Build

```
python build_html.py
```

จะสร้าง `docs/index.html` และ `docs/locations.js` ใหม่จาก `all_locations.json`

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
   cd docs
   python -m http.server 8080
   ```
4. **เปิด preview → Ctrl+Shift+R (hard refresh)** เพื่อเลี่ยง cache

## สิ่งที่ต้องทำในอนาคต (TODO)

### 🔴 ควรทำเร็ว

* **GPS: แสดง accuracy circle แบบ animated** — fade-in เมื่อเริ่มต้น, ค่อยๆ หดลงเมื่อ refine
* **GPS: หยุด watchPosition อัตโนมัติ** เมื่อ accuracy ดีพอ (< 30ม.) เพื่อประหยัดแบต
* **build_html.py: generate `docs/locations.js` อัตโนมัติ** — ตอนนี้ต้อง copy มือ
* **ลบไฟล์ test** ที่ยังค้างอยู่ใน repo

### 🟡 ควรทำ

* **Offline mode** — cache ข้อมูลด้วย Service Worker ให้ใช้ได้แม้ไม่มีเน็ต
* **GPS: track ต่อเนื่อง (live tracking)** — marker เคลื่อนตามตำแหน่งจริงแบบ real-time
* **Share จุด** — generate link ที่เปิดแผนที่แล้ว fly ไปจุดนั้นทันที (`?id=xxx`)
* **ค้นหาด้วยเสียง** — Web Speech API กด mic แล้วพูดชื่อสถานที่
* **Cluster click → zoom to bounds** — กด cluster แล้ว map zoom ไปแสดงทุกจุดในกลุ่ม
* **Import จาก Google Maps URL** — วาง URL แล้วดึง lat/lng อัตโนมัติ

### 🟢 น่าทำ (nice-to-have)

* **ปรับ Mobile responsive** ให้ดีขึ้น — โดยเฉพาะ filter chips และ place card บน iOS Safari
* **Drag marker** เพื่อย้ายตำแหน่งโดยตรงบนแผนที่ (แทนการพิมพ์ lat/lng)
* **รูปภาพต่อจุด** — แนบรูปสถานที่ใน popup (store เป็น base64 หรือ URL)
* **Route planning** — เลือกหลายจุด แล้ว generate Google Maps Directions URL
* **Print / Export PNG** — สั่งพิมพ์แผนที่พร้อม legend เป็น PDF หรือรูปภาพ
* **Tag system** — เพิ่ม tags หลายอันต่อจุด (นอกเหนือจาก list และ city)
* **Autocomplete** ช่อง list และ city จากข้อมูลที่มีอยู่แล้ว

### 🔵 ด้านระบบ/ข้อมูล

* **Conflict resolution** เมื่อ sync จาก GitHub แล้วข้อมูลต่างกัน (ตอนนี้ใช้ last-write-wins)
* **Versioning** — เก็บ history การเปลี่ยนแปลงต่อจุด (ใครแก้ เมื่อไหร่)
* **Multi-user support** — lock จุดเมื่อมีคนกำลังแก้ไขอยู่
* **validate_data.py** — เพิ่มตรวจจุดที่อยู่นอกไทย และจุดที่ lat/lng = 0

## บันทึกการเปลี่ยนแปลง (Changelog)

### 2026-05-02 (ล่าสุด)

* **GPS 2-Phase เร็วขึ้นมาก** — Phase 1 ใช้ low-accuracy (IP-based) แสดงผลภายใน 1-2 วิ, Phase 2 refine ด้วย watchPosition high-accuracy อัตโนมัติในเบื้องหลัง
* **Triple-ring pulse marker** — แทนที่ dot เดิมด้วยวง ripple 3 ชั้น เหลื่อมกัน, popup แสดง ±Xม.
* **GPS button state** — icon หมุน (searching) → สีน้ำเงิน (found), กดซ้ำ = fly กลับไปตำแหน่ง
* **GPS ใน Modal เร็วขึ้น** — ใช้ low-accuracy ก่อน ได้พิกัดเร็ว แล้ว refine เงียบๆ ถ้า accuracy หยาบ
* **flyTo/flyToBounds แทน setView/fitBounds** ทุกจุด — map เคลื่อนไหวลื่นตลอด
* **Place card desktop** — เพิ่ม fade+translateY transition แทน bottom slide
* **Modal animation** — spring bounce (scale + translateY) + backdrop blur
* **Action buttons** — hover ลอยขึ้น 2px, active scale(0.95)
* **Place card close button** — hover scale + สีเปลี่ยน smooth

### 2026-05-02 (ก่อนหน้า)

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
* แยกข้อมูลหมุดออกจาก `index.html` → `locations.js`
* เพิ่ม popup คำเตือนตอนกด Reset
* เพิ่มปุ่ม Save to GitHub + Token modal
* เพิ่ม CRUD (เพิ่ม/แก้ไข/ลบ จุด) + Export/Import JSON
* เพิ่ม city field ใน location data
* สร้าง `merge_sheet.py` สำหรับรวมข้อมูลจาก Google Sheet
