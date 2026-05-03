// ════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════
const APP_VERSION = 'v6.6.20';

// Hoisted early — used by renderMarkers before route section loads
let routeLine = null, routeMode = false;
let multiRouteLayer = null, multiRouteMode = false;
const STORAGE_KEY = 'bt_locations_data';

// Helper: safely attach onclick handler (avoids null errors)
function onClick(id, handler) {
    const el = document.getElementById(id);
    if (el) el.onclick = handler;
}

// ════════════════════════════════════════════
// DATA FORMAT UTILS (used early by import)
// ════════════════════════════════════════════
function tryParseDataFormat(json){
    if(Array.isArray(json) && json.length > 0 && (json[0].lat !== undefined || json[0].latitude !== undefined)){
        return json.map((p, i) => ({
            id: p.id || i,
            name: p.name || p.title || 'จุดที่ ' + (i+1),
            lat: parseFloat(p.lat || p.latitude || p.y || 0),
            lng: parseFloat(p.lng || p.lon || p.longitude || p.x || 0),
            list: p.list || p.group || p.category || 'ทั้งหมด',
            district: p.district || p.area || p.zone || '',
            city: p.city || p.province || p.district || '',
            note: p.note || p.desc || '',
            tags: p.tags || [],
            photo: p.photo || '',
            added_by: p.added_by || p.addedBy || '',
            date: p.date || p.created_at || new Date().toLocaleDateString('th-TH'),
            updated_at: p.updated_at || ''
        })).filter(p => p.lat && p.lng);
    }
    if(json.lists && Array.isArray(json.lists)){
        const data = [];
        json.lists.forEach(l => {
            (l.points || l.locations || l.items || []).forEach((p, i) => {
                data.push({
                    id: p.id || data.length,
                    name: p.name || 'จุดที่ ' + (i+1),
                    lat: parseFloat(p.lat || p.latitude || 0),
                    lng: parseFloat(p.lng || p.longitude || 0),
                    list: l.name || l.id || 'รายการ',
                    district: p.district || '',
                    city: p.city || '',
                    note: p.note || '',
                    tags: p.tags || [],
                    photo: p.photo || '',
                    date: p.date || ''
                });
            });
        });
        return data.filter(p => p.lat && p.lng);
    }
    if(json.points || json.locations || json.data){
        return tryParseDataFormat(json.points || json.locations || json.data);
    }
    return null;
}
const CHANGELOG_KEY = 'bt_changelog';
const GITHUB_TOKEN_KEY = 'bt_github_token';
const WORKER_URL_KEY = 'bt_worker_url';
const API_KEY_KEY = 'bt_api_key';
const SYNC_SHA_KEY = 'bt_sync_sha';
const SYNC_SNAPSHOT_KEY = 'bt_sync_snapshot';
const FAVORITES_KEY = 'bt_favorites';
const TRACKING_KEY = 'bt_tracked_paths';
const TAG_COLOR_KEY = 'bt_tag_colors';
const REPO_OWNER = 'valrinx', REPO_NAME = 'bt-locations';
// ── Tag Color System ──
let tagColors = (() => { try { return JSON.parse(localStorage.getItem(TAG_COLOR_KEY)||'{}'); } catch { return {}; } })();
function saveTagColors(){ localStorage.setItem(TAG_COLOR_KEY, JSON.stringify(tagColors)); }
function getTagColor(tag){ return tagColors[tag]||null; }
// Get first tag color for a location (used for marker override)
function getLocTagColor(loc){ if(!loc.tags||!loc.tags.length)return null; for(const t of loc.tags){const c=getTagColor(t);if(c)return c;} return null; }
// Sanitize DMS coordinate names
function _cleanDMSName(n){return(n&&/\d+[°ºᵒ˚]/.test(n))?'':n;}
// ── Supabase ──
const _SB_URL = 'https://uemvtttfedpvofqhnwoo.supabase.co';
const _SB_KEY = 'sb_publishable_2MH9_WZUfdAiBqtDwSFuOg_QeiWkPyh';
const _sb = supabase.createClient(_SB_URL, _SB_KEY);
// Worker URL: kept for fallback compat
const DEFAULT_WORKER_URL = 'https://bt-locations.teenson4.workers.dev';
function getWorkerUrl(){return localStorage.getItem(WORKER_URL_KEY)||DEFAULT_WORKER_URL;}
function getApiKey(){return localStorage.getItem(API_KEY_KEY)||'';}
function useWorker(){return !!getWorkerUrl();}
const undoStack = [], redoStack = [], MAX_UNDO = 20;
let favorites = new Set((() => { try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'); } catch { return []; } })());
function saveFavorites() { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites])); }
// Avatar init
(function _initAvatar(){ const un=localStorage.getItem('bt_username')||''; const el=document.getElementById('searchAvatar'); if(el)el.textContent=(un[0]||'B').toUpperCase(); })();

// ════════════════════════════════════════════
// CONCEPT UI FUNCTIONS
// ════════════════════════════════════════════
let currentView = 'map';
function switchView(view){
    if(currentView === view && view !== 'map') {
        // Toggle back to map
        view = 'map';
    }
    currentView = view;
    document.querySelectorAll('.vt').forEach(v=>v.classList.remove('on'));
    const vtEl = document.getElementById('vt-'+view);
    if(vtEl) vtEl.classList.add('on');
    
    document.querySelectorAll('.map-view, .list-view, .stats-view').forEach(el=>el.classList.remove('show'));
    const viewEl = document.getElementById('view-'+view);
    if(viewEl) viewEl.classList.add('show');
    
    if(view==='stats') renderStatsView();
    if(view==='list') renderListView();
    if(view==='heat') { heatmapMode=true; update(); } else if(view!=='map') { heatmapMode=false; update(); }
}

// View tab click handlers
document.querySelectorAll('.vt').forEach(v=>{
    v.onclick = () => switchView(v.dataset.view);
});

// Bottom toolbar handlers
onClick('btMap', () => switchView('map'));
onClick('btRoute', () => { routeMode ? clearRoute() : doRoute(); });
onClick('btHeat', () => switchView(heatmapMode ? 'map' : 'heat'));
onClick('btAdd', () => openAddMode());

// ════════════════════════════════════════════
// MOBILE UI FUNCTIONS
// ════════════════════════════════════════════

// Mobile view switcher (for bottom nav)
function mobSwitchView(view){
    const wasView = currentView;
    switchView(view);
    // Update mobile nav active state
    document.querySelectorAll('.mob-nb').forEach(nb => nb.classList.remove('on'));
    document.getElementById('mn-'+currentView)?.classList.add('on');
    // Close bottom sheet if open
    closeMobSheet();
}

// Mobile drawer toggle
function toggleMobDrawer(){
    const drawer = document.getElementById('mobDrawer');
    if(!drawer) return;
    if(drawer.classList.contains('show')){
        closeMobDrawer();
    } else {
        openMobDrawer();
    }
}

// Mobile drawer
function openMobDrawer(){
    const drawer = document.getElementById('mobDrawer');
    if(drawer) drawer.classList.add('show');
    _renderMobDrawer();
}
function closeMobDrawer(){
    const drawer = document.getElementById('mobDrawer');
    if(drawer) drawer.classList.remove('show');
}

// Render mobile drawer content
function _renderMobDrawer(){
    const listContainer = document.getElementById('mobDrawerLists');
    const cityContainer = document.getElementById('mobDrawerCities');
    if(!listContainer || !cityContainer) return;
    
    // Lists
    const lc={}; locations.forEach(l=>{lc[l.list]=(lc[l.list]||0)+1;});
    const lists = Object.entries(lc).sort((a,b)=>b[1]-a[1]);
    let listHtml = `<div class="fi ${!filterList?'on':''}" onclick="setFilterList('');closeMobDrawer()"><div class="fdot" style="background:#5b8fff"></div><span class="fn">ทั้งหมด</span><span class="fc">${locations.length}</span></div>`;
    lists.forEach(([name,count],i)=>{
        const col=colorPalette[i % colorPalette.length];
        listHtml += `<div class="fi ${filterList===name?'on':''}" onclick="setFilterList('${name.replace(/'/g,"\\'")}');closeMobDrawer()"><div class="fdot" style="background:${col}"></div><span class="fn">${name}</span><span class="fc">${count}</span></div>`;
    });
    listContainer.innerHTML = listHtml;
    
    // Cities
    const cc={}; locations.forEach(l=>{if(l.city)cc[l.city]=(cc[l.city]||0)+1;});
    const cities = Object.entries(cc).sort((a,b)=>b[1]-a[1]);
    let cityHtml = '';
    cities.forEach(([name,count],i)=>{
        const col=colorPalette[i % colorPalette.length];
        cityHtml += `<div class="ci ${filterCity===name?'on':''}" onclick="setFilterCity('${name.replace(/'/g,"\\'")}');closeMobDrawer()"><div class="cpip" style="background:${col}"></div><span class="cn">${name}</span><span class="cc">${count}</span></div>`;
    });
    cityContainer.innerHTML = cityHtml;
}

function _renderSidebar(){
    const listContainer = document.getElementById('listContainer');
    const cityContainer = document.getElementById('cityContainer');
    if(!listContainer || !cityContainer) { _renderMobDrawer(); return; }
    
    const lists = [...new Set(locations.map(l=>l.list))].filter(Boolean).sort();
    const cities = [...new Set(locations.map(l=>l.city))].filter(Boolean).sort();
    
    listContainer.innerHTML = lists.map(name =>
        `<div class="flist-item${filterList===name?' active':''}" onclick="setFilterList('${name.replace(/'/g,"\\'")}')">
            <span class="fl-dot" style="background:${getColor(name)}"></span>
            <span class="fl-name">${name}</span>
            <span class="fl-count">${locations.filter(l=>l.list===name).length}</span>
        </div>`
    ).join('');
    
    cityContainer.innerHTML = cities.map(name =>
        `<div class="clist-item${filterCity===name?' active':''}" onclick="setFilterCity('${name.replace(/'/g,"\\'")}')">
            <span class="fl-name">${name}</span>
            <span class="fl-count">${locations.filter(l=>l.city===name).length}</span>
        </div>`
    ).join('');
    
    _renderMobDrawer();
}
// Filter setters for mobile
function setFilterList(name){
    filterList = name;
    filterCity = '';
    _lastFilteredKey = null;
    update();
    _renderSidebar();
    _updateMobChips();
}
function setFilterCity(name){
    filterCity = name;
    filterList = '';
    _lastFilteredKey = null;
    update();
    _renderSidebar();
    _updateMobChips();
    // Zoom to city
    const cityLocs = locations.filter(l=>l.city===filterCity);
    if(cityLocs.length && map){
        const group = L.featureGroup(cityLocs.map(l=>L.marker([l.lat,l.lng])));
        map.fitBounds(group.getBounds().pad(0.15), {animate:false, maxZoom:16});
    }
}

// Mobile chips update
function _updateMobChips(){
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
    if(!filterList && !filterCity && !filterFavorites){
        document.getElementById('chipAll')?.classList.add('on');
    } else if(filterFavorites){
        document.getElementById('chipFav')?.classList.add('on');
    } else if(filterList){
        document.getElementById('chipList')?.classList.add('on');
    } else if(filterCity){
        document.getElementById('chipCity')?.classList.add('on');
    }
}

// Chip click handlers
document.querySelectorAll('.chip').forEach(chip=>{
    chip.onclick = () => {
        const filter = chip.dataset.filter;
        document.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
        chip.classList.add('on');
        if(filter === 'all'){
            filterList = ''; filterCity = ''; filterFavorites = false;
        } else if(filter === 'fav'){
            filterFavorites = true; filterList = ''; filterCity = '';
        } else if(filter === 'list'){
            const drop = document.getElementById('listDropdown');
            if(drop) {
                const isOpen = drop.classList.contains('open');
                document.querySelectorAll('.chip-dropdown').forEach(d => d.classList.remove('open'));
                if(!isOpen) drop.classList.add('open');
            }
            return; // Don't call update() yet, wait for dropdown choice
        } else if(filter === 'city'){
            // Open drawer to select city
            openMobDrawer();
        }
        _lastFilteredKey = null;
        update();
        _renderSidebar();
    };
});

// Mobile search sync
document.getElementById('mobSearchInput')?.addEventListener('input', debounce((e)=>{
    const si = document.getElementById('search');
    if(si) si.value = e.target.value;
    update();
}, 150));

// Sync top search to mobile
document.getElementById('search')?.addEventListener('input', debounce((e)=>{
    const mi = document.getElementById('mobSearchInput'); // mobile not in Google UI
    if(mi) mi.value = e.target.value;
}, 150));

// Mobile bottom sheet
let mobSheetOpen = false;
function openMobSheet(title, items){
    const sheet = document.getElementById('mobSheet');
    const titleEl = document.getElementById('mobSheetTitle');
    const listEl = document.getElementById('mobSheetList');
    const chipList = document.getElementById('chipList');
    const chipCity = document.getElementById('chipCity');
    const filterMoreBtn = document.getElementById('filterMoreBtn'); // May not exist in Google UI
    if(!sheet) return;
    if(titleEl) titleEl.textContent = title || 'รายการ';
    if(listEl && items){
        listEl.innerHTML = items.map((item,i) => `
            <div class="ms-item" onclick="mobSheetItemClick(${i})">
                <div class="ms-dot" style="background:${item.color||'var(--bl)'}"></div>
                <div class="ms-info">
                    <div class="ms-name">${item.name}</div>
                    <div class="ms-meta">${item.meta || ''}</div>
                </div>
                <div class="ms-chevron">›</div>
            </div>
        `).join('');
    }
    sheet.classList.add('open');
    mobSheetOpen = true;
}
function closeMobSheet(){
    const sheet = document.getElementById('mobSheet');
    if(sheet) sheet.classList.remove('open');
    mobSheetOpen = false;
}
function toggleMobSheet(){
    if(mobSheetOpen) closeMobSheet();
}
function mobSheetItemClick(index){
    // Override this to handle item clicks
    console.log('Sheet item clicked:', index);
}

// Show location details in bottom sheet (mobile) or popup (desktop)
function showLocationDetails(loc, idx){
    const isMobile = window.innerWidth < 768;
    if(isMobile){
        // Mobile: show in bottom sheet
        const color = getLocTagColor(loc) || getColor(loc.list);
        openMobSheet(loc.name || loc.list, [{
            name: loc.name || loc.list,
            meta: `${loc.list} · ${loc.city || '-'} · ${loc.added_by || 'unknown'}`,
            color: color
        }]);
        // Store current location for actions
        window._sheetLoc = loc;
        window._sheetIdx = idx;
    } else {
        // Desktop: show map popup
        showPlaceCard(loc, idx);
    }
}

// Override cluster click to use bottom sheet on mobile
function handleClusterClick(childMarkers){
    const isMobile = window.innerWidth < 768;
    const clusterLocs = childMarkers.map(m => {
        const idx = m._locIdx;
        return (idx !== undefined && locations[idx]) ? locations[idx] : null;
    }).filter(Boolean);
    
    if(clusterLocs.length === 0) return;
    
    if(isMobile){
        // Mobile: show in bottom sheet
        const items = clusterLocs.map(loc => {
            const color = getLocTagColor(loc) || getColor(loc.list);
            return {
                name: loc.name || loc.list,
                meta: `${loc.list} · ${loc.city || '-'}`,
                color: color,
                loc: loc
            };
        });
        openMobSheet(`${clusterLocs.length} จุดในบริเวณนี้`, items);
        // Setup item click handlers
        window.mobSheetItemClick = function(i){
            const item = items[i];
            if(item && item.loc){
                map.flyTo([item.loc.lat, item.loc.lng], 16, {animate: true, duration: 0.5});
                // Show single location after fly
                setTimeout(() => showLocationDetails(item.loc, getLocIndex(item.loc)), 600);
            }
        };
    } else {
        // Desktop: show list panel
        const lp = document.getElementById('listPanel');
        if(lp) lp.classList.add('open');
        closePlaceCard();
        renderListPanel(clusterLocs);
    }
}

// Search box
document.getElementById('search')?.addEventListener('input', debounce(()=>{
    update();
}, 150));

// Add button
onClick('btnAddLocation', () => openAddMode());

// Export/Import buttons
onClick('btnUpload', () => doExport());
onClick('btnImportData', () => openImportModal());

// Import modal functions
window.openImportModal = function(){
    document.getElementById('importModalOverlay').classList.add('open');
    document.getElementById('importJsonText').value = '';
    document.getElementById('importUrl').value = '';
};
window.closeImportModal = function(){
    document.getElementById('importModalOverlay').classList.remove('open');
};
window.doImportData = async function(){
    const jsonText = document.getElementById('importJsonText').value.trim();
    const url = document.getElementById('importUrl').value.trim();
    
    let data = null;
    
    if(jsonText){
        // Parse pasted JSON
        try {
            const json = JSON.parse(jsonText);
            data = tryParseDataFormat(json);
        } catch(e) {
            showToast('❌ JSON ไม่ถูกต้อง: ' + e.message, true);
            return;
        }
    } else if(url){
        // Fetch from URL
        showToast('⏳ กำลังโหลดจาก URL...', false, true);
        try {
            const res = await fetchWithTimeout(url, 10000);
            if(!res.ok) throw new Error('HTTP ' + res.status);
            const json = await res.json();
            data = tryParseDataFormat(json);
        } catch(e) {
            showToast('❌ โหลดไม่สำเร็จ: ' + e.message, true);
            return;
        }
    } else {
        showToast('⚠️ กรุณาวาง JSON หรือใส่ URL', true);
        return;
    }
    
    if(data && data.length > 0){
        locations = data;
        invalidateMarkerCache();
        update();
        saveToStorage(); // Save to localStorage
        closeImportModal();
        showToast(`✅ นำเข้า ${data.length} จุดสำเร็จ`, false, true);
    } else {
        showToast('❌ ไม่พบข้อมูลที่ถูกต้อง', true);
    }
};

// Sidebar toggle with backdrop
function toggleSidebar(){
    const sb = document.getElementById('sidebar');
    const bd = document.getElementById('sidebarBackdrop');
    const isOpen = sb.classList.toggle('open');
    if(bd) bd.classList.toggle('show', isOpen);
}
window.closeSidebar = function(){
    const sb = document.getElementById('sidebar');
    const bd = document.getElementById('sidebarBackdrop');
    sb.classList.remove('open');
    if(bd) bd.classList.remove('show');
};
onClick('btnMenu', toggleSidebar);

function favKey(loc) { return `${loc.lat.toFixed(6)},${loc.lng.toFixed(6)}`; }
function toggleFavorite(loc) { const k = favKey(loc); if (favorites.has(k)) favorites.delete(k); else favorites.add(k); saveFavorites(); }
function isFavorite(loc) { return favorites.has(favKey(loc)); }
let filterFavorites = false;
const MAX_CHANGELOG = 200;
const SYNC_INTERVAL = 30000; // 30 seconds
let _syncTimer = null, _syncing = false, _lastSyncTime = 0;

// Tracking & paths (referenced in menu)
let trackingActive = false, _trackWatchId = null, _currentTrack = [];
let savedPaths = (() => { try { return JSON.parse(localStorage.getItem(TRACKING_KEY) || '[]'); } catch { return []; } })();
function startTracking() {
    if (!navigator.geolocation) { showToast('GPS ไม่รองรับ'); return; }
    trackingActive = true;
    _currentTrack = [];
    _trackWatchId = navigator.geolocation.watchPosition(pos => {
        _currentTrack.push({ lat: pos.coords.latitude, lng: pos.coords.longitude, t: Date.now() });
    }, err => console.warn('Track error:', err), { enableHighAccuracy: true, maximumAge: 5000 });
    showToast('▶ เริ่มบันทึกเส้นทาง');
}
function stopTracking() {
    if (_trackWatchId !== null) navigator.geolocation.clearWatch(_trackWatchId);
    _trackWatchId = null;
    trackingActive = false;
    if (_currentTrack.length > 1) {
        savedPaths.push({ points: _currentTrack, date: Date.now() });
        localStorage.setItem(TRACKING_KEY, JSON.stringify(savedPaths));
        showToast(`⏹ บันทึก ${_currentTrack.length} จุด`);
    } else {
        showToast('⏹ หยุดบันทึก (ไม่มีจุด)');
    }
    _currentTrack = [];
}
function showSavedPaths() {
    if (!savedPaths.length) { showToast('ไม่มีเส้นทางที่บันทึก'); return; }
    savedPaths.forEach((p, i) => {
        const latlngs = p.points.map(pt => [pt.lat, pt.lng]);
        L.polyline(latlngs, { color: '#4285f4', weight: 3, opacity: 0.7 }).addTo(map);
    });
    showToast(`แสดง ${savedPaths.length} เส้นทาง`);
}
function exportPaths() {
    if (!savedPaths.length) { showToast('ไม่มีเส้นทาง'); return; }
    const json = JSON.stringify(savedPaths, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `bt_paths_${new Date().toISOString().slice(0,10)}.json`; a.click();
    URL.revokeObjectURL(url);
    showToast('📤 Export เส้นทางแล้ว');
}

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

// Note: DEFAULT_LOCATIONS is declared in locations.js which loads before app.js
let locations = (() => {
    try { 
        const s = localStorage.getItem(STORAGE_KEY); 
        // Use DEFAULT_LOCATIONS from locations.js, or empty array if not available
        const defaultData = (typeof DEFAULT_LOCATIONS !== 'undefined') ? DEFAULT_LOCATIONS : [];
        const raw = s ? JSON.parse(s) : JSON.parse(JSON.stringify(defaultData)); 
        return raw.map(normalizeLocation); 
    }
    catch(e) { 
        console.error('Failed to load locations:', e);
        return []; // Return empty array as safe fallback
    }
})();
// Auto-clean DMS names from localStorage data on load
(function(){
    if(!Array.isArray(locations) || locations.length === 0) return;
    let dirty=false;
    locations.forEach(l=>{
        if(!l || !l.name) return;
        const c=_cleanDMSName(l.name);
        if(c!==l.name){l.name=c||'';dirty=true;}
    });
    if(dirty){localStorage.setItem(STORAGE_KEY,JSON.stringify(locations));}
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
    let topBadge = document.getElementById('topSyncBadge');
    let topDot = document.getElementById('topSyncDot');
    let topText = document.getElementById('topSyncText');

    if (badge) badge.style.display = 'none'; // Hide legacy badge

    const colors = { ok: '#10b981', syncing: '#f5a623', dirty: '#f5a623', error: '#ef4444', idle: '#10b981' };
    const labels = { ok: 'Live', syncing: 'Syncing', dirty: 'Wait', error: 'Error', idle: 'Live' };
    
    if (topBadge) {
        const color = colors[syncStatus] || '#10b981';
        topBadge.style.color = color;
        topBadge.style.borderColor = color + '33';
        topBadge.style.background = color + '1a';
        if (topDot) topDot.style.background = color;
        if (topText) topText.textContent = labels[syncStatus] || 'Live';
        
        // Update mini dot near logo
        const miniDot = document.getElementById('topSyncDotMini');
        if (miniDot) {
            miniDot.style.background = color;
            miniDot.style.boxShadow = `0 0 6px ${color}`;
            if (syncStatus === 'syncing') miniDot.classList.add('syncing');
            else miniDot.classList.remove('syncing');
        }
    }

    if (!badge) return;
    const icons = { idle: '', ok: '🟢', syncing: '🟡', dirty: '🟡', error: '🔴' };
    badge.textContent = icons[syncStatus] || '';
    const ago = _lastSyncTime ? Math.round((Date.now() - _lastSyncTime) / 1000) : 0;
    const agoText = _lastSyncTime ? (ago < 60 ? `${ago}s ago` : `${Math.round(ago / 60)}m ago`) : '';
    const titles = { idle: '', ok: `Synced ${agoText}`, syncing: 'กำลัง sync...', dirty: 'ยังไม่ sync', error: 'Sync ล้มเหลว' };
    badge.title = titles[syncStatus] || '';
    
    const btn = document.getElementById('btnGithubSave');
    if (btn) btn.title = `GitHub Sync ${icons[syncStatus] || ''} ${agoText}`.trim();
}
setInterval(_updateSyncBadge, 10000);

function _canSync(){return true;}
function _locRow(l){
    return {
        name: _cleanDMSName(l.name)||'',
        lat: l.lat, lng: l.lng,
        list: l.list||'', city: l.city||'',
        note: l.note||'',
        tags: Array.isArray(l.tags)?l.tags.join(','):(l.tags||''),
        photo: l.photo||'',
        added_by: localStorage.getItem('bt_username')||'',
        updated_at: new Date(l.updatedAt||Date.now()).toISOString(),
    };
}
// Supabase write-only helpers — do NOT touch local array or render.
// Realtime subscription is the ONLY place that updates locations[] and calls update().
async function sbInsert(loc){
    const {error}=await _sb.from('locations').insert(_locRow(loc));
    if(error){console.warn('sbInsert failed:',error.message);_setSyncStatus('error');}
    // Realtime INSERT event will add to locations[] and render
}
async function sbUpdate(loc){
    if(!loc.sb_id){await sbInsert(loc);return;}
    const {error}=await _sb.from('locations').update(_locRow(loc)).eq('id',loc.sb_id);
    if(error){console.warn('sbUpdate failed:',error.message);_setSyncStatus('error');}
    // Realtime UPDATE event will update locations[] and render
}
async function sbDelete(loc){
    if(!loc.sb_id)return;
    const {error}=await _sb.from('locations').delete().eq('id',loc.sb_id);
    if(error){console.warn('sbDelete failed:',error.message);_setSyncStatus('error');}
    // Realtime DELETE event will remove from locations[] and render
}
async function sbBulkUpdate(locs){
    for(const loc of locs){await sbUpdate(loc);}
}

let _sbLoaded = false;
const saveLocations = debounce(() => {
    if (!_validateBeforeSave()) return;
    _writeCache(); // localStorage only — Supabase push done via sbInsert/sbUpdate/sbDelete
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
            if (zoom >= 14) return 30;
            if (zoom >= 12) return 50;
            if (zoom >= 10) return 70;
            return 90;
        },
        disableClusteringAtZoom: 17,
        spiderfyOnMaxZoom: true,
        zoomToBoundsOnClick: true,
        animate: true,
        animateAddingMarkers: false,
        chunkedLoading: true,
        chunkInterval: 100,
        chunkDelay: 20,
        removeOutsideVisibleBounds: true,
        iconCreateFunction(cluster) {
            const count = cluster.getChildCount();
            // Proportional sizing: 30px for small clusters, up to 60px for large
            const size = Math.min(60, Math.max(30, 30 + Math.sqrt(count) * 3));
            const fontSize = Math.min(16, Math.max(11, 11 + count / 20));
            return L.divIcon({ 
                html: `<div style="width:${size}px;height:${size}px;font-size:${fontSize}px;"><span>${count}</span></div>`, 
                className: `marker-cluster ${getDensityClass(count)}`, 
                iconSize: L.point(size, size) 
            });
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
        const color = getLocTagColor(loc) || getColor(loc.list);
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
        marker.on('click', () => showLocationDetails(loc, idx));
        _markerCache.set(idx, marker);
    });
    _clusterDirty = false;
}

function _heatZoom(){ if(heatmapMode){_lastFilteredKey=null;update();} }

function renderMarkers(filtered) {
    // Hide normal markers in route mode to avoid overlap with route stops
    if (routeMode) { if (map.hasLayer(markerCluster)) map.removeLayer(markerCluster); return; }
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
        const z=map.getZoom();
        const hr=Math.max(8,Math.min(40, z<=10?10:z<=12?18:z<=14?28:40));
        const hb=Math.round(hr*0.6);
        heatLayer = L.heatLayer(filtered.map(l=>[l.lat,l.lng,1]),{radius:hr,blur:hb,gradient:{0.2:'#00f',0.5:'#0ff',0.7:'#0f0',0.85:'#ff0',1.0:'#f00'},minOpacity:0.4}).addTo(map);
        map.off('zoomend',_heatZoom).on('zoomend',_heatZoom);
        const _cp=document.getElementById('countPill');if(_cp)_cp.textContent = filtered.length + ' สถานที่';
        const _cp2=document.getElementById('countPill');if(_cp2)_cp2.classList.add('show');
        const _mst2=document.getElementById('mapStatTotal');if(_mst2)_mst2.textContent=filtered.length;
        const _msc2=document.getElementById('mapStatClusters');if(_msc2)_msc2.textContent=0;
        return;
    }

    // ── cluster mode: เอาแค่ filtered markers เข้า cluster ──
    // ถ้า filtered = ทั้งหมด ไม่ต้อง diff — addLayers ใหม่เลย
    map.removeLayer(markerCluster);
    markerCluster = createClusterGroup();

    const zoom = map.getZoom();
    const MAX_MARKERS = _mobile
        ? (zoom >= 15 ? 600 : zoom >= 13 ? 400 : 250)
        : (zoom >= 15 ? 2000 : zoom >= 13 ? 1200 : 600);
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
        const _cp=document.getElementById('countPill');if(_cp)_cp.textContent = filtered.length + ' สถานที่';
        const _cp2=document.getElementById('countPill');if(_cp2)_cp2.classList.add('show');

        // Update map stat counters
        const _mst=document.getElementById('mapStatTotal');if(_mst)_mst.textContent=filtered.length;
        const _msc=document.getElementById('mapStatClusters');if(_msc)_msc.textContent=markerCluster.getLayers().length;
        const _lvc=document.getElementById('lvCount');if(_lvc)_lvc.textContent='แสดง '+filtered.length+' จาก '+locations.length+' จุด';

        // Cluster click → show list of locations (bottom sheet on mobile, list panel on desktop)
        markerCluster.on('clusterclick', function(e) {
            const childMarkers = e.layer.getAllChildMarkers();
            handleClusterClick(childMarkers);
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
    // render list panel เฉพาะเมื่อเปิดอยู่ และไม่ได้อยู่ใน route mode
    const _lp=document.getElementById('listPanel');
    if (_lp && _lp.classList.contains('open') && !routeMode) {
        renderListPanel(filtered);
    } else if (!routeMode) {
        const _lpt=document.getElementById('listPanelTitle');
        if(_lpt) _lpt.textContent = filtered.length + ' สถานที่';
    }
    updateChipLabels();
    refreshDatalistSuggestions();
    _renderSidebar();
    _updateMobChips(); // Sync mobile chip state
}

// ════════════════════════════════════════════
// DATA LOADING - Fast init, background fetch
// ════════════════════════════════════════════
const REPO = 'valrinx/bt-locations';
const FETCH_TIMEOUT = 4000; // 4 seconds timeout per URL

function setLoader(txt){
    const el = document.getElementById('loaderTxt');
    if(el) el.textContent = txt;
}

// Fetch with timeout to avoid hanging
async function fetchWithTimeout(url, timeout = FETCH_TIMEOUT){
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        return res;
    } catch(e) {
        clearTimeout(timer);
        throw e;
    }
}

async function initApp(){
    try {
        console.log('[BT] initApp started');
        
        // 1. Data already loaded from localStorage at module init (line ~720)
        // If no localStorage data, locations will be empty and we use sample data
        setLoader('กำลังเริ่มต้น...');
        if(locations.length === 0) {
            console.log('[BT] No locations, loading sample data');
            loadSampleData();
            saveToStorage(); // Save sample data to localStorage for next time
        }
        
        // 2. Render initial markers (map already initialized at line ~875)
        console.log('[BT] Calling update()...');
        update();
        
        // 3. Show app immediately
        setLoader('พร้อมใช้งาน');
        setTimeout(() => {
            document.getElementById('loader').classList.add('done');
            document.getElementById('app').style.display = 'flex';
            console.log('[BT] Loader hidden');
            setTimeout(()=>{map.invalidateSize();update();},100);
        }, 200);
        
        // 4. Set avatar (if exists in UI)
        const un = localStorage.getItem('bt_username') || '';
        const a1 = document.getElementById('av1');
        if(a1) a1.textContent = (un[0] || 'V').toUpperCase();
        
        _initMapEvents(); // Add this line
        console.log('[BT] initApp completed');
        // 5. No automatic fetch - user controls data via Import button
    } catch(e) {
        console.error('[BT] initApp error:', e);
        document.getElementById('loaderTxt').textContent = 'เกิดข้อผิดพลาด: ' + e.message;
    }
}

async function fetchRepoDataWithTimeout(){
    const attempts = [
        `https://raw.githubusercontent.com/${REPO}/main/data.json`,
        `https://raw.githubusercontent.com/${REPO}/main/locations.json`,
        `https://raw.githubusercontent.com/${REPO}/main/docs/data.json`,
        `https://raw.githubusercontent.com/${REPO}/master/data.json`,
    ];
    
    for(const url of attempts){
        try {
            const res = await fetchWithTimeout(url, FETCH_TIMEOUT);
            if(!res.ok) continue;
            const json = await res.json();
            const parsed = tryParseDataFormat(json);
            if(parsed && parsed.length > 0) return parsed;
        } catch(e){ continue; }
    }
    
    // Try GitHub API as last resort
    try {
        const apiRes = await fetchWithTimeout(`https://api.github.com/repos/${REPO}/git/trees/main?recursive=1`, FETCH_TIMEOUT);
        if(apiRes.ok){
            const tree = await apiRes.json();
            const jsonFiles = (tree.tree || []).filter(f => f.path.endsWith('.json') && f.type === 'blob');
            for(const f of jsonFiles.slice(0, 3)){
                try {
                    const r = await fetchWithTimeout(`https://raw.githubusercontent.com/${REPO}/main/${f.path}`, FETCH_TIMEOUT);
                    if(!r.ok) continue;
                    const j = await r.json();
                    const parsed = tryParseDataFormat(j);
                    if(parsed && parsed.length > 0) return parsed;
                } catch(e){ continue; }
            }
        }
    } catch(e){ /* ignore */ }
    
    return null;
}

function parseDataFormat(json){
    // Format 1: array of points [{name,lat,lng,list}]
    if(Array.isArray(json) && json.length > 0 && (json[0].lat !== undefined || json[0].latitude !== undefined)){
        locations = json.map((p, i) => ({
            id: p.id || i,
            name: p.name || p.title || 'จุดที่ ' + (i+1),
            lat: parseFloat(p.lat || p.latitude || p.y || 0),
            lng: parseFloat(p.lng || p.lon || p.longitude || p.x || 0),
            list: p.list || p.group || p.category || 'ทั้งหมด',
            district: p.district || p.area || p.zone || '',
            city: p.city || p.province || p.district || '',
            note: p.note || p.desc || '',
            tags: p.tags || [],
            photo: p.photo || '',
            added_by: p.added_by || p.addedBy || '',
            date: p.date || p.created_at || new Date().toLocaleDateString('th-TH'),
            updated_at: p.updated_at || ''
        })).filter(p => p.lat && p.lng);
        invalidateMarkerCache();
        return locations.length > 0;
    }
    // Format 2: {lists:[{name,points:[...]}]}
    if(json.lists && Array.isArray(json.lists)){
        locations = [];
        json.lists.forEach(l => {
            (l.points || l.locations || l.items || []).forEach((p, i) => {
                locations.push({
                    id: p.id || locations.length,
                    name: p.name || 'จุดที่ ' + (i+1),
                    lat: parseFloat(p.lat || p.latitude || 0),
                    lng: parseFloat(p.lng || p.longitude || 0),
                    list: l.name || l.id || 'รายการ',
                    district: p.district || '',
                    city: p.city || '',
                    note: p.note || '',
                    tags: p.tags || [],
                    photo: p.photo || '',
                    date: p.date || ''
                });
            });
        });
        locations = locations.filter(p => p.lat && p.lng);
        invalidateMarkerCache();
        return locations.length > 0;
    }
    // Format 3: {points:[...]} or {locations:[...]} or {data:[...]}
    if(json.points || json.locations || json.data){
        return parseDataFormat(json.points || json.locations || json.data);
    }
    return false;
}

function loadSampleData(){
    // Realistic sample data (similar to prototype)
    const sample = [
        {name:'ร้าน BT สาทร', lat:13.7201, lng:100.5301, list:'ยกกลับแล้ว', city:'สาทร', note:'ติดต่อคุณสมชาย'},
        {name:'ร้าน BT สีลม', lat:13.7301, lng:100.5401, list:'ยกกลับแล้ว', city:'บางรัก', note:'เปิด 8:00-18:00'},
        {name:'ร้าน BT อโศก', lat:13.7401, lng:100.5601, list:'คืนนายาว', city:'วัฒนา', note:'ใกล้ BTS'},
        {name:'ร้าน BT รัชดา', lat:13.7601, lng:100.5701, list:'มีนบุรี', city:'ห้วยขวาง', note:'มีที่จอดรถ'},
        {name:'ร้าน BT ลาดพร้าว', lat:13.7801, lng:100.5801, list:'เมืองนนทบุรี', city:'จตุจักร', note:'ติดต่อ 081-xxx-xxxx'},
    ];
    locations = sample.map((p, i) => ({...p, id: i, date: new Date().toLocaleDateString('th-TH')}));
    invalidateMarkerCache();
}

// ════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════
console.log('[BT] Script loaded, readyState:', document.readyState);
console.log('[BT] locations count:', locations.length);

try {
    if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        // DOM already ready (app.js loaded dynamically after DOMContentLoaded)
        initApp();
    }
} catch(e) {
    console.error('[BT] Init failed:', e);
    document.getElementById('loaderTxt').textContent = 'เกิดข้อผิดพลาด: ' + e.message;
}

function refreshDatalistSuggestions() {
    const listSuggestions = document.getElementById('listSuggestions');
    const citySuggestions = document.getElementById('citySuggestions');
    if(listSuggestions) listSuggestions.innerHTML=[...new Set(locations.map(l=>l.list).filter(Boolean))].map(l=>`<option value="${l}">`).join('');
    if(citySuggestions) citySuggestions.innerHTML=[...new Set(locations.map(l=>l.city).filter(Boolean))].map(c=>`<option value="${c}">`).join('');
}

function updateChipLabels() {
    const chipListLabel = document.getElementById('chipListLabel');
    const chipCityLabel = document.getElementById('chipCityLabel');
    const chipList = document.getElementById('chipList');
    const chipCity = document.getElementById('chipCity');
    const chipAll = document.getElementById('chipAll');
    const chipNearby = document.getElementById('chipNearby');
    const chipHeatmap = document.getElementById('chipHeatmap');
    const chipFav = document.getElementById('chipFav');
    const chipMore = document.getElementById('chipMore');
    if(chipListLabel) chipListLabel.textContent=filterList||'รายการ';
    if(chipCityLabel) chipCityLabel.textContent=filterCity||'เขต';
    if(chipList) chipList.classList.toggle('active',!!filterList);
    if(chipCity) chipCity.classList.toggle('active',!!filterCity);
    // Dropdown items
    if(chipAll) chipAll.classList.toggle('active',!filterList&&!filterCity&&!nearbyMode&&!filterFavorites);
    if(chipNearby) chipNearby.classList.toggle('active',nearbyMode);
    if(chipHeatmap) chipHeatmap.classList.toggle('active',heatmapMode);
    if(chipFav) chipFav.classList.toggle('active',filterFavorites);
    // Highlight "more" button if any dropdown item is active
    const anyDropActive=nearbyMode||heatmapMode||filterFavorites;
    if(chipMore) chipMore.classList.toggle('active',anyDropActive);
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
        ${loc.tags&&loc.tags.length?`<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px;">${loc.tags.map(t=>{const tc=getTagColor(t);return`<span data-tag="${t}" title="กดเพื่อตั้งสี tag" style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;background:${tc||'var(--surface2)'};border-radius:12px;font-size:11px;color:${tc?'#fff':'var(--gn)'};font-weight:500;cursor:pointer;border:1px solid ${tc||'var(--gn)'};">🏷️ ${t}</span>`;}).join('')}</div>`:''}
        ${loc.photo?`<div style="margin-bottom:12px;"><img src="${loc.photo}" style="width:100%;max-height:200px;object-fit:cover;border-radius:12px;border:1px solid var(--gn);cursor:pointer;" onclick="window.open(this.src,'_blank')"></div>`:''}
        ${loc.note?`<div style="font-size:13px;color:var(--gn);margin-bottom:12px;padding:8px 12px;background:var(--surface2);border-radius:10px;">📝 ${loc.note}</div>`:''}
        <div class="place-card-actions">
            <button class="place-action-btn" onclick="openEdit(${idx})" style="background:rgba(91,143,255,0.15);border-color:rgba(91,143,255,0.3);">
                <span class="place-action-icon">✏️</span>
                <span class="place-action-label" style="color:var(--bl);">แก้ไข</span>
            </button>
            <button class="place-action-btn" onclick="doDirectionsTo(${idx})" style="background:rgba(45,255,160,0.12);border-color:rgba(45,255,160,0.3);">
                <span class="place-action-icon">🧭</span>
                <span class="place-action-label" style="color:var(--gn);">เส้นทาง</span>
            </button>
            <button class="place-action-btn" onclick="doConfirmDelete(${idx})" style="background:rgba(255,95,95,0.12);border-color:rgba(255,95,95,0.3);">
                <span class="place-action-icon">🗑️</span>
                <span class="place-action-label" style="color:var(--red);">ลบ</span>
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
                style="border:none;background:none;cursor:pointer;color:var(--bl);font-size:13px;font-weight:500;padding:4px 8px;border-radius:8px;flex-shrink:0;">คัดลอก</button>
        </div>
        ${loc.city?`<div class="place-card-row"><div class="place-card-row-icon">🏙️</div><div class="place-card-row-text">${loc.city}</div></div>`:''}
    `;
    // Tag color click handler
    document.getElementById('placeCardContent').querySelectorAll('[data-tag]').forEach(el=>{
        el.onclick=e=>{
            e.stopPropagation();
            const tag=el.dataset.tag;
            const cur=getTagColor(tag)||'#4caf50';
            const inp=document.createElement('input'); inp.type='color'; inp.value=cur;
            inp.style.cssText='position:fixed;opacity:0;width:0;height:0;';
            document.body.appendChild(inp);
            inp.addEventListener('change',()=>{
                tagColors[tag]=inp.value; saveTagColors();
                _clusterDirty=true; invalidateCache(); update();
                showPlaceCard(loc,idx);
                document.body.removeChild(inp);
            });
            inp.addEventListener('blur',()=>{ setTimeout(()=>{ if(document.body.contains(inp))document.body.removeChild(inp); },200); });
            inp.click();
        };
        el.title='กดเพื่อตั้งสีให้ tag นี้ (ทุกจุดที่มี tag นี้จะเปลี่ยนสี)';
    });
    closePlaceCard();
    setTimeout(()=>{
        const pc = document.getElementById('placeCard');
        if(pc) pc.classList.add('open');
    },10);
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

function closePlaceCard() { const pc = document.getElementById('placeCard'); if(pc) pc.classList.remove('open'); }
window.doToggleFavorite=function(idx){const loc=locations[idx];if(!loc)return;toggleFavorite(loc);invalidateCache();update();showPlaceCard(loc,idx);showToast(isFavorite(loc)?'⭐ เพิ่มในรายการโปรดแล้ว':'☆ นำออกจากรายการโปรดแล้ว');};
onClick('placeCardClose', closePlaceCard);

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
                <div class="list-item-name">${_cleanDMSName(loc.name)||'ไม่มีชื่อ'}</div>
                <div class="list-item-sub">${loc.list}${loc.city?' · '+loc.city:''}${distText}</div>
            </div>
            <span class="list-item-chevron">›</span>
        </div>`;
    }).join('');
}
window.closeListPanel = ()=>{const _lp=document.getElementById('listPanel');if(_lp)_lp.classList.remove('open');};
onClick('listPanelClose', closeListPanel);

document.getElementById('listSortBar')?.addEventListener('click',e=>{
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

if(searchInput){
    searchInput.addEventListener('focus',()=>{if(searchBox)searchBox.classList.add('focused');renderSearchResults();});
    searchInput.addEventListener('blur',()=>setTimeout(()=>{if(searchBox)searchBox.classList.remove('focused');},200));
    searchInput.addEventListener('input',()=>{
        if(btnClearSearch)btnClearSearch.classList.toggle('show',searchInput.value.length>0);
        if(!searchInput.value.trim())_clearSearchMarker();
        renderSearchResults();
        _debouncedUpdate();
    });
}
if(btnClearSearch) btnClearSearch.onclick=()=>{if(searchInput)searchInput.value='';if(btnClearSearch)btnClearSearch.classList.remove('show');if(searchResults)searchResults.innerHTML='';_clearSearchMarker();_lastFilteredKey=null;update();};

// Normalize ALL Unicode degree/quote variants → ASCII
function _normDMS(s){
    return s.replace(/[°ºᵒ˚]/g,'D')
            .replace(/[''ʼ′‛`]/g,'M')
            .replace(/[""″‟˝]/g,'S')
            .replace(/\s+/g,' ').trim();
}
// Parse single DMS component: 13D45M40.4SN → decimal
function _parseDMS(str){
    const m=str.match(/(\d+)\s*D\s*(\d+)\s*M\s*([\d.]+)\s*S?\s*([NSEWnsew])?/);
    if(!m)return null;
    let val=parseInt(m[1])+parseInt(m[2])/60+parseFloat(m[3])/3600;
    if(m[4]&&/[SsWw]/.test(m[4]))val=-val;
    return {val, dir:(m[4]||'').toUpperCase()};
}
function parseLatLng(q) {
    const raw=q.replace(/\s+/g,' ').trim();
    // Decimal format: 13.761, 100.548
    const m=raw.match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/);
    if(m){const lat=parseFloat(m[1]),lng=parseFloat(m[2]);if(lat>=-90&&lat<=90&&lng>=-180&&lng<=180)return{lat,lng};}
    // DMS format — normalize then parse
    const s=_normDMS(raw);
    // Match two DMS groups
    const dmsRe=/(\d+\s*D\s*\d+\s*M\s*[\d.]+\s*S?\s*[NSEWnsew]?)/g;
    const groups=s.match(dmsRe);
    if(groups&&groups.length>=2){
        const a=_parseDMS(groups[0]),b=_parseDMS(groups[1]);
        if(a&&b){
            let lat,lng;
            if(a.dir==='N'||a.dir==='S'){lat=a.val;lng=b.val;}
            else if(a.dir==='E'||a.dir==='W'){lat=b.val;lng=a.val;}
            else if(b.dir==='N'||b.dir==='S'){lat=b.val;lng=a.val;}
            else if(b.dir==='E'||b.dir==='W'){lat=a.val;lng=b.val;}
            else{lat=Math.abs(a.val)<=90?a.val:b.val;lng=Math.abs(a.val)<=90?b.val:a.val;}
            if(lat>=-90&&lat<=90&&lng>=-180&&lng<=180)return{lat,lng};
        }
    }
    return null;
}
// Temp search marker
let _searchMarker=null;
function _showSearchMarker(lat,lng){
    if(_searchMarker)map.removeLayer(_searchMarker);
    _searchMarker=L.marker([lat,lng],{icon:L.divIcon({className:'search-pin',html:'<div style="width:20px;height:20px;background:#e53935;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.4);animation:searchPulse 1.5s ease-in-out infinite"></div>',iconSize:[20,20],iconAnchor:[10,10]})}).addTo(map);
    _searchMarker.bindPopup(`📍 ${lat.toFixed(6)}, ${lng.toFixed(6)}`).openPopup();
}
function _clearSearchMarker(){if(_searchMarker){map.removeLayer(_searchMarker);_searchMarker=null;}}
// Inject pulse animation CSS
(function(){const st=document.createElement('style');st.textContent='@keyframes searchPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.4);opacity:.7}}';document.head.appendChild(st);})();

// Auto-convert DMS on paste → show decimal + fly to location + marker
searchInput.addEventListener('paste',e=>{
    setTimeout(()=>{
        const coords=parseLatLng(searchInput.value.trim());
        if(coords){
            searchInput.value=`${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;
            renderSearchResults();
            map.flyTo([coords.lat,coords.lng],16,{animate:true,duration:0.8});
            _showSearchMarker(coords.lat,coords.lng);
            showToast(`📍 ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`,false,true);
        }
    },50);
});

function renderSearchResults() {
    const q=searchInput.value.toLowerCase().trim();
    if(!q){searchResults.innerHTML='';return;}
    let html='';
    const coords=parseLatLng(searchInput.value.trim());
    if(coords){
        html+=`<div class="search-result-item" onclick="map.flyTo([${coords.lat},${coords.lng}],16,{animate:true,duration:0.8});_showSearchMarker(${coords.lat},${coords.lng});document.getElementById('search').blur();">
            <div class="search-result-icon" style="background:var(--am);color:var(--bl)">🎯</div>
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

// Dropdown toggle for "List Manager"
const _listDropdown=document.getElementById('listDropdown');
const _chipListEl=document.getElementById('chipList');
if(_chipListEl && _listDropdown) {
    _chipListEl.addEventListener('click',e=>{
        e.stopPropagation();
        _listDropdown.classList.toggle('open');
    });
    // Close on outside touch/click
    document.addEventListener('mousedown',e=>{
        if(_listDropdown.classList.contains('open')&&!e.target.closest('.chip-more-wrap'))
            _listDropdown.classList.remove('open');
    });
    document.addEventListener('touchstart',e=>{
        if(_listDropdown.classList.contains('open')&&!e.target.closest('.chip-more-wrap'))
            _listDropdown.classList.remove('open');
    },{passive:true});
    // Each dropdown item closes menu after its handler runs
    document.querySelectorAll('.chip-dropdown-item').forEach(item=>{
        item.addEventListener('click',()=>{
            setTimeout(()=>_listDropdown.classList.remove('open'),100);
        });
    });
}

onClick('chipAll', ()=>{
    filterList=''; filterCity=''; nearbyMode=false; filterFavorites=false;
    clearRoute(); clearMultiRoutes();
    update();
});

onClick('chipFav', ()=>{
    filterFavorites=!filterFavorites;
    if(filterFavorites){ filterList=''; filterCity=''; nearbyMode=false; }
    update();
});

onClick('btnPlanMultipleRoutes', () => {
    if (multiRouteMode) {
        clearMultiRoutes();
        showToast('🏁 ปิดการวางแผนหลายเส้นทาง');
    } else {
        doMultiRoute();
    }
});

onClick('chipNearby', ()=>{
    if(!myLatLng){showToast('กรุณาเปิด GPS ก่อน',true);return;}
    nearbyMode=!nearbyMode; update();
    if(nearbyMode){
        const f=getFiltered();
        if(f.length>0)map.flyToBounds(L.latLngBounds(f.map(l=>[l.lat,l.lng])),{padding:[60,60],animate:true,duration:0.8});
        showToast(`📍 ${getFiltered().length} จุดใกล้ฉัน (${nearbyRadius/1000} กม.)`);
    }
});

onClick('btnMergeList', ()=>{
    const counts={}; locations.forEach(l=>{counts[l.list]=(counts[l.list]||0)+1;});
    const lists=Object.keys(counts).filter(n=>n!==filterList).sort();
    if(!lists.length){showToast('ไม่มีรายการอื่นให้รวม',true);return;}
    // Build inline dropdown in the modal body
    const container=document.getElementById('listChoiceList');
    container.innerHTML=`
        <div style="padding:12px;">
            <div style="font-size:14px;font-weight:600;margin-bottom:8px;">🔗 รวม "${filterList}" (${counts[filterList]} จุด) → ไปรายการไหน?</div>
            <select id="_mergeListTarget" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--gn);font-size:14px;background:var(--surface);">
                ${lists.map(n=>`<option value="${n}">${n} (${counts[n]} จุด)</option>`).join('')}
            </select>
            <div style="display:flex;gap:8px;margin-top:12px;">
                <button id="_mergeListConfirm" style="flex:1;padding:10px;border:none;background:#e67c00;color:#fff;border-radius:8px;font-size:13px;cursor:pointer;">✅ รวมเลย</button>
                <button id="_mergeListCancel" style="flex:1;padding:10px;border:1px solid var(--gn);background:var(--surface);border-radius:8px;font-size:13px;cursor:pointer;">ยกเลิก</button>
            </div>
        </div>`;
    const _mergeListCancel=document.getElementById('_mergeListCancel');
    const _mergeListConfirm=document.getElementById('_mergeListConfirm');
    if(_mergeListCancel) _mergeListCancel.onclick=()=>{const chipList=document.getElementById('chipList');if(chipList)chipList.click();};
    if(_mergeListConfirm) _mergeListConfirm.onclick=()=>{
        const toList=document.getElementById('_mergeListTarget').value;
        pushUndo();
        let count=0;
        const changedMergeList=[];
        locations.forEach(l=>{if(l.list===filterList){l.list=toList;l.updatedAt=Date.now();count++;changedMergeList.push(l);}});
        showToast(`🔗 รวม "${filterList}" (${count} จุด) → "${toList}"`);
        filterList=toList;
        saveLocations();invalidateCache();
        if(_sbLoaded)sbBulkUpdate(changedMergeList);
        document.getElementById('listFilterModalOverlay').classList.remove('open');
        update();
    };
});

onClick('chipCity', ()=>{
    const counts={}; locations.forEach(l=>{if(l.city)counts[l.city]=(counts[l.city]||0)+1;});
    const cities=Object.keys(counts).filter(n=>n!==filterCity).sort();
    if(!cities.length){showToast('ไม่มีเขตอื่นให้รวม',true);return;}
    const container=document.getElementById('cityChoiceList');
    container.innerHTML=`
        <div style="padding:12px;">
            <div style="font-size:14px;font-weight:600;margin-bottom:8px;">🔗 รวม "${filterCity}" (${counts[filterCity]} จุด) → ไปเขตไหน?</div>
            <select id="_mergeCityTarget" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--gn);font-size:14px;background:var(--surface);">
                ${cities.map(n=>`<option value="${n}">${n} (${counts[n]} จุด)</option>`).join('')}
            </select>
            <div style="display:flex;gap:8px;margin-top:12px;">
                <button id="_mergeCityConfirm" style="flex:1;padding:10px;border:none;background:#e67c00;color:#fff;border-radius:8px;font-size:13px;cursor:pointer;">✅ รวมเลย</button>
                <button id="_mergeCityCancel" style="flex:1;padding:10px;border:1px solid var(--gn);background:var(--surface);border-radius:8px;font-size:13px;cursor:pointer;">ยกเลิก</button>
            </div>
        </div>`;
    onClick('_mergeCityCancel', ()=>{const el=document.getElementById('chipCity');if(el)el.click();});
    onClick('_mergeCityConfirm', ()=>{
        const toCity=document.getElementById('_mergeCityTarget').value;
        pushUndo();
        let count=0;
        const changedMergeCity=[];
        locations.forEach(l=>{if(l.city===filterCity){l.city=toCity;l.updatedAt=Date.now();count++;changedMergeCity.push(l);}});
        showToast(`🔗 รวม "${filterCity}" (${count} จุด) → "${toCity}"`);
        filterCity=toCity;
        saveLocations();invalidateCache();
        if(_sbLoaded)sbBulkUpdate(changedMergeCity);
        document.getElementById('cityFilterModalOverlay').classList.remove('open');
        update();
    });
});

onClick('chipHeatmap', ()=>{heatmapMode=!heatmapMode;_lastFilteredKey=null;update();});
onClick('chipShowList', ()=>{
    const lp=document.getElementById('listPanel');
    if(lp.classList.contains('open')){closeListPanel();}else{
        lp.classList.add('open'); closePlaceCard();
        renderListPanel(getFiltered());
    }
    update();
});

const _chipAll = document.getElementById('chipAll');
if(_chipAll) _chipAll.classList.add('active');

// ════════════════════════════════════════════
// MAP CONTROLS
// ════════════════════════════════════════════
onClick('btnZoomIn', ()=>map.zoomIn());
onClick('btnZoomOut', ()=>map.zoomOut());
onClick('btnTile', ()=>{
    map.removeLayer(tileLayers[tileNames[currentTileIdx]]);
    currentTileIdx=(currentTileIdx+1)%tileNames.length;
    tileLayers[tileNames[currentTileIdx]].addTo(map);
    showToast('แผนที่: '+tileNames[currentTileIdx]);
});

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
                <small style="color:var(--text3);">${lat.toFixed(6)}, ${lng.toFixed(6)}</small><br>
                <small style="color:var(--text3);">±${Math.round(accuracy)}ม.</small><br><br>
                <button onclick="openAddAt(${lat},${lng})" style="background:var(--bl);color:white;border:none;border-radius:8px;padding:6px 14px;cursor:pointer;font-size:12px;font-family:inherit;">+ ปักหมุดที่นี่</button>
            </div>`);
    }
    myLatLng = {lat, lng};
    if (myLocationMarker.isPopupOpen()) {
        myLocationMarker.setPopupContent(`<div style="padding:12px;font-size:13px;min-width:180px;"><b>📍 ตำแหน่งของฉัน</b><br><small>${lat.toFixed(6)}, ${lng.toFixed(6)}</small><br><small>±${Math.round(accuracy)}ม.</small><br><br><button onclick="openAddAt(${lat},${lng})" style="background:var(--bl);color:white;border:none;border-radius:8px;padding:6px 14px;cursor:pointer;font-size:12px;font-family:inherit;">+ ปักหมุดที่นี่</button></div>`);
    }
    _smoothFollow(lat, lng);
    if (listSortMode==='near' || nearbyMode) update();
}

// หยุดติดตามกล้องเมื่อผู้ใช้ลาก map
// แสดง tooltip ถาวรเฉพาะตอน zoom >= 16
const TOOLTIP_ZOOM = 16;
function _updateTooltipVisibility() {
    const showPermanent = map.getZoom() >= TOOLTIP_ZOOM;
    _markerCache.forEach(marker => {
        const tt = marker.getTooltip();
        if (!tt) return;
        if (showPermanent && !tt.options.permanent) {
            marker.unbindTooltip();
            marker.bindTooltip(tt._content || tt.getContent(), { permanent: true, direction: 'top', offset: [0, -2], className: 'bt-tooltip', opacity: 0.95 });
            if (marker._map) marker.openTooltip();
        } else if (!showPermanent && tt.options.permanent) {
            marker.unbindTooltip();
            marker.bindTooltip(tt._content || tt.getContent(), { permanent: false, direction: 'top', offset: [0, -2], className: 'bt-tooltip', opacity: 0.95 });
        }
    });
}
map.on('zoomend', () => {
    _updateTooltipVisibility();
    _lastFilteredKey = null; // force re-render with new marker limit
    update();
});

if(btnGps){
map.on('dragstart', () => {
    if (gpsTracking) {
        gpsTracking = false;
        btnGps.title = 'ติดตามตำแหน่ง (ปิด — แตะเพื่อเปิด)';
        btnGps.classList.remove('gps-tracking');
    }
});
}

function stopGps() {
    if (gpsWatcher !== null) { navigator.geolocation.clearWatch(gpsWatcher); gpsWatcher = null; }
    gpsActive = false; gpsTracking = false; gpsCoarseShown = false; gpsFlyDone = false;
    gpsToastShown = false; gpsFineToastShown = false;
    if(btnGps) btnGps.classList.remove('gps-searching', 'gps-found', 'gps-tracking');
    _lastGpsLat = null; _lastGpsLng = null;
}

// btnGps: กดครั้งที่ 1 = เปิด GPS + เปิด tracking, กดครั้งที่ 2 = กล้องบินไปตำแหน่ง + เปิด tracking อีกครั้ง
if(btnGps) btnGps.onclick = () => {
    if (!navigator.geolocation) { showToast('Browser ไม่รองรับ GPS', true); return; }
    if (gpsActive && myLocationMarker) {
        // toggle tracking: ถ้า tracking อยู่ → บินไปตำแหน่ง, ถ้าไม่ → เปิด tracking
        gpsTracking = true;
        btnGps.classList.add('gps-tracking');
        const ll = myLocationMarker.getLatLng();
        map.flyTo([ll.lat, ll.lng], Math.max(map.getZoom(), 17), {animate:true, duration:0.8});
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
                map.flyTo([lat, lng], z, {animate:true, duration:1.0});
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
const btnUseGpsModal = document.getElementById('btnUseGpsModal');
if(btnUseGpsModal) btnUseGpsModal.onclick=()=>{
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

window.openAddMode = function(){
    if(addMode){cancelAddMode();return;}
    
    // Auto-switch back to map if we are on List or Stats
    if (typeof currentView !== 'undefined' && currentView !== 'map') {
        if (typeof switchView === 'function') switchView('map');
    }

    addMode=true; fab.classList.add('add-mode');
    fab.innerHTML=`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>ยกเลิก`;
    addBanner.classList.add('show'); crosshair.classList.add('show');
    document.getElementById('map').classList.add('add-cursor');
    closePlaceCard(); cancelMeasureMode();
};
fab.onclick = openAddMode;

const btnCancelAdd=document.getElementById('btnCancelAdd');
if(btnCancelAdd) btnCancelAdd.onclick=cancelAddMode;
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
    // Waypoint Mode Hook
    if (typeof _handleMapClickForWaypoint === 'function' && _isAddingWaypoint) {
        _handleMapClickForWaypoint(e);
        return;
    }
    const{lat,lng}=e.latlng;
    const editModalOverlay = document.getElementById('editModalOverlay');
    if(editModalOverlay && editModalOverlay.classList.contains('open')){
        document.getElementById('modalLat').value=lat.toFixed(6);
        document.getElementById('modalLng').value=lng.toFixed(6);
        ['modalLat','modalLng'].forEach(id=>{const el=document.getElementById(id);el.style.borderColor='#34a853';setTimeout(()=>el.style.borderColor='',800);});
        return;
    }
    if(measureMode){
        if(!measureStart){
            measureStart = {lat, lng, name: 'จุดที่เลือก'};
            // Visual feedback for first point
            const dot = L.circleMarker([lat,lng], {radius:5, color:'#7b1fa2', fillColor:'#7b1fa2', fillOpacity:1}).addTo(map);
            measureLine = dot; // Reuse measureLine to hold the temporary dot
            return;
        }
        const straightDist=haversine(measureStart.lat,measureStart.lng,lat,lng);
        if(measureLine)map.removeLayer(measureLine);
        // Draw straight line immediately
        measureLine=L.polyline([[measureStart.lat,measureStart.lng],[lat,lng]],{color:'#7b1fa2',weight:3,dashArray:'8,6'}).addTo(map);
        document.getElementById('btnClearMeasure').style.display='flex';
        const fromName=measureStart.name||measureStart.list||'จุดเริ่ม';
        document.getElementById('measureResultText').textContent=`📏 ${formatDist(straightDist)} (เส้นตรง)\n(${fromName} → พิกัดที่เลือก)`;
        document.getElementById('measureModalOverlay').classList.add('open');
        // Try OSRM for road distance
        const osrmUrl=`https://router.project-osrm.org/route/v1/driving/${measureStart.lng},${measureStart.lat};${lng},${lat}?overview=full&geometries=geojson`;
        fetch(osrmUrl).then(r=>r.json()).then(data=>{
            if(data.routes&&data.routes.length){
                const route=data.routes[0];
                const roadDist=route.distance;
                const mins=Math.round(route.duration/60);
                const coords=route.geometry.coordinates.map(c=>[c[1],c[0]]);
                if(measureLine)map.removeLayer(measureLine);
                measureLine=L.polyline(coords,{color:'#7b1fa2',weight:4,opacity:0.85}).addTo(map);
                document.getElementById('btnClearMeasure').style.display='flex';
                document.getElementById('measureResultText').textContent=`🛣️ ${formatDist(roadDist)} · ~${mins} นาที (ถนน)\n📏 ${formatDist(straightDist)} (เส้นตรง)\n(${fromName} → พิกัดที่เลือก)`;
            }
        }).catch(()=>{});
        cancelMeasureMode(); return;
    }
    if(!addMode)return;
    cancelAddMode(); openAddAt(lat,lng);
});

window.openAddAt=function(lat,lng){
    map.closePopup(); editingIndex=-1;
    document.getElementById('editModalTitle').textContent='เพิ่มสถานที่';
    document.getElementById('modalName').value='';
    document.getElementById('modalNote').value='';
    document.getElementById('modalTags').value='';
    setPhotoPreview('');
    document.getElementById('modalLat').value=parseFloat(lat).toFixed(6);
    document.getElementById('modalLng').value=parseFloat(lng).toFixed(6);

    // Auto-fill list/city: use active filter first, then nearest location
    let autoList=filterList||'';
    let autoCity=filterCity||'';
    if(!autoList||!autoCity){
        let bestDist=Infinity, bestLoc=null;
        locations.forEach(l=>{
            const d=haversine(lat,lng,l.lat,l.lng);
            if(d<bestDist){bestDist=d;bestLoc=l;}
        });
        if(bestLoc&&bestDist<10000){ // within 10km
            if(!autoList)autoList=bestLoc.list||'';
            if(!autoCity)autoCity=bestLoc.city||'';
        }
        // Fallback: most-used list overall
        if(!autoList&&locations.length){
            const cnt={};locations.forEach(l=>{if(l.list)cnt[l.list]=(cnt[l.list]||0)+1;});
            autoList=Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
        }
    }
    document.getElementById('modalList').value=autoList;
    document.getElementById('modalCity').value=autoCity;

    // Reverse geocode for city/district name
    _reverseGeocodeCity(lat,lng).then(city=>{
        if(city&&!filterCity){
            document.getElementById('modalCity').value=city;
        }
    });

    document.getElementById('editModalOverlay').classList.add('open');
};

// Reverse geocode: get district/city name from coordinates
async function _reverseGeocodeCity(lat,lng){
    try{
        const url=`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=12&addressdetails=1&accept-language=th`;
        const res=await fetch(url);
        const data=await res.json();
        if(data.address){
            // Priority: suburb → city_district → district → city → town → county
            let name=data.address.suburb||data.address.city_district||data.address.district||
                   data.address.city||data.address.town||data.address.county||'';
            // Strip Thai admin prefixes: เขต, อำเภอ, แขวง, ตำบล, อ., ต.
            name=name.replace(/^(เขต|อำเภอ|แขวง|ตำบล|อ\.|ต\.)\s*/,'').trim();
            return name;
        }
    }catch(e){console.warn('Reverse geocode failed:',e);}
    return '';
}

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

const editModalCancel=document.getElementById('editModalCancel');
const editModalOverlay=document.getElementById('editModalOverlay');
if(editModalCancel) editModalCancel.onclick=()=>{if(editModalOverlay)editModalOverlay.classList.remove('open');};
if(editModalOverlay) editModalOverlay.onclick=e=>{if(e.target===editModalOverlay&&editModalOverlay)editModalOverlay.classList.remove('open');};

const editModalSave=document.getElementById('editModalSave');
if(editModalSave) editModalSave.onclick=()=>{
    const name=_cleanDMSName(document.getElementById('modalName').value.trim());
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
    addChangelogEntry(editingIndex>=0?'edit':'add',entry);
    document.getElementById('editModalOverlay').classList.remove('open');
    showToast(editingIndex>=0?'บันทึกสำเร็จ':'เพิ่มสถานที่แล้ว',false,true);
    if(_sbLoaded){
        // Realtime will update locations[] and render for everyone including self
        if(editingIndex>=0){
            const existing=locations[editingIndex];
            entry.sb_id=existing.sb_id;
            sbUpdate(entry);
        } else {
            if(editingIndex<0)map.flyTo([lat,lng],15,{animate:true,duration:0.7});
            sbInsert(entry);
        }
    } else {
        // Offline fallback
        if(editingIndex>=0){locations[editingIndex]=entry;}else{locations.push(entry);}
        saveLocations();invalidateCache();update();
    }
};

// ════════════════════════════════════════════
// DELETE
// ════════════════════════════════════════════
window.doConfirmDelete=function(idx){
    const loc=locations[idx]; if(!loc)return;
    showConfirm('🗑️','ลบสถานที่?',`"${loc.name||loc.list}" จะถูกลบ (Undo ได้)`,()=>{
        addChangelogEntry('delete',loc);
        pushUndo();locations.splice(idx,1);saveLocations();invalidateCache();closePlaceCard();update();showToast('ลบแล้ว');
        if(_sbLoaded)sbDelete(loc);
    });
};

// ════════════════════════════════════════════
// MEASURE
// ════════════════════════════════════════════
window.startMeasureMode=function(idx){
    measureMode=true;
    if(typeof idx==='number' && locations[idx]){
        measureStart=locations[idx];
    } else {
        measureStart=null;
    }
    document.getElementById('measureBanner').classList.add('show');
    document.getElementById('map').classList.add('measure-cursor');
    closePlaceCard();
};
const btnCancelMeasure=document.getElementById('btnCancelMeasure');
if(btnCancelMeasure) btnCancelMeasure.onclick=cancelMeasureMode;
function cancelMeasureMode(){
    measureMode=false;measureStart=null;
    document.getElementById('measureBanner').classList.remove('show');
    document.getElementById('map').classList.remove('measure-cursor');
}
const measureModalClose=document.getElementById('measureModalClose');
const measureModalClear=document.getElementById('measureModalClear');
const measureModalOverlay2=document.getElementById('measureModalOverlay');
if(measureModalClose) measureModalClose.onclick=()=>{if(measureModalOverlay2)measureModalOverlay2.classList.remove('open');};
if(measureModalClear) measureModalClear.onclick=()=>{
    if(measureLine){map.removeLayer(measureLine);measureLine=null;}
    document.getElementById('btnClearMeasure').style.display='none';
    if(measureModalOverlay2)measureModalOverlay2.classList.remove('open');
};
const btnClearMeasureGlobal=document.getElementById('btnClearMeasure');
if(btnClearMeasureGlobal) btnClearMeasureGlobal.onclick=()=>{
    if(measureLine){map.removeLayer(measureLine);measureLine=null;}
    btnClearMeasureGlobal.style.display='none';
};
if(measureModalOverlay2) measureModalOverlay2.onclick=e=>{if(e.target===measureModalOverlay2)measureModalOverlay2.classList.remove('open');};

// ════════════════════════════════════════════
// DIRECTIONS (Live navigation + auto-reroute)
// ════════════════════════════════════════════
// Route avoidance preferences (shared by nav + route planning)
let _routeAvoid = JSON.parse(localStorage.getItem('routeAvoid')||'{}');
// Keys: toll, ferry, motorway  (OSRM exclude values)
function _saveRouteAvoid(){localStorage.setItem('routeAvoid',JSON.stringify(_routeAvoid));}
function _osrmExcludeParam(){
    // Note: router.project-osrm.org does NOT support &exclude parameter
    // Sending it causes 400 Bad Request — always return empty string
    return '';
}
window._showAvoidSettings=function(){
    // Anti-spam & Toggle logic: If open, close it and return
    const old = document.getElementById('_avoidModal');
    if(old) {
        old.remove();
        const backdrop = document.getElementById('_avoidBackdrop');
        if(backdrop) backdrop.remove();
        return;
    }

    const html=`
        <div id="_avoidModal" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2001;background:rgba(15,23,42,0.95);backdrop-filter:blur(16px);padding:24px;border-radius:24px;box-shadow:0 20px 50px rgba(0,0,0,0.6);min-width:300px;border:1px solid rgba(255,255,255,0.1);color:#fff;font-family:inherit;">
            <div style="font-weight:700;font-size:18px;margin-bottom:16px;display:flex;align-items:center;gap:10px;color:var(--bl);">
                <i class="fa-solid fa-shield-halved"></i> ตั้งค่าเส้นทาง
            </div>
            <label style="display:flex;align-items:center;gap:12px;padding:12px 0;font-size:14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.05);">
                <input type="checkbox" id="_avToll" ${_routeAvoid.toll?'checked':''} style="width:18px;height:18px;accent-color:var(--bl);"> 
                <span>หลีกเลี่ยงทางด่วน / เก็บเงิน</span>
            </label>
            <label style="display:flex;align-items:center;gap:12px;padding:12px 0;font-size:14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.05);">
                <input type="checkbox" id="_avFerry" ${_routeAvoid.ferry?'checked':''} style="width:18px;height:18px;accent-color:var(--bl);"> 
                <span>หลีกเลี่ยงทางเรือ / เรือข้ามฟาก</span>
            </label>
            <label style="display:flex;align-items:center;gap:12px;padding:12px 0;font-size:14px;cursor:pointer;margin-bottom:8px;">
                <input type="checkbox" id="_avMotorway" ${_routeAvoid.motorway?'checked':''} style="width:18px;height:18px;accent-color:var(--bl);"> 
                <span>หลีกเลี่ยงทางหลวง / มอเตอร์เวย์</span>
            </label>
            <div style="display:flex;gap:10px;margin-top:20px;">
                <button onclick="_applyAvoidSettings()" style="flex:1;padding:12px;border:none;background:var(--bl);color:#fff;border-radius:14px;font-size:14px;font-weight:700;cursor:pointer;transition:all 0.2s;">✅ บันทึก</button>
                <button onclick="document.getElementById('_avoidModal').remove();document.getElementById('_avoidBackdrop').remove();" style="flex:1;padding:12px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.05);color:#fff;border-radius:14px;font-size:14px;cursor:pointer;">ยกเลิก</button>
            </div>
        </div>
        <div id="_avoidBackdrop" onclick="document.getElementById('_avoidModal').remove();this.remove();" style="position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,0.5);backdrop-filter:blur(2px);"></div>`;
    document.body.insertAdjacentHTML('beforeend',html);
};
window._applyAvoidSettings=function(){
    _routeAvoid.toll=document.getElementById('_avToll').checked;
    _routeAvoid.ferry=document.getElementById('_avFerry').checked;
    _routeAvoid.motorway=document.getElementById('_avMotorway').checked;
    _saveRouteAvoid();
    document.getElementById('_avoidModal').remove();
    document.getElementById('_avoidBackdrop').remove();
    showToast('⚙️ บันทึกการตั้งค่าเส้นทางแล้ว');
    // Reroute if nav active
    if(_navState.active&&myLatLng)_navReroute(myLatLng.lat,myLatLng.lng);
};

let _navState = {
    active: false,
    line: null,           // polyline on map
    routeCoords: [],      // [[lat,lng],...]
    dest: null,           // destination location
    waypoints: [],        // intermediate waypoints [{lat,lng,name?}]
    watchId: null,        // GPS watch
    myMarker: null,       // position marker
    totalDist: 0,         // route distance (m)
    totalDur: 0,          // route duration (s)
    lastReroute: 0,       // timestamp of last reroute
    trafficFactor: 1.0,   // 1.0=normal, 1.3=moderate, 1.6=heavy
};
const REROUTE_THRESHOLD = 80; // meters off-route to trigger reroute
const REROUTE_COOLDOWN = 15000; // ms between reroutes
const ARRIVAL_THRESHOLD = 50; // meters to consider "arrived"

// Inject nav banner CSS once (Modern Premium Redesign)
(function(){const s=document.createElement('style');s.textContent=`
#directionsBanner{position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:2000;
  background:rgba(15,23,42,0.9);backdrop-filter:blur(12px);padding:16px 20px;border-radius:24px;
  box-shadow:0 12px 40px rgba(0,0,0,0.5);font-size:14px;font-family:inherit;min-width:280px;
  max-width:92vw;width:360px;color:#fff;border:1px solid rgba(255,255,255,0.1);}
#directionsBanner .nav-row{display:flex;align-items:center;gap:12px;margin-bottom:8px;}
#directionsBanner .nav-row strong{font-size:16px;font-weight:700;color:var(--bl);}
#directionsBanner .nav-stats{display:flex;gap:20px;font-size:14px;margin:8px 0;opacity:0.9;}
#directionsBanner .nav-stats span{display:flex;align-items:center;gap:6px;}
#directionsBanner .nav-btns{display:flex;gap:8px;margin-top:14px;}
#directionsBanner .nav-btn{flex:1;padding:10px 4px;border:none;border-radius:12px;
  background:rgba(255,255,255,0.1);cursor:pointer;font-size:12px;font-weight:600;color:#fff;
  transition:all .2s ease;display:flex;align-items:center;justify-content:center;gap:4px;}
#directionsBanner .nav-btn:hover{background:rgba(255,255,255,0.2);transform:translateY(-1px);}
#directionsBanner .nav-btn i{font-size:14px;}
#directionsBanner .nav-close{width:40px;height:40px;border:none;background:#ff4d4d;color:#fff;
  border-radius:12px;cursor:pointer;font-size:16px;font-weight:bold;box-shadow:0 4px 10px rgba(255,77,77,0.3);
  transition:all .2s;display:flex;align-items:center;justify-content:center;}
#directionsBanner .nav-close:hover{background:#ff2e2e;transform:scale(1.05);}
`;document.head.appendChild(s);})();

let _navDestMarker=null;
function clearDirections(){
    if(_navState.line){map.removeLayer(_navState.line);_navState.line=null;}
    if(_navState.watchId!==null){navigator.geolocation.clearWatch(_navState.watchId);_navState.watchId=null;}
    if(_navState.myMarker){map.removeLayer(_navState.myMarker);_navState.myMarker=null;}
    if(_navDestMarker){map.removeLayer(_navDestMarker);_navDestMarker=null;}
    _navState.active=false;
    _navState.waypoints=[];
    _navState.routeCoords=[];
    _navState.dest=null;
    _navState.totalDist=0;
    _navState.totalDur=0;
    const banner=document.getElementById('directionsBanner');
    if(banner)banner.remove();
}
window.clearDirections=clearDirections;

// Escape key / map click to cancel nav
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&_navState.active){clearDirections();showToast('ยกเลิกการนำทาง');}});

function _updateNavBanner(){
    if(!_navState.active)return;
    // Remove old banner to prevent duplicates
    let old=document.getElementById('directionsBanner');
    if(old)old.remove();

    const banner=document.createElement('div');
    banner.id='directionsBanner';
    document.body.appendChild(banner);

    const distKm=(_navState.totalDist/1000).toFixed(1);
    const etaMins=Math.round(_navState.totalDur/60);
    const destName=_navState.dest?.name||'ปลายทาง';
    const wpText=_navState.waypoints.length?`<div style="font-size:11px;color:var(--bl);margin-top:4px;display:flex;align-items:center;gap:4px;"><i class="fa-solid fa-location-dot"></i> ${_navState.waypoints.length} จุดแวะ</div>`:'';
    banner.innerHTML=`
        <div class="nav-row">
            <i class="fa-solid fa-compass" style="font-size:20px;color:var(--bl);"></i>
            <strong style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${destName}</strong>
        </div>
        <div class="nav-stats">
            <span><i class="fa-solid fa-route"></i> ${distKm} km</span>
            <span><i class="fa-solid fa-clock-rotate-left"></i> ~${etaMins} นาที</span>
        </div>
        ${wpText}
        <div class="nav-btns">
            <button class="nav-btn" id="_nbWaypoint"><i class="fa-solid fa-location-pin"></i> จุดแวะ</button>
            <button class="nav-btn" id="_nbAvoid"><i class="fa-solid fa-shield"></i> หลีกเลี่ยง</button>
            <button class="nav-btn" id="_nbMaps"><i class="fa-solid fa-map"></i> Maps</button>
            <button class="nav-close" id="_nbClose">✕</button>
        </div>`;

    // Bind buttons with addEventListener (reliable, no scope issues)
    document.getElementById('_nbWaypoint').addEventListener('click',_navAddWaypoint);
    document.getElementById('_nbAvoid').addEventListener('click',_showAvoidSettings);
    document.getElementById('_nbMaps').addEventListener('click',_navOpenMaps);
    document.getElementById('_nbClose').addEventListener('click',()=>{clearDirections();showToast('ยกเลิกการนำทาง');});
}

function _navOpenMaps(){
    if(!_navState.dest)return;
    const d=_navState.dest;
    let url=`https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}`;
    if(_navState.waypoints.length){
        url+=`&waypoints=${_navState.waypoints.map(w=>`${w.lat},${w.lng}`).join('|')}`;
    }
    window.open(url,'_blank');
}

let _isAddingWaypoint = false;

function _navAddWaypoint(){
    if(!_navState.active) return;
    _isAddingWaypoint = true;
    showToast('📍 โปรดคลิกบนแผนที่เพื่อเลือกจุดแวะ');
    map.getContainer().style.cursor = 'crosshair';
}

// Add this to your map click handler logic
function _handleMapClickForWaypoint(e) {
    if(!_isAddingWaypoint) return;
    
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    
    _navState.waypoints.push({
        lat: lat,
        lng: lng,
        name: `จุดแวะ ${_navState.waypoints.length + 1}`
    });
    
    _isAddingWaypoint = false;
    map.getContainer().style.cursor = '';
    
    showToast(`📍 เพิ่มจุดแวะเรียบร้อยแล้ว`);
    if(myLatLng) _navReroute(myLatLng.lat, myLatLng.lng);
}


// ── Shared routing helper: Valhalla (primary) → OSRM (fallback) ──
async function _fetchRouteValhalla(points) {
    // points = [[lng,lat], [lng,lat], ...]
    const locations = points.map(p => ({ lon: p[0], lat: p[1] }));
    const body = JSON.stringify({
        locations,
        costing: 'auto',
        costing_options: { auto: { use_highways: 0.2, use_tolls: 0.2 } },
        directions_options: { language: 'th-TH', units: 'kilometers' }
    });
    const res = await fetch('https://valhalla1.openstreetmap.de/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
    });
    if (!res.ok) throw new Error(`Valhalla error ${res.status}`);
    const data = await res.json();
    if (!data.trip) throw new Error('Valhalla: no trip');
    // Convert Valhalla encoded shape → [[lat,lng], ...]
    const coords = _decodePolyline(data.trip.legs[0].shape, 6);
    const dist = data.trip.summary.length * 1000; // km → m
    const dur = data.trip.summary.time;
    return { coords, distance: dist, duration: dur };
}

function _decodePolyline(encoded, precision = 5) {
    let index = 0, lat = 0, lng = 0;
    const coords = [];
    const factor = Math.pow(10, precision);
    while (index < encoded.length) {
        let b, shift = 0, result = 0;
        do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        lat += (result & 1) ? ~(result >> 1) : (result >> 1);
        shift = result = 0;
        do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        lng += (result & 1) ? ~(result >> 1) : (result >> 1);
        coords.push([lat / factor, lng / factor]);
    }
    return coords;
}

async function _navFetchRoute(fromLat, fromLng) {
    // Build & validate points [lng, lat]
    const points = [[fromLng, fromLat]];
    _navState.waypoints.forEach(w => points.push([w.lng, w.lat]));
    points.push([_navState.dest.lng, _navState.dest.lat]);

    const validPoints = points.filter(p =>
        isFinite(p[0]) && isFinite(p[1]) &&
        Math.abs(p[1]) <= 90 && Math.abs(p[0]) <= 180
    );
    const uniquePoints = validPoints.filter((p, i) => {
        if (i === 0) return true;
        const prev = validPoints[i - 1];
        return Math.sqrt(Math.pow(p[0]-prev[0],2)+Math.pow(p[1]-prev[1],2)) > 0.00001;
    });
    if (uniquePoints.length < 2) throw new Error('ตำแหน่งเริ่มต้นและปลายทางอยู่ใกล้กันเกินไป');

    // Try Valhalla first (better local road routing)
    try {
        const result = await _fetchRouteValhalla(uniquePoints);
        return {
            geometry: { coordinates: result.coords.map(c => [c[1], c[0]]) },
            distance: result.distance,
            duration: result.duration,
            _coords: result.coords  // [lat,lng] already
        };
    } catch (valhallaErr) {
        console.warn('[BT] Valhalla failed, falling back to OSRM:', valhallaErr.message);
    }

    // Fallback: OSRM
    const coordStr = uniquePoints.map(c => c[0] + ',' + c[1]).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson&steps=true`;
    const res = await fetch(url);
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `OSRM error ${res.status}`);
    }
    const data = await res.json();
    if (!data.routes || !data.routes.length) throw new Error('ไม่พบเส้นทาง');
    return data.routes[0];
}


async function _navReroute(lat,lng){
    _navState.lastReroute=Date.now();
    try{
        const route=await _navFetchRoute(lat,lng);
        // Valhalla returns _coords as [lat,lng]; OSRM returns geometry.coordinates as [lng,lat]
        const coords = route._coords || route.geometry.coordinates.map(c=>[c[1],c[0]]);
        _navState.routeCoords=coords;
        _navState.totalDist=route.distance;
        _navState.totalDur=route.duration;
        if(_navState.line)map.removeLayer(_navState.line);
        _navState.line=L.polyline(coords,{color:'#1a73e8',weight:5,opacity:0.85}).addTo(map);
        _updateNavBanner();
    }catch(e){
        showToast('❌ ไม่สามารถคำนวณเส้นทางได้ (โปรดเลือกจุดบนถนน)', true);
        if(_navState.waypoints.length > 0) _navState.waypoints.pop();
    }
}

function _distToRoute(lat,lng,routeCoords){
    // Min distance from point to any segment in route
    let minD=Infinity;
    // Sample every ~5th point for performance
    const step=Math.max(1,Math.floor(routeCoords.length/200));
    for(let i=0;i<routeCoords.length;i+=step){
        const d=haversine(lat,lng,routeCoords[i][0],routeCoords[i][1]);
        if(d<minD)minD=d;
    }
    return minD;
}

window.doDirectionsTo = function(idx) {
    const dest = locations[idx];
    if (!dest) { showToast('ไม่พบสถานที่', true); return; }
    closePlaceCard();
    clearDirections();

    if (!navigator.geolocation) {
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}`, '_blank');
        return;
    }

    _navState.dest=dest;
    _navState.active=true;
    _navState.trafficFactor=1.0;
    _navState.waypoints=[];
    // Add destination marker
    _navDestMarker=L.marker([dest.lat,dest.lng]).addTo(map).bindPopup(`🏁 ${dest.name||'ปลายทาง'}`);
    showToast('📍 กำลังหาตำแหน่งและคำนวณเส้นทาง...');

    navigator.geolocation.getCurrentPosition(async pos => {
        const fromLat=pos.coords.latitude, fromLng=pos.coords.longitude;
        myLatLng={lat:fromLat,lng:fromLng};

        try{
            await _navReroute(fromLat,fromLng);
            map.fitBounds(_navState.line.getBounds(),{padding:[80,80]});

            // Start live tracking
            _navState.watchId=navigator.geolocation.watchPosition(p=>{
                const lat=p.coords.latitude, lng=p.coords.longitude;
                myLatLng={lat,lng};

                // Update position marker
                if(!_navState.myMarker){
                    _navState.myMarker=L.circleMarker([lat,lng],{radius:8,color:'#fff',fillColor:'#4285f4',fillOpacity:1,weight:3}).addTo(map);
                }else{
                    _navState.myMarker.setLatLng([lat,lng]);
                }

                // Check arrival
                const distToDest=haversine(lat,lng,dest.lat,dest.lng);
                if(distToDest<ARRIVAL_THRESHOLD){
                    showToast(`🎉 ถึงแล้ว! ${dest.name||'ปลายทาง'}`,false,true);
                    clearDirections();
                    return;
                }

                // Check if off-route → reroute
                if(_navState.routeCoords.length>0){
                    const distOff=_distToRoute(lat,lng,_navState.routeCoords);
                    if(distOff>REROUTE_THRESHOLD && Date.now()-_navState.lastReroute>REROUTE_COOLDOWN){
                        showToast('🔄 ออกนอกเส้นทาง — กำลังหาเส้นทางใหม่...');
                        _navReroute(lat,lng);
                    }
                }

                // Follow user position
                map.panTo([lat,lng],{animate:true,duration:0.5});
            }, err=>console.warn('Nav GPS error:',err), {enableHighAccuracy:true,maximumAge:3000,timeout:10000});

        }catch(e){
            // OSRM failed — open Google Maps for turn-by-turn navigation
            console.warn('[BT] Navigation OSRM failed, opening Google Maps:', e.message);
            _navState.active=false;
            const gmUrl = myLatLng
                ? `https://www.google.com/maps/dir/${myLatLng.lat},${myLatLng.lng}/${dest.lat},${dest.lng}`
                : `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}`;
            window.open(gmUrl, '_blank');
            showToast('เปิด Google Maps เพื่อนำทาง', false, true);
        }
    }, err => {
        console.warn('GPS error:', err);
        showToast('📍 ไม่สามารถหาตำแหน่ง GPS ได้ — เปิด Google Maps',true,false,()=>{
            window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}`, '_blank');
        });
        _navState.active=false;
    }, { enableHighAccuracy: true, timeout: 10000 });
};

// ════════════════════════════════════════════
// ROUTE PLANNING (Smart TSP + Interactive Editor)
// ════════════════════════════════════════════
// routeLine & routeMode hoisted to top of file
let _routeStops=[]; // ordered stops [{lat,lng,name,list,city,...}]
let _routeDist=0, _routeDur=0, _routeUseOSRM=false;

function clearRoute(){
    if(routeLine){map.removeLayer(routeLine);routeLine=null;}
    routeMode=false;
    _routeStops=[];
    document.getElementById('chipRoute').classList.remove('active');
    // Restore sort bar + markers
    document.getElementById('listSortBar').style.display='';
    _lastFilteredKey=null; // force marker re-render
    update();
}

// ── TSP solver: Nearest-Neighbor + 2-opt improvement ──
function _tspSolve(points, startLat, startLng){
    // Nearest-neighbor initial solution
    const remaining=[...points];
    const ordered=[];
    let cLat=startLat, cLng=startLng;
    while(remaining.length>0){
        let bi=0, bd=Infinity;
        for(let i=0;i<remaining.length;i++){
            const d=haversine(cLat,cLng,remaining[i].lat,remaining[i].lng);
            if(d<bd){bd=d;bi=i;}
        }
        const next=remaining.splice(bi,1)[0];
        ordered.push(next);
        cLat=next.lat;cLng=next.lng;
    }
    // 2-opt improvement (up to 50 points for performance)
    if(ordered.length<=50){
        const dist=(a,b)=>haversine(a.lat,a.lng,b.lat,b.lng);
        let improved=true, iter=0;
        while(improved&&iter<500){
            improved=false;iter++;
            for(let i=0;i<ordered.length-1;i++){
                for(let j=i+2;j<ordered.length;j++){
                    const a=i===0?{lat:startLat,lng:startLng}:ordered[i-1];
                    const d1=dist(a,ordered[i])+dist(ordered[j],j+1<ordered.length?ordered[j+1]:{lat:ordered[j].lat,lng:ordered[j].lng});
                    const d2=dist(a,ordered[j])+dist(ordered[i],j+1<ordered.length?ordered[j+1]:{lat:ordered[j].lat,lng:ordered[j].lng});
                    if(d2<d1-0.001){
                        // Reverse segment i..j
                        const seg=ordered.slice(i,j+1).reverse();
                        ordered.splice(i,j-i+1,...seg);
                        improved=true;
                    }
                }
            }
        }
    }
    return ordered;
}

// ── OSRM fetch for route planning (chunked, with avoidance) ──
async function _routeFetchOSRM(waypoints){
    const CHUNK=25;
    const allCoords=[];
    let totalDist=0, totalDur=0;

    // Validate & deduplicate waypoints (prevents OSRM 400)
    const validWaypoints = waypoints.filter(p =>
        Array.isArray(p) && p.length === 2 &&
        isFinite(p[0]) && isFinite(p[1]) &&
        Math.abs(p[1]) <= 90 && Math.abs(p[0]) <= 180
    );
    const dedupedWaypoints = validWaypoints.filter((p, i) => {
        if (i === 0) return true;
        const prev = validWaypoints[i - 1];
        const dist = Math.sqrt(Math.pow(p[0]-prev[0],2) + Math.pow(p[1]-prev[1],2));
        return dist > 0.00001; // ~1 meter threshold
    });
    if (dedupedWaypoints.length < 2) throw new Error('ต้องการอย่างน้อย 2 จุดที่แตกต่างกัน');

    for(let i=0;i<dedupedWaypoints.length-1;i+=CHUNK-1){
        const chunk=dedupedWaypoints.slice(i, Math.min(i+CHUNK, dedupedWaypoints.length));
        if(chunk.length<2)break;
        const coordStr=chunk.map(c=>c[0]+','+c[1]).join(';');
        const url=`https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson${_osrmExcludeParam()}`;
        const res=await fetch(url);
        if(!res.ok){
            let msg = `OSRM error ${res.status}`;
            try { const e=await res.json(); msg=e.message||msg; } catch(_){}
            throw new Error(msg);
        }
        const data=await res.json();
        if(data.routes&&data.routes.length){
            const r=data.routes[0];
            const coords=r.geometry.coordinates.map(c=>[c[1],c[0]]);
            if(allCoords.length&&coords.length)coords.shift();
            allCoords.push(...coords);
            totalDist+=r.distance;
            totalDur+=r.duration;
        }else{throw new Error('OSRM: ไม่พบเส้นทาง (ลองเลือกจุดที่อยู่บนถนน)');}
    }
    return {coords:allCoords,distance:totalDist,duration:totalDur};
}

// ── Draw route on map ──
async function _routeDraw(){
    if(routeLine){map.removeLayer(routeLine);}
    if(_routeStops.length<1)return;
    // Remove normal markers/clusters
    if(map.hasLayer(markerCluster))map.removeLayer(markerCluster);

    const group=L.layerGroup();
    const waypoints=[];
    if(myLatLng)waypoints.push([myLatLng.lng,myLatLng.lat]);
    _routeStops.forEach(l=>waypoints.push([l.lng,l.lat]));

    _routeUseOSRM=false;
    if(waypoints.length<=100){
        try{
            const result=await _routeFetchOSRM(waypoints);
            L.polyline(result.coords,{color:'#4285f4',weight:4,opacity:0.85}).addTo(group);
            _routeDist=result.distance;
            _routeDur=result.duration;
            _routeUseOSRM=true;
        }catch(e){
            console.warn('OSRM route failed:',e.message);
        }
    }

    if(!_routeUseOSRM){
        _routeDist=0;
        const pts=[];
        if(myLatLng){pts.push([myLatLng.lat,myLatLng.lng]);_routeDist+=haversine(myLatLng.lat,myLatLng.lng,_routeStops[0].lat,_routeStops[0].lng);}
        _routeStops.forEach((l,i)=>{
            pts.push([l.lat,l.lng]);
            if(i>0)_routeDist+=haversine(_routeStops[i-1].lat,_routeStops[i-1].lng,l.lat,l.lng);
        });
        L.polyline(pts,{color:'#4285f4',weight:3,opacity:0.8,dashArray:'8,6'}).addTo(group);
        _routeDur=0;
    }

    const allPts=[];
    if(myLatLng)allPts.push([myLatLng.lat,myLatLng.lng]);
    _routeStops.forEach((loc,i)=>{
        allPts.push([loc.lat,loc.lng]);
        L.circleMarker([loc.lat,loc.lng],{radius:10,color:'#fff',fillColor:'#4285f4',fillOpacity:1,weight:2})
            .bindTooltip(String(i+1),{permanent:true,direction:'center',className:'route-number-tooltip'})
            .addTo(group);
    });

    routeLine=group.addTo(map);
    map.fitBounds(L.latLngBounds(allPts),{padding:[60,60]});
    _renderRoutePanel();
}

// ── Inject route panel CSS ──
(function(){const s=document.createElement('style');s.textContent=`
.rp-toolbar{padding:8px 12px;display:flex;gap:6px;flex-wrap:wrap;}
.rp-btn{flex:1;padding:7px 4px;border:1px solid var(--gn);border-radius:8px;background:var(--surface);
  cursor:pointer;font-size:11px;min-width:0;color:var(--text);transition:background .15s;}
.rp-btn:active{background:var(--gn);}
.rp-btn-nav{flex:1;padding:7px 4px;border:none;background:var(--bl);color:#fff;border-radius:8px;
  cursor:pointer;font-size:11px;min-width:0;font-weight:600;}
.rp-btn-nav:active{background:var(--bl);}
.rp-stop{display:flex;align-items:center;gap:6px;padding:8px 4px;border-bottom:1px solid var(--gn);}
.rp-stop-num{font-size:14px;font-weight:700;color:#4285f4;min-width:22px;text-align:center;}
.rp-stop-info{flex:1;min-width:0;}
.rp-stop-name{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.rp-stop-sub{font-size:11px;color:var(--text3);}
.rp-stop-btn{border:none;background:none;cursor:pointer;font-size:14px;padding:4px;color:var(--text);min-width:28px;}
.rp-stop-btn:active{background:var(--gn);border-radius:6px;}
.rp-stop-btn.del{color:#ea4335;}
`;document.head.appendChild(s);})();

// ── Interactive route panel (replaces list panel) ──
function _renderRoutePanel(){
    const lp=document.getElementById('listPanel');
    lp.classList.add('open');
    // Hide sort bar in route mode
    document.getElementById('listSortBar').style.display='none';
    const distText=formatDist(_routeDist);
    const etaMins=_routeUseOSRM?Math.round(_routeDur/60):0;
    const modeText=_routeUseOSRM?'🛣️':'📏';
    const etaText=_routeUseOSRM?` · ~${etaMins} นาที`:'';

    document.getElementById('listPanelTitle').textContent=`${modeText} เส้นทาง ${_routeStops.length} จุด · ${distText}${etaText}`;

    const body=document.getElementById('listBody');
    // Build toolbar
    let html=`<div class="rp-toolbar">
        <button class="rp-btn" data-rp="optimize">🧠 จัดลำดับ</button>
        <button class="rp-btn" data-rp="avoid">⚙️ หลีกเลี่ยง</button>
        <button class="rp-btn" data-rp="add">➕ เพิ่มจุด</button>
        <button class="rp-btn-nav" data-rp="navigate">🧭 นำทาง</button>
    </div><div style="padding:0 8px 8px;">`;

    // Build stop list
    _routeStops.forEach((s,i)=>{
        html+=`<div class="rp-stop">
            <span class="rp-stop-num">${i+1}</span>
            <div class="rp-stop-info">
                <div class="rp-stop-name">${_cleanDMSName(s.name)||s.list||'ไม่มีชื่อ'}</div>
                <div class="rp-stop-sub">${s.list||''}${s.city?' · '+s.city:''}</div>
            </div>
            <button class="rp-stop-btn" data-rp="up" data-idx="${i}" ${i===0?'disabled':''}>▲</button>
            <button class="rp-stop-btn" data-rp="down" data-idx="${i}" ${i===_routeStops.length-1?'disabled':''}>▼</button>
            <button class="rp-stop-btn del" data-rp="remove" data-idx="${i}">✕</button>
        </div>`;
    });
    html+=`</div>`;
    body.innerHTML=html;

    // Bind all buttons via event delegation
    body.addEventListener('click',_routePanelClick);
}

function _routePanelClick(e){
    const btn=e.target.closest('[data-rp]');
    if(!btn)return;
    const action=btn.dataset.rp;
    const idx=parseInt(btn.dataset.idx);
    switch(action){
        case 'optimize':_routeOptimize();break;
        case 'avoid':_showAvoidSettings();break;
        case 'add':_routeAddStop();break;
        case 'navigate':_routeNavigate();break;
        case 'up':_routeMoveStop(idx,-1);break;
        case 'down':_routeMoveStop(idx,1);break;
        case 'remove':_routeRemoveStop(idx);break;
    }
}

// ── Route actions ──
async function _routeOptimize(){
    if(_routeStops.length<3){showToast('ต้องมีอย่างน้อย 3 จุดถึงจะจัดลำดับได้',true);return;}
    showToast('🧠 กำลังคำนวณเส้นทางที่ดีที่สุด...');
    const startLat=myLatLng?myLatLng.lat:_routeStops[0].lat;
    const startLng=myLatLng?myLatLng.lng:_routeStops[0].lng;

    _routeStops=_tspSolve(_routeStops, startLat, startLng);
    await _routeDraw();
    showToast('🧠 จัดลำดับเส้นทางใหม่แล้ว!',false,true);
}

async function _routeMoveStop(idx,dir){
    const newIdx=idx+dir;
    if(newIdx<0||newIdx>=_routeStops.length)return;
    const tmp=_routeStops[idx];
    _routeStops[idx]=_routeStops[newIdx];
    _routeStops[newIdx]=tmp;
    await _routeDraw();
}

async function _routeRemoveStop(idx){
    _routeStops.splice(idx,1);
    if(_routeStops.length<1){clearRoute();closeListPanel();showToast('ล้างเส้นทาง');return;}
    await _routeDraw();
}

function _routeAddStop(){
    const q=prompt('พิมพ์ชื่อสถานที่หรือพิกัด (lat,lng):','');
    if(!q)return;
    const coords=parseLatLng(q);
    if(coords){
        _routeStops.push({lat:coords.lat,lng:coords.lng,name:`จุดกำหนด (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`,list:'',city:''});
        _routeDraw();
        return;
    }
    const matches=locations.filter(l=>(l.name||'').toLowerCase().includes(q.toLowerCase())||l.list.toLowerCase().includes(q.toLowerCase()));
    if(!matches.length){showToast('ไม่พบสถานที่',true);return;}
    if(matches.length===1){
        _routeStops.push(matches[0]);
        _routeDraw();
        showToast(`➕ เพิ่ม "${matches[0].name||matches[0].list}"`);
        return;
    }
    const msg=matches.slice(0,10).map((m,i)=>`${i+1}. ${m.name||m.list}`).join('\n');
    const pick=prompt(`พบ ${matches.length} จุด เลือกเลข:\n${msg}`);
    if(!pick)return;
    const sel=matches[parseInt(pick)-1];
    if(sel){
        _routeStops.push(sel);
        _routeDraw();
        showToast(`➕ เพิ่ม "${sel.name||sel.list}"`);
    }
}

function _routeNavigate(){
    if(!_routeStops.length)return;
    const last=_routeStops[_routeStops.length-1];
    let url=`https://www.google.com/maps/dir/?api=1&destination=${last.lat},${last.lng}`;
    if(_routeStops.length>1){
        const wps=_routeStops.slice(0,-1).map(s=>`${s.lat},${s.lng}`).join('|');
        url+=`&waypoints=${wps}`;
    }
    if(myLatLng)url+=`&origin=${myLatLng.lat},${myLatLng.lng}`;
    window.open(url,'_blank');
}

async function doRoute(){
    const filtered=getFiltered();
    if(filtered.length<2){showToast('ต้องมีอย่างน้อย 2 จุด',true);return;}
    if(filtered.length>500){showToast('มากเกินไป (สูงสุด 500 จุด)',true);return;}

    showToast('🛤️ กำลังวางแผนเส้นทาง...');

    const startLat=myLatLng?myLatLng.lat:filtered[0].lat;
    const startLng=myLatLng?myLatLng.lng:filtered[0].lng;

    _routeStops=_tspSolve(filtered, startLat, startLng);
    routeMode=true;
    document.getElementById('chipRoute').classList.add('active');
    await _routeDraw();
}

const chipRoute=document.getElementById('chipRoute');
if(chipRoute) chipRoute.onclick=(e)=>{
    e.stopPropagation();
    document.querySelectorAll('.chip-dropdown').forEach(d => d.classList.remove('open'));
    if(routeMode){
        clearRoute();
        showToast('🏁 ปิดการนำทาง');
    } else {
        doRoute();
    }
};
async function doMultiRoute(){
    const uniqueLists = [...new Set(locations.map(l => l.list))].filter(l => l);
    if(uniqueLists.length < 1){showToast('ไม่พบรายการข้อมูล',true);return;}
    
    showToast('🗺️ กำลังวางแผนหลายเส้นทาง...');
    clearRoute();
    if(multiRouteLayer) map.removeLayer(multiRouteLayer);
    multiRouteLayer = L.layerGroup().addTo(map);
    multiRouteMode = true;
    document.getElementById('btnPlanMultipleRoutes')?.classList.add('active');

    const colors = ['#4285f4', '#34a853', '#fbbc05', '#ea4335', '#a78bfa', '#ff7f5c', '#2ecc90', '#f5a623'];
    
    for (let i = 0; i < uniqueLists.length; i++) {
        const listName = uniqueLists[i];
        const listPoints = locations.filter(l => l.list === listName);
        if (listPoints.length < 2) continue;

        const color = colors[i % colors.length];
        const stops = _tspSolve(listPoints, listPoints[0].lat, listPoints[0].lng);
        
        const pts = stops.map(l => [l.lat, l.lng]);
        L.polyline(pts, {
            color: color,
            weight: 3,
            opacity: 0.7,
            dashArray: '5, 5'
        }).addTo(multiRouteLayer).bindTooltip(`รายการ: ${listName}`, {sticky: true});
    }
    
    // Hide clusters to show routes clearly
    if(map.hasLayer(markerCluster)) map.removeLayer(markerCluster);
    renderMarkers(); 
}

function clearMultiRoutes(){
    if(multiRouteLayer){ map.removeLayer(multiRouteLayer); multiRouteLayer = null; }
    multiRouteMode = false;
    document.getElementById('btnPlanMultipleRoutes')?.classList.remove('active');
    if(!map.hasLayer(markerCluster)) map.addLayer(markerCluster);
    update();
}

// ════════════════════════════════════════════
// INFO PANEL (kept for compatibility)
// ════════════════════════════════════════════
const infoPanelClose=document.getElementById('infoPanelClose');
const infoPanelBackdrop=document.getElementById('infoPanelBackdrop');
if(infoPanelClose) infoPanelClose.onclick = closeInfo;
if(infoPanelBackdrop) infoPanelBackdrop.onclick = closeInfo;

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
                return `<div style="display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--gn);">
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
            <div style="font-size:28px;font-weight:700;color:var(--bl);margin-bottom:4px;">${locations.length}</div>
            <div style="font-size:13px;color:var(--text3);margin-bottom:20px;">สถานที่ทั้งหมด</div>
            <div class="stats-header">ตามรายการ</div>
            ${sl.map(([n,c])=>`<div class="stats-row"><span class="stats-dot" style="background:${getColor(n)}"></span><span class="stats-name">${n}</span><div class="stats-bar-wrap"><div class="stats-bar" style="width:${c/maxL*100}%;background:${getColor(n)}"></div></div><span class="stats-count">${c}</span></div>`).join('')}
            ${sc.length?`<div class="stats-header" style="margin-top:20px;">ตามเขต</div>${sc.map(([n,c])=>`<div class="stats-row"><span class="stats-dot" style="background:var(--bl)"></span><span class="stats-name">${n}</span><div class="stats-bar-wrap"><div class="stats-bar" style="width:${c/Math.max(...sc.map(x=>x[1]))*100}%"></div></div><span class="stats-count">${c}</span></div>`).join('')}`:''}
        </div>`;
    } else {
        document.getElementById('infoPanelTitle').textContent='BT Locations';
        const _syncAgo=getToken()?` · ${Math.round((Date.now()-_lastSyncTime)/1000)}s ago`:'';
        const _darkLabel=document.body.classList.contains('light')?'🌙 Dark mode':'☀️ Light mode';
        const _trackLabel=trackingActive?'⏹ หยุดบันทึก':'▶ บันทึกเส้นทาง';
        const _menuSection=(title,items)=>`
            <div style="margin-bottom:8px;">
                <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.8px;padding:12px 16px 4px;">${title}</div>
                <div style="background:var(--surface);border-radius:14px;margin:0 12px;overflow:hidden;box-shadow:var(--shadow-sm);">
                    ${items.map(([icon,label,id,cls])=>`
                        <button class="om-item ${cls||''}" id="${id}">
                            <span style="font-size:16px;width:24px;text-align:center;">${icon}</span>
                            <span style="flex:1;font-size:14px;">${label}</span>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="color:var(--text3);opacity:0.4;"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                        </button>
                    `).join('')}
                </div>
            </div>`;
        body.innerHTML=`
            <div style="padding:8px 4px 4px;">
                <div style="padding:16px 16px 8px;display:flex;align-items:center;gap:12px;">
                    <div style="width:44px;height:44px;border-radius:12px;background:var(--bl);display:flex;align-items:center;justify-content:center;">
                        <span style="font-size:22px;color:#fff;">📍</span>
                    </div>
                    <div>
                        <div style="font-size:16px;font-weight:700;color:var(--text);">BT Locations</div>
                        <div style="font-size:12px;color:var(--text3);">${locations.length} สถานที่${_syncAgo}</div>
                    </div>
                </div>
                ${_menuSection('ข้อมูล',[
                    ['🔄','Sync','omSyncM',''],
                    ['📤','Export','omExportM',''],
                    ['📥','Import','omImportM',''],
                    ['📊','สถิติ','omStatsM',''],
                    ['📝','Changelog','omChangelogM',''],
                ])}
                ${_menuSection('เครื่องมือ',[
                    [_darkLabel.split(' ')[0],_darkLabel.split(' ').slice(1).join(' '),'omDarkM',''],
                    ['📍',_trackLabel,'omTrackM',''],
                    ['🗺️','ดูเส้นทาง ('+savedPaths.length+')','omShowPathsM',''],
                    ['📤','Export เส้นทาง','omExportPathsM',''],
                    ['🖼️','Export รูปแผนที่','omExportImgM',''],
                ])}
                ${_menuSection('แก้ไข',[
                    ['↩️','เลิกทำ','omUndoM',''],
                    ['↪️','ทำซ้ำ','omRedoM',''],
                    ['🗑️','ลบที่กรอง','omBulkDelM','red'],
                    ['⚠️','รีเซ็ตข้อมูล','omResetM','red'],
                ])}
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

    onClick('shareBtnDownload', () => {
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
    });

    onClick('shareBtnShare', () => {
        document.getElementById('shareModalOverlay').classList.remove('open');
        if (navigator.share) {
            navigator.share({ title: 'BT Locations', text: jsonStr })
                .then(() => showToast('✅ แชร์แล้ว', false, true))
                .catch(() => showToast('ยกเลิกการแชร์'));
        } else {
            showToast('Browser ไม่รองรับ Share API');
        }
    });

    onClick('shareBtnCopy', () => {
        document.getElementById('shareModalOverlay').classList.remove('open');
        fallbackCopy(jsonStr);
    });

    onClick('shareBtnCancel', () => {
        document.getElementById('shareModalOverlay').classList.remove('open');
    });
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
        pushUndo();const rm=new Set(f);const toDelSb=[...rm];locations=locations.filter(l=>!rm.has(l));saveLocations();invalidateCache();update();showToast(`ลบ ${f.length} จุดแล้ว`);
        if(_sbLoaded)toDelSb.forEach(l=>sbDelete(l));
    });
    closeInfo();
}

async function doReset(){
    showConfirm('🔄','รีเซ็ตข้อมูล?','ข้อมูลที่แก้ไขจะหาย ระบบจะดึงข้อมูลใหม่จาก Supabase',async()=>{
        pushUndo();localStorage.removeItem(STORAGE_KEY);
        await doSync(false);
    });
    closeInfo();
}

function toggleDark(){document.body.classList.toggle('light');const isLight=document.body.classList.contains('light');showToast(isLight?'Light mode':'Dark mode');closeInfo();}

// ════════════════════════════════════════════
// SUPABASE SAVE (replaces GitHub save)
// ════════════════════════════════════════════
function getToken(){return '';}
function setToken(t){}

const btnGithubSave=document.getElementById('btnGithubSave');
if(btnGithubSave) btnGithubSave.onclick=()=>{showToast('⏳ กำลังซิงค์...');_debouncedPush.flush?_debouncedPush.flush():_debouncedPush();};
const tokenCancel=document.getElementById('tokenCancel');
const tokenSave=document.getElementById('tokenSave');
const tokenModalOverlay=document.getElementById('tokenModalOverlay');
if(tokenCancel) tokenCancel.onclick=()=>{if(tokenModalOverlay)tokenModalOverlay.classList.remove('open');};
if(tokenSave) tokenSave.onclick=()=>{if(tokenModalOverlay)tokenModalOverlay.classList.remove('open');};
if(tokenModalOverlay) tokenModalOverlay.onclick=e=>{if(e.target===tokenModalOverlay)tokenModalOverlay.classList.remove('open');};

function _workerHeaders(){return{'Content-Type':'application/json'};}
async function githubFile(path,token){return{sha:null};}
async function githubPut(path,content,sha,token,msg){}

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
const confirmCancel=document.getElementById('confirmCancel');
const confirmOk=document.getElementById('confirmOk');
const confirmModalOverlay=document.getElementById('confirmModalOverlay');
if(confirmCancel) confirmCancel.onclick=()=>{if(confirmModalOverlay)confirmModalOverlay.classList.remove('open');};
if(confirmOk) confirmOk.onclick=()=>{
    if(confirmModalOverlay)confirmModalOverlay.classList.remove('open');
    if(confirmCallback){confirmCallback();confirmCallback=null;}
};
if(confirmModalOverlay) confirmModalOverlay.onclick=e=>{if(e.target===confirmModalOverlay)confirmModalOverlay.classList.remove('open');};

// ════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════
let toastTimer;
function showToast(msg,isError=false,isSuccess=false,onClick=null){
    const t=document.getElementById('saveToast');
    t.textContent=msg;
    t.className='save-toast show'+(isError?' error':isSuccess?' success':'')+(onClick?' clickable':'');
    t.onclick = onClick ? (()=>{ onClick(); t.classList.remove('show'); }) : null;
    t.style.cursor = onClick ? 'pointer' : '';
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>{ t.classList.remove('show'); t.onclick=null; }, onClick?6000:3000);
}

// ════════════════════════════════════════════
// BACKDROP & KEYBOARD
// ════════════════════════════════════════════
function _initMapEvents() {
    if (typeof map === 'undefined' || !map) return;
    
    map.on('click', e => {
        // Waypoint Mode Hook
        if (typeof _handleMapClickForWaypoint === 'function' && _isAddingWaypoint) {
            _handleMapClickForWaypoint(e);
            return;
        }
        const { lat, lng } = e.latlng;
        const editModalOverlay = document.getElementById('editModalOverlay');
        if (editModalOverlay && editModalOverlay.classList.contains('open')) {
            return;
        }
    });

    map.on('click', () => {
        if (!addMode && !measureMode) closePlaceCard();
        closeListPanel();
        clearDirections();
    });
}
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
        clearDirections();
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
    if(listPanel && listPanel.classList.contains('open') &&
       !listPanel.contains(target) &&
       !(searchBar && searchBar.contains(target)) &&
       !target.closest('.chip')){
        closeListPanel();
    }

    // ปิด placeCard เมื่อคลิกนอก (ยกเว้นตอน add/measure mode)
    if(!addMode && !measureMode &&
       placeCard && placeCard.classList.contains('open') &&
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
        }, 400);
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
    }else{
        navigator.clipboard.writeText(url).then(() => showToast('📋 คัดลอกลิงก์แล้ว')).catch(() => {
            prompt('คัดลอกลิงก์:', url);
        });
    }
};

// ════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════
rebuildIndexMap();

// Handle permalink hash: #lat,lng,zoom
(function () {
    const h = location.hash.replace('#', '');
    if (!h) return;
    const parts = h.split(',').map(Number);
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        const lat = parts[0], lng = parts[1], zoom = parts[2] || 17;
        setTimeout(() => {
            map.setView([lat, lng], zoom);
            // Find nearest location within 50m and open its card
            let nearest = null, minD = 50;
            locations.forEach((l, i) => {
                const d = haversine(lat, lng, l.lat, l.lng);
                if (d < minD) { minD = d; nearest = { loc: l, idx: i }; }
            });
            if (nearest) showPlaceCard(nearest.loc, nearest.idx);
        }, 500);
    }
})();

update();

const style=document.createElement('style');
style.textContent=`.bt-tooltip{background:rgba(32,33,36,0.82)!important;color:#fff!important;border:none!important;border-radius:6px!important;padding:3px 8px!important;font-size:11px!important;font-weight:600!important;box-shadow:0 1px 4px rgba(0,0,0,.3)!important;white-space:nowrap!important;font-family:inherit!important;}
.leaflet-marker-icon div { transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1), opacity 0.15s ease !important; }
.leaflet-marker-icon:hover div { transform: scale(1.35) !important; }
.marker-cluster { transition: transform 0.25s cubic-bezier(0.34,1.4,0.64,1), opacity 0.2s ease !important; }
.marker-cluster:hover { transform: scale(1.15) !important; }
.leaflet-cluster-anim .leaflet-marker-icon,
.leaflet-cluster-anim .leaflet-marker-shadow { transition: left 0.3s cubic-bezier(0.4,0,0.2,1), top 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease !important; }
`;
document.head.appendChild(style);

// ════════════════════════════════════════════
// SUPABASE SYNC — load + realtime
// ════════════════════════════════════════════
async function doSync(silent=true){
    if(_syncing)return;
    _syncing=true;
    _setSyncStatus('syncing');
    try{
        // Paginate: Supabase default limit = 1000 rows per request
        let allData=[], from=0, pageSize=1000;
        while(true){
            const {data,error}=await _sb.from('locations').select('*').order('created_at',{ascending:true}).range(from,from+pageSize-1);
            if(error)throw new Error(error.message);
            allData=allData.concat(data);
            if(data.length<pageSize)break;
            from+=pageSize;
        }
        const data=allData;
        const loaded=data.map(r=>normalizeLocation({
            sb_id:r.id, name:r.name||'', lat:r.lat, lng:r.lng,
            list:r.list||'', city:r.city||'', note:r.note||'',
            tags:r.tags?r.tags.split(',').filter(Boolean):[],
            photo:r.photo||'',
            updatedAt:r.updated_at?new Date(r.updated_at).getTime():Date.now(),
        }));
        locations=loaded;
        _clearDirty(); // clear BEFORE writeCache so saveLocations won't re-push
        localStorage.setItem(STORAGE_KEY,JSON.stringify(locations)); // bypass saveLocations
        invalidateCache();update();
        _setSyncStatus('ok');_lastSyncTime=Date.now();
        if(!silent)showToast(`✅ โหลด ${locations.length} จุดจาก Supabase`,false,true);
    }catch(err){
        _setSyncStatus('error');
        if(!silent)showToast('❌ Sync: '+err.message,true);
    }finally{_syncing=false;}
}

function _locKey(l){return l.lat.toFixed(6)+','+l.lng.toFixed(6);}

// Realtime subscription — all 8 users see live changes
function startRealtimeSync(){
    _sb.channel('locations-rt')
        .on('postgres_changes',{event:'INSERT',schema:'public',table:'locations'},payload=>{
            const r=payload.new;
            const exists=locations.find(l=>l.sb_id===r.id);
            if(!exists){
                const loc=normalizeLocation({sb_id:r.id,name:r.name,lat:r.lat,lng:r.lng,list:r.list,city:r.city,note:r.note||'',tags:r.tags?r.tags.split(',').filter(Boolean):[],photo:r.photo||'',updatedAt:r.updated_at?new Date(r.updated_at).getTime():Date.now()});
                locations.push(loc);
                _writeCache();invalidateCache();update();
                showToast(`📍 จุดใหม่: "${r.name||'ไม่มีชื่อ'}"`);
            }
        })
        .on('postgres_changes',{event:'UPDATE',schema:'public',table:'locations'},payload=>{
            const r=payload.new;
            const idx=locations.findIndex(l=>l.sb_id===r.id);
            if(idx>=0){
                const photo=locations[idx].photo;
                locations[idx]=normalizeLocation({sb_id:r.id,name:r.name,lat:r.lat,lng:r.lng,list:r.list,city:r.city,note:r.note||'',tags:r.tags?r.tags.split(',').filter(Boolean):[],photo:photo||r.photo||'',updatedAt:r.updated_at?new Date(r.updated_at).getTime():Date.now()});
                _writeCache();invalidateCache();update();
            }
        })
        .on('postgres_changes',{event:'DELETE',schema:'public',table:'locations'},payload=>{
            const id=payload.old.id;
            locations=locations.filter(l=>l.sb_id!==id);
            _writeCache();invalidateCache();update();
        })
        .subscribe();
}

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


let _visibilityBound = false;
function startAutoSync(){
    startRealtimeSync();
    // Periodic pull every 60s as fallback
    if(_syncTimer)clearInterval(_syncTimer);
    _syncTimer=setInterval(()=>{
        if(document.visibilityState==='visible'&&Date.now()-_lastSyncTime>55000)doSync(true);
    },60000);
    if(!_visibilityBound){
        _visibilityBound=true;
        document.addEventListener('visibilitychange',()=>{
            if(document.visibilityState==='visible'&&Date.now()-_lastSyncTime>15000)doSync(true);
        });
    }
}

// Initial load: Supabase = SINGLE source of truth
(async()=>{
    // Initial load from Supabase (source of truth)
    await doSync(false);
    _sbLoaded = true;
    startAutoSync();
})();

// ════════════════════════════════════════════
// DEBUG MODE
// ════════════════════════════════════════════
window.btDebug = {
    get locations() { return locations; },
    get filtered() { return getFiltered(); },
    get syncSha() { return localStorage.getItem(SYNC_SHA_KEY); },
    get token() { return getToken() ? '✅ set' : '❌ none'; },
    get worker() { return useWorker() ? `✅ ${getWorkerUrl()}` : '❌ not set'; },
    get stats() {
        const lc={};locations.forEach(l=>{lc[l.list]=(lc[l.list]||0)+1;});
        return {total:locations.length,lists:lc,mobile:_mobile,syncing:_syncing,dirty:_isDirty(),lastSync:new Date(_lastSyncTime).toLocaleString(),undoStack:undoStack.length,redoStack:redoStack.length};
    },
    forceSync: ()=>doSync(false),
    clearCache: ()=>{invalidateCache();update();showToast('Cache cleared');},
    exportDebug: ()=>JSON.stringify({locations:locations.length,lists:Object.keys(locations.reduce((a,l)=>(a[l.list]=1,a),{})),sha:localStorage.getItem(SYNC_SHA_KEY),ua:navigator.userAgent,screen:`${screen.width}x${screen.height}`,dpr:devicePixelRatio},null,2),
};
console.log('%c🗺️ BT Locations Debug','font-size:14px;font-weight:bold;','→ window.btDebug');

// Version badge & Update Announcement
(async function showVersion(){
    const container = document.getElementById('dynamicVerInfo');
    if (!container) return;
    
    // 1. Display current app version from code
    container.innerHTML = `<span class="v-text">${APP_VERSION}</span><span class="v-hash" id="dynamicHash">...</span>`;
    
    // 2. Announcement logic (Auto Toast after update)
    const lastVer = localStorage.getItem('bt_last_version');
    if (lastVer && lastVer !== APP_VERSION) {
        showToast(`🚀 อัปเดตแอปเป็น ${APP_VERSION} เรียบร้อย!`, false, 5000);
    }
    localStorage.setItem('bt_last_version', APP_VERSION);

    // 3. Fetch latest commit hash from GitHub (Truly Auto)
    try {
        const resp = await fetch('https://api.github.com/repos/valrinx/bt-locations/commits?per_page=1');
        const data = await resp.json();
        if (data && data[0]) {
            const sha = data[0].sha.substring(0, 7);
            const hashEl = document.getElementById('dynamicHash');
            if (hashEl) hashEl.textContent = sha;
        }
    } catch(e) {
        const hashEl = document.getElementById('dynamicHash');
        if (hashEl) hashEl.textContent = 'online';
    }
})();

// PWA: register service worker + force update
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
        console.log('SW registered:', reg.scope);
        reg.update();
        reg.addEventListener('updatefound', () => {
            const newSW = reg.installing;
            if (!newSW) return;
            newSW.addEventListener('statechange', () => {
                if (newSW.state === 'activated' && navigator.serviceWorker.controller) {
                    console.log('New SW activated, reloading...');
                    window.location.reload();
                }
            });
        });
    }).catch(err => console.warn('SW failed:', err));
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
    });
    // Force SW update check when returning to tab (Android fix)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            navigator.serviceWorker.getRegistration().then(reg => {
                if (reg) reg.update();
            });
        }
    });
}