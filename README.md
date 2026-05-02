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
| `docs/index.html` | หน้าเว็บ — HTML markup + CSS only |
| `docs/app.js` | JavaScript logic ทั้งหมด (~1700 บรรทัด) |
| `docs/locations.js` | ข้อมูลหมุดแยกไฟล์ (generated จาก build) |
| `docs/all_locations.json` | สำเนา JSON สำหรับ GitHub Pages |
| `topup_map.html` | แผนที่ Topup Locations แบบ standalone |
| `topup_locations.csv` | ข้อมูล Topup Locations (CSV) |
| `topup-map-site/` | Topup Locations Map site สำหรับ deploy |

---

## ฟีเจอร์ปัจจุบัน

### 🗺️ แผนที่ + Markers
- แสดงหมุดบนแผนที่พร้อม MarkerCluster + แยกสีตาม list (CircleMarker + color palette)
- Heatmap mode แสดงความหนาแน่นของจุด (leaflet.heat)
- Route planning — Nearest-neighbor TSP + polyline + numbered stops
- วัดระยะทางระหว่าง 2 จุด (haversine)
- 4 map tiles: Street / Satellite / Terrain / Dark
- Zoom to filtered อัตโนมัติเมื่อเลือก filter

### 🔍 ค้นหา + กรอง
- ค้นหา + กรองตามรายการ (list) + เขต (city) + tags แบบ multi-filter
- ค้นหาตามพิกัด (paste lat,lng)
- Tag/label system ต่อจุด + ค้นหาได้

### ✏️ CRUD + Data
- CRUD: เพิ่ม / แก้ไข / ลบจุดบนแผนที่ + Undo สูงสุด 20 ครั้ง
- Bulk delete จุดที่กรองอยู่
- Photo/attachment support (แนบรูป + resize + แสดงใน place card)
- Changelog UI — เก็บประวัติ add/edit/delete + แสดงใน info panel

### 📤 Export / Import
- Export JSON + Export รูปแผนที่ (PNG) พร้อมรองรับ Share API
- Import หลายรูปแบบ: JSON / CSV / KML / GPX / GeoJSON + Merge/Replace
- Data validation + schema normalization ตอน import

### ☁️ Sync + Multi-user
- Multi-user collaboration — **Supabase Realtime** (8 คน live sync ทันที)
- Supabase PostgreSQL เป็น single source of truth
- Realtime INSERT/UPDATE/DELETE broadcast ให้ทุกคนพร้อมกัน
- Periodic pull ทุก 60 วิ เป็น fallback
- Permalink / แชร์จุด — URL `#lat,lng,zoom`

### 📱 Mobile + Performance
- PWA / Offline support — Service Worker + manifest + cache tiles
- Mobile UX: long-press เพิ่มจุด, swipe-down ปิด place card, vibration feedback
- Performance: preferCanvas (mobile), tile lazy-loading, marker limit, debounced search
- Z-index system (CSS variables) ไม่มี UI ซ้อนทับ

### 🔧 ระบบ
- Dark mode + Stats dashboard
- Backup อัตโนมัติก่อนทุก build + GitHub Actions auto build + deploy
- Debug mode: `window.btDebug` (stats, forceSync, clearCache)
- Pre-commit hooks: black, flake8, trailing-whitespace, check-json
- Unit tests: validate_data + auto_city (9 tests)

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

1. **แก้ไขอะไรก็ตาม → บันทึกไฟล์ทันที → อัพเดทเวอร์ชั่นAppด้วย**
2. **ทำเสร็จ → push ขึ้น GitHub เสมอ**

   ```bash
   git add -A
   git commit -m "อธิบายสิ่งที่ทำ"
   git pull --rebase origin main
   git push origin main
   ```

3. **หลัง push → รอ GitHub Actions build เสร็จ** (~30 วินาที) แล้ว hard refresh
   - หรือถ้า run local server: restart server แล้ว refresh

   ```bash
   # หยุด server เดิม แล้วรันใหม่
   cd docs
   python -m http.server 8080
   ```

4. **เปิด preview → Ctrl+Shift+R (hard refresh)** เพื่อเลี่ยง cache
5. **fetch ข้าม domain (GitHub API) → ห้ามใส่ header ที่ CORS ไม่อนุญาต**
   - ❌ `'Cache-Control': 'no-cache'` → ทำให้ CORS preflight fail บน Android/PC Chrome
   - ❌ `cache: 'no-store'` → ไม่จำเป็นและอาจมีปัญหา
   - ✅ ใช้แค่ `Authorization` + `Accept` เท่านั้น
6. **เพิ่มเมนู/UI ที่อ้างอิงตัวแปร → ต้องประกาศตัวแปรก่อนเสมอ**
   - grep ตรวจว่าทุกตัวแปรที่ใช้ถูก `let`/`const`/`function` ไว้แล้ว
   - ถ้าไม่มี → JS crash ทั้งหน้า (เคยเกิดกับ `trackingActive`)
7. **ทดสอบบนมือถือทุกครั้งที่แก้ไข** — iOS/Android/PC ทำงานต่างกัน
   - Android Chrome: CORS เข้มงวด, SW cache aggressive
   - iOS Safari: CORS ผ่อนปรน, SW lifecycle ต่าง
   - ถ้า sync ใช้ได้บน iOS แต่ไม่ได้บน Android → ตรวจ CORS headers ก่อน

> 💡 **Tip:** GitHub Actions จะ auto build + deploy หลัง push ไป `main` — ดูสถานะที่ Actions tab ใน repo

---

## ✅ ฟีเจอร์ที่เสร็จแล้ว

### 2026-05-03 (ล่าสุด)

- **Supabase Migration (v5.6.x)** — ย้าย backend จาก GitHub API / Cloudflare Worker → Supabase
  - Supabase PostgreSQL เป็น single source of truth (1,678 จุด)
  - Realtime subscription — INSERT/UPDATE/DELETE live sync ทุกคน
  - `sbInsert` / `sbUpdate` / `sbDelete` แทน bulk push ทั้งหมด
  - `saveLocations()` = localStorage only, Supabase push ผ่าน targeted functions
  - `doSync()` = pull-only (paginate 1000 rows ต่อ page)
  - `_sbLoaded` gate ป้องกัน push ระหว่าง initial load
  - Auto-fill list ตอนเพิ่มจุด: nearest 10km → most-used fallback

### 2026-05-02 (ล่าสุด)
- [x] **PWA / Offline support** — Service Worker + manifest + cache map tiles
- [x] **ค้นหาตามพิกัด** — paste lat,lng ในช่องค้นหาแล้ว jump ไปตำแหน่งนั้น
- [x] **Permalink / แชร์จุด** — URL `#lat,lng,zoom` + ปุ่มแชร์ใน place card
- [x] **ป้องกัน token หลุด** — ย้ายจาก localStorage เป็น sessionStorage
- [x] **Cache-busting locations.js** — timestamp query string ทุกครั้งที่โหลด
- [x] **แก้ UI bugs** — latlng-hint ย้ายมุมขวาล่าง, count-pill ไม่ทับ, ปุ่ม X list-panel กดได้
- [x] **Import Takeout CSV** — 1676 จุดจาก Google Takeout + ดึงหมายเลขตู้จาก Note
- [x] **Topup Locations Map** — แผนที่ standalone สำหรับจุด Topup
- [x] **Export/Share API** — แก้ bug + รองรับ Share API ถูกต้อง
- [x] **Export กรองตาม List/City** — Export เฉพาะข้อมูลที่กรองไว้
- [x] **Import Merge/Replace** — เลือก mode ได้: Merge (ไม่ทับ) หรือ Replace

### ก่อนหน้านี้
- [x] **Mobile responsive** — ใช้งานบนมือถือได้ดี (base)
- [x] **Multi-filter** — กรองตาม list + city พร้อมกัน
- [x] **Stats dashboard** — สถิติจำนวนจุด
- [x] **Undo (20 ครั้ง)** — ย้อนกลับการแก้ไข
- [x] **CircleMarker + สีตาม list** — แยกสีตามรายการ
- [x] **Bulk delete** — ลบจุดที่กรองอยู่ทั้งหมด
- [x] **Heatmap mode** — แสดงความหนาแน่น
- [x] **Legend + Dark mode** — 4 map tiles (Street/Satellite/Terrain/Dark)
- [x] **วัดระยะทาง** — ระหว่าง 2 จุด
- [x] **GitHub Actions + Backup** — Auto build & deploy
- [x] **Save to GitHub** — ผ่าน API token
- [x] **CRUD + Background sync** — เพิ่ม/แก้ไข/ลบ/ซิงค์ข้ามเครื่อง

---

## สิ่งที่ต้องทำต่อไป (TODO)

### 🔴 สำคัญ (ควรทำก่อน)

- [x] **PWA / Offline support** — ✅ เสร็จแล้ว
- [x] **รองรับ import หลายรูปแบบ** — ✅ เสร็จแล้ว (JSON/CSV/KML/GPX/GeoJSON + Merge/Replace)
- [x] **ป้องกัน token หลุด** — ✅ เสร็จแล้ว (sessionStorage)

### 🟡 น่าทำ (ปรับปรุง UX)

- [x] **Mobile UX ปรับปรุงต่อ** — ✅ เสร็จแล้ว (ปุ่มใหญ่ขึ้น, safe-area, chip/search compact)
- [x] **Cluster click → zoom + แสดง list** — ✅ เสร็จแล้ว
- [x] **ค้นหาตามพิกัด** — ✅ เสร็จแล้ว
- [x] **Permalink per location** — ✅ เสร็จแล้ว
- [x] **Photo/attachment support** — ✅ เสร็จแล้ว (แนบรูป + resize + แสดงใน place card)

### 🟢 Nice-to-have (ฟีเจอร์เพิ่ม)

- [x] **Export เป็น image** — ✅ เสร็จแล้ว (PNG พร้อม overlay ข้อมูล)
- [x] **Route planning** — ✅ เสร็จแล้ว (Nearest-neighbor TSP + polyline + numbered stops)
- [x] **Tag/label system** — ✅ เสร็จแล้ว (tags ต่อจุด + ค้นหาได้)
- [x] **Changelog UI** — ✅ เสร็จแล้ว (เก็บประวัติ add/edit/delete + แสดงใน info panel)
- [x] **Multi-user collaboration** — ✅ เสร็จแล้ว (Supabase Realtime: live sync ทันที, ไม่มี merge conflict)

### 🔧 ด้านระบบ / code quality

- [x] **Unit test สำหรับ Python scripts** — ✅ เสร็จแล้ว (9 tests, validate_data + auto_city)
- [x] **Lint + format** — ✅ เสร็จแล้ว (pre-commit: black, flake8, trailing-whitespace, check-json)
- [x] **แยก JS ออกจาก HTML** — ✅ เสร็จแล้ว (แยก ~1700 บรรทัดเป็น `docs/app.js`, HTML เหลือแค่ markup + CSS)
- [x] **Versioning สำหรับ locations.js** — ✅ เสร็จแล้ว (timestamp cache-busting)
- [x] **Performance + UI stability** — ✅ เสร็จแล้ว (preferCanvas, tile opts, z-index system, marker limit, debug mode)

### 🚀 Production TODO (ยังไม่ทำ)

#### PHASE 1: Stability & Safety
- [x] **Redo system** — ✅ เสร็จแล้ว (redo stack + Ctrl+Shift+Z + ปุ่มใน Menu)
- [x] **Auto backup to cloud** — ✅ Supabase เป็น cloud storage แล้ว
- [x] **Normalize data on load** — ✅ เสร็จแล้ว (normalizeLocation ทุกครั้งที่โหลด)
- [x] **Prevent data corruption** — ✅ เสร็จแล้ว (integrity check ก่อน save)

#### PHASE 2: Architecture (scale ได้จริง)
- [ ] **Refactor `app.js` → modules** — แยก map.js / ui.js / data.js
- [ ] **Reduce global state** — ลด global variables
- [ ] **Separate rendering logic from data logic**
- [ ] **Add central state manager** — simple store pattern

#### PHASE 3: Core Features
- [x] **Favorite / pin system** — ✅ เสร็จแล้ว (⭐ flag + filter chip + golden marker + place card button)
- [ ] **Color tags** — สีต่อ tag (แทน list เดิม)
- [x] **Path tracking** — ✅ เสร็จแล้ว (GPS polyline + save/export GeoJSON + ดูเส้นทางเก่า)
- [x] **Directions API** — ✅ เสร็จแล้ว (OSRM routing + distance/ETA + ปุ่มนำทางใน place card)

#### PHASE 4: Data System
- [ ] **Data versioning** — `{ "version": 2, "data": [...] }`
- [ ] **Schema migration support** — auto-upgrade เมื่อ version เปลี่ยน

#### PHASE 5: Mobile UX
- [x] **Tap marker → zoom + focus** — ✅ เสร็จแล้ว (zoom 16 mobile / 15 desktop)
- [ ] **Improve touch responsiveness** — ลด delay, ปรับ hit area

#### PHASE 6: Advanced Map
- [ ] **Heatmap improvements** — ปรับ radius/blur ตาม zoom, color scale
- [ ] **Polygon area calculation** — วาดพื้นที่ + คำนวณ

#### PHASE 7: Debug & Dev Tools
- [ ] **Show render time / FPS** — performance monitor
- [ ] **Error logging system** — เก็บ error log + แสดงใน debug panel

#### BONUS (ถ้าจะทำให้เทพจริง)
- [ ] **Virtualized marker system** — รองรับ 10k+ points
- [ ] **Smart clustering** — dynamic cluster radius ตาม density
- [ ] **Offline mode** — limited map usage โดยไม่ต้องมี internet
- [ ] **AI search** — ค้นหาด้วยภาษาธรรมชาติ

#### 🚀 โครงโปรเจกต์ใหม่ (ยังใช้ไฟล์เดิมได้ แต่เริ่มแยก)
/src
  /core
    store.js
    events.js
  /map
    map.js
    markers.js
    layers.js
  /ui
    ui.js
    panels.js
    modal.js
  /data
    data.js
    import.js
    export.js
  /features
    favorites.js
    tracking.js
    directions.js
/app.js
/index.html

👉 ไม่ต้องย้ายทีเดียว — ค่อย ๆ ย้ายจาก app.js 

#### 🧠 1. CORE: State + Store (หัวใจใหม่) 
/src/core/store.js

export const store = {
  locations: [],
  filtered: [],
  selected: null,
  favorites: new Set(),
  history: [],
  future: []
};

export function setState(patch) {
  Object.assign(store, patch);
  window.dispatchEvent(new Event("statechange"));
}

#### 🧨 Undo / Redo

export function pushHistory() {
  store.history.push(JSON.stringify(store.locations));
  store.future = [];
}

export function undo() {
  if (!store.history.length) return;
  store.future.push(JSON.stringify(store.locations));
  store.locations = JSON.parse(store.history.pop());
  setState({});
}

export function redo() {
  if (!store.future.length) return;
  store.history.push(JSON.stringify(store.locations));
  store.locations = JSON.parse(store.future.pop());
  setState({});
}

#### 🗺 2. MAP ENGINE (ลื่นขึ้นทันที)
/src/map/map.js

import { renderMarkers } from "./markers.js";

export const map = L.map('map', {
  preferCanvas: true,
  maxZoom: 18,
  minZoom: 5
}).setView([13.75, 100.5], 11);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  updateWhenIdle: true,
  updateWhenZooming: false,
  keepBuffer: 2
}).addTo(map);

map.on('moveend', renderMarkers);

#### 📍 Marker Virtualization (ตัวโหด)
/src/map/markers.js

import { map } from "./map.js";
import { store } from "../core/store.js";

let layer = L.layerGroup().addTo(map);

export function renderMarkers() {
  layer.clearLayers();

  const bounds = map.getBounds();

  const visible = store.locations.filter(l =>
    bounds.contains([l.lat, l.lng])
  );

  visible.slice(0, 2000).forEach(l => {
    const marker = L.marker([l.lat, l.lng]);
    marker.bindPopup(l.name || "-");
    layer.addLayer(marker);
  });
}

#### ⭐ 3. FAVORITE SYSTEM
/src/features/favorites.js

import { store, setState } from "../core/store.js";

export function toggleFavorite(id) {
  if (store.favorites.has(id)) {
    store.favorites.delete(id);
  } else {
    store.favorites.add(id);
  }
  setState({});
}

#### 📍 4. PATH TRACKING
/src/features/tracking.js

import { map } from "../map/map.js";

let path = [];
let polyline = L.polyline([], { color: 'red' }).addTo(map);

export function startTracking() {
  navigator.geolocation.watchPosition(pos => {
    const latlng = [pos.coords.latitude, pos.coords.longitude];
    path.push(latlng);
    polyline.setLatLngs(path);
  });
}

#### 🧭 5. DIRECTIONS (OSRM)
/src/features/directions.js

export async function getRoute(a, b) {
  const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;

  const res = await fetch(url);
  const data = await res.json();

  return data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
}

#### 📦 6. DATA SYSTEM
/src/data/data.js

export function normalize(l) {
  return {
    lat: l.lat,
    lng: l.lng,
    name: l.name || "",
    city: l.city || "",
    note: l.note || "",
    list: l.list || ""
  };
}

#### 📊 Versioning

export function exportData(data) {
  return JSON.stringify({
    version: 2,
    data
  });
}

#### 📱 7. MOBILE UX
Long press

let timer;

map.on('mousedown', e => {
  timer = setTimeout(() => {
    addLocation(e.latlng);
    navigator.vibrate?.(50);
  }, 600);
});

map.on('mouseup', () => clearTimeout(timer));

#### ⚡ 8. PERFORMANCE BOOST สุดท้าย
เพิ่ม: L.Marker.prototype.options.keyboard = false;

#### 🧪 9. DEBUG MODE

window.debug = {
  get count() {
    return store.locations.length;
  }
};

#### 🔥 วิธีใช้ (สำคัญ)
Step-by-step
1. สร้างโฟลเดอร์ /src
2. ย้าย logic จาก app.js ไปทีละส่วน
3. ใช้ store แทน global
4. ใช้ renderMarkers() แทน render เดิม
---

## บันทึกการเปลี่ยนแปลง (Changelog)

### 2026-05-02

- **Performance + UI Stability Update**
  - Map: `preferCanvas` (mobile), ปิด animations mobile, `minZoom:5` / `maxZoom:19`
  - Tile: `updateWhenIdle`, `updateWhenZooming:false`, `keepBuffer` ลด request
  - Marker limit: 1000 (mobile) / 2000 (desktop)
  - Z-index system: CSS variables ทั้งระบบ ไม่มี UI ซ้อนทับ
  - Lat/lng overlay: ย้ายกลางล่าง, ซ่อนบน mobile
  - Modal: fix max-height + overflow บนจอใหญ่
  - Mobile: long-press (600ms) เพิ่มจุด, swipe-down ปิด place card, vibration feedback
  - Import: validate JSON + normalize schema อัตโนมัติ
  - Debug: `window.btDebug` (stats, forceSync, clearCache, exportDebug)
- **Multi-user collaboration** — GitHub-based 3-way merge, auto-sync ทุก 30 วิ, conflict resolution, sync indicator
- **แยก JS ออกจาก HTML** — ดึง ~1700 บรรทัดเป็น `docs/app.js`, HTML เหลือ ~880 บรรทัด
- **Route planning** — Nearest-neighbor TSP + dashed polyline + numbered stops
- **Changelog UI** — เก็บประวัติ add/edit/delete ใน localStorage + ดูจาก Menu
- **Tag/label system** — tags ต่อจุด + ค้นหาได้
- **Photo/attachment support** — แนบรูป + resize 800px + JPEG 70% + แสดงใน place card
- **Export รูปแผนที่** — PNG พร้อม overlay ข้อมูล
- **Pre-commit hooks** — black, flake8, trailing-whitespace, check-json

### 2026-05-02 (เช้า)

- **เพิ่ม Topup Locations Map** — แผนที่แสดงจุด Topup แบบ standalone (`topup_map.html`)
  - ค้นหาจุด BT ได้แบบ real-time
  - MarkerCluster + แสดงชื่อบน marker
  - รายการจุดแบบ side panel กดเลือกแล้ว jump ไปจุดนั้น
  - Mobile responsive
  - เปิด Google Maps ได้จาก popup

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
