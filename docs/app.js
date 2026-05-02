// ════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════
const STORAGE_KEY = 'bt_locations_data';
const CHANGELOG_KEY = 'bt_changelog';
const GITHUB_TOKEN_KEY = 'bt_github_token';
const SYNC_SHA_KEY = 'bt_sync_sha';
const SYNC_SNAPSHOT_KEY = 'bt_sync_snapshot';
const FAVORITES_KEY = 'bt_favorites';
const TRACKING_KEY = 'bt_tracked_paths';
const REPO_OWNER = 'valrinx', REPO_NAME = 'bt-locations';
const undoStack = [], redoStack = [], MAX_UNDO = 20;
let favorites = new Set((() => { try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'); } catch { return []; } })());
function saveFavorites() { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites])); }
function favKey(loc) { return `${loc.lat.toFixed(6)},${loc.lng.toFixed(6)}`; }
function toggleFavorite(loc) { const k = favKey(loc); if (favorites.has(k)) favorites.delete(k); else favorites.add(k); saveFavorites(); }
function isFavorite(loc) { return favorites.has(favKey(loc)); }
let filterFavorites = false;
const MAX_CHANGELOG = 200;
const SYNC_INTERVAL = 30000; // 30 seconds
let _syncTimer = null, _syncing = false, _lastSyncTime = 0;

function getChangelog(){try{return JSON.parse(localStorage.getItem(CHANGELOG_KEY)||'[]');}catch{return[];}}
function addChangelogEntry(action,loc){
    const log=getChangelog();
    log.unshift({t:Date.now(),a:action,n:loc.name||'',lat:loc.lat,lng:loc.lng,list:loc.list||''});
    if(log.length>MAX_CHANGELOG)log.length=MAX_CHANGELOG;
    localStorage.setItem(CHANGELOG_KEY,JSON.stringify(log));
}

function normalizeLocation(l) {
    return {
        name: l.name || '',
        lat: typeof l.lat === 'number' ? l.lat : parseFloat(l.lat) || 0,
        lng: typeof l.lng === 'number' ? l.lng : parseFloat(l.lng) || 0,
        list: l.list || 'Uncategorized',
        city: l.city || '',
        note: l.note || '',
        updatedAt: l.updatedAt || Date.now(),
        ...(l.tags && l.tags.length ? { tags: l.tags } : {}),
        ...(l.photo ? { photo: l.photo } : {}),
    };
}

let locations = (() => {
    try { const s = localStorage.getItem(STORAGE_KEY); const raw = s ? JSON.parse(s) : JSON.parse(JSON.stringify(DEFAULT_LOCATIONS)); return raw.map(normalizeLocation); }
    catch(e) { return JSON.parse(JSON.stringify(DEFAULT_LOCATIONS)).map(normalizeLocation); }
})();

let addMode = false, editingIndex = -1;
let filterList = '', filterCity = '';
let heatmapMode = false;
let measureMode = false, measureStart = null, measureLine = null;
let myLocationMarker = null, myLocationCircle = null;
let listSortMode = 'default';
let myLatLng = null;
let nearbyMode = false, nearbyRadius = 2000;
let gpsWatcher = null, gpsCoarseShown = false, gpsFlyDone = false;
let gpsActive = false, gpsToastShown = false, gpsFineToastShown = false;
let gpsTracking = false;
let _lastGpsLat = null, _lastGpsLng = null;

const isMobile = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 600;

// ── debounce / throttle helpers ──
function debounce(fn, ms) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
function throttle(fn, ms) {
    let last = 0; return (...a) => { const now = Date.now(); if (now - last >= ms) { last = now; fn(...a); } };
}

// ── save: debounced + integrity check ──
// Architecture: GitHub = SINGLE source of truth
// localStorage = read cache + dirty queue (offline fallback)
// Flow: edit → mark dirty → push GitHub → if success: clear dirty + update cache
//       if push fails (offline): keep dirty → resolve on next load
const DIRTY_KEY = 'bt_dirty';
const BACKUP_KEY = 'bt_backup';
const BASE_SNAPSHOT_KEY = 'bt_base_snapshot';
const BASE_SHA_KEY = 'bt_base_sha';

// Sync status: 'idle' | 'syncing' | 'ok' | 'error' | 'dirty'
let syncStatus = 'idle';

function _validateBeforeSave() {
    if (!Array.isArray(locations)) { console.error('Save aborted: locations is not array'); return false; }
    if (locations.length === 0) return true;
    const sample = locations[0];
    if (typeof sample.lat !== 'number' || typeof sample.lng !== 'number') { console.error('Save aborted: invalid lat/lng in first item'); return false; }
    return true;
}
function _markDirty() { localStorage.setItem(DIRTY_KEY, '1'); _setSyncStatus('dirty'); }
function _clearDirty() { localStorage.removeItem(DIRTY_KEY); }
function _isDirty() { return localStorage.getItem(DIRTY_KEY) === '1'; }

// Base snapshot: saved ONCE at load time — the "common ancestor" for 3-way merge
function _saveBaseSnapshot(data, sha) {
    localStorage.setItem(BASE_SNAPSHOT_KEY, JSON.stringify(data));
    if (sha) localStorage.setItem(BASE_SHA_KEY, sha);
}
function _getBaseSnapshot() { try { return JSON.parse(localStorage.getItem(BASE_SNAPSHOT_KEY) || 'null'); } catch { return null; } }
function _getBaseSha() { return localStorage.getItem(BASE_SHA_KEY) || ''; }

// Crash-safe backup
function _writeBackup() { localStorage.setItem(BACKUP_KEY, JSON.stringify(locations)); }

// Write to localStorage cache (always, as offline fallback)
function _writeCache() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(locations));
    _writeBackup(); // crash-safe
}

// Sync status UI
function _setSyncStatus(status) {
    syncStatus = status;
    setSyncIndicator(status === 'dirty' ? 'pending' : status === 'ok' ? 'ok' : status === 'syncing' ? 'active' : status === 'error' ? 'error' : null);
    _updateSyncBadge();
}
function _updateSyncBadge() {
    let badge = document.getElementById('syncBadge');
    if (!badge) return;
    const icons = { idle: '', ok: '🟢', syncing: '🟡', dirty: '🟡', error: '🔴' };
    badge.textContent = icons[syncStatus] || '';
    const ago = _lastSyncTime ? Math.round((Date.now() - _lastSyncTime) / 1000) : 0;
    const agoText = _lastSyncTime ? (ago < 60 ? `${ago}s ago` : `${Math.round(ago / 60)}m ago`) : '';
    const titles = { idle: '', ok: `Synced ${agoText}`, syncing: 'กำลัง sync...', dirty: 'ยังไม่ sync', error: 'Sync ล้มเหลว' };
    badge.title = titles[syncStatus] || '';
    // Update btn tooltip too
    const btn = document.getElementById('btnGithubSave');
    if (btn) btn.title = `GitHub Sync ${icons[syncStatus] || ''} ${agoText}`.trim();
}
// Auto-refresh badge every 10s to keep "ago" current
setInterval(_updateSyncBadge, 10000);

let _pushInFlight = false;
const _debouncedPush = debounce(async () => {
    if (_pushInFlight) return;
    const token = getToken();
    if (!token) return;
    _pushInFlight = true;
    _setSyncStatus('syncing');
    try {
        const locs = locations.map(l => { const { photo, ...rest } = l; return rest; });
        const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/all_locations.json`, {
            headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json', 'Cache-Control': 'no-cache' },
            cache: 'no-store'
        });
        if (!res.ok) throw new Error('GitHub fetch: ' + res.status);
        const data = await res.json();
        await _pushToGithub(token, locs, data.sha);
        _clearDirty();
        _saveBaseSnapshot(locs, null); // update base after push
        _setSyncStatus('ok');
        _lastSyncTime = Date.now();
        console.log('Pushed to GitHub:', locs.length, 'locs');
    } catch (err) {
        console.warn('Push failed (will retry):', err.message);
        _setSyncStatus('error');
    } finally { _pushInFlight = false; }
}, 2000);

const saveLocations = debounce(() => {
    if (!_validateBeforeSave()) return;
    _markDirty();
    _writeCache();
    _debouncedPush();
}, 300);

// ── index map: O(1) lookup แทน locations.indexOf() O(n) ──
let _locIndexMap = new Map();
function rebuildIndexMap() { _locIndexMap = new Map(locations.map((l, i) => [l, i])); }
function getLocIndex(loc) { return _locIndexMap.has(loc) ? _locIndexMap.get(loc) : locations.indexOf(loc); }

// ── datalist cache: rebuild เฉพาะเมื่อ locations เปลี่ยน ──
let _datalistDirty = true;
function markDatalistDirty() { _datalistDirty = true; }
function refreshDatalistSuggestions() {
    if (!_datalistDirty) return;
    document.getElementById('listSuggestions').innerHTML = [...new Set(locations.map(l => l.list).filter(Boolean))].map(l => `<option value="${l}">`).join('');
    document.getElementById('citySuggestions').innerHTML = [...new Set(locations.map(l => l.city).filter(Boolean))].map(c => `<option value="${c}">`).join('');
    _datalistDirty = false;
}

function pushUndo() { undoStack.push(JSON.stringify(locations)); if (undoStack.length > MAX_UNDO) undoStack.shift(); redoStack.length = 0; }

// ════════════════════════════════════════════
// MAP
// ════════════════════════════════════════════
const _mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 600;
const map = L.map('map', {
    zoomControl: false,
    zoomAnimation: !_mobile,   // ปิดบน mobile เพื่อ performance
    fadeAnimation: !_mobile,   // ปิดบน mobile
    markerZoomAnimation: !_mobile,
    preferCanvas: _mobile,     // Canvas renderer บน mobile — เร็วกว่า SVG
    zoomSnap: _mobile ? 1 : 0.25,
    zoomDelta: 1,
    wheelPxPerZoomLevel: 80,
    minZoom: 5,
    maxZoom: 19,
    tap: true,
    tapTolerance: 15,
    maxBoundsViscosity: 1.0,
}).setView([13.75, 100.5], 11);

const _tileOpts = {
    updateWhenIdle: _mobile,      // mobile: load tiles only after pan/zoom ends
    updateWhenZooming: false,     // don't load mid-zoom
    keepBuffer: _mobile ? 2 : 4, // fewer buffer tiles on mobile
};
const tileLayers = {
    'Street':    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM', maxZoom: 19, ..._tileOpts }),
    'Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri', maxZoom: 19, ..._tileOpts }),
    'Terrain':   L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { attribution: '© OpenTopoMap', maxZoom: 17, ..._tileOpts }),
    'Dark':      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '© CartoDB', maxZoom: 19, ..._tileOpts })
};
const tileNames = Object.keys(tileLayers);
let currentTileIdx = 0;
tileLayers[tileNames[0]].addTo(map);

// ════════════════════════════════════════════
// CLUSTER + COLORS
// ════════════════════════════════════════════
function getDensityClass(count) {
    if (count < 10) return 'cluster-density-low';
    if (count < 50) return 'cluster-density-medium';
    if (count < 100) return 'cluster-density-high';
    return 'cluster-density-extreme';
}
function createClusterGroup() {
    return L.markerClusterGroup({
        maxClusterRadius: function(zoom) {
            if (zoom >= 18) return 10;
            if (zoom >= 16) return 20;
            if (zoom >= 14) return 35;
            if (zoom >= 12) return 50;
            return 80;
        },
        disableClusteringAtZoom: 18,
        spiderfyOnMaxZoom: true,
        zoomToBoundsOnClick: true,
        animate: true,
        animateAddingMarkers: false,
        chunkedLoading: true,
        chunkInterval: 200,
        chunkDelay: 50,
        removeOutsideVisibleBounds: true,
        iconCreateFunction(cluster) {
            const count = cluster.getChildCount();
            return L.divIcon({ html: `<div><span>${count}</span></div>`, className: `marker-cluster ${getDensityClass(count)}`, iconSize: L.point(40,40) });
        }
    });
}

let markerCluster = createClusterGroup(), currentMarkers = [], heatLayer = null;
const colorPalette = ['#ea4335','#fbbc04','#34a853','#4285f4','#9334e6','#00897b','#e91e63','#ff6d00','#0097a7','#795548'];
const listColors = {};
function getColor(list) {
    if (!listColors[list]) {
        let h = 0; for (let i = 0; i < list.length; i++) h = list.charCodeAt(i) + ((h << 5) - h);
        listColors[list] = colorPalette[Math.abs(h) % colorPalette.length];
    }
    return listColors[list];
}
function haversine(lat1, lng1, lat2, lng2) {
    const R=6371000, p1=lat1*Math.PI/180, p2=lat2*Math.PI/180, dp=(lat2-lat1)*Math.PI/180, dl=(lng2-lng1)*Math.PI/180;
    const a=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function formatDist(m) { return m>=1000?`${(m/1000).toFixed(1)} กม.`:`${Math.round(m)} ม.`; }

// ════════════════════════════════════════════
// RENDER
// ════════════════════════════════════════════
function matchCoords(l, q) {
    const qClean=q.replace(/\s/g,'');
    return String(l.lat).includes(q)||String(l.lng).includes(q)||(String(l.lat)+','+String(l.lng)).includes(qClean);
}

function getFiltered() {
    const q = document.getElementById('search').value.toLowerCase().trim();
    return locations.filter(l => {
        const ml = !filterList || l.list===filterList;
        const mc = !filterCity || l.city===filterCity;
        const ms = !q||(l.name||'').toLowerCase().includes(q)||l.list.toLowerCase().includes(q)||(l.city||'').toLowerCase().includes(q)||(l.tags||[]).some(t=>t.toLowerCase().includes(q))||matchCoords(l,q);
        const mn = !nearbyMode||!myLatLng||haversine(myLatLng.lat,myLatLng.lng,l.lat,l.lng)<=nearbyRadius;
        const mf = !filterFavorites||isFavorite(l);
        return ml&&mc&&ms&&mn&&mf;
    });
}

function getSorted(filtered) {
    const arr = [...filtered];
    if (listSortMode==='name') arr.sort((a,b)=>(a.name||'').localeCompare(b.name||'','th'));
    else if (listSortMode==='list') arr.sort((a,b)=>a.list.localeCompare(b.list,'th'));
    else if (listSortMode==='city') arr.sort((a,b)=>(a.city||'').localeCompare(b.city||'','th'));
    else if (listSortMode==='near'&&myLatLng) arr.sort((a,b)=>haversine(myLatLng.lat,myLatLng.lng,a.lat,a.lng)-haversine(myLatLng.lat,myLatLng.lng,b.lat,b.lng));
    return arr;
}

// ══ Marker cache: สร้างครั้งเดียว, ไม่ rebuild ══
// key = index ใน locations[], value = L.Marker
let _markerCache = new Map(); // idx → marker
let _lastFilteredKey = null;
let _clusterDirty = false; // ต้อง rebuild cache ทั้งหมดเมื่อ locations เปลี่ยน

function _buildMarkerCache() {
    // สร้าง marker ทุกตัวครั้งเดียว แล้ว cache ไว้ตลอด
    _markerCache.clear();
    locations.forEach((loc, idx) => {
        const color = getColor(loc.list);
        // ใช้ DivIcon วงกลมแทน circleMarker — ทำงานกับ cluster ได้ 100%
        const size = 18;
        const fav = isFavorite(loc);
        const icon = L.divIcon({
            className: '',
            html: `<div style="
                width:${size}px;height:${size}px;border-radius:50%;
                background:${color};border:2.5px solid ${fav?'#f9ab00':'#fff'};
                box-shadow:0 1px 4px rgba(0,0,0,.35)${fav?',0 0 6px rgba(249,171,0,.6)':''};
                box-sizing:border-box;
                will-change:transform;
            " data-idx="${idx}"></div>`,
            iconSize: [size, size],
            iconAnchor: [size/2, size/2],
            tooltipAnchor: [0, -size/2],
        });
        const marker = L.marker([loc.lat, loc.lng], {
            icon,
            title: loc.name || loc.list,
            riseOnHover: false,
            bubblingMouseEvents: false,
        });
        marker.bindTooltip(loc.name || loc.list, {
            permanent: false,
            direction: 'top',
            offset: [0, -2],
            className: 'bt-tooltip',
            opacity: 0.95,
        });
        marker._locIdx = idx;
        marker.on('click', () => showPlaceCard(loc, idx));
        _markerCache.set(idx, marker);
    });
    _clusterDirty = false;
}

function renderMarkers(filtered) {
    // build cache ถ้าตัวแรกหรือ locations เปลี่ยน
    if (_markerCache.size === 0 || _clusterDirty) _buildMarkerCache();

    const filteredIdxSet = new Set(filtered.map(l => getLocIndex(l)));
    const key = [...filteredIdxSet].sort().join(',') + '|' + heatmapMode;
    if (key === _lastFilteredKey) return;
    _lastFilteredKey = key;

    // ── heatmap mode ──
    if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }
    if (heatmapMode) {
        if (map.hasLayer(markerCluster)) map.removeLayer(markerCluster);
        heatLayer = L.heatLayer(filtered.map(l=>[l.lat,l.lng,1]),{radius:25,blur:15}).addTo(map);
        document.getElementById('countPill').textContent = filtered.length + ' สถานที่';
        document.getElementById('countPill').classList.add('show');
        return;
    }

    // ── cluster mode: เอาแค่ filtered markers เข้า cluster ──
    // ถ้า filtered = ทั้งหมด ไม่ต้อง diff — addLayers ใหม่เลย
    map.removeLayer(markerCluster);
    markerCluster = createClusterGroup();

    const MAX_MARKERS = _mobile ? 1000 : 2000;
    const layers = [];
    let truncated = false;
    filteredIdxSet.forEach(idx => {
        if (layers.length >= MAX_MARKERS) { truncated = true; return; }
        const m = _markerCache.get(idx);
        if (m) layers.push(m);
    });
    if (truncated) console.warn(`Marker limit reached (${MAX_MARKERS}), showing partial`);

    // requestAnimationFrame — ให้ browser วาด frame นี้ให้เสร็จก่อน
    requestAnimationFrame(() => {
        markerCluster.addLayers(layers, { chunkedLoading: true });
        map.addLayer(markerCluster);
        document.getElementById('countPill').textContent = filtered.length + ' สถานที่';
        document.getElementById('countPill').classList.add('show');

        // Cluster click → show list of locations in that cluster
        markerCluster.on('clusterclick', function(e) {
            const childMarkers = e.layer.getAllChildMarkers();
            const clusterLocs = childMarkers.map(m => {
                const idx = m._locIdx;
                return (idx !== undefined && locations[idx]) ? locations[idx] : null;
            }).filter(Boolean);
            if (clusterLocs.length > 0) {
                const lp = document.getElementById('listPanel');
                lp.classList.add('open');
                closePlaceCard();
                renderListPanel(clusterLocs);
            }
        });
    });
}

// เรียกเมื่อ locations เปลี่ยน (add/edit/delete/import/reset)
function invalidateMarkerCache() { _clusterDirty = true; }

function invalidateCache() {
    _lastFilteredKey = null;
    markDatalistDirty();
    rebuildIndexMap();
    invalidateMarkerCache();
}

function update() {
    const filtered = getFiltered();
    renderMarkers(filtered);
    // render list panel เฉพาะเมื่อเปิดอยู่ — ไม่ทำงานเบื้องหลัง
    if (document.getElementById('listPanel').classList.contains('open')) {
        renderListPanel(filtered);
    } else {
        document.getElementById('listPanelTitle').textContent = filtered.length + ' สถานที่';
    }
    updateChipLabels();
    refreshDatalistSuggestions();
}

function refreshDatalistSuggestions() {
    document.getElementById('listSuggestions').innerHTML=[...new Set(locations.map(l=>l.list).filter(Boolean))].map(l=>`<option value="${l}">`).join('');
    document.getElementById('citySuggestions').innerHTML=[...new Set(locations.map(l=>l.city).filter(Boolean))].map(c=>`<option value="${c}">`).join('');
}

function updateChipLabels() {
    document.getElementById('chipListLabel').textContent=filterList||'รายการ';
    document.getElementById('chipCityLabel').textContent=filterCity||'เขต';
    document.getElementById('chipList').classList.toggle('active',!!filterList);
    document.getElementById('chipCity').classList.toggle('active',!!filterCity);
    document.getElementById('chipAll').classList.toggle('active',!filterList&&!filterCity&&!nearbyMode);
    document.getElementById('chipNearby').classList.toggle('active',nearbyMode);
    document.getElementById('chipHeatmap').classList.toggle('active',heatmapMode);
}

// ════════════════════════════════════════════
// PLACE CARD
// ════════════════════════════════════════════
function showPlaceCard(loc, idx) {
    const color=getColor(loc.list);
    const dist=myLatLng?haversine(myLatLng.lat,myLatLng.lng,loc.lat,loc.lng):null;
    const distHtml=dist!==null?`<span class="distance-badge">📍 ${formatDist(dist)}</span>`:'';
    document.getElementById('placeCardContent').innerHTML=`
        <div class="place-card-name">${loc.name||'ไม่มีชื่อ'}</div>
        <div class="place-card-meta">
            <span style="color:${color};font-weight:600;">● ${loc.list}</span>
            ${loc.city?`<span class="dot">·</span><span>${loc.city}</span>`:''}
            ${distHtml}
        </div>
        ${loc.tags&&loc.tags.length?`<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px;">${loc.tags.map(t=>`<span style="display:inline-block;padding:3px 10px;background:var(--surface2);border-radius:12px;font-size:11px;color:var(--text2);font-weight:500;">🏷️ ${t}</span>`).join('')}</div>`:''}
        ${loc.photo?`<div style="margin-bottom:12px;"><img src="${loc.photo}" style="width:100%;max-height:200px;object-fit:cover;border-radius:12px;border:1px solid var(--border);cursor:pointer;" onclick="window.open(this.src,'_blank')"></div>`:''}
        ${loc.note?`<div style="font-size:13px;color:var(--text2);margin-bottom:12px;padding:8px 12px;background:var(--surface2);border-radius:10px;">📝 ${loc.note}</div>`:''}
        <div class="place-card-actions">
            <a class="place-action-btn" href="https://www.google.com/maps?q=${loc.lat},${loc.lng}" target="_blank">
                <span class="place-action-icon">🗺️</span>
                <span class="place-action-label" style="color:#1a73e8;">Maps</span>
            </a>
            <a class="place-action-btn green" href="https://waze.com/ul?ll=${loc.lat},${loc.lng}&navigate=yes" target="_blank">
                <span class="place-action-icon">🚗</span>
                <span class="place-action-label">Waze</span>
            </a>
            <button class="place-action-btn yellow" onclick="openEdit(${idx})">
                <span class="place-action-icon">✏️</span>
                <span class="place-action-label">แก้ไข</span>
            </button>
            <button class="place-action-btn purple" onclick="startMeasureMode(${idx})">
                <span class="place-action-icon">📏</span>
                <span class="place-action-label">วัดระยะ</span>
            </button>
            <button class="place-action-btn" onclick="shareLocation(${loc.lat},${loc.lng},'${(loc.name||'BT').replace(/'/g,'\\&#39;')}')">
                <span class="place-action-icon">🔗</span>
                <span class="place-action-label">แชร์</span>
            </button>
            <button class="place-action-btn green" onclick="doDirectionsTo(${idx})">
                <span class="place-action-icon">🧭</span>
                <span class="place-action-label">นำทาง</span>
            </button>
            <button class="place-action-btn orange" onclick="doToggleFavorite(${idx})">
                <span class="place-action-icon">${isFavorite(loc)?'⭐':'☆'}</span>
                <span class="place-action-label">${isFavorite(loc)?'ยกเลิก':'ชอบ'}</span>
            </button>
            <button class="place-action-btn red" onclick="doConfirmDelete(${idx})">
                <span class="place-action-icon">🗑️</span>
                <span class="place-action-label">ลบ</span>
            </button>
        </div>
        <div class="place-card-divider"></div>
        <div class="place-card-row">
            <div class="place-card-row-icon">📌</div>
            <div class="place-card-row-text">
                ${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}<br>
                <small>พิกัด GPS</small>
            </div>
            <button onclick="copyCoords(${loc.lat},${loc.lng})"
                style="border:none;background:none;cursor:pointer;color:var(--blue);font-size:13px;font-weight:500;padding:4px 8px;border-radius:8px;flex-shrink:0;">คัดลอก</button>
        </div>
        ${loc.city?`<div class="place-card-row"><div class="place-card-row-icon">🏙️</div><div class="place-card-row-text">${loc.city}</div></div>`:''}
    `;
    closePlaceCard();
    setTimeout(()=>document.getElementById('placeCard').classList.add('open'),10);
    const targetZoom = Math.max(map.getZoom(), _mobile ? 16 : 15);
    map.flyTo([loc.lat,loc.lng], targetZoom, {animate: !_mobile, duration: _mobile ? 0.3 : 0.6});
    closeListPanel();
}

// ══ คัดลอกพิกัด — รองรับมือถือ ══
window.copyCoords = function(lat, lng) {
    const text = `${lat},${lng}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(()=>showToast('✅ คัดลอกพิกัดแล้ว',false,true)).catch(()=>fallbackCopy(text));
    } else { fallbackCopy(text); }
};
function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    try { document.execCommand('copy'); showToast('✅ คัดลอกแล้ว',false,true); }
    catch(e) { showToast('ไม่สามารถคัดลอกได้'); }
    document.body.removeChild(ta);
}

function closePlaceCard() { document.getElementById('placeCard').classList.remove('open'); }
window.doToggleFavorite=function(idx){const loc=locations[idx];if(!loc)return;toggleFavorite(loc);invalidateCache();update();showPlaceCard(loc,idx);showToast(isFavorite(loc)?'⭐ เพิ่มในรายการโปรดแล้ว':'☆ นำออกจากรายการโปรดแล้ว');};
document.getElementById('placeCardClose').onclick = closePlaceCard;

// ════════════════════════════════════════════
// LIST PANEL
// ════════════════════════════════════════════
function renderListPanel(filtered) {
    const body=document.getElementById('listBody');
    document.getElementById('listPanelTitle').textContent=`${filtered.length} สถานที่`;
    const sorted=getSorted(filtered);
    body.innerHTML=sorted.map(loc=>{
        const color=getColor(loc.list);
        const idx=getLocIndex(loc);
        const dist=myLatLng?haversine(myLatLng.lat,myLatLng.lng,loc.lat,loc.lng):null;
        const distText=dist!==null?` · ${formatDist(dist)}`:'';
        return `<div class="list-item" onclick="showPlaceCard(locations[${idx}],${idx});closeListPanel();">
            <div class="list-item-icon" style="background:${color}20;"><span style="font-size:16px;">📍</span></div>
            <div class="list-item-text">
                <div class="list-item-name">${loc.name||'ไม่มีชื่อ'}</div>
                <div class="list-item-sub">${loc.list}${loc.city?' · '+loc.city:''}${distText}</div>
            </div>
            <span class="list-item-chevron">›</span>
        </div>`;
    }).join('');
}
window.closeListPanel = ()=>document.getElementById('listPanel').classList.remove('open');
document.getElementById('listPanelClose').onclick = closeListPanel;

document.getElementById('listSortBar').addEventListener('click',e=>{
    const btn=e.target.closest('.sort-btn'); if(!btn) return;
    const sort=btn.dataset.sort;
    if(sort==='near'&&!myLatLng){showToast('กรุณาเปิด GPS ก่อน',true);return;}
    listSortMode=sort;
    document.querySelectorAll('.sort-btn').forEach(b=>b.classList.toggle('active',b.dataset.sort===sort));
    renderListPanel(getFiltered());
});

// ════════════════════════════════════════════
// SEARCH
// ════════════════════════════════════════════
const searchInput=document.getElementById('search');
const searchBox=document.getElementById('searchBox');
const searchResults=document.getElementById('searchResults');
const btnClearSearch=document.getElementById('btnClearSearch');

const _debouncedUpdate = debounce(update, 120);

searchInput.addEventListener('focus',()=>{searchBox.classList.add('focused');renderSearchResults();});
searchInput.addEventListener('blur',()=>setTimeout(()=>searchBox.classList.remove('focused'),200));
searchInput.addEventListener('input',()=>{
    btnClearSearch.classList.toggle('show',searchInput.value.length>0);
    renderSearchResults();
    _debouncedUpdate(); // debounce 120ms — ไม่ re-render map ทุก keystroke
});
btnClearSearch.onclick=()=>{searchInput.value='';btnClearSearch.classList.remove('show');searchResults.innerHTML='';_lastFilteredKey=null;update();};

function parseLatLng(q) {
    const m=q.replace(/\s+/g,' ').trim().match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/);
    if(m){const lat=parseFloat(m[1]),lng=parseFloat(m[2]);if(lat>=-90&&lat<=90&&lng>=-180&&lng<=180)return{lat,lng};}
    return null;
}

function renderSearchResults() {
    const q=searchInput.value.toLowerCase().trim();
    if(!q){searchResults.innerHTML='';return;}
    let html='';
    const coords=parseLatLng(searchInput.value.trim());
    if(coords){
        html+=`<div class="search-result-item" onclick="map.flyTo([${coords.lat},${coords.lng}],16,{animate:true,duration:0.8});document.getElementById('search').blur();">
            <div class="search-result-icon" style="background:#e8f0fe;color:#1a73e8">🎯</div>
            <div class="search-result-text">
                <div class="search-result-name">ไปที่พิกัด ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}</div>
                <div class="search-result-sub">กดเพื่อ zoom ไปยังตำแหน่งนี้</div>
            </div>
        </div>`;
    }
    const matches=locations.filter(l=>(l.name||'').toLowerCase().includes(q)||l.list.toLowerCase().includes(q)||(l.city||'').toLowerCase().includes(q)||matchCoords(l,q)).slice(0,8);
    html+=matches.map(loc=>{
        const color=getColor(loc.list);
        const idx=getLocIndex(loc);
        return `<div class="search-result-item" onclick="showPlaceCard(locations[${idx}],${idx});document.getElementById('search').blur();">
            <div class="search-result-icon" style="background:${color}20;color:${color}">📍</div>
            <div class="search-result-text">
                <div class="search-result-name">${loc.name||'ไม่มีชื่อ'}</div>
                <div class="search-result-sub">${loc.list}${loc.city?' · '+loc.city:''} · ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}</div>
            </div>
        </div>`;
    }).join('');
    searchResults.innerHTML=html;
}

// ════════════════════════════════════════════
// FILTER CHIPS
// ════════════════════════════════════════════
document.getElementById('chipAll').onclick=()=>{filterList='';filterCity='';nearbyMode=false;update();};

document.getElementById('chipFav').onclick=()=>{filterFavorites=!filterFavorites;document.getElementById('chipFav').classList.toggle('active',filterFavorites);update();};

document.getElementById('chipNearby').onclick=()=>{
    if(!myLatLng){showToast('กรุณาเปิด GPS ก่อน',true);return;}
    nearbyMode=!nearbyMode; update();
    if(nearbyMode){
        const f=getFiltered();
        if(f.length>0)map.flyToBounds(L.latLngBounds(f.map(l=>[l.lat,l.lng])),{padding:[60,60],animate:true,duration:0.8});
        showToast(`📍 ${getFiltered().length} จุดใกล้ฉัน (${nearbyRadius/1000} กม.)`);
    }
};

document.getElementById('chipList').onclick=()=>{
    const counts={}; locations.forEach(l=>{counts[l.list]=(counts[l.list]||0)+1;});
    const lists=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
    const container=document.getElementById('listChoiceList');
    container.innerHTML=`<div class="filter-choice-item ${!filterList?'selected':''}" data-val="">
        <span class="filter-choice-dot" style="background:#9aa0a6"></span>ทุกรายการ<span class="filter-choice-count">${locations.length}</span></div>
        ${lists.map(([n,c])=>`<div class="filter-choice-item ${filterList===n?'selected':''}" data-val="${n}">
        <span class="filter-choice-dot" style="background:${getColor(n)}"></span>${n}<span class="filter-choice-count">${c}</span></div>`).join('')}`;
    container.querySelectorAll('.filter-choice-item').forEach(el=>{
        el.onclick=()=>{container.querySelectorAll('.filter-choice-item').forEach(x=>x.classList.remove('selected'));el.classList.add('selected');filterList=el.dataset.val;};
    });
    document.getElementById('listFilterModalOverlay').classList.add('open');
};
document.getElementById('listFilterClose').onclick=()=>{
    document.getElementById('listFilterModalOverlay').classList.remove('open'); update();
    if(filterList){const f=getFiltered();if(f.length>0)map.flyToBounds(L.latLngBounds(f.map(l=>[l.lat,l.lng])),{padding:[60,60],animate:true,duration:0.8});}
};
document.getElementById('listFilterClear').onclick=()=>{filterList='';document.getElementById('listFilterModalOverlay').classList.remove('open');update();};
document.getElementById('listFilterModalOverlay').onclick=e=>{if(e.target===document.getElementById('listFilterModalOverlay')){document.getElementById('listFilterModalOverlay').classList.remove('open');update();}};

document.getElementById('chipCity').onclick=()=>{
    const counts={}; locations.forEach(l=>{if(l.city)counts[l.city]=(counts[l.city]||0)+1;});
    const cities=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
    const container=document.getElementById('cityChoiceList');
    container.innerHTML=`<div class="filter-choice-item ${!filterCity?'selected':''}" data-val="">
        <span class="filter-choice-dot" style="background:#9aa0a6"></span>ทุกเขต<span class="filter-choice-count">${locations.length}</span></div>
        ${cities.map(([n,c])=>`<div class="filter-choice-item ${filterCity===n?'selected':''}" data-val="${n}">
        <span class="filter-choice-dot" style="background:#1a73e8"></span>${n}<span class="filter-choice-count">${c}</span></div>`).join('')}`;
    container.querySelectorAll('.filter-choice-item').forEach(el=>{
        el.onclick=()=>{container.querySelectorAll('.filter-choice-item').forEach(x=>x.classList.remove('selected'));el.classList.add('selected');filterCity=el.dataset.val;};
    });
    document.getElementById('cityFilterModalOverlay').classList.add('open');
};
document.getElementById('cityFilterClose').onclick=()=>{
    document.getElementById('cityFilterModalOverlay').classList.remove('open'); update();
    if(filterCity){const f=getFiltered();if(f.length>0)map.flyToBounds(L.latLngBounds(f.map(l=>[l.lat,l.lng])),{padding:[60,60],animate:true,duration:0.8});}
};
document.getElementById('cityFilterClear').onclick=()=>{filterCity='';document.getElementById('cityFilterModalOverlay').classList.remove('open');update();};
document.getElementById('cityFilterModalOverlay').onclick=e=>{if(e.target===document.getElementById('cityFilterModalOverlay')){document.getElementById('cityFilterModalOverlay').classList.remove('open');update();}};

document.getElementById('chipHeatmap').onclick=()=>{heatmapMode=!heatmapMode;_lastFilteredKey=null;update();};
document.getElementById('chipList2').onclick=()=>{
    const lp=document.getElementById('listPanel');
    if(lp.classList.contains('open')){closeListPanel();}else{
        lp.classList.add('open'); closePlaceCard();
        renderListPanel(getFiltered()); // render เมื่อเปิดครั้งแรก
    }
};
document.getElementById('chipAll').classList.add('active');

// ════════════════════════════════════════════
// MAP CONTROLS
// ════════════════════════════════════════════
document.getElementById('btnZoomIn').onclick=()=>map.zoomIn();
document.getElementById('btnZoomOut').onclick=()=>map.zoomOut();
document.getElementById('btnTile').onclick=()=>{
    map.removeLayer(tileLayers[tileNames[currentTileIdx]]);
    currentTileIdx=(currentTileIdx+1)%tileNames.length;
    tileLayers[tileNames[currentTileIdx]].addTo(map);
    showToast('แผนที่: '+tileNames[currentTileIdx]);
};

// ════════════════════════════════════════════
// GPS
// ════════════════════════════════════════════
const btnGps=document.getElementById('btnGps');

// ── smooth pan ด้วย panTo แทน flyTo — ไม่กระตุกเมื่อตำแหน่งเปลี่ยนนิดเดียว ──
function _smoothFollow(lat, lng) {
    if (!gpsTracking) return;
    const cur = map.getCenter();
    const dist = haversine(cur.lat, cur.lng, lat, lng);
    if (dist < 2) return; // ไม่ขยับถ้าใกล้มาก < 2ม.
    // panTo สมูทกว่า flyTo สำหรับการติดตาม
    map.panTo([lat, lng], {animate: true, duration: 0.5, easeLinearity: 0.5, noMoveStart: true});
}

function updateGpsMarker(lat, lng, accuracy) {
    if (myLocationCircle) {
        myLocationCircle.setLatLng([lat, lng]);
        myLocationCircle.setRadius(Math.min(accuracy, 500));
    } else {
        myLocationCircle = L.circle([lat, lng], {
            radius: Math.min(accuracy, 500), color:'#1a73e8',
            fillColor:'#1a73e8', fillOpacity:0.08, weight:1.5
        }).addTo(map);
    }
    const iconHtml = `<div class="you-are-here-wrap"><div class="you-are-here-ring"></div><div class="you-are-here-ring"></div><div class="you-are-here-ring"></div><div class="you-are-here"></div></div>`;
    const icon = L.divIcon({className:'', html:iconHtml, iconSize:[48,48], iconAnchor:[24,24]});
    if (myLocationMarker) {
        myLocationMarker.setLatLng([lat, lng]);
    } else {
        myLocationMarker = L.marker([lat, lng], {icon, zIndexOffset:1000, interactive:true}).addTo(map)
            .bindPopup(`<div style="padding:12px;font-size:13px;min-width:180px;">
                <b>📍 ตำแหน่งของฉัน</b><br>
                <small style="color:#5f6368;">${lat.toFixed(6)}, ${lng.toFixed(6)}</small><br>
                <small style="color:#5f6368;">±${Math.round(accuracy)}ม.</small><br><br>
                <button onclick="openAddAt(${lat},${lng})" style="background:#1a73e8;color:white;border:none;border-radius:8px;padding:6px 14px;cursor:pointer;font-size:12px;font-family:inherit;">+ ปักหมุดที่นี่</button>
            </div>`);
    }
    myLatLng = {lat, lng};
    if (myLocationMarker.isPopupOpen()) {
        myLocationMarker.setPopupContent(`<div style="padding:12px;font-size:13px;min-width:180px;"><b>📍 ตำแหน่งของฉัน</b><br><small>${lat.toFixed(6)}, ${lng.toFixed(6)}</small><br><small>±${Math.round(accuracy)}ม.</small><br><br><button onclick="openAddAt(${lat},${lng})" style="background:#1a73e8;color:white;border:none;border-radius:8px;padding:6px 14px;cursor:pointer;font-size:12px;font-family:inherit;">+ ปักหมุดที่นี่</button></div>`);
    }
    _smoothFollow(lat, lng);
    if (listSortMode==='near' || nearbyMode) update();
}

// หยุดติดตามกล้องเมื่อผู้ใช้ลาก map
map.on('dragstart', () => {
    if (gpsTracking) {
        gpsTracking = false;
        btnGps.title = 'ติดตามตำแหน่ง (ปิด — แตะเพื่อเปิด)';
        btnGps.classList.remove('gps-tracking');
    }
});

function stopGps() {
    if (gpsWatcher !== null) { navigator.geolocation.clearWatch(gpsWatcher); gpsWatcher = null; }
    gpsActive = false; gpsTracking = false; gpsCoarseShown = false; gpsFlyDone = false;
    gpsToastShown = false; gpsFineToastShown = false;
    btnGps.classList.remove('gps-searching', 'gps-found', 'gps-tracking');
    _lastGpsLat = null; _lastGpsLng = null;
}

// btnGps: กดครั้งที่ 1 = เปิด GPS + เปิด tracking, กดครั้งที่ 2 = กล้องบินไปตำแหน่ง + เปิด tracking อีกครั้ง
btnGps.onclick = () => {
    if (!navigator.geolocation) { showToast('Browser ไม่รองรับ GPS', true); return; }
    if (gpsActive && myLocationMarker) {
        // toggle tracking: ถ้า tracking อยู่ → บินไปตำแหน่ง, ถ้าไม่ → เปิด tracking
        gpsTracking = true;
        btnGps.classList.add('gps-tracking');
        const ll = myLocationMarker.getLatLng();
        map.flyTo([ll.lat, ll.lng], Math.max(map.getZoom(), 17), {animate:true, duration:0.8, easeLinearity:0.5});
        showToast('📍 ติดตามตำแหน่ง');
        return;
    }
    stopGps();
    gpsActive = true; gpsTracking = true;
    btnGps.classList.add('gps-searching', 'gps-tracking');
    showToast('⏳ กำลังหาตำแหน่ง...');
    navigator.geolocation.getCurrentPosition(
        pos => {
            if (!gpsActive) return;
            const {latitude:lat, longitude:lng, accuracy} = pos.coords;
            gpsCoarseShown = true;
            updateGpsMarker(lat, lng, accuracy);
            if (!gpsFlyDone) {
                gpsFlyDone = true;
                const z = accuracy > 1000 ? 13 : accuracy > 200 ? 15 : 17;
                map.flyTo([lat, lng], z, {animate:true, duration:1.0, easeLinearity:0.5});
            }
            btnGps.classList.remove('gps-searching');
            btnGps.classList.add('gps-found');
            if (!gpsToastShown) {
                gpsToastShown = true;
                showToast(accuracy > 500 ? `📡 ±${Math.round(accuracy)}ม.` : `✅ พบตำแหน่ง ±${Math.round(accuracy)}ม.`, false, true);
            }
            // watchPosition — อัปเดตแบบ continuous
            gpsWatcher = navigator.geolocation.watchPosition(
                pos2 => {
                    if (!gpsActive) return;
                    const {latitude:lat2, longitude:lng2, accuracy:acc2} = pos2.coords;
                    // กรอง noise: ถ้าตำแหน่งไม่เปลี่ยนมากพอ ไม่ต้อง update marker
                    if (_lastGpsLat !== null) {
                        const moved = haversine(_lastGpsLat, _lastGpsLng, lat2, lng2);
                        if (moved < 1 && acc2 > 20) return; // < 1ม. และ accuracy ไม่ดีขึ้น → skip
                    }
                    _lastGpsLat = lat2; _lastGpsLng = lng2;
                    updateGpsMarker(lat2, lng2, acc2);
                    if (!gpsFineToastShown && acc2 < 50) {
                        gpsFineToastShown = true;
                        showToast(`✅ แม่นยำ ±${Math.round(acc2)}ม.`, false, true);
                    }
                },
                () => {},
                {enableHighAccuracy:true, timeout:15000, maximumAge:1000}
            );
        },
        () => { stopGps(); showToast('ไม่สามารถหาตำแหน่งได้ กรุณาอนุญาต GPS', true); },
        {enableHighAccuracy:false, timeout:5000, maximumAge:30000}
    );
};

// GPS modal
document.getElementById('btnUseGpsModal').onclick=()=>{
    if(!navigator.geolocation){showToast('Browser ไม่รองรับ GPS',true);return;}
    const btn=document.getElementById('btnUseGpsModal');
    btn.textContent='⏳ กำลังหาตำแหน่ง...';
    navigator.geolocation.getCurrentPosition(pos=>{
        document.getElementById('modalLat').value=pos.coords.latitude.toFixed(6);
        document.getElementById('modalLng').value=pos.coords.longitude.toFixed(6);
        btn.textContent='✅ ได้ตำแหน่งแล้ว';
        setTimeout(()=>btn.textContent='📍 ใช้ตำแหน่งของฉัน',2000);
        if(pos.coords.accuracy>100){
            navigator.geolocation.getCurrentPosition(p2=>{
                document.getElementById('modalLat').value=p2.coords.latitude.toFixed(6);
                document.getElementById('modalLng').value=p2.coords.longitude.toFixed(6);
            },()=>{},{enableHighAccuracy:true,timeout:8000,maximumAge:0});
        }
    },()=>{btn.textContent='📍 ใช้ตำแหน่งของฉัน';showToast('ไม่สามารถหาตำแหน่งได้',true);},{enableHighAccuracy:false,timeout:4000,maximumAge:30000});
};

// ════════════════════════════════════════════
// ADD MODE
// ════════════════════════════════════════════
const crosshair=document.getElementById('crosshair'), addBanner=document.getElementById('addBanner'), fab=document.getElementById('btnFab');

fab.onclick=()=>{
    if(addMode){cancelAddMode();return;}
    addMode=true; fab.classList.add('add-mode');
    fab.innerHTML=`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>ยกเลิก`;
    addBanner.classList.add('show'); crosshair.classList.add('show');
    document.getElementById('map').classList.add('add-cursor');
    closePlaceCard(); cancelMeasureMode();
};

document.getElementById('btnCancelAdd').onclick=cancelAddMode;
function cancelAddMode() {
    addMode=false; fab.classList.remove('add-mode');
    fab.innerHTML=`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>เพิ่มจุด`;
    addBanner.classList.remove('show'); crosshair.classList.remove('show');
    document.getElementById('map').classList.remove('add-cursor');
}

document.getElementById('map').addEventListener('mousemove', throttle(e=>{
    if(!addMode)return; crosshair.style.left=e.clientX+'px'; crosshair.style.top=e.clientY+'px';
}, 16)); // ~60fps cap

// ════════════════════════════════════════════
// MAP CLICK
// ════════════════════════════════════════════
map.on('click',e=>{
    const{lat,lng}=e.latlng;
    if(document.getElementById('editModalOverlay').classList.contains('open')){
        document.getElementById('modalLat').value=lat.toFixed(6);
        document.getElementById('modalLng').value=lng.toFixed(6);
        ['modalLat','modalLng'].forEach(id=>{const el=document.getElementById(id);el.style.borderColor='#34a853';setTimeout(()=>el.style.borderColor='',800);});
        return;
    }
    if(measureMode&&measureStart){
        const d=haversine(measureStart.lat,measureStart.lng,lat,lng);
        if(measureLine)map.removeLayer(measureLine);
        measureLine=L.polyline([[measureStart.lat,measureStart.lng],[lat,lng]],{color:'#7b1fa2',weight:3,dashArray:'8,6'}).addTo(map);
        document.getElementById('measureResultText').textContent=`${formatDist(d)}\n(จาก: ${measureStart.name||measureStart.list} → พิกัดที่เลือก)`;
        document.getElementById('measureModalOverlay').classList.add('open');
        cancelMeasureMode(); return;
    }
    if(!addMode)return;
    cancelAddMode(); openAddAt(lat,lng);
});

window.openAddAt=function(lat,lng){
    map.closePopup(); editingIndex=-1;
    document.getElementById('editModalTitle').textContent='เพิ่มสถานที่';
    document.getElementById('modalName').value='';
    document.getElementById('modalList').value=filterList||'';
    document.getElementById('modalCity').value=filterCity||'';
    document.getElementById('modalNote').value='';
    document.getElementById('modalTags').value='';
    setPhotoPreview('');
    document.getElementById('modalLat').value=parseFloat(lat).toFixed(6);
    document.getElementById('modalLng').value=parseFloat(lng).toFixed(6);
    document.getElementById('editModalOverlay').classList.add('open');
};

// lat/lng hint — desktop only (ซ่อนบนมือถือผ่าน CSS)
const latlngHint=document.getElementById('latlngHint');
map.on('mousemove', throttle(e=>{ latlngHint.textContent=`${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`; latlngHint.classList.add('show'); }, 50));
map.on('mouseout',()=>latlngHint.classList.remove('show'));

// ════════════════════════════════════════════
// EDIT / ADD MODAL
// ════════════════════════════════════════════
let _modalPhoto=''; // temp base64
const photoPreview=document.getElementById('modalPhotoPreview');
const photoInput=document.getElementById('modalPhotoInput');
const photoRemoveBtn=document.getElementById('modalPhotoRemove');

function setPhotoPreview(dataUrl){
    _modalPhoto=dataUrl||'';
    if(_modalPhoto){
        photoPreview.src=_modalPhoto;photoPreview.style.display='block';
        photoRemoveBtn.style.display='inline-block';
    }else{
        photoPreview.src='';photoPreview.style.display='none';
        photoRemoveBtn.style.display='none';
    }
}
photoInput.onchange=e=>{
    const file=e.target.files[0];if(!file)return;
    if(file.size>2*1024*1024){showToast('รูปใหญ่เกิน 2MB',true);e.target.value='';return;}
    const reader=new FileReader();
    reader.onload=ev=>{
        // resize to max 800px
        const img=new Image();
        img.onload=()=>{
            const max=800;let w=img.width,h=img.height;
            if(w>max||h>max){const r=Math.min(max/w,max/h);w*=r;h*=r;}
            const c=document.createElement('canvas');c.width=w;c.height=h;
            c.getContext('2d').drawImage(img,0,0,w,h);
            setPhotoPreview(c.toDataURL('image/jpeg',0.7));
        };
        img.src=ev.target.result;
    };
    reader.readAsDataURL(file);e.target.value='';
};
photoRemoveBtn.onclick=()=>setPhotoPreview('');

window.openEdit=function(idx){
    const loc=locations[idx]; if(!loc)return;
    editingIndex=idx;
    document.getElementById('editModalTitle').textContent='แก้ไขสถานที่';
    document.getElementById('modalName').value=loc.name||'';
    document.getElementById('modalList').value=loc.list||'';
    document.getElementById('modalCity').value=loc.city||'';
    document.getElementById('modalNote').value=loc.note||'';
    document.getElementById('modalTags').value=(loc.tags||[]).join(', ');
    document.getElementById('modalLat').value=loc.lat;
    document.getElementById('modalLng').value=loc.lng;
    setPhotoPreview(loc.photo||'');
    closePlaceCard();
    document.getElementById('editModalOverlay').classList.add('open');
};

document.getElementById('editModalCancel').onclick=()=>document.getElementById('editModalOverlay').classList.remove('open');
document.getElementById('editModalOverlay').onclick=e=>{if(e.target===document.getElementById('editModalOverlay'))document.getElementById('editModalOverlay').classList.remove('open');};

document.getElementById('editModalSave').onclick=()=>{
    const name=document.getElementById('modalName').value.trim();
    const list=document.getElementById('modalList').value.trim()||'ไม่มีรายการ';
    const city=document.getElementById('modalCity').value.trim();
    const note=document.getElementById('modalNote').value.trim();
    const lat=parseFloat(document.getElementById('modalLat').value);
    const lng=parseFloat(document.getElementById('modalLng').value);
    if(isNaN(lat)||isNaN(lng)){showToast('กรุณากรอก Lat/Lng',true);return;}
    pushUndo();
    const photo=_modalPhoto||'';
    const tagsRaw=document.getElementById('modalTags').value;
    const tags=tagsRaw?tagsRaw.split(',').map(t=>t.trim()).filter(Boolean):[];
    const entry={name,lat,lng,list,city,note,updatedAt:Date.now()};
    if(tags.length)entry.tags=tags;
    if(photo)entry.photo=photo;
    if(editingIndex>=0){locations[editingIndex]=entry;addChangelogEntry('edit',entry);}
    else{locations.push(entry);addChangelogEntry('add',entry);}
    saveLocations(); invalidateCache();
    document.getElementById('editModalOverlay').classList.remove('open');
    update();
    showToast(editingIndex>=0?'บันทึกสำเร็จ':'เพิ่มสถานที่แล้ว',false,true);
    if(editingIndex<0)map.flyTo([lat,lng],15,{animate:true,duration:0.7});
};

// ════════════════════════════════════════════
// DELETE
// ════════════════════════════════════════════
window.doConfirmDelete=function(idx){
    const loc=locations[idx]; if(!loc)return;
    showConfirm('🗑️','ลบสถานที่?',`"${loc.name||loc.list}" จะถูกลบ (Undo ได้)`,()=>{
        addChangelogEntry('delete',loc);
        pushUndo();locations.splice(idx,1);saveLocations();invalidateCache();closePlaceCard();update();showToast('ลบแล้ว');
    });
};

// ════════════════════════════════════════════
// MEASURE
// ════════════════════════════════════════════
window.startMeasureMode=function(idx){
    const loc=locations[idx]; measureStart=loc; measureMode=true;
    document.getElementById('measureBanner').classList.add('show');
    document.getElementById('map').classList.add('measure-cursor');
    closePlaceCard();
};
document.getElementById('btnCancelMeasure').onclick=cancelMeasureMode;
function cancelMeasureMode(){
    measureMode=false;measureStart=null;
    document.getElementById('measureBanner').classList.remove('show');
    document.getElementById('map').classList.remove('measure-cursor');
}
document.getElementById('measureModalClose').onclick=()=>document.getElementById('measureModalOverlay').classList.remove('open');
document.getElementById('measureModalClear').onclick=()=>{if(measureLine){map.removeLayer(measureLine);measureLine=null;}document.getElementById('measureModalOverlay').classList.remove('open');};
document.getElementById('measureModalOverlay').onclick=e=>{if(e.target===document.getElementById('measureModalOverlay'))document.getElementById('measureModalOverlay').classList.remove('open');};

// ════════════════════════════════════════════
// ROUTE PLANNING (Nearest-Neighbor TSP)
// ════════════════════════════════════════════
let routeLine=null, routeMode=false;

function clearRoute(){
    if(routeLine){map.removeLayer(routeLine);routeLine=null;}
    routeMode=false;
    document.getElementById('chipRoute').classList.remove('active');
}

function doRoute(){
    const filtered=getFiltered();
    if(filtered.length<2){showToast('ต้องมีอย่างน้อย 2 จุด',true);return;}
    if(filtered.length>500){showToast('มากเกินไป (สูงสุด 500 จุด)',true);return;}

    // Start from GPS location or first point
    let startLat=myLatLng?myLatLng.lat:filtered[0].lat;
    let startLng=myLatLng?myLatLng.lng:filtered[0].lng;

    // Nearest-neighbor TSP
    const remaining=[...filtered];
    const ordered=[];
    let curLat=startLat, curLng=startLng;
    while(remaining.length>0){
        let bestIdx=0, bestDist=Infinity;
        for(let i=0;i<remaining.length;i++){
            const d=haversine(curLat,curLng,remaining[i].lat,remaining[i].lng);
            if(d<bestDist){bestDist=d;bestIdx=i;}
        }
        const next=remaining.splice(bestIdx,1)[0];
        ordered.push(next);
        curLat=next.lat;curLng=next.lng;
    }

    // Calculate total distance
    let totalDist=0;
    if(myLatLng)totalDist+=haversine(myLatLng.lat,myLatLng.lng,ordered[0].lat,ordered[0].lng);
    for(let i=0;i<ordered.length-1;i++){
        totalDist+=haversine(ordered[i].lat,ordered[i].lng,ordered[i+1].lat,ordered[i+1].lng);
    }

    // Draw polyline + numbered markers in a layer group
    if(routeLine){map.removeLayer(routeLine);}
    const group=L.layerGroup();
    const pts=[];
    if(myLatLng)pts.push([myLatLng.lat,myLatLng.lng]);
    ordered.forEach(l=>pts.push([l.lat,l.lng]));
    L.polyline(pts,{color:'#4285f4',weight:3,opacity:0.8,dashArray:'8,6'}).addTo(group);

    ordered.forEach((loc,i)=>{
        L.circleMarker([loc.lat,loc.lng],{radius:10,color:'#fff',fillColor:'#4285f4',fillOpacity:1,weight:2})
            .bindTooltip(String(i+1),{permanent:true,direction:'center',className:'route-number-tooltip'})
            .addTo(group);
    });

    routeLine=group.addTo(map);
    map.fitBounds(L.latLngBounds(pts),{padding:[60,60]});
    routeMode=true;
    document.getElementById('chipRoute').classList.add('active');
    showToast(`🛤️ เส้นทาง ${ordered.length} จุด · ${formatDist(totalDist)}`,false,true);

    // Show list panel with route order
    const lp=document.getElementById('listPanel');
    lp.classList.add('open');
    renderListPanel(ordered);
    document.getElementById('listPanelTitle').textContent=`🛤️ เส้นทาง · ${formatDist(totalDist)}`;
}

document.getElementById('chipRoute').onclick=()=>{
    if(routeMode){clearRoute();showToast('ปิดเส้นทาง');}
    else doRoute();
};

// ════════════════════════════════════════════
// INFO PANEL
// ════════════════════════════════════════════
document.getElementById('btnMenu').onclick=()=>openInfoPanel('menu');
document.getElementById('infoPanelClose').onclick=closeInfo;
document.getElementById('infoPanelBackdrop').onclick=closeInfo;

function openInfoPanel(mode){
    const body=document.getElementById('infoPanelBody');
    if(mode==='changelog'){
        document.getElementById('infoPanelTitle').textContent='ประวัติการแก้ไข';
        const log=getChangelog();
        const actionLabel={add:'เพิ่ม',edit:'แก้ไข',delete:'ลบ'};
        const actionIcon={add:'➕',edit:'✏️',delete:'🗑️'};
        const actionColor={add:'#34a853',edit:'#4285f4',delete:'#ea4335'};
        if(!log.length){body.innerHTML='<div style="padding:24px;text-align:center;color:var(--text3);">\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e21\u0e35\u0e1b\u0e23\u0e30\u0e27\u0e31\u0e15\u0e34</div>';}
        else{body.innerHTML=`<div style="padding:8px 16px;">
            ${log.map(e=>{
                const d=new Date(e.t);
                const ts=d.toLocaleDateString('th-TH',{day:'numeric',month:'short'})+' '+d.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
                return `<div style="display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border);">
                    <span style="font-size:16px;margin-top:2px;">${actionIcon[e.a]||'❓'}</span>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:13px;font-weight:600;color:${actionColor[e.a]||'var(--text)'};">${actionLabel[e.a]||e.a}</div>
                        <div style="font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${e.n||'(\u0e44\u0e21\u0e48\u0e21\u0e35\u0e0a\u0e37\u0e48\u0e2d)'}</div>
                        <div style="font-size:11px;color:var(--text3);">${e.list} · ${ts}</div>
                    </div>
                </div>`;}).join('')}
        </div>`;}
    } else if(mode==='stats'){
        document.getElementById('infoPanelTitle').textContent='สถิติ';
        const lc={},cc={};
        locations.forEach(l=>{lc[l.list]=(lc[l.list]||0)+1;if(l.city)cc[l.city]=(cc[l.city]||0)+1;});
        const maxL=Math.max(...Object.values(lc),1);
        const sl=Object.entries(lc).sort((a,b)=>b[1]-a[1]);
        const sc=Object.entries(cc).sort((a,b)=>b[1]-a[1]);
        body.innerHTML=`<div class="stats-section">
            <div style="font-size:28px;font-weight:700;color:var(--blue);margin-bottom:4px;">${locations.length}</div>
            <div style="font-size:13px;color:var(--text3);margin-bottom:20px;">สถานที่ทั้งหมด</div>
            <div class="stats-header">ตามรายการ</div>
            ${sl.map(([n,c])=>`<div class="stats-row"><span class="stats-dot" style="background:${getColor(n)}"></span><span class="stats-name">${n}</span><div class="stats-bar-wrap"><div class="stats-bar" style="width:${c/maxL*100}%;background:${getColor(n)}"></div></div><span class="stats-count">${c}</span></div>`).join('')}
            ${sc.length?`<div class="stats-header" style="margin-top:20px;">ตามเขต</div>${sc.map(([n,c])=>`<div class="stats-row"><span class="stats-dot" style="background:var(--blue)"></span><span class="stats-name">${n}</span><div class="stats-bar-wrap"><div class="stats-bar" style="width:${c/Math.max(...sc.map(x=>x[1]))*100}%"></div></div><span class="stats-count">${c}</span></div>`).join('')}`:''}
        </div>`;
    } else {
        document.getElementById('infoPanelTitle').textContent='BT Locations';
        body.innerHTML=`<div style="padding:16px;">
            <div style="font-size:14px;color:var(--text2);margin-bottom:20px;">แผนที่จุด BT Locations · ${locations.length} สถานที่</div>
            ${[
                ['📤','Export JSON','omExportM',''],
                ['🖼️','Export \u0e23\u0e39\u0e1b\u0e41\u0e1c\u0e19\u0e17\u0e35\u0e48','omExportImgM',''],
                ['📥','Import (JSON/CSV/KML/GPX)','omImportM',''],
                ['📊','สถิติ','omStatsM',''],
                ['🔥',heatmapMode?'ปิด Heatmap':'เปิด Heatmap','omHeatmapM',''],
                ['📝','Changelog','omChangelogM',''],
                ['�','Sync Now'+(getToken()?` (${Math.round((Date.now()-_lastSyncTime)/1000)}s ago)`:''),'omSyncM',''],
                ['🌙','Dark mode','omDarkM',''],
                ['📍',trackingActive?'⏹ หยุดบันทึกเส้นทาง':'▶ บันทึกเส้นทาง','omTrackM',''],
                ['🗺️',`ดูเส้นทาง (${savedPaths.length})`,'omShowPathsM',''],
                ['📤','Export เส้นทาง','omExportPathsM',''],
                ['↩','Undo','omUndoM',''],
                ['↪','Redo','omRedoM',''],
                ['🗑️','ลบที่กรอง (Bulk)','omBulkDelM','red'],
                ['🔄','รีเซ็ตข้อมูล','omResetM','red'],
            ].map(([icon,label,id,cls])=>`<button class="om-item ${cls}" id="${id}" style="border-radius:12px;"><span style="font-size:18px;width:20px;">${icon}</span>${label}</button>`).join('<div class="om-sep" style="margin:2px 0;"></div>')}
        </div>`;
        const b=(id,fn)=>{const el=document.getElementById(id);if(el)el.onclick=fn;};
        b('omExportM',  doExport);
        b('omExportImgM', doExportImage);
        b('omImportM',  ()=>{closeInfo();document.getElementById('fileImport').click();});
        b('omStatsM',   ()=>openInfoPanel('stats'));
        b('omChangelogM',()=>openInfoPanel('changelog'));
        b('omSyncM',    ()=>{closeInfo();doSync(false);});
        b('omHeatmapM', ()=>{heatmapMode=!heatmapMode;document.getElementById('chipHeatmap').classList.toggle('active',heatmapMode);update();closeInfo();});
        b('omDarkM',    toggleDark);
        b('omTrackM',   ()=>{closeInfo();if(trackingActive)stopTracking();else startTracking();});
        b('omShowPathsM',()=>{closeInfo();showSavedPaths();});
        b('omExportPathsM',()=>{closeInfo();exportPaths();});
        b('omUndoM',    doUndo);
        b('omRedoM',    doRedo);
        b('omBulkDelM', doBulkDel);
        b('omResetM',   doReset);
    }
    document.getElementById('infoPanel').classList.add('open');
    document.getElementById('infoPanelBackdrop').classList.add('show');
}
function closeInfo(){document.getElementById('infoPanel').classList.remove('open');document.getElementById('infoPanelBackdrop').classList.remove('show');}

// ════════════════════════════════════════════
// EXPORT IMAGE — capture map as PNG
// ════════════════════════════════════════════
function doExportImage() {
    closeInfo();
    showToast('กำลังสร้างรูป...');
    setTimeout(()=>{
        const mapEl=document.getElementById('map');
        const canvas=document.createElement('canvas');
        const w=mapEl.offsetWidth, h=mapEl.offsetHeight;
        canvas.width=w; canvas.height=h;
        const ctx=canvas.getContext('2d');

        // Draw map tiles
        const tiles=mapEl.querySelectorAll('.leaflet-tile');
        const origin=mapEl.querySelector('.leaflet-map-pane');
        const transform=getComputedStyle(origin).transform;
        let tx=0,ty=0;
        if(transform&&transform!=='none'){
            const m=transform.match(/matrix.*\((.+)\)/);
            if(m){const v=m[1].split(',').map(Number);tx=v[4]||0;ty=v[5]||0;}
        }
        tiles.forEach(tile=>{
            try{
                const tileContainer=tile.parentElement;
                const containerTransform=getComputedStyle(tileContainer).transform;
                let ctx2=0,cty=0;
                if(containerTransform&&containerTransform!=='none'){
                    const m2=containerTransform.match(/matrix.*\((.+)\)/);
                    if(m2){const v2=m2[1].split(',').map(Number);ctx2=v2[4]||0;cty=v2[5]||0;}
                }
                const x=parseInt(tile.style.left||0)+tx+ctx2;
                const y=parseInt(tile.style.top||0)+ty+cty;
                ctx.drawImage(tile,x,y,parseInt(tile.style.width||256),parseInt(tile.style.height||256));
            }catch(e){}
        });

        // Draw info text
        ctx.fillStyle='rgba(0,0,0,0.6)';
        ctx.fillRect(0,h-32,w,32);
        ctx.fillStyle='#fff';
        ctx.font='13px sans-serif';
        const center=map.getCenter();
        const info=`BT Locations · ${getFiltered().length} sites · ${center.lat.toFixed(4)},${center.lng.toFixed(4)} · z${map.getZoom()}`;
        ctx.fillText(info,8,h-10);

        // Download
        canvas.toBlob(blob=>{
            if(!blob){showToast('ไม่สามารถสร้างรูปได้ (CORS)',true);return;}
            const url=URL.createObjectURL(blob);
            const a=document.createElement('a');
            a.href=url;
            a.download=`bt_map_${new Date().toISOString().slice(0,10)}.png`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('บันทึกรูปแผนที่แล้ว',false,true);
        },'image/png');
    },300);
}

// ════════════════════════════════════════════
// EXPORT — รองรับมือถือ ✅
// ════════════════════════════════════════════
function doExport() {
    closeInfo();
    const jsonStr = JSON.stringify(locations, null, 2);
    const filename = `bt_locations_${new Date().toISOString().slice(0,10)}.json`;

    // ถ้า Share API รองรับ (มือถือ)
    if (navigator.share && navigator.canShare) {
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const file = new File([blob], filename, { type: 'application/json' });
        if (navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file], title: 'BT Locations Export', text: `ข้อมูล ${locations.length} สถานที่` })
                .then(() => showToast('✅ แชร์สำเร็จ', false, true))
                .catch(() => fallbackExport(jsonStr, filename));
            return;
        }
    }
    fallbackExport(jsonStr, filename);
}

function fallbackExport(jsonStr, filename) {
    // แสดง modal เลือกวิธีบนมือถือ
    document.getElementById('shareModalText').textContent = `${locations.length} สถานที่ · ${Math.round(jsonStr.length/1024)} KB`;
    document.getElementById('shareModalOverlay').classList.add('open');

    document.getElementById('shareBtnDownload').onclick = () => {
        document.getElementById('shareModalOverlay').classList.remove('open');
        // วิธีที่ 1: blob URL (Desktop)
        try {
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = filename; a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            showToast('✅ ดาวน์โหลดแล้ว', false, true);
        } catch(e) {
            // วิธีที่ 2: data URI (มือถือ fallback)
            const a = document.createElement('a');
            a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonStr);
            a.download = filename; a.click();
            showToast('✅ ดาวน์โหลดแล้ว', false, true);
        }
    };

    document.getElementById('shareBtnShare').onclick = () => {
        document.getElementById('shareModalOverlay').classList.remove('open');
        if (navigator.share) {
            navigator.share({ title: 'BT Locations', text: jsonStr })
                .then(() => showToast('✅ แชร์แล้ว', false, true))
                .catch(() => showToast('ยกเลิกการแชร์'));
        } else {
            showToast('Browser ไม่รองรับ Share API');
        }
    };

    document.getElementById('shareBtnCopy').onclick = () => {
        document.getElementById('shareModalOverlay').classList.remove('open');
        fallbackCopy(jsonStr);
    };

    document.getElementById('shareBtnCancel').onclick = () => {
        document.getElementById('shareModalOverlay').classList.remove('open');
    };
}

// ════════════════════════════════════════════
// MULTI-FORMAT IMPORT (JSON/CSV/KML/GPX/GeoJSON)
// ════════════════════════════════════════════
function parseCSV(text) {
    const lines=text.split('\n').map(l=>l.trim()).filter(Boolean);
    if(lines.length<2)return[];
    const header=lines[0].split(',').map(h=>h.trim().toLowerCase());
    const iLat=header.findIndex(h=>h==='lat'||h==='latitude');
    const iLng=header.findIndex(h=>h==='lng'||h==='lon'||h==='longitude');
    const iName=header.findIndex(h=>h==='name'||h==='title');
    const iList=header.findIndex(h=>h==='list'||h==='category'||h==='group');
    const iCity=header.findIndex(h=>h==='city'||h==='district');
    const iUrl=header.findIndex(h=>h==='url');
    if(iLat<0&&iLng<0&&iUrl<0)return[];
    const result=[];
    for(let i=1;i<lines.length;i++){
        const cols=lines[i].split(',').map(c=>c.trim());
        let lat,lng;
        if(iLat>=0&&iLng>=0){lat=parseFloat(cols[iLat]);lng=parseFloat(cols[iLng]);}
        else if(iUrl>=0){
            const m=cols[iUrl].match(/[/@]([-\d.]+),([-\d.]+)/);
            if(m){lat=parseFloat(m[1]);lng=parseFloat(m[2]);}
        }
        if(!lat||!lng||isNaN(lat)||isNaN(lng))continue;
        result.push({name:cols[iName]||'',lat,lng,list:cols[iList]||'Imported',city:cols[iCity]||''});
    }
    return result;
}
function parseKML(text) {
    const parser=new DOMParser();
    const doc=parser.parseFromString(text,'text/xml');
    const placemarks=doc.querySelectorAll('Placemark');
    const result=[];
    placemarks.forEach(pm=>{
        const nameEl=pm.querySelector('name');
        const coordEl=pm.querySelector('coordinates');
        if(!coordEl)return;
        const parts=coordEl.textContent.trim().split(',');
        if(parts.length<2)return;
        const lng=parseFloat(parts[0]),lat=parseFloat(parts[1]);
        if(isNaN(lat)||isNaN(lng))return;
        result.push({name:nameEl?nameEl.textContent.trim():'',lat,lng,list:'KML Import',city:''});
    });
    return result;
}
function parseGPX(text) {
    const parser=new DOMParser();
    const doc=parser.parseFromString(text,'text/xml');
    const wpts=doc.querySelectorAll('wpt');
    const result=[];
    wpts.forEach(wpt=>{
        const lat=parseFloat(wpt.getAttribute('lat'));
        const lng=parseFloat(wpt.getAttribute('lon'));
        if(isNaN(lat)||isNaN(lng))return;
        const nameEl=wpt.querySelector('name');
        result.push({name:nameEl?nameEl.textContent.trim():'',lat,lng,list:'GPX Import',city:''});
    });
    // Also parse trk > trkseg > trkpt
    doc.querySelectorAll('trkpt').forEach(pt=>{
        const lat=parseFloat(pt.getAttribute('lat'));
        const lng=parseFloat(pt.getAttribute('lon'));
        if(!isNaN(lat)&&!isNaN(lng))result.push({name:'',lat,lng,list:'GPX Track',city:''});
    });
    return result;
}
function parseGeoJSON(obj) {
    const result=[];
    const features=obj.features||[obj];
    features.forEach(f=>{
        if(!f.geometry||f.geometry.type!=='Point')return;
        const [lng,lat]=f.geometry.coordinates;
        if(isNaN(lat)||isNaN(lng))return;
        const props=f.properties||{};
        result.push({name:props.name||props.title||'',lat,lng,list:props.list||'GeoJSON Import',city:props.city||''});
    });
    return result;
}

document.getElementById('fileImport').onchange=e=>{
    const file=e.target.files[0]; if(!file)return;
    const ext=file.name.split('.').pop().toLowerCase();
    const reader=new FileReader();
    reader.onload=ev=>{
        const text=ev.target.result;
        let imp=[];
        try {
            if(ext==='csv'){
                imp=parseCSV(text);
            } else if(ext==='kml'){
                imp=parseKML(text);
            } else if(ext==='gpx'){
                imp=parseGPX(text);
            } else if(ext==='geojson'){
                const obj=JSON.parse(text);
                imp=parseGeoJSON(obj);
            } else {
                const obj=JSON.parse(text);
                if(Array.isArray(obj))imp=obj.filter(l=>l&&typeof l.lat==='number'&&typeof l.lng==='number'&&!isNaN(l.lat)&&!isNaN(l.lng)).map(l=>({name:l.name||'',lat:l.lat,lng:l.lng,list:l.list||l.category||l.group||'Imported',city:l.city||l.district||'',note:l.note||'',...(l.tags?{tags:l.tags}:{})}));
                else if(obj.type==='FeatureCollection'||obj.type==='Feature')imp=parseGeoJSON(obj);
                else {showToast('รูปแบบ JSON ไม่ถูกต้อง',true);return;}
            }
        }catch(err){showToast('ไฟล์ไม่ถูกต้อง: '+err.message,true);return;}
        if(!imp.length){showToast('ไม่พบข้อมูลพิกัดในไฟล์',true);return;}
        showConfirm('📥',`Import ${imp.length} จุด?`,`จากไฟล์ ${file.name} (.${ext})\nเลือก Merge หรือ Replace`,()=>{
            pushUndo();locations=imp;saveLocations();invalidateCache();update();showToast(`Replace: ${imp.length} จุด`,false,true);
        });
        // Add merge button to confirm dialog
        setTimeout(()=>{
            const footer=document.querySelector('.confirm-footer');
            if(!footer||footer.querySelector('#btnMergeImport'))return;
            const mergeBtn=document.createElement('button');
            mergeBtn.id='btnMergeImport';
            mergeBtn.className='modal-btn modal-btn-save';
            mergeBtn.style.cssText='background:#059669;';
            mergeBtn.textContent='🔀 Merge (เพิ่มเฉพาะจุดใหม่)';
            mergeBtn.onclick=()=>{
                pushUndo();
                const existing=new Set(locations.map(l=>l.lat.toFixed(5)+','+l.lng.toFixed(5)));
                let added=0;
                imp.forEach(loc=>{
                    const key=loc.lat.toFixed(5)+','+loc.lng.toFixed(5);
                    if(!existing.has(key)){locations.push(loc);existing.add(key);added++;}
                });
                saveLocations();invalidateCache();update();
                showToast(`Merge: เพิ่ม ${added} จุดใหม่ (ข้าม ${imp.length-added} ซ้ำ)`,false,true);
                document.getElementById('confirmModalOverlay').classList.remove('open');
            };
            footer.insertBefore(mergeBtn,footer.firstChild);
        },100);
    };
    reader.readAsText(file); e.target.value='';
};

function doUndo(){if(!undoStack.length){showToast('ไม่มี Undo');return;}redoStack.push(JSON.stringify(locations));locations=JSON.parse(undoStack.pop());saveLocations();invalidateCache();update();showToast('Undo แล้ว');closeInfo();}
function doRedo(){if(!redoStack.length){showToast('ไม่มี Redo');return;}undoStack.push(JSON.stringify(locations));locations=JSON.parse(redoStack.pop());saveLocations();invalidateCache();update();showToast('Redo แล้ว');closeInfo();}

function doBulkDel(){
    const f=getFiltered();
    if(!filterList&&!filterCity&&!document.getElementById('search').value&&!nearbyMode){showToast('กรุณา filter ก่อน',true);return;}
    if(!f.length){showToast('ไม่มีจุดในตัวกรอง',true);return;}
    showConfirm('🗑️',`ลบ ${f.length} จุด?`,'จุดที่อยู่ในตัวกรองปัจจุบันจะถูกลบทั้งหมด',()=>{
        pushUndo();const rm=new Set(f);locations=locations.filter(l=>!rm.has(l));saveLocations();invalidateCache();update();showToast(`ลบ ${f.length} จุดแล้ว`);
    });
    closeInfo();
}

async function doReset(){
    showConfirm('🔄','รีเซ็ตข้อมูล?','ข้อมูลที่แก้ไขจะหาย ระบบจะดึงข้อมูลใหม่จาก GitHub',async()=>{
        pushUndo();localStorage.removeItem(STORAGE_KEY);
        try{const res=await fetch(`https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/all_locations.json?t=${Date.now()}`);
            if(res.ok){locations=await res.json();saveLocations();invalidateCache();update();showToast(`โหลด ${locations.length} จุดจาก GitHub`,false,true);return;}}catch{}
        locations=JSON.parse(JSON.stringify(DEFAULT_LOCATIONS));saveLocations();invalidateCache();update();showToast('รีเซ็ตสำเร็จ');
    });
    closeInfo();
}

function toggleDark(){document.body.classList.toggle('dark');showToast(document.body.classList.contains('dark')?'Dark mode':'Light mode');closeInfo();}

// ════════════════════════════════════════════
// GITHUB SAVE
// ════════════════════════════════════════════
function getToken(){return localStorage.getItem(GITHUB_TOKEN_KEY)||sessionStorage.getItem(GITHUB_TOKEN_KEY)||'';}
function setToken(t){localStorage.setItem(GITHUB_TOKEN_KEY,t);sessionStorage.removeItem(GITHUB_TOKEN_KEY);}

document.getElementById('btnGithubSave').onclick=doGithubSaveFlow;

async function doGithubSaveFlow(){
    if(!getToken()){document.getElementById('tokenInput').value='';document.getElementById('tokenModalOverlay').classList.add('open');return;}
    await doGithubSave(getToken());
}
document.getElementById('tokenCancel').onclick=()=>document.getElementById('tokenModalOverlay').classList.remove('open');
document.getElementById('tokenSave').onclick=async()=>{
    const t=document.getElementById('tokenInput').value.trim();
    if(!t){showToast('กรุณากรอก Token',true);return;}
    setToken(t);document.getElementById('tokenModalOverlay').classList.remove('open');await doGithubSave(t);
};
document.getElementById('tokenModalOverlay').onclick=e=>{if(e.target===document.getElementById('tokenModalOverlay'))document.getElementById('tokenModalOverlay').classList.remove('open');};

async function githubFile(path,token){
    const r=await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`,{headers:{'Authorization':`token ${token}`,'Accept':'application/vnd.github.v3+json'}});
    if(r.status===404)return{sha:null};if(!r.ok)throw new Error(`GitHub ${r.status}`);const d=await r.json();return{sha:d.sha};
}
async function githubPut(path,content,sha,token,msg){
    const b={message:msg,content:btoa(unescape(encodeURIComponent(content)))};if(sha)b.sha=sha;
    const r=await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`,{method:'PUT',headers:{'Authorization':`token ${token}`,'Accept':'application/vnd.github.v3+json','Content-Type':'application/json'},body:JSON.stringify(b)});
    if(!r.ok){const e=await r.json();throw new Error(e.message||`GitHub ${r.status}`);}
}

async function doGithubSave(token){
    const btn=document.getElementById('btnGithubSave'); btn.style.color='#fbbc04';
    showToast('⏳ กำลังซิงค์...');
    try{
        await doSync(false);
        showToast('✅ Sync สำเร็จ',false,true);
        startAutoSync(); // Ensure auto-sync is running after first manual save
    }catch(err){
        if(err.message.includes('401')||err.message.includes('credentials')){localStorage.removeItem(GITHUB_TOKEN_KEY);sessionStorage.removeItem(GITHUB_TOKEN_KEY);showToast('🔑 Token ไม่ถูกต้อง',true);}
        else if(err.message.includes('404')){showToast('❌ ไม่พบ repo หรือไฟล์',true);}
        else if(err.message.includes('422')){showToast('❌ SHA ไม่ตรง ลอง Sync อีกครั้ง',true);}
        else showToast('❌ '+err.message,true);
    }finally{btn.style.color='';}
}

// ════════════════════════════════════════════
// CONFIRM DIALOG
// ════════════════════════════════════════════
let confirmCallback=null;
function showConfirm(icon,title,text,cb){
    document.getElementById('confirmIcon').textContent=icon;
    document.getElementById('confirmTitle').textContent=title;
    document.getElementById('confirmText').textContent=text;
    confirmCallback=cb;
    document.getElementById('confirmModalOverlay').classList.add('open');
}
document.getElementById('confirmCancel').onclick=()=>document.getElementById('confirmModalOverlay').classList.remove('open');
document.getElementById('confirmOk').onclick=()=>{
    document.getElementById('confirmModalOverlay').classList.remove('open');
    if(confirmCallback){confirmCallback();confirmCallback=null;}
};
document.getElementById('confirmModalOverlay').onclick=e=>{if(e.target===document.getElementById('confirmModalOverlay'))document.getElementById('confirmModalOverlay').classList.remove('open');};

// ════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════
let toastTimer;
function showToast(msg,isError=false,isSuccess=false){
    const t=document.getElementById('saveToast');
    t.textContent=msg;t.className='save-toast show'+(isError?' error':isSuccess?' success':'');
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),3000);
}

// ════════════════════════════════════════════
// BACKDROP & KEYBOARD
// ════════════════════════════════════════════
map.on('click',()=>{if(!addMode&&!measureMode)closePlaceCard();closeListPanel();});
window.showPlaceCard=showPlaceCard;
window.closeListPanel=closeListPanel;

// Keyboard shortcuts: Undo/Redo + ESC
document.addEventListener('keydown',(e)=>{
    if((e.ctrlKey||e.metaKey)&&!e.altKey){
        if(e.key==='z'&&!e.shiftKey){e.preventDefault();doUndo();return;}
        if((e.key==='z'&&e.shiftKey)||e.key==='y'){e.preventDefault();doRedo();return;}
    }
    if(e.key==='Escape'){
        closeInfo();
        closePlaceCard();
        closeListPanel();
        document.getElementById('shareModalOverlay').classList.remove('open');
        document.getElementById('tokenModalOverlay').classList.remove('open');
        document.getElementById('listFilterModalOverlay').classList.remove('open');
        document.getElementById('cityFilterModalOverlay').classList.remove('open');
        document.getElementById('editModalOverlay').classList.remove('open');
        document.getElementById('confirmModalOverlay').classList.remove('open');
    }
});

// Desktop: ปิด listPanel/placeCard เมื่อคลิกนอก (backdrop behavior)
document.addEventListener('click',(e)=>{
    const listPanel=document.getElementById('listPanel');
    const placeCard=document.getElementById('placeCard');
    const searchBar=document.getElementById('searchBar');
    const target=e.target;

    // ปิด listPanel เมื่อคลิกนอก
    if(listPanel.classList.contains('open') &&
       !listPanel.contains(target) &&
       !searchBar.contains(target) &&
       !target.closest('.chip')){
        closeListPanel();
    }

    // ปิด placeCard เมื่อคลิกนอก (ยกเว้นตอน add/measure mode)
    if(!addMode && !measureMode &&
       placeCard.classList.contains('open') &&
       !placeCard.contains(target) &&
       !target.closest('.leaflet-marker-icon') &&
       !target.closest('.search-result-item')){
        closePlaceCard();
    }
});

// ════════════════════════════════════════════
// MOBILE: LONG-PRESS TO ADD + SWIPE-CLOSE PLACE CARD
// ════════════════════════════════════════════
if (_mobile) {
    // Long-press on map → add location
    let _lpTimer=null, _lpStart=null;
    map.getContainer().addEventListener('touchstart', e=>{
        if (e.touches.length !== 1) return;
        _lpStart = {x: e.touches[0].clientX, y: e.touches[0].clientY};
        _lpTimer = setTimeout(()=>{
            if (!addMode && !measureMode) {
                const latlng = map.containerPointToLatLng([_lpStart.x, _lpStart.y]);
                if (navigator.vibrate) navigator.vibrate(30);
                openAddAt(latlng.lat, latlng.lng);
            }
        }, 600);
    }, {passive: true});
    map.getContainer().addEventListener('touchmove', e=>{
        if (_lpTimer && _lpStart) {
            const dx=e.touches[0].clientX-_lpStart.x, dy=e.touches[0].clientY-_lpStart.y;
            if (Math.sqrt(dx*dx+dy*dy)>10) { clearTimeout(_lpTimer); _lpTimer=null; }
        }
    }, {passive: true});
    map.getContainer().addEventListener('touchend', ()=>{ clearTimeout(_lpTimer); _lpTimer=null; }, {passive: true});

    // Swipe-down on place card → close
    const _pc = document.getElementById('placeCard');
    let _swipeStartY=0, _swiping=false;
    _pc.addEventListener('touchstart', e=>{
        if (e.touches.length!==1) return;
        _swipeStartY=e.touches[0].clientY; _swiping=true;
    }, {passive: true});
    _pc.addEventListener('touchmove', e=>{
        if (!_swiping) return;
        const dy=e.touches[0].clientY-_swipeStartY;
        if (dy>60) { closePlaceCard(); _swiping=false; if(navigator.vibrate)navigator.vibrate(15); }
    }, {passive: true});
    _pc.addEventListener('touchend', ()=>{ _swiping=false; }, {passive: true});
}

// ════════════════════════════════════════════
// SHARE / PERMALINK
// ════════════════════════════════════════════
window.shareLocation=function(lat,lng,name){
    const url=location.origin+location.pathname+'#'+lat.toFixed(6)+','+lng.toFixed(6)+',17';
    if(navigator.share){
        navigator.share({title:name||'BT Location',text:name+' ('+lat.toFixed(5)+', '+lng.toFixed(5)+')',url:url}).catch(()=>{});
    } else {
        navigator.clipboard.writeText(url).then(()=>showToast('📋 คัดลอกลิงก์แล้ว')).catch(()=>{
            prompt('คัดลอกลิงก์:',url);
        });
    }
};

// ════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════
rebuildIndexMap();

// Handle permalink hash: #lat,lng,zoom
(function(){
    const h=location.hash.replace('#','');
    if(!h)return;
    const parts=h.split(',').map(Number);
    if(parts.length>=2&&!isNaN(parts[0])&&!isNaN(parts[1])){
        const lat=parts[0],lng=parts[1],zoom=parts[2]||17;
        setTimeout(()=>{
            map.setView([lat,lng],zoom);
            // Find nearest location within 50m and open its card
            let nearest=null,minD=50;
            locations.forEach((l,i)=>{
                const d=haversine(lat,lng,l.lat,l.lng);
                if(d<minD){minD=d;nearest={loc:l,idx:i};}
            });
            if(nearest) showPlaceCard(nearest.loc,nearest.idx);
        },500);
    }
})();

update();

const style=document.createElement('style');
style.textContent=`.bt-tooltip{background:rgba(32,33,36,0.82)!important;color:#fff!important;border:none!important;border-radius:6px!important;padding:3px 8px!important;font-size:11px!important;font-weight:600!important;box-shadow:0 1px 4px rgba(0,0,0,.3)!important;white-space:nowrap!important;font-family:inherit!important;}`;
document.head.appendChild(style);

// ════════════════════════════════════════════
// MULTI-USER SYNC (GitHub-based polling + merge)
// ════════════════════════════════════════════
function _locKey(l){return l.lat.toFixed(6)+','+l.lng.toFixed(6);}

function mergeLocs(local, remote, base){
    // 3-way merge with DETERMINISTIC conflict resolution via updatedAt
    // Strategy: "latest wins" — item with newer updatedAt wins conflicts
    try {
        const bMap=new Map(), lMap=new Map(), rMap=new Map();
        (base||[]).forEach(l=>bMap.set(_locKey(l),l));
        local.forEach(l=>lMap.set(_locKey(l),l));
        remote.forEach(l=>rMap.set(_locKey(l),l));
        const allKeys=new Set([...lMap.keys(),...rMap.keys()]);
        const merged=[];
        let conflicts=0, added=0, removed=0;
        const conflictDetails=[];
        allKeys.forEach(key=>{
            const inBase=bMap.has(key), inLocal=lMap.has(key), inRemote=rMap.has(key);
            if(inLocal&&inRemote){
                const ll=lMap.get(key), rl=rMap.get(key);
                if(inBase){
                    const bl=bMap.get(key);
                    const lStrip=JSON.stringify({...ll,photo:undefined});
                    const rStrip=JSON.stringify({...rl,photo:undefined});
                    const bStrip=JSON.stringify({...bl,photo:undefined});
                    const localChanged=lStrip!==bStrip;
                    const remoteChanged=rStrip!==bStrip;
                    if(localChanged&&remoteChanged){
                        // TRUE CONFLICT → latest wins (deterministic)
                        conflicts++;
                        const lTime=ll.updatedAt||0, rTime=rl.updatedAt||0;
                        const winner=lTime>=rTime?'local':'remote';
                        const chosen=winner==='local'?ll:{...rl,photo:ll.photo||undefined};
                        conflictDetails.push({key,name:ll.name||rl.name,local:ll,remote:rl,base:bl,winner,lTime,rTime});
                        console.warn(`CONFLICT at ${key} "${ll.name||rl.name}" → ${winner} wins (local:${new Date(lTime).toISOString()} remote:${new Date(rTime).toISOString()})`);
                        merged.push(chosen);
                    } else if(localChanged){
                        merged.push(ll);
                    } else {
                        merged.push({...rl,photo:ll.photo||undefined});
                    }
                } else {
                    // Both added same coords — latest wins
                    const lTime=ll.updatedAt||0, rTime=rl.updatedAt||0;
                    merged.push(lTime>=rTime?ll:{...rl,photo:ll.photo||undefined});
                }
            } else if(inLocal&&!inRemote){
                if(inBase){
                    console.warn('Remote deleted:', key, lMap.get(key).name);
                    removed++;
                } else {
                    merged.push(lMap.get(key)); added++;
                }
            } else if(!inLocal&&inRemote){
                if(inBase){
                    console.warn('Local deleted:', key, rMap.get(key).name);
                    removed++;
                } else {
                    merged.push(rMap.get(key)); added++;
                }
            }
        });
        if(conflictDetails.length) console.warn('MERGE SUMMARY:', conflicts, 'conflicts', conflictDetails);
        return {merged, conflicts, added, removed, conflictDetails};
    } catch(mergeErr) {
        // SAFE MODE: merge crashed → fallback to backup
        console.error('MERGE FAILED:', mergeErr);
        try {
            const backup=JSON.parse(localStorage.getItem(BACKUP_KEY)||'null');
            if(backup&&backup.length){
                showToast('⚠️ Merge ล้มเหลว — กู้คืนจาก backup',true);
                return {merged:backup, conflicts:0, added:0, removed:0, conflictDetails:[], recovered:true};
            }
        } catch(e){}
        // Last resort: return local as-is
        showToast('⚠️ Merge ล้มเหลว — ใช้ข้อมูล local',true);
        return {merged:local, conflicts:0, added:0, removed:0, conflictDetails:[], recovered:true};
    }
}

function setSyncIndicator(state){
    const btn=document.getElementById('btnGithubSave');
    if(!btn)return;
    btn.classList.remove('sync-ok','sync-pending','sync-error','sync-active');
    if(state)btn.classList.add('sync-'+state);
}

async function doSync(silent=true){
    if(_syncing)return;
    const token=getToken();
    if(!token){if(!silent)showToast('กรุณาใส่ Token ก่อน',true);return;}
    _syncing=true;
    _setSyncStatus('syncing');
    try{
        const res=await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/all_locations.json`,{
            headers:{'Authorization':`token ${token}`,'Accept':'application/vnd.github.v3+json','Cache-Control':'no-cache'},
            cache:'no-store'
        });
        if(!res.ok){if(!silent)showToast('Sync ล้มเหลว: '+res.status,true);_setSyncStatus('error');return;}
        const data=await res.json();
        const remoteSha=data.sha;
        const remoteContent=JSON.parse(decodeURIComponent(escape(atob(data.content.replace(/\n/g,'')))));

        // Use PROPER base snapshot (set at load time)
        const base=_getBaseSnapshot();
        const baseSha=_getBaseSha();
        const localStripped=locations.map(l=>{const{photo,...rest}=l;return rest;});

        if(remoteSha===baseSha||remoteSha===localStorage.getItem(SYNC_SHA_KEY)){
            // Remote unchanged since our base
            const localJson=JSON.stringify(localStripped);
            const baseJson=base?JSON.stringify(base):null;
            if(localJson!==baseJson&&baseJson){
                await _pushToGithub(token, localStripped, remoteSha);
                _saveBaseSnapshot(localStripped, null);
                _clearDirty();
                if(!silent)showToast('⬆️ Pushed local changes',false,true);
            } else {
                if(!silent)showToast('✅ ข้อมูลตรงกัน',false,true);
            }
            _setSyncStatus('ok');
        } else {
            // Remote changed since our base
            const localJson=JSON.stringify(localStripped);
            const baseJson=base?JSON.stringify(base):null;
            if(localJson===baseJson||!base){
                // No local changes — just pull
                _applyRemote(remoteContent, remoteSha);
                if(!silent)showToast(`⬇️ ดึง ${remoteContent.length} จุดจาก GitHub`,false,true);
                console.log('Sync: pulled',remoteContent.length,'locs');
            } else {
                // BOTH changed — 3-way merge with REAL base
                console.warn('3-WAY MERGE needed: base has', (base||[]).length, 'local has', localStripped.length, 'remote has', remoteContent.length);
                const result=mergeLocs(localStripped, remoteContent, base);
                const photoMap=new Map();
                locations.forEach(l=>{if(l.photo)photoMap.set(_locKey(l),l.photo);});
                result.merged.forEach(l=>{
                    const p=photoMap.get(_locKey(l));
                    if(p)l.photo=p;
                });
                locations=result.merged;
                _writeCache();invalidateCache();update();
                const mergedStripped=locations.map(l=>{const{photo,...rest}=l;return rest;});
                await _pushToGithub(token, mergedStripped, remoteSha);
                _saveBaseSnapshot(mergedStripped, null);
                _clearDirty();
                const msg=`🔀 Merge: +${result.added} -${result.removed}${result.conflicts?' ⚠️'+result.conflicts+' conflicts':''}`;
                if(!silent)showToast(msg,result.conflicts>0);
                console.log('Sync: merged',msg);
            }
            _setSyncStatus('ok');
        }
        _lastSyncTime=Date.now();
    }catch(err){
        console.warn('Sync error:',err);
        _setSyncStatus('error');
        if(!silent)showToast('❌ Sync: '+err.message,true);
    }finally{_syncing=false;}
}

function _applyRemote(remote, sha){
    const photoMap=new Map();
    locations.forEach(l=>{if(l.photo)photoMap.set(_locKey(l),l.photo);});
    locations=remote.map(l=>{
        const p=photoMap.get(_locKey(l));
        const n=normalizeLocation(l);
        return p?{...n,photo:p}:n;
    });
    _writeCache();invalidateCache();update();
    // Save as new base snapshot
    _saveBaseSnapshot(remote, sha);
    localStorage.setItem(SYNC_SHA_KEY,sha);
    localStorage.setItem(SYNC_SNAPSHOT_KEY,JSON.stringify(remote));
    _clearDirty();
    _setSyncStatus('ok');
}

async function _pushToGithub(token, locs, currentSha){
    const json=JSON.stringify(locs,null,2);
    const locJs='const DEFAULT_LOCATIONS='+JSON.stringify(locs)+';\n';
    // Push all 3 files
    await githubPut('all_locations.json',json,currentSha,token,'Sync from web');
    const f2=await githubFile('docs/all_locations.json',token);
    await githubPut('docs/all_locations.json',json,f2.sha,token,'Sync docs');
    const f3=await githubFile('docs/locations.js',token);
    await githubPut('docs/locations.js',locJs,f3.sha,token,'Sync locations.js');
    // Update local snapshot
    const f1=await githubFile('all_locations.json',token);
    localStorage.setItem(SYNC_SHA_KEY,f1.sha);
    localStorage.setItem(SYNC_SNAPSHOT_KEY,JSON.stringify(locs));
}

function startAutoSync(){
    if(_syncTimer)clearInterval(_syncTimer);
    _syncTimer=setInterval(()=>{
        if(getToken()&&document.visibilityState==='visible')doSync(true);
    },SYNC_INTERVAL);
    // Also sync on visibility change
    document.addEventListener('visibilitychange',()=>{
        if(document.visibilityState==='visible'&&getToken()&&Date.now()-_lastSyncTime>10000)doSync(true);
    });
}

// Initial load: GitHub = SINGLE source of truth
// Base snapshot = the version we loaded → used for 3-way merge later
(async()=>{
    const token = getToken();
    let ghData = null, ghSha = null;

    // Crash recovery: check for backup if main cache is corrupted
    if (!locations.length) {
        try {
            const backup = JSON.parse(localStorage.getItem(BACKUP_KEY) || 'null');
            if (backup && backup.length) {
                locations = backup.map(normalizeLocation);
                console.warn('Crash recovery: restored', locations.length, 'locs from backup');
            }
        } catch (e) {}
    }

    // 1. Fetch from GitHub (source of truth)
    try {
        if (token) {
            const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/all_locations.json`, {
                headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json', 'Cache-Control': 'no-cache' },
                cache: 'no-store'
            });
            if (res.ok) {
                const d = await res.json();
                ghData = JSON.parse(decodeURIComponent(escape(atob(d.content.replace(/\n/g, '')))));
                ghSha = d.sha;
            }
        }
        if (!ghData) {
            const res = await fetch(`https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/all_locations.json?t=${Date.now()}`, { cache: 'no-store' });
            if (res.ok) ghData = await res.json();
        }
    } catch (e) { console.warn('GitHub fetch failed:', e.message); }

    // 2. Resolve: dirty detection + conflict resolution
    if (ghData && ghData.length > 0) {
        if (_isDirty()) {
            const base = _getBaseSnapshot(); // REAL base from last load
            const localStripped = locations.map(l => { const { photo, ...rest } = l; return rest; });
            const ghJson = JSON.stringify(ghData);
            const baseJson = base ? JSON.stringify(base) : null;

            if (baseJson && ghJson !== baseJson) {
                // CONFLICT: both local AND GitHub changed
                console.warn('CONFLICT: local dirty + GitHub changed since base');
                console.warn('Base:', (base||[]).length, 'Local:', localStripped.length, 'Remote:', ghData.length);
                const result = mergeLocs(localStripped, ghData, base);
                const photoMap = new Map();
                locations.forEach(l => { if (l.photo) photoMap.set(_locKey(l), l.photo); });
                locations = result.merged.map(l => {
                    const n = normalizeLocation(l);
                    const p = photoMap.get(_locKey(n));
                    return p ? { ...n, photo: p } : n;
                });
                _writeCache();
                invalidateCache(); update();
                if (token && ghSha) {
                    try {
                        const mergedStripped = locations.map(l => { const { photo, ...rest } = l; return rest; });
                        await _pushToGithub(token, mergedStripped, ghSha);
                        _saveBaseSnapshot(mergedStripped, null);
                        _clearDirty();
                        _setSyncStatus('ok');
                        const msg = `🔀 Merge: +${result.added} -${result.removed}${result.conflicts ? ' ⚠️' + result.conflicts + ' conflicts' : ''}`;
                        showToast(msg, result.conflicts > 0);
                    } catch (e) { console.warn('Merge push failed:', e); _setSyncStatus('error'); }
                }
            } else {
                // GitHub unchanged — local wins, push it
                console.log('Dirty: local changes, GitHub unchanged → pushing');
                if (token) _debouncedPush();
            }
        } else {
            // Not dirty — GitHub wins (normal load)
            const photoMap = new Map();
            locations.forEach(l => { if (l.photo) photoMap.set(_locKey(l), l.photo); });
            locations = ghData.map(l => {
                const n = normalizeLocation(l);
                const p = photoMap.get(_locKey(n));
                return p ? { ...n, photo: p } : n;
            });
            _writeCache();
            if (ghSha) {
                localStorage.setItem(SYNC_SHA_KEY, ghSha);
                localStorage.setItem(SYNC_SNAPSHOT_KEY, JSON.stringify(ghData));
            }
            _clearDirty();
            invalidateCache(); update();
            console.log('Loaded from GitHub:', locations.length, 'locs');
        }
        // ★ SAVE BASE SNAPSHOT — the "common ancestor" for future merges
        const stripped = locations.map(l => { const { photo, ...rest } = l; return rest; });
        _saveBaseSnapshot(stripped, ghSha);
    } else {
        // GitHub unavailable — use cache
        console.log('GitHub unavailable, using cache:', locations.length, 'locs');
        if (_isDirty()) {
            showToast('⚠️ มีข้อมูลที่ยังไม่ได้ sync', true);
            _setSyncStatus('dirty');
        }
    }

    // Background retry: if still dirty, retry push every 5s
    setInterval(() => {
        if (_isDirty() && getToken() && !_pushInFlight && document.visibilityState === 'visible') {
            console.log('Background retry: pushing dirty changes...');
            _debouncedPush();
        }
    }, 5000);

    if (token) startAutoSync();
})();

// ════════════════════════════════════════════
// DEBUG MODE
// ════════════════════════════════════════════
window.btDebug = {
    get locations() { return locations; },
    get filtered() { return getFiltered(); },
    get syncSha() { return localStorage.getItem(SYNC_SHA_KEY); },
    get token() { return getToken() ? '✅ set' : '❌ none'; },
    get stats() {
        const lc={};locations.forEach(l=>{lc[l.list]=(lc[l.list]||0)+1;});
        return {total:locations.length,lists:lc,mobile:_mobile,syncing:_syncing,dirty:_isDirty(),lastSync:new Date(_lastSyncTime).toLocaleString(),undoStack:undoStack.length,redoStack:redoStack.length};
    },
    forceSync: ()=>doSync(false),
    clearCache: ()=>{invalidateCache();update();showToast('Cache cleared');},
    exportDebug: ()=>JSON.stringify({locations:locations.length,lists:Object.keys(locations.reduce((a,l)=>(a[l.list]=1,a),{})),sha:localStorage.getItem(SYNC_SHA_KEY),ua:navigator.userAgent,screen:`${screen.width}x${screen.height}`,dpr:devicePixelRatio},null,2),
};
console.log('%c🗺️ BT Locations Debug','font-size:14px;font-weight:bold;','→ window.btDebug');

// PWA: register service worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
        console.log('SW registered:', reg.scope);
    }).catch(err => console.warn('SW failed:', err));
}
