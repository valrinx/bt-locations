// ════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════
const APP_VERSION = 'v6.9.9';

// Hoisted early — used by renderMarkers before route section loads
let routeLine = null, routeMode = false;
let multiRouteLayer = null, multiRouteMode = false;
let manualRouteMode = false;
let manualRoutePoints = []; // Array of selected points {lat, lng, name}
let manualRouteMarkers = [];
const STORAGE_KEY = 'bt_locations_data';

// ════════════════════════════════════════════
// HIERARCHICAL CLUSTERING (District → List → Markers)
// ════════════════════════════════════════════
let _districtClusterMode = true; // Enable district-based clustering
let _selectedDistrict = null; // Currently selected district for zoom
let _selectedDistrictList = null; // Optional list scoped within selected district
let _districtClusterGroup = null; // Custom cluster layer
let _individualMarkersLayer = null; // Layer for individual markers when zoomed in

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
    
    // Hide mob-chips-row when not in map view
    const mobChipsContainer = document.querySelector('.mob-chips-scroll-container');
    const mobChipsRow = document.getElementById('mobChipsRow');
    const mobSearchRow = document.getElementById('mobSearchRow');
    if(mobChipsContainer) {
        const bodyEl = document.querySelector('.body');
        if(view === 'map') {
            mobChipsContainer.style.setProperty('display', 'flex', 'important');
            if(bodyEl) bodyEl.style.removeProperty('top');
        } else {
            mobChipsContainer.style.setProperty('display', 'none', 'important');
            // Collapse the chips gap so list/stats views start right below topbar
            if(bodyEl) bodyEl.style.setProperty('top', 'calc(var(--topbar-h) + env(safe-area-inset-top, 0px))', 'important');
        }
    }
    
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
    document.getElementById('mn-menu')?.classList.add('on');
    _renderMobDrawer();
}
function closeMobDrawer(){
    const drawer = document.getElementById('mobDrawer');
    if(drawer) drawer.classList.remove('show');
    document.getElementById('mn-menu')?.classList.remove('on');
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
        listHtml += `<div class="fi ${filterList===name?'on':''}" onclick="setFilterList('${name.replace(/'/g,"\\'")}');closeMobDrawer()"><div class="fdot" style="background:${col}"></div><span class="fn">${name}</span><span class="fc">${count}</span><button class="fl-edit" onclick="event.stopPropagation();closeMobDrawer();openEditGroup('list','${name.replace(/'/g,"\\'")}')"><i class="fa-solid fa-pen"></i></button></div>`;
    });
    listContainer.innerHTML = listHtml;
    
    // Cities
    const cc={}; locations.forEach(l=>{if(l.city)cc[l.city]=(cc[l.city]||0)+1;});
    const cities = Object.entries(cc).sort((a,b)=>b[1]-a[1]);
    let cityHtml = '';
    cities.forEach(([name,count],i)=>{
        const col=colorPalette[i % colorPalette.length];
        cityHtml += `<div class="ci ${filterCity===name?'on':''}" onclick="setFilterCity('${name.replace(/'/g,"\\'")}');closeMobDrawer()"><div class="cpip" style="background:${col}"></div><span class="cn">${name}</span><span class="cc">${count}</span><button class="fl-edit" onclick="event.stopPropagation();closeMobDrawer();openEditGroup('city','${name.replace(/'/g,"\\'")}')"><i class="fa-solid fa-pen"></i></button></div>`;
    });
    cityContainer.innerHTML = cityHtml;
}

function _renderSidebar(){
    const listContainer = document.getElementById('listContainer');
    const cityContainer = document.getElementById('cityContainer');
    if(!listContainer || !cityContainer) { _renderMobDrawer(); return; }
    
    const listCounts = {};
    const cityCounts = {};
    locations.forEach(l => {
        if (l.list) listCounts[l.list] = (listCounts[l.list] || 0) + 1;
        if (l.city) cityCounts[l.city] = (cityCounts[l.city] || 0) + 1;
    });
    const lists = Object.keys(listCounts).sort();
    const cities = Object.keys(cityCounts).sort();
    
    listContainer.innerHTML = lists.map(name =>
        `<div class="flist-item${filterList===name?' active':''}" onclick="setFilterList('${name.replace(/'/g,"\\'")}')">
            <span class="fl-dot" style="background:${getColor(name)}"></span>
            <span class="fl-name">${name}</span>
            <span class="fl-count">${listCounts[name]}</span>
            <button class="fl-edit" title="แก้ไข" onclick="event.stopPropagation();openEditGroup('list','${name.replace(/'/g,"\\'")}')"><i class='fa-solid fa-pen'></i></button>
        </div>`
    ).join('');
    
    cityContainer.innerHTML = cities.map(name =>
        `<div class="clist-item${filterCity===name?' active':''}" onclick="setFilterCity('${name.replace(/'/g,"\\'")}')">
            <span class="fl-name">${name}</span>
            <span class="fl-count">${cityCounts[name]}</span>
            <button class="fl-edit" title="แก้ไข" onclick="event.stopPropagation();openEditGroup('city','${name.replace(/'/g,"\\'")}')"><i class='fa-solid fa-pen'></i></button>
        </div>`
    ).join('');
    
    _renderMobDrawer();
}
// Filter setters for mobile
function setFilterList(name){
    try {
        console.log(`[FILTER] Setting filter list to: "${name}"`);
        filterList = name;
        filterCity = '';
        _lastFilteredKey = null;
        // Force clear any search query when changing filter
        const searchInput = document.getElementById('search');
        if(searchInput) searchInput.value = '';
        update();
        _renderSidebar();
        _updateMobChips();
        console.log(`[FILTER] After update: filterList="${filterList}", locations count=${locations.length}, filtered count=${getFiltered().length}`);
    } catch(err) {
        console.error('[FILTER] Error in setFilterList:', err);
        showToast('เกิดข้อผิดพลาดในการกรองข้อมูล', true);
    }
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

// ── Edit group (list or city): rename / delete ──
let _editGroupType = '', _editGroupOldName = '';
function openEditGroup(type, name){
    _editGroupType = type;
    _editGroupOldName = name;
    const label = type === 'list' ? 'รายการ' : 'เมือง/เขต';
    const count = locations.filter(l => type==='list' ? l.list===name : l.city===name).length;
    const titleEl = document.getElementById('editGroupTitle');
    if(titleEl){ const span = titleEl.querySelector('span'); if(span) span.textContent = `แก้ไข${label}: ${name} (${count} จุด)`; }
    document.getElementById('editGroupInput').value = name;
    // Show danger zone only for list type
    const wrap = document.getElementById('editGroupDeleteAllWrap');
    if(wrap) wrap.style.display = type==='list' ? '' : 'none';
    document.getElementById('editGroupModalOverlay').classList.add('open');
    setTimeout(()=>document.getElementById('editGroupInput').select(), 100);
}
document.getElementById('editGroupCancel').onclick = () =>
    document.getElementById('editGroupModalOverlay').classList.remove('open');
document.getElementById('editGroupModalOverlay').onclick = e => {
    if(e.target === document.getElementById('editGroupModalOverlay'))
        document.getElementById('editGroupModalOverlay').classList.remove('open');
};
document.getElementById('editGroupSave').onclick = () => {
    const newName = document.getElementById('editGroupInput').value.trim();
    if(!newName){ showToast('กรุณากรอกชื่อ', true); return; }
    if(newName === _editGroupOldName){ document.getElementById('editGroupModalOverlay').classList.remove('open'); return; }
    pushUndo();
    locations.forEach(l => {
        if(_editGroupType==='list' && l.list===_editGroupOldName){ l.list=newName; if(_sbLoaded)sbUpdate(l); }
        else if(_editGroupType==='city' && l.city===_editGroupOldName){ l.city=newName; if(_sbLoaded)sbUpdate(l); }
    });
    if(filterList===_editGroupOldName && _editGroupType==='list') filterList=newName;
    if(filterCity===_editGroupOldName && _editGroupType==='city') filterCity=newName;
    saveLocations(); invalidateCache(); update(); _renderSidebar();
    document.getElementById('editGroupModalOverlay').classList.remove('open');
    showToast(`เปลี่ยนชื่อเป็น "${newName}" แล้ว`, false, true);
};
document.getElementById('editGroupDelete').onclick = () => {
    const label = _editGroupType==='list' ? 'รายการ' : 'เมือง/เขต';
    const count = locations.filter(l => _editGroupType==='list' ? l.list===_editGroupOldName : l.city===_editGroupOldName).length;
    document.getElementById('editGroupModalOverlay').classList.remove('open');
    showConfirm('delete', `ลบ${label} "${_editGroupOldName}"?`,
        `จุด ${count} จุดจะถูกย้ายไปใส่ "ยังไม่บันทึก"`,
        () => {
            pushUndo();
            locations.forEach(l => {
                if(_editGroupType==='list' && l.list===_editGroupOldName){
                    l.list='ยังไม่บันทึก'; if(_sbLoaded)sbUpdate(l);
                } else if(_editGroupType==='city' && l.city===_editGroupOldName){
                    l.city=''; if(_sbLoaded)sbUpdate(l);
                }
            });
            if(filterList===_editGroupOldName && _editGroupType==='list') filterList='';
            if(filterCity===_editGroupOldName && _editGroupType==='city') filterCity='';
            saveLocations(); invalidateCache(); update(); _renderSidebar();
            showToast(`ลบ${label} "${_editGroupOldName}" แล้ว`, false, true);
        }
    );
};
document.getElementById('editGroupDeleteAll').onclick = () => {
    const count = locations.filter(l => l.list===_editGroupOldName).length;
    document.getElementById('editGroupModalOverlay').classList.remove('open');
    showConfirm('delete', `ลบหมุด ${count} จุดใน "${_editGroupOldName}"?`,
        'หมุดทั้งหมดใน List นี้จะถูกลบออกจากระบบถาวร',
        async () => {
            pushUndo();
            const toDelete = locations.filter(l => l.list===_editGroupOldName);
            locations = locations.filter(l => l.list!==_editGroupOldName);
            _clearSearchMarkerIfDeleted(toDelete);
            if(filterList===_editGroupOldName) filterList='';
            saveLocations(); invalidateCache(); update(); _renderSidebar();
            showToast(`ลบ ${toDelete.length} จุดแล้ว`, true);
            if(_sbLoaded){ for(const l of toDelete) await sbDelete(l); }
        }
    );
};

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
// Removed duplicate chip click handlers

// Mobile search sync
document.getElementById('mobSearchInput')?.addEventListener('input', debounce((e)=>{
    const si = document.getElementById('search');
    if(si) si.value = e.target.value;
    if(!e.target.value.trim()) _clearSearchMarker();
    renderSearchResults();
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
onClick('btnUpload', () => protectedDataAction('export'));
onClick('btnImportData', () => protectedDataAction('importModal'));

// Import modal functions
window.openImportModal = function(){
    const modal = document.getElementById('importModalOverlay');
    if(modal) modal.classList.add('open');
    const jsonText = document.getElementById('importJsonText');
    if(jsonText) jsonText.value = '';
    const url = document.getElementById('importUrl');
    if(url) url.value = '';
};
window.closeImportModal = function(){
    const modal = document.getElementById('importModalOverlay');
    if(modal) modal.classList.remove('open');
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
        const prepared = prepareImportedLocations(data);
        data = prepared.items;
        if(!data.length){
            showToast('❌ ไม่มีพิกัดที่ผ่านการตรวจสอบ', true);
            return;
        }
        pushUndo();
        locations = data;
        saveLocations();
        invalidateCache();
        update();
        closeImportModal();
        showToast(`✅ นำเข้า ${locations.length} จุด${formatImportReport(prepared.report)}`, false, true);
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
let _trackLine = null, _savedPathsLayer = null;

function _trackDistance(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        total += haversine(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
    }
    return total;
}

function _formatTrackDistance(meters) {
    return meters >= 1000 ? `${(meters / 1000).toFixed(2)} กม.` : `${Math.round(meters)} ม.`;
}

function _persistSavedPaths() {
    localStorage.setItem(TRACKING_KEY, JSON.stringify(savedPaths));
}

function _ensureSavedPathsLayer() {
    if (!_savedPathsLayer) _savedPathsLayer = L.layerGroup().addTo(map);
    return _savedPathsLayer;
}

function _clearLiveTrackLine() {
    if (_trackLine) {
        map.removeLayer(_trackLine);
        _trackLine = null;
    }
}

function startTracking() {
    if (!navigator.geolocation) { showToast('GPS ไม่รองรับ'); return; }
    if (trackingActive) { showToast('กำลังบันทึกเส้นทางอยู่แล้ว'); return; }
    trackingActive = true;
    _currentTrack = [];
    _clearLiveTrackLine();
    _trackLine = L.polyline([], {
        color: '#2ecc90',
        weight: 5,
        opacity: 0.88,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(map);
    _trackWatchId = navigator.geolocation.watchPosition(pos => {
        const { latitude: lat, longitude: lng, accuracy, speed } = pos.coords;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        const prev = _currentTrack[_currentTrack.length - 1];
        if (prev) {
            const moved = haversine(prev.lat, prev.lng, lat, lng);
            if (moved < 1.5 && accuracy > 25) return;
        }
        const point = { lat, lng, accuracy: Math.round(accuracy || 0), speed: speed || null, t: Date.now() };
        _currentTrack.push(point);
        if (_trackLine) _trackLine.setLatLngs(_currentTrack.map(pt => [pt.lat, pt.lng]));
        if (_currentTrack.length === 1) map.panTo([lat, lng], { animate: true, duration: 0.35 });
    }, err => {
        console.warn('Track error:', err);
        if (!_currentTrack.length || err.code === err.PERMISSION_DENIED) {
            if (_trackWatchId !== null) navigator.geolocation.clearWatch(_trackWatchId);
            _trackWatchId = null;
            trackingActive = false;
            _clearLiveTrackLine();
        }
        showToast('อ่าน GPS สำหรับ Track ไม่ได้', true);
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 1200 });
    showToast('▶ เริ่มบันทึกเส้นทาง');
}
function stopTracking() {
    if (_trackWatchId !== null) navigator.geolocation.clearWatch(_trackWatchId);
    _trackWatchId = null;
    trackingActive = false;
    if (_currentTrack.length > 1) {
        const distance = _trackDistance(_currentTrack);
        savedPaths.push({ points: _currentTrack, date: Date.now(), distance });
        _persistSavedPaths();
        showToast(`⏹ บันทึก ${_currentTrack.length} จุด · ${_formatTrackDistance(distance)}`);
    } else {
        showToast('⏹ หยุดบันทึก (ไม่มีจุด)');
        _clearLiveTrackLine();
    }
    _currentTrack = [];
}
function toggleTracking() {
    if (trackingActive) stopTracking();
    else startTracking();
}
function showSavedPaths() {
    if (!savedPaths.length) { showToast('ไม่มีเส้นทางที่บันทึก'); return; }
    const layer = _ensureSavedPathsLayer();
    layer.clearLayers();
    const bounds = [];
    savedPaths.forEach((p, i) => {
        const latlngs = p.points.map(pt => [pt.lat, pt.lng]);
        bounds.push(...latlngs);
        L.polyline(latlngs, {
            color: i === savedPaths.length - 1 ? '#5b8fff' : '#8a8aaa',
            weight: i === savedPaths.length - 1 ? 5 : 3,
            opacity: i === savedPaths.length - 1 ? 0.86 : 0.5,
            lineCap: 'round',
            lineJoin: 'round'
        }).bindTooltip(`${new Date(p.date).toLocaleString('th-TH')} · ${_formatTrackDistance(p.distance || _trackDistance(p.points))}`, {
            sticky: true,
            className: 'bt-tooltip'
        }).addTo(layer);
    });
    if (bounds.length) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 17, animate: true });
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

// Global IP storage
let _currentIP = 'unknown';
function getDeviceSummary(ua = navigator.userAgent) {
    const os = /Android/i.test(ua) ? 'Android'
        : /iPhone|iPad|iPod/i.test(ua) ? 'iOS'
        : /Windows/i.test(ua) ? 'Windows'
        : /Mac OS X|Macintosh/i.test(ua) ? 'macOS'
        : /Linux/i.test(ua) ? 'Linux'
        : 'Unknown OS';
    const browser = /Edg\//i.test(ua) ? 'Edge'
        : /OPR\//i.test(ua) ? 'Opera'
        : /CriOS|Chrome\//i.test(ua) ? 'Chrome'
        : /FxiOS|Firefox\//i.test(ua) ? 'Firefox'
        : /Safari\//i.test(ua) ? 'Safari'
        : 'Browser';
    const form = /Mobile|Android|iPhone|iPod/i.test(ua) ? 'Mobile'
        : /iPad|Tablet/i.test(ua) ? 'Tablet'
        : 'Desktop';
    return `${form} · ${os} · ${browser}`;
}
let _currentDevice = getDeviceSummary();

window.getChangelog = function(){try{return JSON.parse(localStorage.getItem(CHANGELOG_KEY)||'[]');}catch{return[];}}
function addChangelogEntry(action, loc, changes = null){
    const log=window.getChangelog();
    const username = localStorage.getItem('bt_username') || 'anonymous';
    const device = _currentDevice;
    const ip = _currentIP;
    
    // Build detailed description based on action
    let details = '';
    if (action === 'add') {
        details = `เพิ่มจุดใหม่: ${loc.name} (${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)})`;
    } else if (action === 'edit') {
        if (changes) {
            const changeList = Object.entries(changes).map(([k, v]) => `${k}: ${v.old} → ${v.new}`).join(', ');
            details = `แก้ไข ${loc.name}: ${changeList}`;
        } else {
            details = `แก้ไขข้อมูล ${loc.name}`;
        }
    } else if (action === 'delete') {
        details = `ลบจุด: ${loc.name} (${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)})`;
    }
    
    log.unshift({
        t: Date.now(),
        a: action,
        n: loc.name || '',
        lat: loc.lat,
        lng: loc.lng,
        list: loc.list || '',
        city: loc.city || '',
        note: loc.note || '',
        tags: Array.isArray(loc.tags) ? loc.tags : [],
        user: username,
        device: device,
        ip: ip,
        details: details,
        changes: changes
    });
    if(log.length>MAX_CHANGELOG)log.length=MAX_CHANGELOG;
    localStorage.setItem(CHANGELOG_KEY,JSON.stringify(log));
}

function normalizeLocation(l) {
    return {
        ...(l.sb_id || l.id ? { sb_id: l.sb_id || l.id } : {}),
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

const DATA_SCHEMA_VERSION = 1;
const THAILAND_BOUNDS = { minLat: 5.5, maxLat: 20.5, minLng: 97.0, maxLng: 106.5 };

function _looksLikeCoordinateName(value) {
    return /^\s*-?\d{1,2}\.\d+\s*,\s*-?\d{2,3}\.\d+\s*$/.test(String(value || ''));
}

function isInThailandBounds(loc) {
    const lat = Number(loc.lat), lng = Number(loc.lng);
    return lat >= THAILAND_BOUNDS.minLat && lat <= THAILAND_BOUNDS.maxLat &&
        lng >= THAILAND_BOUNDS.minLng && lng <= THAILAND_BOUNDS.maxLng;
}

function getDataQualityReport(data = locations) {
    const coordCounts = new Map();
    const keyFor = l => `${Number(l.lat).toFixed(6)},${Number(l.lng).toFixed(6)}`;
    data.forEach(l => {
        if (Number.isFinite(Number(l.lat)) && Number.isFinite(Number(l.lng))) {
            const key = keyFor(l);
            coordCounts.set(key, (coordCounts.get(key) || 0) + 1);
        }
    });
    const duplicateGroups = [...coordCounts.values()].filter(count => count > 1);
    const suspiciousLabels = data
        .filter(l => /^[ูุู]/.test(l.list || '') || ((l.city || '').includes('(') && !(l.city || '').includes(')')))
        .slice(0, 10)
        .map(l => ({ name: l.name || '', list: l.list || '', city: l.city || '', lat: l.lat, lng: l.lng }));
    return {
        total: data.length,
        invalidCoordinates: data.filter(l => !Number.isFinite(Number(l.lat)) || !Number.isFinite(Number(l.lng))).length,
        outOfThailandBounds: data.filter(l => Number.isFinite(Number(l.lat)) && Number.isFinite(Number(l.lng)) && !isInThailandBounds(l)).length,
        emptyNames: data.filter(l => !String(l.name || '').trim()).length,
        coordinateNames: data.filter(l => _looksLikeCoordinateName(l.name)).length,
        duplicateCoordinateGroups: duplicateGroups.length,
        duplicateCoordinatePoints: duplicateGroups.reduce((sum, count) => sum + count, 0),
        suspiciousLabels
    };
}

let locations = (() => {
    try { 
        const s = localStorage.getItem(STORAGE_KEY); 
        if (!s) return [];
        const raw = JSON.parse(s); 
        return raw.map(normalizeLocation); 
    }
    catch(e) { 
        console.error('Failed to load locations:', e);
        return []; // Return empty array as safe fallback
    }
})();

function loadDefaultLocationsScript() {
    if (typeof DEFAULT_LOCATIONS !== 'undefined') return Promise.resolve(true);
    return new Promise(resolve => {
        const script = document.createElement('script');
        script.src = `locations.js?v=${encodeURIComponent(APP_VERSION)}`;
        script.onload = () => resolve(typeof DEFAULT_LOCATIONS !== 'undefined');
        script.onerror = () => {
            console.warn('[BT] locations.js fallback failed to load');
            resolve(false);
        };
        document.head.appendChild(script);
    });
}

async function ensureDefaultLocationsLoaded() {
    if (locations.length > 0) return;
    const loaded = await loadDefaultLocationsScript();
    if (!loaded || typeof DEFAULT_LOCATIONS === 'undefined' || !Array.isArray(DEFAULT_LOCATIONS)) return;
    locations = JSON.parse(JSON.stringify(DEFAULT_LOCATIONS)).map(normalizeLocation);
    cleanLoadedLocationNames(false);
    rebuildIndexMap();
}

function cleanLoadedLocationNames(persist = true) {
    if(!Array.isArray(locations) || locations.length === 0) return;
    let dirty=false;
    locations.forEach(l=>{
        if(!l || !l.name) return;
        const c=_cleanDMSName(l.name);
        if(c!==l.name){l.name=c||'';dirty=true;}
    });
    if(dirty && persist){localStorage.setItem(STORAGE_KEY,JSON.stringify(locations));}
}

// Auto-clean DMS names from localStorage data on load
cleanLoadedLocationNames();

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
let gpsMode = 'off';
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

function saveToStorage() {
    _writeCache();
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
    const {data,error}=await _sb.from('locations').insert(_locRow(loc)).select('id').single();
    if(error){console.warn('sbInsert failed:',error.message);_setSyncStatus('error');return false;}
    if(data && data.id)loc.sb_id=data.id;
    _writeCache();
    return true;
    // Realtime INSERT event will add to locations[] and render
}
async function sbUpdate(loc){
    if(!loc.sb_id)return await sbInsert(loc);
    const {error}=await _sb.from('locations').update(_locRow(loc)).eq('id',loc.sb_id);
    if(error){console.warn('sbUpdate failed:',error.message);_setSyncStatus('error');return false;}
    _writeCache();
    return true;
    // Realtime UPDATE event will update locations[] and render
}
async function sbDelete(loc){
    if(!loc.sb_id)return;
    const {error}=await _sb.from('locations').delete().eq('id',loc.sb_id);
    if(error){console.warn('sbDelete failed:',error.message);_setSyncStatus('error');return false;}
    return true;
    // Realtime DELETE event will remove from locations[] and render
}
async function sbBulkUpdate(locs){
    for(const loc of locs){await sbUpdate(loc);}
}

let _sbLoaded = false;
function saveLocations() {
    if (!_validateBeforeSave()) return;
    _markDirty();
    _writeCache(); // localStorage only — Supabase push done via sbInsert/sbUpdate/sbDelete
}

// ── index map: O(1) lookup แทน locations.indexOf() O(n) ──
let _locIndexMap = new Map();
function rebuildIndexMap() { _locIndexMap = new Map(locations.map((l, i) => [l, i])); }
function getLocIndex(loc) { return _locIndexMap.has(loc) ? _locIndexMap.get(loc) : locations.indexOf(loc); }

// ── custom autocomplete for modalList / modalCity ──
let _datalistDirty = true;
function markDatalistDirty() { _datalistDirty = true; }
function _setupAC(inputId, dropId, getItems) {
    const inp = document.getElementById(inputId);
    const drop = document.getElementById(dropId);
    if (!inp || !drop) return;
    function showDrop(val) {
        const all = getItems();
        const q = val.toLowerCase();
        const filtered = q ? all.filter(s => s.toLowerCase().includes(q)) : all;
        if (!filtered.length) { drop.classList.remove('open'); return; }
        drop.innerHTML = filtered.slice(0, 30).map(s =>
            `<div class="ac-option" data-val="${_escapeHtml(s)}">${_escapeHtml(s)}</div>`
        ).join('');
        drop.classList.add('open');
        drop.querySelectorAll('.ac-option').forEach(el => {
            el.addEventListener('mousedown', e => {
                e.preventDefault();
                inp.value = el.dataset.val;
                drop.classList.remove('open');
                inp.dispatchEvent(new Event('change'));
            });
        });
    }
    inp.addEventListener('focus', () => showDrop(inp.value));
    inp.addEventListener('input', () => showDrop(inp.value));
    inp.addEventListener('blur', () => setTimeout(() => drop.classList.remove('open'), 150));
}
function _renderDatalistOptions(items) {
    return [...new Set(items.filter(Boolean))]
        .sort()
        .map(item => `<option value="${_escapeHtml(item)}"></option>`)
        .join('');
}

function pushUndo() { undoStack.push(JSON.stringify(locations)); if (undoStack.length > MAX_UNDO) undoStack.shift(); redoStack.length = 0; }

// ════════════════════════════════════════════
// MAP
// ════════════════════════════════════════════
const _mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    window.innerWidth < 768 ||
    localStorage.getItem('bt_force_mobile_mode') === 'true' ||
    document.body.classList.contains('force-mobile');
if (_mobile) document.documentElement.classList.add('is-mobile-map');
const map = L.map('map', {
    zoomControl: false,
    zoomAnimation: !_mobile,   // ปิดบน mobile เพื่อ performance
    fadeAnimation: !_mobile,   // ปิดบน mobile
    markerZoomAnimation: !_mobile,
    inertia: !_mobile,
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
window.map = map;

const _tileOpts = {
    updateWhenIdle: false,
updateWhenZooming: true,
keepBuffer: 4,
};
const tileLayers = {
'Street': L.tileLayer('https://maps.hereapi.com/v3/base/mc/{z}/{x}/{y}/png?style=explore.day&apiKey=YOUR_KEY', {
    attribution: '© HERE',
    maxZoom: 20,
    ..._tileOpts
}),
    'Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri', maxZoom: 19, ..._tileOpts }),
    'Terrain':   L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { attribution: '© OpenTopoMap', maxZoom: 17, ..._tileOpts }),
    'Dark':      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '© CartoDB', maxZoom: 19, ..._tileOpts })
};
const tileNames = Object.keys(tileLayers);
let currentTileIdx = 0;
tileLayers[tileNames[0]].addTo(map);

// ════════════════════════════════════════════
// MARKER SYSTEM (District-based Hierarchical Clustering)
// ════════════════════════════════════════════
let currentMarkers = [], heatLayer = null;
const colorPalette = ['#ea4335','#fbbc04','#34a853','#4285f4','#9334e6','#00897b','#e91e63','#ff6d00','#0097a7','#795548'];
const listColors = {};
function getColor(list) {
    if (!listColors[list]) {
        // Generate distinct HSL color based on list name hash
        let hash = 0;
        for (let i = 0; i < list.length; i++) {
            hash = list.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        // Use golden angle approximation for better color distribution
        // This ensures colors are spread evenly around the color wheel
        const goldenAngle = 137.508; // degrees
        const hue = Math.floor((Math.abs(hash) * goldenAngle) % 360);
        
        // Alternate between light and dark variations for more contrast
        const variant = Math.abs(hash >> 8) % 4;
        let sat, light;
        switch(variant) {
            case 0: sat = 85; light = 55; break; // bright
            case 1: sat = 75; light = 45; break; // medium-dark
            case 2: sat = 90; light = 65; break; // light pastel
            case 3: sat = 65; light = 40; break; // dark muted
        }
        
        listColors[list] = `hsl(${hue}, ${sat}%, ${light}%)`;
    }
    return listColors[list];
}
function haversine(lat1, lng1, lat2, lng2) {
    const R=6371000, p1=lat1*Math.PI/180, p2=lat2*Math.PI/180, dp=(lat2-lat1)*Math.PI/180, dl=(lng2-lng1)*Math.PI/180;
    const a=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function formatDist(m) { return m>=1000?`${(m/1000).toFixed(1)} กม.`:`${Math.round(m)} ม.`; }

function _escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[ch]);
}

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
const DISTRICT_CLUSTER_MAX_ZOOM = 13;
const MARKER_VIEWPORT_PAD = _mobile ? 0 : 0.08;
const STACK_PROXIMITY_PRECISION = 5; // decimal places for duplicate detection
const MAX_VIEWPORT_MARKERS_DESKTOP = 500;
const MAX_VIEWPORT_MARKERS_MOBILE = 220;
let _lastMarkerRenderMode = null;
let _tooltipPermanentState = null;
let _visibleMarkerIdxs = new Set();
let _mobileZoomRestoreTimer = null;
let _lastMarkerRenderMs = 0;
let _lastFullUpdateMs = 0;
let _lastMapOnlyUpdateMs = 0;
let _lastUpdateKind = 'init';
let _mapOnlyUpdateRaf = null;
let _pendingMapOnlyReason = '';
let _mapDebugOverlayEnabled = localStorage.getItem('bt_map_debug_overlay') === '1';
let _mapDebugOverlay = null;

function _getDistrictName(loc) {
    return loc.district || loc.city || loc.list || 'ไม่ระบุเขต';
}

function _getMarkerColor(loc) {
    return getLocTagColor(loc) || getColor(loc.list || 'ไม่ระบุ');
}

function _getMarkerRenderMode() {
    if (routeMode) return 'route';
    if (heatmapMode) return `heat:${map.getZoom()}`;
    if (manualRouteMode) return 'manual';
    if (_selectedDistrict) return 'district-detail';
    return map.getZoom() <= DISTRICT_CLUSTER_MAX_ZOOM ? 'district-clusters' : 'points';
}

function _getViewportKey() {
    if (!map || !map.getBounds) return 'no-map';
    const b = map.getBounds().pad(MARKER_VIEWPORT_PAD);
    const z = map.getZoom();
    return [
        z,
        b.getSouth().toFixed(3),
        b.getWest().toFixed(3),
        b.getNorth().toFixed(3),
        b.getEast().toFixed(3)
    ].join(':');
}

function _filterToViewport(items) {
    if (!map || !map.getBounds || map.getZoom() <= DISTRICT_CLUSTER_MAX_ZOOM) return items;
    const b = map.getBounds().pad(MARKER_VIEWPORT_PAD);
    return items.filter(l => b.contains([l.lat, l.lng]));
}

function _getMobileMarkerLimit() {
    if (!_mobile) return Infinity;
    const zoom = map.getZoom();
    if (zoom <= 14) return 140;
    if (zoom <= 15) return 260;
    if (zoom <= 16) return 420;
    return 650;
}

function _limitMobileMarkers(items) {
    const limit = _getMobileMarkerLimit();
    if (!_mobile || items.length <= limit) return items;
    const center = map.getCenter();
    const ranked = items.map(loc => {
        const dx = loc.lat - center.lat;
        const dy = (loc.lng - center.lng) * Math.cos(center.lat * Math.PI / 180);
        return { loc, d: dx * dx + dy * dy };
    });
    ranked.sort((a, b) => a.d - b.d);
    return ranked.slice(0, limit).map(item => item.loc);
}

function _updateMobileMarkerLabels(count) {
    if (!_mobile) return;
    const mapEl = map.getContainer();
    const canShow = map.getZoom() >= 14 && count <= 90 && !mapEl.classList.contains('is-gesture-zooming');
    mapEl.classList.toggle('show-mobile-marker-labels', canShow);
}

function _ensureMapDebugOverlay() {
    if (_mapDebugOverlay && !_mapDebugOverlay.isConnected) _mapDebugOverlay = null;
    if (_mapDebugOverlay || !_mapDebugOverlayEnabled) return _mapDebugOverlay;
    const el = document.createElement('div');
    el.id = 'mapDebugOverlay';
    el.style.cssText = 'position:absolute;left:10px;bottom:calc(var(--mob-above-nav, 0px) + 10px);z-index:1400;display:grid;grid-template-columns:auto auto;gap:3px 10px;padding:8px 10px;border-radius:10px;background:rgba(9,13,20,0.9);border:1px solid rgba(91,143,255,0.35);box-shadow:0 8px 24px rgba(0,0,0,0.42);color:var(--tx);font:700 10px/1.25 monospace;pointer-events:none;backdrop-filter:blur(6px);transform:translateZ(0);';
    map.getContainer().appendChild(el);
    _mapDebugOverlay = el;
    return el;
}

function _updateMapDebugOverlay() {
    if (!_mapDebugOverlayEnabled) {
        if (_mapDebugOverlay) {
            _mapDebugOverlay.remove();
            _mapDebugOverlay = null;
        }
        return;
    }
    const el = _ensureMapDebugOverlay();
    if (!el) return;
    const stats = {
        zoom: map.getZoom(),
        mode: _getMarkerRenderMode(),
        visible: _visibleMarkerIdxs.size,
        layer: _individualMarkersLayer ? _individualMarkersLayer.getLayers().length : 0,
        limit: _getMobileMarkerLimit(),
        ms: _lastMarkerRenderMs,
        updateKind: _lastUpdateKind,
        fullMs: _lastFullUpdateMs,
        mapMs: _lastMapOnlyUpdateMs,
        pending: !!_mapOnlyUpdateRaf,
        zooming: map.getContainer().classList.contains('is-gesture-zooming')
    };
    const gps = typeof window.btGpsDebugSnapshot === 'function' ? window.btGpsDebugSnapshot() : null;
    el.innerHTML = `
        <span style="color:var(--tx3);">zoom</span><span>${stats.zoom}</span>
        <span style="color:var(--tx3);">mode</span><span>${_escapeHtml(stats.mode)}</span>
        <span style="color:var(--tx3);">markers</span><span>${stats.visible}/${stats.layer}</span>
        <span style="color:var(--tx3);">limit</span><span>${stats.limit === Infinity ? '∞' : stats.limit}</span>
        <span style="color:var(--tx3);">render</span><span>${stats.ms}ms</span>
        <span style="color:var(--tx3);">update</span><span>${stats.updateKind}</span>
        <span style="color:var(--tx3);">full/map</span><span>${stats.fullMs}/${stats.mapMs}ms</span>
        <span style="color:var(--tx3);">queue</span><span style="color:${stats.pending ? 'var(--am)' : 'var(--gn)'}">${stats.pending ? 'yes' : 'no'}</span>
        <span style="color:var(--tx3);">gesture</span><span style="color:${stats.zooming ? 'var(--am)' : 'var(--gn)'}">${stats.zooming ? 'yes' : 'no'}</span>
        ${gps ? `
        <span style="grid-column:1/-1;height:1px;background:rgba(91,143,255,0.25);margin:2px 0;"></span>
        <span style="color:var(--tx3);">gps</span><span>${_escapeHtml(gps.mode)} · ${_escapeHtml(gps.quality)}</span>
        <span style="color:var(--tx3);">acc/head</span><span>${gps.accuracy === null ? '-' : `±${gps.accuracy}m`}/${gps.heading === null ? '-' : `${gps.heading}°`}</span>
        <span style="color:var(--tx3);">fix age</span><span style="color:${gps.ageSeconds !== null && gps.ageSeconds > 20 ? 'var(--am)' : 'var(--gn)'}">${gps.ageSeconds === null ? '-' : `${gps.ageSeconds}s`}</span>
        ` : ''}
    `;
}

function setMapDebugOverlay(enabled) {
    _mapDebugOverlayEnabled = !!enabled;
    localStorage.setItem('bt_map_debug_overlay', _mapDebugOverlayEnabled ? '1' : '0');
    _updateMapDebugOverlay();
    showToast(_mapDebugOverlayEnabled ? 'เปิด Map debug overlay' : 'ปิด Map debug overlay', false, true);
}

function _getScopedFiltered() {
    const filtered = getFiltered();
    if (!_selectedDistrict) return filtered;
    return filtered.filter(l =>
        _getDistrictName(l) === _selectedDistrict &&
        (!_selectedDistrictList || (l.list || 'ไม่ระบุ') === _selectedDistrictList)
    );
}

function _getStackKeyFromLoc(loc) {
    return `${Number(loc.lat).toFixed(STACK_PROXIMITY_PRECISION)}|${Number(loc.lng).toFixed(STACK_PROXIMITY_PRECISION)}`;
}

function _createStackMarkerIcon(count) {
    const size = Math.min(44, 30 + Math.sqrt(count) * 3);
    return L.divIcon({
        className: 'bt-stack-marker-shell',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        html: `
            <div class="bt-stack-marker" style="--stack-size:${size}px">
                <span class="bt-stack-count">${count}</span>
            </div>
        `
    });
}

function _openStackPopup(locs, marker) {
    const popupHtml = `
        <div class="stack-popup">
            <div class="stack-popup-title">${locs.length} ตำแหน่งซ้อนกัน</div>
            <div class="stack-popup-list">
                ${locs.map(loc => {
                    const idx = getLocIndex(loc);
                    const name = _escapeHtml(loc.name || 'ไม่มีชื่อ');
                    const list = _escapeHtml(loc.list || 'ไม่ระบุ');
                    const area = _escapeHtml(_getDistrictName(loc));
                    return `
                        <button class="stack-popup-row" data-idx="${idx}">
                            <div class="stack-popup-name">${name}</div>
                            <div class="stack-popup-meta">${list} · ${area}</div>
                        </button>
                    `;
                }).join('')}
            </div>
        </div>
    `;

    const popup = L.popup({
        className: 'stack-popup-shell',
        maxWidth: 280,
        autoPan: true,
        closeButton: true
    })
        .setLatLng(marker.getLatLng())
        .setContent(popupHtml)
        .openOn(map);

    setTimeout(() => {
        const container = popup.getElement();
        if (!container) return;
        container.querySelectorAll('.stack-popup-row').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = Number(btn.dataset.idx);
                const loc = locations[idx];
                if (!loc) return;
                map.closePopup(popup);
                showLocationDetails(loc, idx);
            });
        });
    }, 0);
}

function _createLocationIcon(loc, idx) {
    const color = _getMarkerColor(loc);
    const fav = isFavorite(loc);
    const label = _escapeHtml(loc.name || loc.list || 'ตำแหน่ง');
    const markerName = _escapeHtml(loc.name || 'ไม่มีชื่อ');
    const markerArea = _escapeHtml(_getDistrictName(loc));
    const labelText = _mobile
        ? `<span class="bt-marker-name">${markerName}</span><span class="bt-marker-area">${markerArea}</span>`
        : _escapeHtml(loc.list || 'ไม่ระบุ');
    return L.divIcon({
        className: 'bt-field-marker-shell',
        html: `<div class="bt-field-marker${fav ? ' is-favorite' : ''}" style="--marker-color:${color};" data-idx="${idx}" role="img" aria-label="${label}">
            <span class="bt-field-marker-core"></span>
            <span class="bt-field-marker-ring"></span>
            <span class="bt-field-marker-label">${labelText}</span>
        </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        tooltipAnchor: [0, -18],
    });
}

function _updateDistrictScopeControl(count) {
    let el = document.getElementById('districtScopeControl');
    const mapEl = document.getElementById('map');
    if (!_selectedDistrict) {
        if (el) el.remove();
        if (mapEl) mapEl.classList.remove('map-district-scoped');
        return;
    }
    if (mapEl) mapEl.classList.add('map-district-scoped');
    if (!el) {
        el = document.createElement('div');
        el.id = 'districtScopeControl';
        el.className = 'district-scope-control';
        document.body.appendChild(el);
    }

    const label = _selectedDistrictList || _selectedDistrict;
    el.innerHTML = `
        <div class="district-scope-copy">
            <span class="district-scope-kicker">กำลังดูโซน</span>
            <span class="district-scope-name">${_escapeHtml(label)}</span>
            <span class="district-scope-count">${count} ตู้</span>
        </div>
        <button type="button" class="district-scope-route">เส้นทาง</button>
        <button type="button" class="district-scope-close" aria-label="ออกจากโซน">×</button>
    `;
    const routeBtn = el.querySelector('.district-scope-route');
    if (routeBtn) routeBtn.onclick = () => openRouteOptionsSheet();
    const btn = el.querySelector('.district-scope-close');
    if (btn) btn.onclick = _resetToDistrictView;
}

function _buildMarkerCache() {
    _markerCache.clear();
    locations.forEach((loc, idx) => {
        const marker = L.marker([loc.lat, loc.lng], {
            icon: _createLocationIcon(loc, idx),
            title: loc.name || loc.list,
            riseOnHover: false,
            bubblingMouseEvents: false,
            keyboard: true,
        });
        marker.bindTooltip(loc.name || loc.list, {
            permanent: false,
            direction: 'top',
            offset: [0, -2],
            className: 'bt-tooltip',
            opacity: 0.95,
        });
        marker._locIdx = idx;
        marker.on('click', () => {
            if (manualRouteMode) {
                // Add to manual route instead of showing details
                addManualRoutePoint(loc.lat, loc.lng, loc.name || loc.list || 'จุด');
            } else {
                showLocationDetails(loc, idx);
            }
        });
        _markerCache.set(idx, marker);
    });
    _clusterDirty = false;
}

function _heatZoom(){ if(heatmapMode){_lastFilteredKey=null;update();} }

function renderMarkers(filtered) {
    // Hide normal markers in route mode
    if (routeMode) { 
        if (_districtClusterGroup) map.removeLayer(_districtClusterGroup);
        if (_individualMarkersLayer) map.removeLayer(_individualMarkersLayer);
        _updateDistrictScopeControl(0);
        return; 
    }
    
    // Build cache if needed
    if (_markerCache.size === 0 || _clusterDirty) _buildMarkerCache();

    const filteredIdxSet = new Set(filtered.map(l => getLocIndex(l)));
    const zoom = map.getZoom();
    const renderMode = _getMarkerRenderMode();
    const viewportKey = ['points', 'district-detail', 'manual'].includes(renderMode) ? _getViewportKey() : '';
    const key = [...filteredIdxSet].sort().join(',') + '|' + renderMode + '|' + viewportKey + '|' + _selectedDistrict + '|' + _selectedDistrictList;
    if (key === _lastFilteredKey) return;
    _lastFilteredKey = key;
    _lastMarkerRenderMode = renderMode;

    // ── heatmap mode ──
    if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }
    if (heatmapMode) {
        if (_districtClusterGroup) map.removeLayer(_districtClusterGroup);
        if (_individualMarkersLayer) map.removeLayer(_individualMarkersLayer);
        _updateDistrictScopeControl(0);
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

    if (manualRouteMode) {
        if (_districtClusterGroup) map.removeLayer(_districtClusterGroup);
        const visibleManual = _limitMobileMarkers(_filterToViewport(filtered));
        _showIndividualMarkers(visibleManual);
        _updateDistrictScopeControl(filtered.length);
        const _cp=document.getElementById('countPill');if(_cp)_cp.textContent = `${filtered.length} ตู้`;
        const _cp2=document.getElementById('countPill');if(_cp2)_cp2.classList.add('show');
        const _mst=document.getElementById('mapStatTotal');if(_mst)_mst.textContent=filtered.length;
        const _msc=document.getElementById('mapStatClusters');if(_msc)_msc.textContent=filtered.length;
        return;
    }

    // ── Hierarchical District Clustering ──
    // Case 1: Zoomed out (≤13) AND no district selected → Show district clusters
    if (zoom <= DISTRICT_CLUSTER_MAX_ZOOM && !_selectedDistrict) {
        _updateDistrictScopeControl(0);
        // Remove individual markers
        if (_individualMarkersLayer) map.removeLayer(_individualMarkersLayer);
        if (_districtClusterGroup) map.removeLayer(_districtClusterGroup);
        
        // Create district clusters
        const districtGroups = _createMobileClusterCells(_createDistrictClusters(filtered));
        _districtClusterGroup = L.layerGroup();
        
        Object.entries(districtGroups).forEach(([district, data]) => {
            const marker = _createDistrictClusterMarker(district, data);
            _districtClusterGroup.addLayer(marker);
        });
        
        map.addLayer(_districtClusterGroup);
        
        // Update stats
        const districtCount = Object.keys(districtGroups).length;
        const _cp=document.getElementById('countPill');if(_cp)_cp.textContent = `${filtered.length} ตู้ · ${districtCount} เขต`;
        const _cp2=document.getElementById('countPill');if(_cp2)_cp2.classList.add('show');
        const _mst=document.getElementById('mapStatTotal');if(_mst)_mst.textContent=filtered.length;
        const _msc=document.getElementById('mapStatClusters');if(_msc)_msc.textContent=districtCount;
        const _lvc=document.getElementById('lvCount');if(_lvc)_lvc.textContent=`${filtered.length} ตู้ใน ${districtCount} เขต`;
        
        return;
    }
    
    // Case 2: Zoomed in (>13) OR district selected → Show individual markers
    if (_districtClusterGroup) map.removeLayer(_districtClusterGroup);
    
    // If district is selected, filter to that district only
    const markersToShow = _selectedDistrict
        ? filtered.filter(l =>
            _getDistrictName(l) === _selectedDistrict &&
            (!_selectedDistrictList || (l.list || 'ไม่ระบุ') === _selectedDistrictList)
        )
        : filtered;
    
    // Show individual markers
    const visibleMarkers = _limitMobileMarkers(_filterToViewport(markersToShow));
    _showIndividualMarkers(visibleMarkers);
    _updateDistrictScopeControl(markersToShow.length);
    
    // Update stats
    const _cp=document.getElementById('countPill');if(_cp){
        _cp.textContent = _selectedDistrict ? `${_selectedDistrictList || _selectedDistrict} · ${markersToShow.length} ตู้` : `${markersToShow.length} ตู้`;
        _cp.title = _selectedDistrict ? 'คลิกเพื่อกลับภาพรวม' : '';
        _cp.style.cursor = _selectedDistrict ? 'pointer' : '';
        _cp.onclick = _selectedDistrict ? _resetToDistrictView : null;
    }
    const _cp2=document.getElementById('countPill');if(_cp2)_cp2.classList.add('show');
    const _mst=document.getElementById('mapStatTotal');if(_mst)_mst.textContent=filtered.length;
    const _msc=document.getElementById('mapStatClusters');if(_msc)_msc.textContent=markersToShow.length;
    const _lvc=document.getElementById('lvCount');if(_lvc)_lvc.textContent='แสดง '+markersToShow.length+' จาก '+locations.length+' จุด';
}

// เรียกเมื่อ locations เปลี่ยน (add/edit/delete/import/reset)
function invalidateMarkerCache() {
    _clusterDirty = true;
    _visibleMarkerIdxs.clear();
}

function invalidateCache() {
    _lastFilteredKey = null;
    markDatalistDirty();
    rebuildIndexMap();
    invalidateMarkerCache();
}

function scheduleMapOnlyUpdate(reason = 'map') {
    _lastFilteredKey = null;
    _pendingMapOnlyReason = reason;
    if (_mapOnlyUpdateRaf) {
        _updateMapDebugOverlay();
        return;
    }
    _mapOnlyUpdateRaf = requestAnimationFrame(() => {
        _mapOnlyUpdateRaf = null;
        update({ mapOnly: true, reason: _pendingMapOnlyReason });
        _pendingMapOnlyReason = '';
    });
    _updateMapDebugOverlay();
}

function update(options = {}) {
    const mapOnly = !!options.mapOnly;
    const updateStart = performance.now();
    const filtered = getFiltered();
    const markerRenderStart = performance.now();
    renderMarkers(filtered);
    _lastMarkerRenderMs = Math.round((performance.now() - markerRenderStart) * 10) / 10;
    if (mapOnly) {
        _lastUpdateKind = options.reason ? `map:${options.reason}` : 'map';
        _lastMapOnlyUpdateMs = Math.round((performance.now() - updateStart) * 10) / 10;
        _updateMapDebugOverlay();
        return filtered;
    }
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
    if (currentView === 'list' || document.getElementById('view-list')?.classList.contains('show')) {
        renderListDirectory();
    }
    _renderSidebar();
    _updateMobChips(); // Sync mobile chip state
    _lastUpdateKind = 'full';
    _lastFullUpdateMs = Math.round((performance.now() - updateStart) * 10) / 10;
    _updateMapDebugOverlay();
    return filtered;
}

// ════════════════════════════════════════════
// HIERARCHICAL CLUSTERING FUNCTIONS
// ════════════════════════════════════════════

// Group locations by district and create custom cluster markers
function _createDistrictClusters(filtered) {
    const groups = {};
    filtered.forEach(loc => {
        const district = _getDistrictName(loc);
        if (!groups[district]) {
            groups[district] = { locations: [], lists: new Set(), bounds: L.latLngBounds() };
        }
        groups[district].locations.push(loc);
        groups[district].lists.add(loc.list || 'ไม่ระบุ');
        groups[district].bounds.extend([loc.lat, loc.lng]);
    });
    return groups;
}

function _getMobileClusterCellSize() {
    const zoom = map.getZoom();
    if (zoom <= 10) return 96;
    if (zoom <= 12) return 82;
    return 72;
}

function _createMobileClusterCells(districtGroups) {
    if (!_mobile) return districtGroups;
    const cellSize = _getMobileClusterCellSize();
    const cells = {};
    Object.entries(districtGroups).forEach(([district, data]) => {
        const center = data.bounds.getCenter();
        const p = map.latLngToLayerPoint(center);
        const key = `${Math.floor(p.x / cellSize)}:${Math.floor(p.y / cellSize)}`;
        if (!cells[key]) {
            cells[key] = {
                locations: [],
                lists: new Set(),
                districts: new Set(),
                bounds: L.latLngBounds(),
                districtName: null,
                _aggregate: true
            };
        }
        data.locations.forEach(loc => cells[key].locations.push(loc));
        data.lists.forEach(list => cells[key].lists.add(list));
        cells[key].districts.add(district);
        cells[key].districtName = cells[key].districts.size === 1 ? district : null;
        cells[key].bounds.extend(data.bounds);
    });
    return cells;
}

// Create district cluster marker
function _createDistrictClusterMarker(district, data) {
    const count = data.locations.length;
    const center = data.bounds.getCenter();
    const lists = Array.from(data.lists);
    const districtCount = data.districts ? data.districts.size : 1;
    const displayDistrict = data.districtName || (districtCount === 1 && data.districts ? Array.from(data.districts)[0] : district);
    const size = _mobile
        ? Math.min(50, Math.max(30, 28 + Math.sqrt(count) * 1.8))
        : Math.min(54, Math.max(34, 30 + Math.sqrt(count) * 2.8));
    const topList = lists[0] || 'ไม่ระบุ';
    const accent = getColor(topList);
    const label = data._aggregate && districtCount > 1 ? `${districtCount} เขต` : 'ตู้';
    const icon = L.divIcon({
        html: `<div class="bt-district-cluster" style="--cluster-size:${size}px;--cluster-color:${accent};">
                <span class="bt-district-count">${count}</span>
                <span class="bt-district-label">${label}</span>
            </div>
        `,
        className: 'district-cluster-marker',
        iconSize: [size, size],
        iconAnchor: [size/2, size/2]
    });
    
    const marker = L.marker(center, { icon: icon });
    marker._district = displayDistrict;
    marker._districtData = data;
    
    marker.on('click', () => {
        if (data._aggregate && data.districts && data.districts.size > 1) {
            map.fitBounds(data.bounds.pad(0.18), { animate: false, maxZoom: DISTRICT_CLUSTER_MAX_ZOOM + 1 });
            return;
        }
        _showDistrictPopup(displayDistrict, data, marker);
    });

    const listPreview = lists.slice(0, 3).map(_escapeHtml).join(', ');
    if (!_mobile) {
        marker.bindTooltip(`<b>${_escapeHtml(district)}</b><br>${listPreview}${lists.length > 3 ? ` +${lists.length - 3}` : ''}`, {
            direction: 'top',
            offset: [0, -size/2],
            className: 'district-tooltip'
        });
    }
    
    return marker;
}

// Show popup with district info
function _showDistrictPopup(district, data, marker) {
    const lists = Array.from(data.lists);
    const listCounts = {};
    data.locations.forEach(l => {
        const list = l.list || 'ไม่ระบุ';
        listCounts[list] = (listCounts[list] || 0) + 1;
    });
    
    // Sort lists by count
    const sortedLists = Object.entries(listCounts).sort((a, b) => b[1] - a[1]);
    
    const safeDistrict = _escapeHtml(district);
    const districtAttr = _escapeHtml(district);
    const popupContent = `
        <div class="district-popup-card">
            <div class="district-popup-head">
                <span class="district-popup-title">${safeDistrict}</span>
                <span class="district-popup-meta">${data.locations.length} ตู้ · ${lists.length} รายการ</span>
            </div>
            <div class="district-popup-list">
                ${sortedLists.map(([list, count]) => `
                    <button type="button" class="district-popup-row" data-district="${districtAttr}" data-list="${_escapeHtml(list)}">
                        <span class="district-popup-name">${_escapeHtml(list)}</span>
                        <span class="district-popup-count">${count}</span>
                    </button>
                `).join('')}
            </div>
            <div style="padding:8px 0 0;">
                <button type="button" class="action-card district-popup-zoom" data-district="${districtAttr}" style="width:100%;box-sizing:border-box;border-color:rgba(91,143,255,0.3);padding:8px 10px 7px;gap:2px;">
                    <div class="ac-title" style="font-size:12px;">ซูมเข้า</div>
                    <div class="ac-desc" style="font-size:10px;">ดูจุดทั้งหมดในพื้นที่นี้</div>
                    <span class="ac-chip" style="background:var(--bl-d);color:var(--bl);margin-top:4px;font-size:9px;padding:1px 6px;">ZOOM</span>
                </button>
            </div>
        </div>
    `;
    
    const popup = L.popup({
        className: 'district-popup',
        closeButton: true,
        minWidth: 260,
        maxWidth: 300
    })
        .setLatLng(marker.getLatLng())
        .setContent(popupContent)
        .openOn(map);

    setTimeout(() => {
        const popupEl = popup.getElement();
        if (!popupEl) return;
        const zoomBtn = popupEl.querySelector('.district-popup-zoom');
        if (zoomBtn) {
            zoomBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                _zoomToDistrict(zoomBtn.dataset.district || district);
            });
        }
        popupEl.querySelectorAll('.district-popup-row').forEach(row => {
            row.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                _zoomToDistrictList(row.dataset.district || district, row.dataset.list || '');
            });
        });
    }, 0);
}

// Zoom to district and show individual markers
function _zoomToDistrict(district) {
    const filtered = getFiltered().filter(l => _getDistrictName(l) === district);
    if (filtered.length === 0) return;
    map.closePopup();
    
    _selectedDistrict = district;
    _selectedDistrictList = null;
    
    // Calculate bounds
    const bounds = L.latLngBounds(filtered.map(l => [l.lat, l.lng]));
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    
    // Switch to individual marker view
    _showIndividualMarkers(filtered);
    
    showToast(`${district}: ${filtered.length} ตู้`);
}

// Zoom to specific list within district
function _zoomToDistrictList(district, list) {
    const filtered = getFiltered().filter(l => 
        _getDistrictName(l) === district &&
        (l.list || 'ไม่ระบุ') === list
    );
    if (filtered.length === 0) return;
    map.closePopup();

    _selectedDistrict = district;
    _selectedDistrictList = list;
    
    const bounds = L.latLngBounds(filtered.map(l => [l.lat, l.lng]));
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
    
    _showIndividualMarkers(filtered);
    showToast(`${list}: ${filtered.length} ตู้`);
}

// Show individual markers for filtered data
function _showIndividualMarkers(filtered) {
    if (_districtClusterGroup) {
        map.removeLayer(_districtClusterGroup);
    }

    if (!_individualMarkersLayer) {
        _individualMarkersLayer = L.layerGroup();
    }
    if (_markerCache.size === 0 || _clusterDirty) {
        _buildMarkerCache();
    }

    _individualMarkersLayer.clearLayers();

    const groups = new Map();
    filtered.forEach(loc => {
        const key = _getStackKeyFromLoc(loc);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(loc);
    });

    const nextVisibleIdxs = new Set();

    // Single markers
    groups.forEach((locs, key) => {
        if (locs.length > 1) return;
        const loc = locs[0];
        const idx = getLocIndex(loc);
        if (idx < 0) return;
        nextVisibleIdxs.add(idx);
        const marker = _markerCache.get(idx);
        if (marker) _individualMarkersLayer.addLayer(marker);
    });

    // Stacked markers (duplicate coordinates)
    groups.forEach((locs, key) => {
        if (locs.length <= 1) return;
        const idxs = locs.map(getLocIndex).filter(idx => idx >= 0);
        idxs.forEach(idx => nextVisibleIdxs.add(idx));
        const { lat, lng } = locs[0];
        const stackMarker = L.marker([lat, lng], {
            icon: _createStackMarkerIcon(locs.length),
            bubblingMouseEvents: false
        });
        stackMarker.on('click', () => _openStackPopup(locs, stackMarker));
        _individualMarkersLayer.addLayer(stackMarker);
    });

    _visibleMarkerIdxs = nextVisibleIdxs;
    _individualMarkersLayer.addTo(map);
    _updateMobileMarkerLabels(nextVisibleIdxs.size);
    if (typeof _updateTooltipVisibility === 'function') _updateTooltipVisibility();
}

// Reset to district cluster view
function _resetToDistrictView() {
    _selectedDistrict = null;
    _selectedDistrictList = null;
    _updateDistrictScopeControl(0);
    if (_individualMarkersLayer) {
        map.removeLayer(_individualMarkersLayer);
        _individualMarkersLayer = null;
    }
    _visibleMarkerIdxs.clear();
    _updateMobileMarkerLabels(0);
    update(); // Re-render clusters
    if (typeof _updateTooltipVisibility === 'function') _updateTooltipVisibility();
}

// Expose functions for onclick handlers
window._zoomToDistrict = _zoomToDistrict;
window._zoomToDistrictList = _zoomToDistrictList;

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
        await ensureDefaultLocationsLoaded();
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
            const loader = document.getElementById('loader');
            const app = document.getElementById('app');
            if(loader) loader.classList.add('done');
            if(app) app.style.display = 'flex';
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
    if (!_datalistDirty) return;
    const lists = locations.map(l => l.list);
    const cities = locations.map(l => l.city);
    const listSuggestions = document.getElementById('listSuggestions');
    const citySuggestions = document.getElementById('citySuggestions');
    if(listSuggestions) listSuggestions.innerHTML = _renderDatalistOptions(lists);
    if(citySuggestions) citySuggestions.innerHTML = _renderDatalistOptions(cities);
    _setupAC('modalList', 'acListDrop', () => [...new Set(lists.filter(Boolean))].sort());
    _setupAC('modalCity', 'acCityDrop', () => [...new Set(cities.filter(Boolean))].sort());
    _datalistDirty = false;
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
    if(chipList) chipList.classList.toggle('on',!!filterList);
    if(chipCity) chipCity.classList.toggle('on',!!filterCity);
    // Dropdown items
    if(chipAll) chipAll.classList.toggle('on',!filterList&&!filterCity&&!nearbyMode&&!filterFavorites);
    if(chipNearby) chipNearby.classList.toggle('on',nearbyMode);
    if(chipHeatmap) chipHeatmap.classList.toggle('on',heatmapMode);
    if(chipFav) chipFav.classList.toggle('on',filterFavorites);
    // Highlight "more" button if any dropdown item is active
    const anyDropActive=nearbyMode||heatmapMode||filterFavorites;
    if(chipMore) chipMore.classList.toggle('on',anyDropActive);
}

// ════════════════════════════════════════════
// PLACE CARD
// ════════════════════════════════════════════
function showPlaceCard(loc, idx) {
    const color=getColor(loc.list);
    const dist=myLatLng?haversine(myLatLng.lat,myLatLng.lng,loc.lat,loc.lng):null;
    const distHtml=dist!==null?`<span class="distance-badge">${formatDist(dist)}</span>`:'';
    const area=_escapeHtml(_getDistrictName(loc));
    const group=_escapeHtml(loc.list || 'ไม่มีรายการ');
    const coord=`${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}`;
    document.getElementById('placeCardContent').innerHTML=`
        <div class="place-card-name">${_escapeHtml(loc.name||'ไม่มีชื่อ')}</div>
        <div class="place-card-meta">
            <span class="place-card-color-dot" style="background:${color};"></span>
            <span>${group}</span>
            <span class="dot">·</span><span>${area}</span>
            ${distHtml}
        </div>
        ${loc.tags&&loc.tags.length?`<div class="place-card-tags">${loc.tags.map(t=>{const tc=getTagColor(t);return`<span data-tag="${_escapeHtml(t)}" title="กดเพื่อตั้งสี tag" style="background:${tc||'var(--s2)'};color:${tc?'#fff':'var(--gn)'};border-color:${tc||'var(--gn)'};">${_escapeHtml(t)}</span>`;}).join('')}</div>`:''}
        ${loc.photo?`<div style="margin-bottom:12px;"><img src="${loc.photo}" style="width:100%;max-height:200px;object-fit:cover;border-radius:12px;border:1px solid var(--gn);cursor:pointer;" onclick="window.open(this.src,'_blank')"></div>`:''}
        ${loc.note?`<div class="place-card-note">${_escapeHtml(loc.note)}</div>`:''}
        <div class="place-card-actions">
            <button class="place-action-btn" onclick="openEdit(${idx})">
                <span class="place-action-icon">EDIT</span>
                <span class="place-action-label">แก้ไข</span>
            </button>
            <button class="place-action-btn route" onclick="openMapsTo(${idx})">
                <span class="place-action-icon">GO</span>
                <span class="place-action-label">Maps</span>
            </button>
            <button class="place-action-btn danger" onclick="doConfirmDelete(${idx})">
                <span class="place-action-icon">DEL</span>
                <span class="place-action-label">ลบ</span>
            </button>
        </div>
        <div class="place-card-info-grid">
            <div class="place-card-info-item wide">
                <span class="place-card-info-k">พิกัด</span>
                <button type="button" class="place-card-info-v mono" onclick="copyCoords(${loc.lat},${loc.lng})">${coord}</button>
            </div>
            <div class="place-card-info-item">
                <span class="place-card-info-k">เขต</span>
                <span class="place-card-info-v">${area}</span>
            </div>
            <div class="place-card-info-item">
                <span class="place-card-info-k">รายการ</span>
                <span class="place-card-info-v">${group}</span>
            </div>
        </div>
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

function _escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function closePlaceCard() { const pc = document.getElementById('placeCard'); if(pc) pc.classList.remove('open'); }
window.openMapsTo=function(idx){
    const loc=locations[idx]; if(!loc)return;
    window.open(`https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`, '_blank');
};
window.doToggleFavorite=function(idx){const loc=locations[idx];if(!loc)return;toggleFavorite(loc);invalidateCache();update();showPlaceCard(loc,idx);showToast(isFavorite(loc)?'เพิ่มในรายการโปรดแล้ว':'นำออกจากรายการโปรดแล้ว');};
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
function renderListDirectory() {
    const table = document.getElementById('listTable');
    const countEl = document.getElementById('lvCount');
    if(!table)return;
    const listCounts = {};
    const cityCounts = {};
    locations.forEach(loc => {
        const list = loc.list || 'ไม่มีรายการ';
        listCounts[list] = (listCounts[list] || 0) + 1;
        if(loc.city)cityCounts[loc.city] = (cityCounts[loc.city] || 0) + 1;
    });
    const lists = Object.entries(listCounts).sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0], 'th'));
    const cities = Object.entries(cityCounts).sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0], 'th'));
    if(countEl)countEl.textContent = `${lists.length} รายการ · ${cities.length} เขต · ${locations.length} จุด`;

    const section = (title, items, kind) => `
        <div style="padding:12px 12px 4px;color:var(--tx3);font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;">${title}</div>
        ${items.map(([name,count], i) => {
            const color = kind === 'list' ? getColor(name) : colorPalette[i % colorPalette.length];
            const active = kind === 'list' ? filterList === name : filterCity === name;
            return `<div class="list-directory-item ${active ? 'active' : ''}" data-kind="${kind}" data-name="${_escapeHtml(name)}" style="width:100%;display:flex;align-items:center;gap:10px;padding:12px 14px;border:0;border-bottom:0.5px solid var(--bd);background:${active ? 'var(--bl-d)' : 'transparent'};color:var(--tx);font-family:inherit;text-align:left;cursor:pointer;">
                <span style="width:10px;height:10px;border-radius:999px;background:${color};box-shadow:0 0 8px ${color}66;flex-shrink:0;"></span>
                <span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px;">${_escapeHtml(name)}</span>
                <span style="min-width:34px;text-align:right;color:var(--tx2);font-size:12px;">${count}</span>
                <button class="fl-edit" style="opacity:0.5;font-size:12px;padding:4px 7px;" onclick="event.stopPropagation();openEditGroup('${kind}','${name.replace(/'/g,"\\'")}')"><i class='fa-solid fa-pen'></i></button>
            </div>`;
        }).join('')}`;

    // Render toolbar in sticky container outside scroll area
    const toolbarEl = document.getElementById('listTableToolbar');
    if(toolbarEl){
        toolbarEl.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;">
            <button class="lv-tb-btn" data-list-action="all">ทั้งหมด</button>
            <button class="lv-tb-btn" data-list-action="manage">จัดการรายการ</button>
            <span style="margin-left:auto;color:var(--tx3);font-size:11px;white-space:nowrap;">${lists.length} รายการ · ${cities.length} เขต · ${locations.length} จุด</span>
        </div>`;
        toolbarEl.onclick = e => {
            const action = e.target.closest('[data-list-action]')?.dataset.listAction;
            if(action === 'all'){ filterList=''; filterCity=''; filterFavorites=false; nearbyMode=false; switchView('map'); update(); }
            if(action === 'manage'){ openListOptionsSheet(); }
        };
    }

    table.innerHTML = `
        ${section('List', lists, 'list')}
        ${section('เขต / เมือง', cities, 'city')}
    `;

    table.onclick = e => {
        const action = e.target.closest('[data-list-action]')?.dataset.listAction;
        if(action === 'all'){
            filterList=''; filterCity=''; filterFavorites=false; nearbyMode=false;
            switchView('map'); update(); return;
        }
        if(action === 'manage'){
            openListOptionsSheet(); return;
        }
        const item = e.target.closest('.list-directory-item');
        if(!item)return;
        const name = item.dataset.name;
        if(item.dataset.kind === 'list')setFilterList(name);
        else setFilterCity(name);
        switchView('map');
    };
}
window.renderListDirectory = renderListDirectory;
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
function _samePoint(a, b) {
    return !!a && !!b && Math.abs(Number(a.lat) - Number(b.lat)) < 0.000001 && Math.abs(Number(a.lng) - Number(b.lng)) < 0.000001;
}
function _clearSearchMarkerIfDeleted(deleted) {
    if (!_searchMarker) return;
    const pin = _searchMarker.getLatLng();
    const items = Array.isArray(deleted) ? deleted : [deleted];
    if (items.some(loc => _samePoint(loc, pin))) _clearSearchMarker();
}
function _pruneSearchMarkerForQuery() {
    if (!_searchMarker || !searchInput) return;
    const q = searchInput.value.trim();
    if (!q) {
        _clearSearchMarker();
        return;
    }
    const coords = parseLatLng(q);
    if (!coords || !_samePoint(coords, _searchMarker.getLatLng())) _clearSearchMarker();
}
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
    _pruneSearchMarkerForQuery();
    if(!q){searchResults.innerHTML='';searchResults.style.display='none';return;}
    let html='';
    const coords=parseLatLng(searchInput.value.trim());
    if(coords){
        html+=`<div class="search-result-item" onclick="map.flyTo([${coords.lat},${coords.lng}],16,{animate:true,duration:0.8});_showSearchMarker(${coords.lat},${coords.lng});document.getElementById('searchResults').style.display='none';">
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
        return `<div class="search-result-item" onclick="showPlaceCard(locations[${idx}],${idx});document.getElementById('search').blur();document.getElementById('searchResults').style.display='none';">
            <div class="search-result-icon" style="background:${color}20;color:${color}">📍</div>
            <div class="search-result-text">
                <div class="search-result-name">${loc.name||'ไม่มีชื่อ'}</div>
                <div class="search-result-sub">${loc.list}${loc.city?' · '+loc.city:''} · ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}</div>
            </div>
        </div>`;
    }).join('');
    searchResults.innerHTML = html; if(searchResults) searchResults.style.display = html.length > 0 ? 'block' : 'none';
}

// ════════════════════════════════════════════
// FILTER CHIPS
// ════════════════════════════════════════════

// Mobile bottom sheet helper
function openMobSheet(){
    const s=document.getElementById('mobSheet');
    if(s)s.classList.add('open');
}
function closeMobSheet(){
    const s=document.getElementById('mobSheet');
    if(s)s.classList.remove('open');
}

function _listCounts() {
    const counts = {};
    locations.forEach(l => { const name = l.list || 'ไม่มีรายการ'; counts[name] = (counts[name] || 0) + 1; });
    return Object.entries(counts).sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0], 'th'));
}

function _renderListPickerRows(query='') {
    const rows = document.getElementById('_listPickerRows');
    if (!rows) return;
    const q = query.trim().toLowerCase();
    const lists = _listCounts().filter(([name]) => !q || name.toLowerCase().includes(q));
    rows.innerHTML = lists.map(([name,count]) => `
        <button type="button" class="sheet-list-row${filterList===name?' selected':''}" data-list-name="${_escapeHtml(name)}">
            <span class="sheet-list-dot" style="background:${getColor(name)};"></span>
            <span class="sheet-list-main"><b>${_escapeHtml(name)}</b><small>${count} จุด</small></span>
            <span class="sheet-list-count">${count}</span>
        </button>
    `).join('') || '<div class="sheet-note">ไม่พบรายการที่ค้นหา</div>';
    rows.querySelectorAll('[data-list-name]').forEach(el => {
        el.onclick = () => {
            setFilterList(el.dataset.listName || '');
            closeMobSheet();
            switchView('map');
        };
    });
}

function openListPickerSheet() {
    const container = document.getElementById('mobSheetList');
    const title = document.getElementById('mobSheetTitle');
    if(!container || !title)return;
    title.innerText = 'เลือกรายการ';
    container.innerHTML = `
        <div class="sheet-search">
            <input id="_listPickerSearch" type="text" placeholder="ค้นหารายการ..." autocomplete="off">
        </div>
        <button type="button" class="sheet-action primary" id="_listPickerAll">
            <span class="sheet-token">ALL</span>
            <span class="sheet-main"><b>ทั้งหมด</b><small>ล้างตัวกรองรายการและกลับไปดูทุกจุด</small></span>
            <span class="sheet-count">${locations.length}</span>
        </button>
        <div class="sheet-note">รายการที่มีจุดมากที่สุด</div>
        <div id="_listPickerRows" class="sheet-list-rows"></div>
    `;
    document.getElementById('_listPickerAll')?.addEventListener('click', () => {
        setFilterList('');
        closeMobSheet();
        switchView('map');
    });
    const search = document.getElementById('_listPickerSearch');
    if (search) search.oninput = () => _renderListPickerRows(search.value);
    _renderListPickerRows();
    openMobSheet();
}

function openMergeListSheet() {
    if(!filterList){
        showToast('เลือก List ที่ต้องการรวมก่อน', true);
        openListPickerSheet();
        return;
    }
    const container = document.getElementById('mobSheetList');
    const title = document.getElementById('mobSheetTitle');
    if(!container || !title)return;
    const counts = Object.fromEntries(_listCounts());
    const targets = _listCounts().filter(([name]) => name !== filterList);
    title.innerText = `รวม "${filterList}"`;
    container.innerHTML = targets.map(([name,count]) => `
        <div class="ms-item" data-merge-target="${_escapeHtml(name)}" style="display:flex;align-items:center;gap:12px;padding:14px;border-bottom:0.5px solid var(--bd2);cursor:pointer;">
            <div style="width:12px;height:12px;border-radius:999px;background:${getColor(name)};"></div>
            <div style="flex:1;min-width:0;">
                <div style="font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_escapeHtml(name)}</div>
                <div style="font-size:11px;color:var(--tx3);">${count} จุด</div>
            </div>
        </div>
    `).join('');
    container.querySelectorAll('[data-merge-target]').forEach(el => {
        el.onclick = () => {
            const toList = el.dataset.mergeTarget;
            const count = locations.filter(l => (l.list || 'ไม่มีรายการ') === filterList).length;
            
            // Show confirmation before merge
            showConfirm('merge', 
                `รวม "${filterList}" → "${toList}"`,
                `จะมี ${count} จุดถูกย้าย\nสามารถ ↩️ Undo ได้หากผิดพลาด`,
                () => {
                    pushUndo();
                    const changed = [];
                    locations.forEach(l => {
                        if((l.list || 'ไม่มีรายการ') === filterList){
                            l.list = toList;
                            l.updatedAt = Date.now();
                            changed.push(l);
                        }
                    });
                    filterList = toList;
                    saveLocations();invalidateCache();update();
                    if(_sbLoaded)sbBulkUpdate(changed);
                    closeMobSheet();
                    showToast(`✅ รวม ${changed.length} จุด → "${toList}"`, false, true);
                    // Show undo hint
                    setTimeout(() => showToast('↩️ กด Ctrl+Z หรือ ≡ Menu → ↩️ เลิกทำ หากต้องการยกเลิก'), 1500);
                    switchView('map');
                }
            );
        };
    });
    if(!targets.length)container.innerHTML='<div style="padding:18px;color:var(--tx2);font-size:13px;">ไม่มีรายการอื่นให้รวม</div>';
    openMobSheet();
}

function openListOptionsSheet(){
    const container = document.getElementById('mobSheetList');
    const title = document.getElementById('mobSheetTitle');
    if(!container || !title) return;
    
    title.innerText = 'จัดการรายการ';
    container.innerHTML = `
        <button type="button" class="sheet-action primary" data-action="pick">
            <span class="sheet-token">LIST</span>
            <span class="sheet-main"><b>เลือกรายการ</b><small>กรองจุดตามรายการและดูจำนวนในแต่ละกลุ่ม</small></span>
            <span class="sheet-count">${_listCounts().length}</span>
        </button>
        <button type="button" class="sheet-action" data-action="merge">
            <span class="sheet-token">JOIN</span>
            <span class="sheet-main"><b>รวมรายการ</b><small>ย้ายจุดจากรายการที่เลือกไปรวมกับอีกรายการ</small></span>
        </button>
        <div class="sheet-note">เลือกจากแท็บรายการด้านล่างได้เช่นกัน เมนูนี้เหลือเฉพาะคำสั่งจัดการที่จำเป็น</div>
    `;

    container.querySelector('[data-action="pick"]')?.addEventListener('click', openListPickerSheet);
    container.querySelector('[data-action="merge"]')?.addEventListener('click', openMergeListSheet);
    
    openMobSheet();
}
window.openListOptionsSheet = openListOptionsSheet;

function openRouteStartOptionsSheet(){
    const filtered = _getScopedFiltered();
    if(filtered.length < 2){
        showToast('ต้องมีอย่างน้อย 2 จุดในรายการที่เลือก', true);
        return;
    }
    
    const container = document.getElementById('mobSheetList');
    const title = document.getElementById('mobSheetTitle');
    if(!container || !title) return;
    
    title.innerText = 'เลือกจุดเริ่มต้น';
    
    let html = `
        <div class="sheet-note">พบ ${filtered.length} จุดในรายการ เลือกจุดเริ่มต้นสำหรับคำนวณเส้นทาง</div>
    `;
    
    // Option 1: From current GPS position
    if(myLatLng){
        html += `
            <button type="button" class="sheet-action primary" data-start="gps">
                <span class="sheet-token">GPS</span>
                <span class="sheet-main"><b>ตำแหน่งปัจจุบัน</b><small>${myLatLng.lat.toFixed(5)}, ${myLatLng.lng.toFixed(5)}</small></span>
            </button>
        `;
    }
    
    // Option 2: From first location in list
    const firstLoc = filtered[0];
    html += `
        <button type="button" class="sheet-action" data-start="first">
            <span class="sheet-token">01</span>
            <span class="sheet-main"><b>${_escapeHtml(firstLoc.name || firstLoc.list)}</b><small>จุดแรกในรายการ</small></span>
        </button>
    `;
    
    // Option 3: From specific location
    html += `<div class="sheet-note">หรือเลือกจาก 10 จุดแรก</div>`;
    
    filtered.slice(0, 10).forEach((loc, idx) => {
        html += `
            <button type="button" class="sheet-action" data-start="loc" data-idx="${idx}">
                <span class="sheet-token" style="color:${getColor(loc.list)};">${idx + 1}</span>
                <span class="sheet-main"><b>${_escapeHtml(loc.name || loc.list)}</b><small>${_escapeHtml(loc.list)}${loc.city ? ' · ' + _escapeHtml(loc.city) : ''}</small></span>
            </button>
        `;
    });
    
    container.innerHTML = html;
    
    container.querySelectorAll('[data-start]').forEach(el => {
        el.onclick = () => {
            const startType = el.dataset.start;
            let startLat, startLng;
            
            if(startType === 'gps' && myLatLng){
                startLat = myLatLng.lat;
                startLng = myLatLng.lng;
            } else if(startType === 'first'){
                startLat = filtered[0].lat;
                startLng = filtered[0].lng;
            } else if(startType === 'loc'){
                const idx = parseInt(el.dataset.idx);
                startLat = filtered[idx].lat;
                startLng = filtered[idx].lng;
            }
            
            closeMobSheet();
            doRouteWithStart(startLat, startLng);
        };
    });
    
    openMobSheet();
}

async function doRouteWithStart(startLat, startLng){
    try {
        const filtered = _getScopedFiltered();
        if(filtered.length < 2){showToast('ต้องมีอย่างน้อย 2 จุด',true);return;}
        if(filtered.length > 500){showToast('มากเกินไป (สูงสุด 500 จุด)',true);return;}

        showToast('🛤️ กำลังวางแผนเส้นทาง...');

        _routeStops = _tspSolve(filtered, startLat, startLng);
        routeMode = true;
        const chipRoute = document.getElementById('chipRoute');
        if(chipRoute) chipRoute.classList.add('active');
        await _routeDraw();
        showToast(`✅ วางแผนเส้นทาง ${_routeStops.length} จุดเสร็จแล้ว`, false, true);
    } catch(e) {
        console.error('[BT] doRouteWithStart error:', e);
        showToast('เกิดข้อผิดพลาดในการวางแผนเส้นทาง', true);
    }
}

function openRouteOptionsSheet(){
    const container = document.getElementById('mobSheetList');
    const title = document.getElementById('mobSheetTitle');
    if(!container || !title) return;
    
    title.innerText = 'วางแผนเส้นทาง';
    
    let html = '';
    
    // If there's already a route planned, show resume/hide options
    if(_routeStops.length > 0){
        if(routeMode && routeLine){
            // Route is visible - show hide option
            html += `
                <button type="button" class="sheet-action primary" data-action="hide">
                    <span class="sheet-token">VIEW</span>
                    <span class="sheet-main"><b>ซ่อนเส้นทาง</b><small>เก็บแผนเดิมไว้ แต่เอาเส้นออกจากแผนที่ชั่วคราว</small></span>
                    <span class="sheet-count">${_routeStops.length}</span>
                </button>
            `;
        } else {
            // Route exists but hidden - show resume option
            html += `
                <button type="button" class="sheet-action primary" data-action="resume">
                    <span class="sheet-token">SHOW</span>
                    <span class="sheet-main"><b>แสดงเส้นทางเดิม</b><small>กลับมาแสดงเส้นทางที่วางไว้ล่าสุด</small></span>
                    <span class="sheet-count">${_routeStops.length}</span>
                </button>
            `;
        }
        html += `
            <button type="button" class="sheet-action" data-action="clear">
                <span class="sheet-token">CLR</span>
                <span class="sheet-main"><b>ล้างเส้นทาง</b><small>ลบแผนเส้นทางและเริ่มเลือกใหม่</small></span>
            </button>
            <div class="sheet-note">สร้างเส้นทางใหม่</div>
        `;
    }
    
    html += `
        <button type="button" class="sheet-action primary" data-action="route">
            <span class="sheet-token">AUTO</span>
            <span class="sheet-main"><b>วางแผนจากรายการ</b><small>เลือกจุดเริ่มต้น แล้วจัดลำดับเส้นทางให้ทันที</small></span>
        </button>
        <button type="button" class="sheet-action" data-action="manual">
            <span class="sheet-token">PICK</span>
            <span class="sheet-main"><b>เลือกจุดเอง</b><small>แตะ marker หรือแตะแผนที่เพื่อเพิ่มจุดหลายตำแหน่ง</small></span>
        </button>
    `;
    
    container.innerHTML = html;
    
    container.querySelectorAll('[data-action]').forEach(el => {
        el.onclick = () => {
            const action = el.dataset.action;
            if(action === 'route'){
                openRouteStartOptionsSheet();
            } else if(action === 'hide'){
                closeMobSheet();
                hideRoute();
                showToast('ซ่อนเส้นทางชั่วคราว');
            } else if(action === 'resume'){
                closeMobSheet();
                resumeRoute();
                showToast('แสดงเส้นทาง');
            } else if(action === 'clear'){
                closeMobSheet();
                clearRoute();
                showToast('ล้างเส้นทางแล้ว');
            } else if(action === 'manual'){
                closeMobSheet();
                startManualRouteMode();
            }
        };
    });
    
    openMobSheet();
}

function hideRoute(){
    if(routeLine){
        map.removeLayer(routeLine);
        routeLine = null;
    }
    routeMode = false;
    // Keep _routeStops data
    const chipRoute = document.getElementById('chipRoute');
    if(chipRoute) chipRoute.classList.remove('active');
    // Restore markers by updating
    update();
}

async function resumeRoute(){
    if(_routeStops.length === 0) return;
    routeMode = true;
    const chipRoute = document.getElementById('chipRoute');
    if(chipRoute) chipRoute.classList.add('active');
    await _routeDraw();
}
window.openRouteOptionsSheet = openRouteOptionsSheet;

// Initial wire-up for chipList
// Wire up chip buttons
onClick('chipList', (e) => {
    if(e) { e.preventDefault(); e.stopPropagation(); }
    if(typeof openListOptionsSheet === 'function') openListOptionsSheet();
});

onClick('chipRouteMenu', (e) => {
    if(e) { e.preventDefault(); e.stopPropagation(); }
    if(typeof openRouteOptionsSheet === 'function') openRouteOptionsSheet();
});

// Search bar listeners
const mobSearchInput = document.getElementById('mobSearchInput');
if(mobSearchInput) {
    mobSearchInput.oninput = (e) => {
    searchTerm = e.target.value;
    // Sync ไปหา #search แล้วเรียก dropdown
    if(searchInput) searchInput.value = e.target.value;
    renderSearchResults();
    update();
};
}

onClick('chipAll', ()=>{
    console.log('[BT] chipAll clicked');
    filterList=''; filterCity=''; nearbyMode=false; filterFavorites=false;
    _selectedDistrict = null; _selectedDistrictList = null;
    clearRoute(); clearMultiRoutes();
    update();
    showToast('แสดงทั้งหมด');
});

onClick('chipFav', ()=>{
    console.log('[BT] chipFav clicked, current:', filterFavorites);
    filterFavorites=!filterFavorites;
    if(filterFavorites){ filterList=''; filterCity=''; nearbyMode=false; }
    console.log('[BT] chipFav new value:', filterFavorites);
    update();
    showToast(filterFavorites ? '★ แสดงรายการโปรด' : '☆ แสดงทั้งหมด');
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
let _lastGpsPanAt = 0;
let _lastGpsAccuracy = Infinity;
let _gpsResumeTimer = null;
let _gpsDisplayLatLng = null;
let _lastGpsHeading = null;
let _lastGpsIconHeadingBucket = null;
let _deviceHeading = null;
let _orientationBound = false;
let _orientationPermissionTried = false;
let _lastOrientationUpdateAt = 0;
let _lastGpsFixAt = 0;
let _gpsStatusTimer = null;

function _clearGpsResumeTimer() {
    if (_gpsResumeTimer) {
        clearTimeout(_gpsResumeTimer);
        _gpsResumeTimer = null;
    }
}

function _gpsTargetZoom(accuracy) {
    if (accuracy > 900) return Math.max(map.getZoom(), 13);
    if (accuracy > 220) return Math.max(map.getZoom(), 15);
    return Math.max(map.getZoom(), 17);
}

function _normalizeHeading(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return null;
    return ((n % 360) + 360) % 360;
}

function _bearingBetween(lat1, lng1, lat2, lng2) {
    const toRad = d => d * Math.PI / 180;
    const toDeg = r => r * 180 / Math.PI;
    const p1 = toRad(lat1);
    const p2 = toRad(lat2);
    const dLng = toRad(lng2 - lng1);
    const y = Math.sin(dLng) * Math.cos(p2);
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dLng);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function _smoothHeading(nextHeading) {
    const next = _normalizeHeading(nextHeading);
    if (next === null) return _lastGpsHeading;
    if (_lastGpsHeading === null) {
        _lastGpsHeading = next;
        return next;
    }
    const delta = ((next - _lastGpsHeading + 540) % 360) - 180;
    _lastGpsHeading = (_lastGpsHeading + delta * 0.38 + 360) % 360;
    return _lastGpsHeading;
}

function _readOrientationHeading(event) {
    if (typeof event.webkitCompassHeading === 'number') return event.webkitCompassHeading;
    if (event.absolute === true && typeof event.alpha === 'number') return 360 - event.alpha;
    if (typeof event.alpha === 'number') return 360 - event.alpha;
    return null;
}

function _handleDeviceOrientation(event) {
    const heading = _normalizeHeading(_readOrientationHeading(event));
    if (heading === null) return;
    _deviceHeading = heading;
    if (!gpsActive || !myLatLng || !myLocationMarker) return;
    const now = Date.now();
    if (now - _lastOrientationUpdateAt < 120) return;
    _lastOrientationUpdateAt = now;
    updateGpsMarker(myLatLng.lat, myLatLng.lng, _lastGpsAccuracy < Infinity ? _lastGpsAccuracy : 0, false, heading, null, false);
}

async function _ensureOrientationTracking() {
    if (_orientationBound || typeof window === 'undefined') return;
    try {
        if (typeof DeviceOrientationEvent !== 'undefined' &&
            typeof DeviceOrientationEvent.requestPermission === 'function' &&
            !_orientationPermissionTried) {
            _orientationPermissionTried = true;
            const result = await DeviceOrientationEvent.requestPermission();
            if (result !== 'granted') return;
        }
    } catch (err) {
        console.warn('[BT] Device orientation permission failed:', err);
        return;
    }
    window.addEventListener('deviceorientationabsolute', _handleDeviceOrientation, true);
    window.addEventListener('deviceorientation', _handleDeviceOrientation, true);
    _orientationBound = true;
}

function _stopOrientationTracking() {
    if (!_orientationBound || typeof window === 'undefined') return;
    window.removeEventListener('deviceorientationabsolute', _handleDeviceOrientation, true);
    window.removeEventListener('deviceorientation', _handleDeviceOrientation, true);
    _orientationBound = false;
    _deviceHeading = null;
    _lastOrientationUpdateAt = 0;
}

function _setGpsStatusTicker(active) {
    if (_gpsStatusTimer) {
        clearInterval(_gpsStatusTimer);
        _gpsStatusTimer = null;
    }
    if (active) {
        _gpsStatusTimer = setInterval(_updateGpsStatusPanel, 1000);
    }
}

function _smoothGpsDisplay(lat, lng, accuracy, force=false) {
    if (!_gpsDisplayLatLng || force) {
        _gpsDisplayLatLng = { lat, lng };
        return _gpsDisplayLatLng;
    }
    const moved = haversine(_gpsDisplayLatLng.lat, _gpsDisplayLatLng.lng, lat, lng);
    const alpha = moved > 55 ? 0.82 : accuracy > 80 ? 0.28 : 0.46;
    _gpsDisplayLatLng = {
        lat: _gpsDisplayLatLng.lat + (lat - _gpsDisplayLatLng.lat) * alpha,
        lng: _gpsDisplayLatLng.lng + (lng - _gpsDisplayLatLng.lng) * alpha
    };
    return _gpsDisplayLatLng;
}

function _createGpsIcon(heading) {
    const safeHeading = _normalizeHeading(heading);
    const hasHeading = safeHeading !== null;
    const cone = hasHeading
        ? `<div class="you-are-here-cone" style="transform:translateX(-50%) rotate(${safeHeading}deg);"></div>`
        : '';
    const iconHtml = `<div class="you-are-here-wrap${hasHeading ? ' has-heading' : ''}" aria-label="ตำแหน่งของฉัน">${cone}<div class="you-are-here-ring"></div><div class="you-are-here"><span class="you-are-here-core"></span></div></div>`;
    return L.divIcon({className:'you-are-here-icon', html:iconHtml, iconSize:[70,70], iconAnchor:[35,35]});
}

function _smoothFollow(lat, lng, accuracy=0, force=false) {
    if (!gpsTracking) return;
    const now = Date.now();
    const point = L.latLng(lat, lng);
    const bounds = map.getBounds();
    const nearEdge = !bounds.pad(-0.22).contains(point);
    if (!force && !nearEdge && now - _lastGpsPanAt < 950) return;
    const cur = map.getCenter();
    const dist = haversine(cur.lat, cur.lng, lat, lng);
    const minMove = accuracy > 120 ? 28 : 8;
    if (!force && !nearEdge && dist < minMove) return;
    _lastGpsPanAt = now;
    const next = [lat, lng];
    if (force || !bounds.pad(-0.08).contains(point)) {
        map.flyTo(next, _gpsTargetZoom(accuracy), {animate: true, duration: force ? 0.55 : 0.65, easeLinearity: 0.28});
    } else {
        map.panTo(next, {animate: true, duration: 0.45, easeLinearity: 0.25, noMoveStart: true});
    }
}

function _setGpsUi(state, detail='') {
    if (!btnGps) return;
    btnGps.classList.remove('gps-searching', 'gps-found', 'gps-tracking', 'gps-paused', 'gps-compass');
    btnGps.dataset.gpsState = '';
    btnGps.dataset.gpsMode = gpsMode || 'off';
    if (state) btnGps.classList.add(state);
    if (state === 'gps-searching') btnGps.dataset.gpsState = 'หา GPS';
    if (state === 'gps-tracking') btnGps.dataset.gpsState = detail || 'ติดตาม';
    if (state === 'gps-compass') btnGps.dataset.gpsState = detail || 'เข็มทิศ';
    if (state === 'gps-paused') btnGps.dataset.gpsState = 'หยุดตาม';
    if (state === 'gps-found') btnGps.dataset.gpsState = detail || 'พร้อม';
    _updateGpsStatusPanel(detail);
}

async function _setGpsMode(mode, detail='') {
    gpsMode = mode;
    gpsTracking = mode === 'follow' || mode === 'compass';
    _setGpsStatusTicker(mode !== 'off');
    _clearGpsResumeTimer();
    if (!btnGps) return;
    if (mode === 'off') {
        btnGps.title = 'ตำแหน่งของฉัน';
        _setGpsUi('');
    } else if (mode === 'free') {
        btnGps.title = 'โหมดอิสระ (แตะเพื่อกลับไปติดตาม)';
        _setGpsUi('gps-paused', detail || 'อิสระ');
    } else if (mode === 'compass') {
        btnGps.title = 'โหมดเข็มทิศ';
        await _ensureOrientationTracking();
        _setGpsUi('gps-compass', detail || 'เข็มทิศ');
    } else {
        btnGps.title = 'ติดตามตำแหน่งของฉัน';
        _setGpsUi('gps-tracking', detail || 'ติดตาม');
    }
}

async function _cycleGpsMode() {
    if (gpsMode === 'follow') return _setGpsMode('compass');
    if (gpsMode === 'compass') return _setGpsMode('free');
    return _setGpsMode('follow');
}

function _updateGpsModeAccuracy(accuracy) {
    const detail = Number.isFinite(Number(accuracy)) ? `${gpsMode === 'compass' ? 'เข็มทิศ ' : ''}±${Math.round(accuracy)}ม.` : '';
    if (gpsMode === 'compass') _setGpsUi('gps-compass', detail || 'เข็มทิศ');
    else if (gpsMode === 'free') _setGpsUi('gps-paused', 'อิสระ');
    else if (gpsMode === 'follow') _setGpsUi('gps-tracking', detail || 'ติดตาม');
}

function _gpsModeLabel(mode=gpsMode) {
    if (mode === 'follow') return 'FOLLOW';
    if (mode === 'compass') return 'COMPASS';
    if (mode === 'free') return 'FREE';
    return 'OFF';
}

function _gpsModeText(mode=gpsMode) {
    if (mode === 'follow') return 'ติดตามตำแหน่ง';
    if (mode === 'compass') return 'เข็มทิศ';
    if (mode === 'free') return 'อิสระ';
    return 'ยังไม่เปิดตำแหน่ง';
}

function _gpsQualityState() {
    if (!gpsActive) return 'off';
    if (!_lastGpsFixAt) return 'searching';
    const age = (Date.now() - _lastGpsFixAt) / 1000;
    if (age > 20) return 'stale';
    if (_lastGpsAccuracy > 120) return 'weak';
    if (_lastGpsAccuracy > 45) return 'fair';
    return 'good';
}

window.btGpsDebugSnapshot = function() {
    const heading = _lastGpsHeading === null ? _deviceHeading : _lastGpsHeading;
    return {
        active: gpsActive,
        mode: gpsMode,
        quality: _gpsQualityState(),
        tracking: gpsTracking,
        accuracy: _lastGpsAccuracy < Infinity ? Math.round(_lastGpsAccuracy) : null,
        heading: heading === null ? null : Math.round(heading),
        ageSeconds: _lastGpsFixAt ? Math.max(0, Math.round((Date.now() - _lastGpsFixAt) / 1000)) : null,
        orientationBound: _orientationBound
    };
};

function _updateGpsStatusPanel(detail='') {
    const panel = document.getElementById('mobGpsStatus');
    if (!panel) return;
    const modeEl = document.getElementById('mobGpsMode');
    const detailEl = document.getElementById('mobGpsDetail');
    panel.dataset.state = gpsMode || 'off';
    panel.dataset.quality = _gpsQualityState();
    if (modeEl) modeEl.textContent = _gpsModeLabel();
    if (!detailEl) return;
    if (!gpsActive) {
        detailEl.textContent = 'ยังไม่เปิดตำแหน่ง';
        return;
    }
    const parts = [_gpsModeText()];
    if (_lastGpsAccuracy < Infinity) {
        const accuracyText = _lastGpsAccuracy > 120 ? 'สัญญาณอ่อน' : _lastGpsAccuracy > 45 ? 'ปานกลาง' : 'ดี';
        parts.push(`${accuracyText} ±${Math.round(_lastGpsAccuracy)}ม.`);
    } else {
        parts.push('กำลังหาสัญญาณ');
    }
    const heading = _lastGpsHeading === null ? _deviceHeading : _lastGpsHeading;
    if (heading !== null) parts.push(`ทิศ ${Math.round(heading)}°`);
    if (_lastGpsFixAt) {
        const age = Math.max(0, Math.round((Date.now() - _lastGpsFixAt) / 1000));
        parts.push(age < 3 ? 'อัปเดตเมื่อกี้' : `${age} วิที่แล้ว`);
    } else if (detail) {
        parts.push(detail);
    }
    detailEl.textContent = parts.join(' · ');
    _updateMapDebugOverlay();
}

function updateGpsMarker(lat, lng, accuracy, forceFollow=false, heading=null, speed=null, markFix=true) {
    if (markFix) _lastGpsFixAt = Date.now();
    const previousRaw = myLatLng;
    const normalizedHeading = _normalizeHeading(heading) ?? _normalizeHeading(_deviceHeading);
    let displayHeading = normalizedHeading;
    if (displayHeading === null && previousRaw) {
        const movedRaw = haversine(previousRaw.lat, previousRaw.lng, lat, lng);
        if (movedRaw > 4) displayHeading = _bearingBetween(previousRaw.lat, previousRaw.lng, lat, lng);
    }
    displayHeading = displayHeading !== null ? _smoothHeading(displayHeading) : _lastGpsHeading;

    const display = _smoothGpsDisplay(lat, lng, accuracy, forceFollow);
    if (myLocationCircle) {
        map.removeLayer(myLocationCircle);
        myLocationCircle = null;
    }
    const icon = _createGpsIcon(displayHeading);
    const headingBucket = displayHeading === null ? 'none' : Math.round(displayHeading / 5) * 5 % 360;
    if (myLocationMarker) {
        myLocationMarker.setLatLng([display.lat, display.lng]);
        if (_lastGpsIconHeadingBucket !== headingBucket) {
            myLocationMarker.setIcon(icon);
            _lastGpsIconHeadingBucket = headingBucket;
        }
    } else {
        myLocationMarker = L.marker([display.lat, display.lng], {icon, zIndexOffset:3000, interactive:true}).addTo(map)
            .bindPopup(`<div style="padding:12px;font-size:13px;min-width:180px;">
                <b>📍 ตำแหน่งของฉัน</b><br>
                <small style="color:var(--text3);">${lat.toFixed(6)}, ${lng.toFixed(6)}</small><br>
                <small style="color:var(--text3);">±${Math.round(accuracy)}ม.</small><br><br>
                <button onclick="openAddAt(${lat},${lng})" style="background:var(--bl);color:white;border:none;border-radius:8px;padding:6px 14px;cursor:pointer;font-size:12px;font-family:inherit;">+ ปักหมุดที่นี่</button>
            </div>`);
        _lastGpsIconHeadingBucket = headingBucket;
    }
    myLatLng = {lat, lng};
    if (myLocationMarker.isPopupOpen()) {
        myLocationMarker.setPopupContent(`<div style="padding:12px;font-size:13px;min-width:180px;"><b>📍 ตำแหน่งของฉัน</b><br><small>${lat.toFixed(6)}, ${lng.toFixed(6)}</small><br><small>±${Math.round(accuracy)}ม.</small><br><br><button onclick="openAddAt(${lat},${lng})" style="background:var(--bl);color:white;border:none;border-radius:8px;padding:6px 14px;cursor:pointer;font-size:12px;font-family:inherit;">+ ปักหมุดที่นี่</button></div>`);
    }
    _smoothFollow(display.lat, display.lng, accuracy, forceFollow);
    _updateGpsStatusPanel();
    if (listSortMode==='near' || nearbyMode) update();
}

// หยุดติดตามกล้องเมื่อผู้ใช้ลาก map
// แสดง tooltip ถาวรเฉพาะตอน zoom >= 16
const TOOLTIP_ZOOM = 16;
function _updateTooltipVisibility() {
    if (_mobile) return;
    const showPermanent = map.getZoom() >= TOOLTIP_ZOOM;
    if (showPermanent === _tooltipPermanentState) return;
    _tooltipPermanentState = showPermanent;
    const markers = _individualMarkersLayer ? _individualMarkersLayer.getLayers() : [];
    markers.forEach(marker => {
        const tt = marker.getTooltip();
        if (!tt) return;
        if (showPermanent && !tt.options.permanent) {
            marker.unbindTooltip();
            marker.bindTooltip(tt._content || tt.getContent(), { permanent: true, direction: 'top', offset: [0, -9], className: 'bt-tooltip', opacity: 0.88 });
            if (marker._map) marker.openTooltip();
        } else if (!showPermanent && tt.options.permanent) {
            marker.unbindTooltip();
            marker.bindTooltip(tt._content || tt.getContent(), { permanent: false, direction: 'top', offset: [0, -2], className: 'bt-tooltip', opacity: 0.95 });
        }
    });
}
map.on('zoomend', () => {
    if (_mobile) return;
    _updateTooltipVisibility();
    const mode = _getMarkerRenderMode();
    if (mode !== _lastMarkerRenderMode) {
        scheduleMapOnlyUpdate('zoom');
    }
});
map.on('moveend', () => {
    if (_mobile && map.getContainer().classList.contains('is-gesture-zooming')) return;
    const mode = _getMarkerRenderMode();
    if (['points', 'district-detail', 'manual'].includes(mode)) {
        scheduleMapOnlyUpdate('move');
    }
});
map.on('zoomstart', () => {
    if (!_mobile) return;
    if (_mobileZoomRestoreTimer) {
        clearTimeout(_mobileZoomRestoreTimer);
        _mobileZoomRestoreTimer = null;
    }
    map.getContainer().classList.add('is-gesture-zooming');
    map.getContainer().classList.remove('show-mobile-marker-labels');
    _updateMapDebugOverlay();
});
map.on('zoomend', () => {
    if (!_mobile) return;
    map.getContainer().classList.remove('is-gesture-zooming');
    _mobileZoomRestoreTimer = setTimeout(() => {
        _mobileZoomRestoreTimer = null;
        scheduleMapOnlyUpdate('zoom');
    }, 60);
    _updateMapDebugOverlay();
});

if(btnGps){
map.on('dragstart', () => {
    if (gpsActive && gpsMode !== 'free') {
        _setGpsMode('free', 'อิสระ');
    }
});
}

function stopGps() {
    if (gpsWatcher !== null) { navigator.geolocation.clearWatch(gpsWatcher); gpsWatcher = null; }
    gpsActive = false; gpsTracking = false; gpsCoarseShown = false; gpsFlyDone = false;
    gpsMode = 'off';
    gpsToastShown = false; gpsFineToastShown = false;
    _clearGpsResumeTimer();
    _stopOrientationTracking();
    if(btnGps) _setGpsUi('');
    _lastGpsLat = null; _lastGpsLng = null;
    _lastGpsAccuracy = Infinity;
    _lastGpsFixAt = 0;
    _gpsDisplayLatLng = null;
    _lastGpsHeading = null;
    _lastGpsIconHeadingBucket = null;
    _setGpsStatusTicker(false);
    _updateGpsStatusPanel();
}

// btnGps: กดครั้งที่ 1 = เปิด GPS + เปิด tracking, กดครั้งที่ 2 = กล้องบินไปตำแหน่ง + เปิด tracking อีกครั้ง
if(btnGps) btnGps.onclick = async () => {
    if (!navigator.geolocation) { showToast('Browser ไม่รองรับ GPS', true); return; }
    if (gpsActive && myLocationMarker) {
        await _cycleGpsMode();
        const ll = myLocationMarker.getLatLng();
        if (gpsTracking) _smoothFollow(ll.lat, ll.lng, _lastGpsAccuracy, true);
        showToast(gpsMode === 'compass' ? 'GPS: โหมดเข็มทิศ' : gpsMode === 'free' ? 'GPS: โหมดอิสระ' : 'GPS: ติดตามตำแหน่ง');
        return;
    }
    stopGps();
    gpsActive = true;
    await _setGpsMode('follow');
    _lastGpsPanAt = 0;
    _lastGpsAccuracy = Infinity;
    _setGpsUi('gps-searching');
    showToast('กำลังหาตำแหน่ง...');
    await _ensureOrientationTracking();
    navigator.geolocation.getCurrentPosition(
        pos => {
            if (!gpsActive) return;
            const {latitude:lat, longitude:lng, accuracy, heading, speed} = pos.coords;
            gpsCoarseShown = true;
            _lastGpsLat = lat; _lastGpsLng = lng; _lastGpsAccuracy = accuracy;
            const firstFollow = !gpsFlyDone;
            gpsFlyDone = true;
            updateGpsMarker(lat, lng, accuracy, firstFollow, heading, speed);
            _updateGpsModeAccuracy(accuracy);
            if (!gpsToastShown) {
                gpsToastShown = true;
                showToast(accuracy > 500 ? `📡 ±${Math.round(accuracy)}ม.` : `✅ พบตำแหน่ง ±${Math.round(accuracy)}ม.`, false, true);
            }
            // watchPosition — อัปเดตแบบ continuous
            gpsWatcher = navigator.geolocation.watchPosition(
                pos2 => {
                    if (!gpsActive) return;
                    const {latitude:lat2, longitude:lng2, accuracy:acc2, heading:heading2, speed:speed2} = pos2.coords;
                    // กรอง noise: ถ้าตำแหน่งไม่เปลี่ยนมากพอ ไม่ต้อง update marker
                    if (_lastGpsLat !== null) {
                        const moved = haversine(_lastGpsLat, _lastGpsLng, lat2, lng2);
                        const accuracyImproved = acc2 + 5 < _lastGpsAccuracy;
                        if (moved < 1.5 && !accuracyImproved) return;
                    }
                    _lastGpsLat = lat2; _lastGpsLng = lng2; _lastGpsAccuracy = acc2;
                    updateGpsMarker(lat2, lng2, acc2, false, heading2, speed2);
                    _updateGpsModeAccuracy(acc2);
                    if (!gpsFineToastShown && acc2 < 50) {
                        gpsFineToastShown = true;
                        _updateGpsModeAccuracy(acc2);
                        showToast(`แม่นยำ ±${Math.round(acc2)}ม.`, false, true);
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
    // Manual Route Mode - add point on map click
    if (manualRouteMode) {
        const {lat, lng} = e.latlng;
        addManualRoutePoint(lat, lng, 'จุดบนแผนที่');
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
            // Auto-fill list with city name (overrides nearest-location guess, unless filter active)
            if(!filterList){
                document.getElementById('modalList').value=city;
            }
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
    // If city is missing, auto-fill via reverse geocode
    if(!loc.city){
        _reverseGeocodeCity(loc.lat,loc.lng).then(city=>{
            if(city&&!document.getElementById('modalCity').value){
                document.getElementById('modalCity').value=city;
                if(!document.getElementById('modalList').value)
                    document.getElementById('modalList').value=city;
            }
        });
    }
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
    let editChanges = null;
    if(editingIndex >= 0 && locations[editingIndex]){
        const old = locations[editingIndex];
        editChanges = {};
        [
            ['name', old.name || '', entry.name || ''],
            ['list', old.list || '', entry.list || ''],
            ['city', old.city || '', entry.city || ''],
            ['note', old.note || '', entry.note || ''],
            ['lat', Number(old.lat).toFixed(6), Number(entry.lat).toFixed(6)],
            ['lng', Number(old.lng).toFixed(6), Number(entry.lng).toFixed(6)],
            ['tags', (old.tags || []).join(', '), (entry.tags || []).join(', ')]
        ].forEach(([key, before, after]) => {
            if(before !== after) editChanges[key] = { old: before, new: after };
        });
        if(!Object.keys(editChanges).length) editChanges = null;
    }
    addChangelogEntry(editingIndex>=0?'edit':'add',entry,editChanges);
    document.getElementById('editModalOverlay').classList.remove('open');
    showToast(editingIndex>=0?'บันทึกสำเร็จ':'เพิ่มสถานที่แล้ว',false,true);
    // Optimistic local update
    if(editingIndex>=0){
        // Keep sb_id for update
        const existing=locations[editingIndex];
        entry.sb_id = existing.sb_id;
        locations[editingIndex] = entry;
    } else {
        locations.push(entry);
    }
    saveLocations();invalidateCache();update();
    
    if(_sbLoaded){
        // Realtime will broadcast, but we updated local already for instant feedback
        if(editingIndex>=0){
            sbUpdate(entry);
        } else {
            if(editingIndex<0)map.flyTo([lat,lng],15,{animate:true,duration:0.7});
            sbInsert(entry);
        }
    }
};

// ════════════════════════════════════════════
// DELETE
// ════════════════════════════════════════════
window.doConfirmDelete=function(idx){
    const loc=locations[idx]; if(!loc)return;
    showConfirm('delete','ลบสถานที่?',`"${loc.name||loc.list}" จะถูกลบ (Undo ได้)`,()=>{
        addChangelogEntry('delete',loc);
        pushUndo();locations.splice(idx,1);_clearSearchMarkerIfDeleted(loc);saveLocations();invalidateCache();closePlaceCard();update();showToast('ลบแล้ว');
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
    const chipRoute = document.getElementById('chipRoute');
    if(chipRoute) chipRoute.classList.remove('active');
    // Restore sort bar + markers
    const listSortBar = document.getElementById('listSortBar');
    if(listSortBar) listSortBar.style.display='';
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
    if(_districtClusterGroup) map.removeLayer(_districtClusterGroup);
    if(_individualMarkersLayer) map.removeLayer(_individualMarkersLayer);

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
    try {
        const filtered=getFiltered();
        if(filtered.length<2){showToast('ต้องมีอย่างน้อย 2 จุด',true);return;}
        if(filtered.length>500){showToast('มากเกินไป (สูงสุด 500 จุด)',true);return;}

        showToast('🛤️ กำลังวางแผนเส้นทาง...');

        const startLat=myLatLng?myLatLng.lat:filtered[0].lat;
        const startLng=myLatLng?myLatLng.lng:filtered[0].lng;

        _routeStops=_tspSolve(filtered, startLat, startLng);
        routeMode=true;
        const chipRoute = document.getElementById('chipRoute');
        if(chipRoute) chipRoute.classList.add('active');
        await _routeDraw();
    } catch(e) {
        console.error('[BT] doRoute error:', e);
        showToast('เกิดข้อผิดพลาดในการวางแผนเส้นทาง', true);
    }
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
    try {
        const uniqueLists = [...new Set(locations.map(l => l.list))].filter(l => l);
        if(uniqueLists.length < 1){showToast('ไม่พบรายการข้อมูล',true);return;}
        
        showToast('🗺️ กำลังวางแผนหลายเส้นทาง...');
        clearRoute();
        if(multiRouteLayer) map.removeLayer(multiRouteLayer);
        multiRouteLayer = L.layerGroup().addTo(map);
        multiRouteMode = true;
        const btnPlanMultipleRoutes = document.getElementById('btnPlanMultipleRoutes');
        if(btnPlanMultipleRoutes) btnPlanMultipleRoutes.classList.add('active');

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
        if(_districtClusterGroup) map.removeLayer(_districtClusterGroup);
        if(_individualMarkersLayer) map.removeLayer(_individualMarkersLayer);
        renderMarkers();
    } catch(e) {
        console.error('[BT] doMultiRoute error:', e);
        showToast('เกิดข้อผิดพลาดในการวางแผนหลายเส้นทาง', true);
    }
}

function clearMultiRoutes(){
    if(multiRouteLayer){ map.removeLayer(multiRouteLayer); multiRouteLayer = null; }
    multiRouteMode = false;
    document.getElementById('btnPlanMultipleRoutes')?.classList.remove('active');
    update();
}

// ════════════════════════════════════════════
// MANUAL ROUTE MODE (user selects points)
// ════════════════════════════════════════════
function startManualRouteMode(){
    clearManualRoute();
    manualRouteMode = true;
    showToast('📍 โหมดเลือกจุด: คลิกบนแผนที่หรือจุดเพื่อเพิ่ม (กด ✅ คำนวณเส้นทางเมื่อเสร็จ)');
    openManualRoutePanel();
    update();
}

function addManualRoutePoint(lat, lng, name='จุดที่เลือก'){
    if(!manualRouteMode) return;
    const pt = {lat, lng, name: `${name} ${manualRoutePoints.length+1}`};
    manualRoutePoints.push(pt);
    // Add marker
    const marker = L.marker([lat, lng], {
        icon: L.divIcon({
            className: 'manual-route-marker',
            html: `<div style="background:#5b8fff;color:#fff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);">${manualRoutePoints.length}</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        })
    }).addTo(map).bindPopup(`${pt.name} <button onclick="removeManualPoint(${manualRoutePoints.length-1})" style="margin-left:8px;padding:2px 6px;font-size:11px;">ลบ</button>`);
    manualRouteMarkers.push(marker);
    updateManualRoutePanel();
    showToast(`📍 เพิ่ม ${pt.name} (${manualRoutePoints.length} จุด)`);
}

function removeManualPoint(idx){
    if(idx < 0 || idx >= manualRoutePoints.length) return;
    manualRoutePoints.splice(idx, 1);
    // Remove marker
    if(manualRouteMarkers[idx]){
        map.removeLayer(manualRouteMarkers[idx]);
        manualRouteMarkers.splice(idx, 1);
    }
    // Renumber remaining markers
    manualRouteMarkers.forEach((m, i) => {
        m.setIcon(L.divIcon({
            className: 'manual-route-marker',
            html: `<div style="background:#5b8fff;color:#fff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);">${i+1}</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        }));
        m.setPopupContent(`${manualRoutePoints[i].name} <button onclick="removeManualPoint(${i})" style="margin-left:8px;padding:2px 6px;font-size:11px;">ลบ</button>`);
    });
    updateManualRoutePanel();
}

function clearManualRoute(){
    manualRouteMode = false;
    manualRoutePoints = [];
    manualRouteMarkers.forEach(m => map.removeLayer(m));
    manualRouteMarkers = [];
    if(routeLine){ map.removeLayer(routeLine); routeLine = null; }
    routeMode = false;
    closeManualRoutePanel();
    // Remove banner if exists
    const banner = document.getElementById('manualRouteBanner');
    if(banner) banner.remove();
}

async function calculateManualRoute(){
    if(manualRoutePoints.length < 2){
        showToast('ต้องมีอย่างน้อย 2 จุด', true);
        return;
    }
    showToast('🗺️ กำลังคำนวณเส้นทาง...');
    
    try {
        // Build waypoints for OSRM [lng, lat]
        const waypoints = manualRoutePoints.map(p => [p.lng, p.lat]);
        
        // Fetch actual road route from OSRM
        const result = await _routeFetchOSRM(waypoints);
        
        // Draw actual road route
        const coords = result.coords; // [lat, lng] pairs
        if(routeLine) map.removeLayer(routeLine);
        routeLine = L.polyline(coords, {color: '#5b8fff', weight: 4, opacity: 0.85}).addTo(map);
        routeMode = true;
        
        // Fit bounds
        map.fitBounds(routeLine.getBounds(), {padding: [50, 50]});
        
        // Show success with distance
        const distText = formatDist(result.distance);
        const etaMins = Math.round(result.duration / 60);
        
        // Close panel after successful calculation
        closeManualRoutePanel();
        manualRouteMode = false;
        
        // Show route banner
        _showManualRouteBanner(result.distance, result.duration);
        
    } catch(e) {
        console.warn('[BT] Manual route OSRM failed:', e.message);
        showToast('❌ ไม่สามารถคำนวณเส้นทางได้ (ลองเลือกจุดที่อยู่บนถนน)', true);
        
        // Fallback: draw straight lines with warning
        const pts = manualRoutePoints.map(p => [p.lat, p.lng]);
        if(routeLine) map.removeLayer(routeLine);
        routeLine = L.polyline(pts, {color: '#ff6b6b', weight: 3, opacity: 0.6, dashArray: '10, 5'}).addTo(map);
        routeMode = true;
        map.fitBounds(routeLine.getBounds(), {padding: [50, 50]});
        showToast('⚠️ แสดงเส้นตรง (ไม่ใช่เส้นทางจริง)', true);
    }
}

// Show manual route banner similar to nav banner
function _showManualRouteBanner(distance, duration){
    // Remove old banner
    let old = document.getElementById('manualRouteBanner');
    if(old) old.remove();
    
    const banner = document.createElement('div');
    banner.id = 'manualRouteBanner';
    banner.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:2000;background:rgba(15,23,42,0.95);backdrop-filter:blur(12px);padding:16px 20px;border-radius:24px;box-shadow:0 12px 40px rgba(0,0,0,0.5);font-size:14px;font-family:inherit;min-width:280px;max-width:92vw;width:360px;color:#fff;border:1px solid rgba(255,255,255,0.1);';
    
    const distKm = (distance / 1000).toFixed(1);
    const etaMins = Math.round(duration / 60);
    const stopsText = manualRoutePoints.map((p, i) => `${i+1}. ${p.name}`).join(' → ');
    
    banner.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
            <span style="font-size:20px;">🗺️</span>
            <strong style="font-size:16px;font-weight:700;color:#5b8fff;">เส้นทางที่วางแผน</strong>
        </div>
        <div style="display:flex;gap:20px;font-size:14px;margin:8px 0;opacity:0.9;">
            <span style="display:flex;align-items:center;gap:6px;">📏 ${distKm} km</span>
            <span style="display:flex;align-items:center;gap:6px;">⏱️ ~${etaMins} นาที</span>
        </div>
        <div style="font-size:11px;color:#aaa;margin-bottom:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${stopsText}
        </div>
        <div style="display:flex;gap:8px;margin-top:14px;">
            <button onclick="_openManualRouteInMaps()" style="flex:1;padding:10px 4px;border:none;border-radius:12px;background:rgba(255,255,255,0.1);cursor:pointer;font-size:12px;font-weight:600;color:#fff;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:4px;">
                <span>🗺️</span> Maps
            </button>
            <button onclick="clearManualRoute();document.getElementById('manualRouteBanner').remove();" style="width:40px;height:40px;border:none;background:#ff4d4d;color:#fff;border-radius:12px;cursor:pointer;font-size:16px;font-weight:bold;box-shadow:0 4px 10px rgba(255,77,77,0.3);transition:all .2s;display:flex;align-items:center;justify-content:center;">
                ✕
            </button>
        </div>
    `;
    
    document.body.appendChild(banner);
}

// Open manual route in Google Maps
function _openManualRouteInMaps(){
    if(manualRoutePoints.length < 2) return;
    const origin = `${manualRoutePoints[0].lat},${manualRoutePoints[0].lng}`;
    const destination = `${manualRoutePoints[manualRoutePoints.length-1].lat},${manualRoutePoints[manualRoutePoints.length-1].lng}`;
    const waypoints = manualRoutePoints.slice(1, -1).map(p => `${p.lat},${p.lng}`).join('|');
    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
    if(waypoints) url += `&waypoints=${waypoints}`;
    window.open(url, '_blank');
}

let _manualRoutePanelOpen = false;
function openManualRoutePanel(){
    _manualRoutePanelOpen = true;
    updateManualRoutePanel();
}
function closeManualRoutePanel(){
    _manualRoutePanelOpen = false;
    const panel = document.getElementById('manualRoutePanel');
    if(panel) panel.remove();
}
function updateManualRoutePanel(){
    if(!_manualRoutePanelOpen) return;
    let panel = document.getElementById('manualRoutePanel');
    if(!panel){
        panel = document.createElement('div');
        panel.id = 'manualRoutePanel';
        panel.style.cssText = 'position:fixed;left:0;right:0;bottom:0;background:var(--s1);border-radius:14px 14px 0 0;border-top:0.5px solid var(--bd2);z-index:30;max-height:55vh;display:flex;flex-direction:column;transform:translateY(0);transition:transform 0.25s cubic-bezier(0.22,1,0.36,1);';
        document.body.appendChild(panel);
    }
    panel.innerHTML = `
        <div style="width:36px;height:4px;border-radius:2px;background:var(--bd2);margin:10px auto 8px;flex-shrink:0;cursor:pointer;" onclick="closeManualRoutePanel();manualRouteMode=false;"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0 14px 10px;border-bottom:0.5px solid var(--bd);flex-shrink:0;">
            <span style="font-size:13px;font-weight:700;color:var(--tx);">📍 เลือกจุด <span style="background:var(--bl);color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;margin-left:6px;">${manualRoutePoints.length}</span></span>
            <div style="display:flex;gap:8px;">
                <button onclick="clearManualRoute()" style="padding:6px 12px;background:var(--s2);border:none;border-radius:8px;font-size:12px;color:var(--tx2);cursor:pointer;">ยกเลิก</button>
                <button onclick="calculateManualRoute()" style="padding:6px 12px;background:${manualRoutePoints.length < 2 ? 'var(--s3)' : 'var(--bl)'};color:${manualRoutePoints.length < 2 ? 'var(--tx3)' : '#fff'};border:none;border-radius:8px;font-size:12px;cursor:pointer;${manualRoutePoints.length < 2 ? '' : 'font-weight:600;'}">${manualRoutePoints.length < 2 ? 'ต้อง 2+ จุด' : 'คำนวณ'}</button>
            </div>
        </div>
        <div style="flex:1;overflow-y:auto;padding:12px 14px;">
            <div style="position:relative;margin-bottom:12px;">
                <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:14px;color:var(--tx3);">⌕</span>
                <input type="text" id="mrpSearchInput" placeholder="ค้นหาชื่อสถานที่..." autocomplete="off" style="width:100%;padding:10px 12px 10px 36px;border:0.5px solid var(--bd);border-radius:10px;background:var(--s2);color:var(--tx);font-size:14px;box-sizing:border-box;">
                <div id="mrpSearchResults" style="position:absolute;top:100%;left:0;right:0;margin-top:4px;background:var(--s1);border-radius:10px;border:0.5px solid var(--bd2);box-shadow:0 4px 16px rgba(0,0,0,0.2);max-height:150px;overflow-y:auto;z-index:101;display:none;"></div>
            </div>
            ${manualRoutePoints.length === 0 
                ? '<div style="text-align:center;padding:24px;color:var(--tx3);font-size:13px;"><div style="font-size:32px;margin-bottom:8px;">📍</div>คลิกบนแผนที่ หรือค้นหาเพื่อเพิ่มจุด</div>'
                : `<div style="display:flex;flex-direction:column;gap:6px;">${manualRoutePoints.map((p, i) => `
                    <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--s2);border-radius:10px;border:0.5px solid var(--bd);">
                        <span style="width:24px;height:24px;border-radius:50%;background:var(--bl);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">${i+1}</span>
                        <span style="flex:1;font-size:13px;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}</span>
                        <button onclick="removeManualPoint(${i})" style="width:24px;height:24px;border-radius:50%;border:none;background:var(--s4);color:var(--tx3);font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">×</button>
                    </div>
                `).join('')}</div>`
            }
            <div style="font-size:11px;color:var(--tx3);text-align:center;padding:10px;background:var(--s2);border-radius:8px;margin-top:10px;">💡 คลิกที่ marker หรือพิมพ์ค้นหาเพื่อเพิ่มจุด</div>
        </div>
    `;
    
    // Wire up search
    setTimeout(() => {
        const input = document.getElementById('mrpSearchInput');
        const results = document.getElementById('mrpSearchResults');
        if (input) {
            input.addEventListener('input', (e) => {
                const query = e.target.value.trim().toLowerCase();
                if (!query || !results) {
                    if (results) results.style.display = 'none';
                    return;
                }
                // Search in locations
                const matches = locations.filter(l => 
                    (l.name && l.name.toLowerCase().includes(query)) ||
                    (l.list && l.list.toLowerCase().includes(query)) ||
                    (l.city && l.city.toLowerCase().includes(query))
                ).slice(0, 5);
                
                if (matches.length && results) {
                    results.innerHTML = matches.map(l => `
                        <div class="mrp-result" data-lat="${l.lat}" data-lng="${l.lng}" data-name="${l.name || l.list || 'จุด'}">
                            <div style="font-weight:600;color:var(--text);">${l.name || 'ไม่มีชื่อ'}</div>
                            <div style="font-size:11px;color:var(--text3);">${l.list}${l.city ? ' · ' + l.city : ''}</div>
                        </div>
                    `).join('');
                    results.style.display = 'block';
                    
                    // Click to add
                    results.querySelectorAll('.mrp-result').forEach(el => {
                        el.addEventListener('click', () => {
                            const lat = parseFloat(el.dataset.lat);
                            const lng = parseFloat(el.dataset.lng);
                            const name = el.dataset.name;
                            addManualRoutePoint(lat, lng, name);
                            input.value = '';
                            results.style.display = 'none';
                        });
                    });
                } else {
                    results.style.display = 'none';
                }
            });
            
            // Close results on outside click
            input.addEventListener('blur', () => {
                setTimeout(() => { if (results) results.style.display = 'none'; }, 200);
            });
        }
    }, 50);
}

// Expose for onclick handlers
window.removeManualPoint = removeManualPoint;
window.clearManualRoute = clearManualRoute;
window.calculateManualRoute = calculateManualRoute;
window._openManualRouteInMaps = _openManualRouteInMaps;

// ════════════════════════════════════════════
// INFO PANEL (kept for compatibility)
// ════════════════════════════════════════════
const infoPanelClose=document.getElementById('infoPanelClose');
const infoPanelBackdrop=document.getElementById('infoPanelBackdrop');
if(infoPanelClose) infoPanelClose.onclick = closeInfo;
if(infoPanelBackdrop) infoPanelBackdrop.onclick = closeInfo;

window.showChangelogDetail = function(timestamp) {
    const log = window.getChangelog().find(e => e.t === timestamp);
    if(!log) return;
    const body = document.getElementById('infoPanelBody');
    body.dataset.auditName = log.n;
    openInfoPanel('audit');
};

function _auditButtonFeedback(btn, label, duration = 1400) {
    if(!btn) return;
    const original = btn.dataset.originalText || btn.textContent;
    btn.dataset.originalText = original;
    btn.textContent = label;
    btn.classList.add('is-confirmed');
    window.clearTimeout(btn._auditFeedbackTimer);
    btn._auditFeedbackTimer = window.setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove('is-confirmed');
    }, duration);
}

window.copyAuditCoords = function(lat, lng, btn) {
    fallbackCopy(`${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`);
    _auditButtonFeedback(btn, 'คัดลอกแล้ว');
};

window.openAuditCoords = function(lat, lng, btn) {
    _auditButtonFeedback(btn, 'เปิดแล้ว', 900);
    window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
};

(function ensureAuditActionStyles(){
    if(document.getElementById('auditActionStyles')) return;
    const style = document.createElement('style');
    style.id = 'auditActionStyles';
    style.textContent = `
        .audit-action-btn {
            position: relative;
            overflow: hidden;
            border: 0.5px solid var(--bd2);
            background: var(--s2);
            color: var(--tx2);
            border-radius: 8px;
            padding: 5px 8px;
            font: 700 10px/1.1 inherit;
            cursor: pointer;
            transition: transform 160ms cubic-bezier(0.22,1,0.36,1), background 160ms ease, color 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
            -webkit-tap-highlight-color: transparent;
        }
        .audit-action-btn::after {
            content: "";
            position: absolute;
            inset: 50% auto auto 50%;
            width: 0;
            height: 0;
            border-radius: 999px;
            background: currentColor;
            opacity: 0;
            transform: translate(-50%, -50%);
        }
        .audit-action-btn:active {
            transform: scale(0.94);
        }
        .audit-action-btn:active::after {
            animation: auditButtonRipple 520ms cubic-bezier(0.22,1,0.36,1);
        }
        .audit-action-btn.is-map {
            border-color: var(--bl-b);
            background: var(--bl-d);
            color: var(--bl);
        }
        .audit-action-btn.is-confirmed {
            border-color: var(--gn-b);
            background: var(--gn-d);
            color: var(--gn);
            box-shadow: 0 0 0 3px rgba(46,204,144,0.12);
            animation: auditButtonConfirm 420ms cubic-bezier(0.22,1,0.36,1);
        }
        @keyframes auditButtonRipple {
            0% { width: 0; height: 0; opacity: 0.24; }
            100% { width: 52px; height: 52px; opacity: 0; }
        }
        @keyframes auditButtonConfirm {
            0% { transform: scale(0.94); }
            60% { transform: scale(1.05); }
            100% { transform: scale(1); }
        }
    `;
    document.head.appendChild(style);
})();

function _auditField(label, value) {
    const text = value === undefined || value === null || value === '' ? 'ไม่ระบุ' : value;
    return `<div style="display:grid;grid-template-columns:78px 1fr;gap:8px;align-items:start;padding:6px 0;border-bottom:0.5px solid var(--bd);">
        <span style="color:var(--tx3);font-size:10px;font-weight:700;text-transform:uppercase;">${label}</span>
        <span style="color:var(--tx);font-size:12px;line-height:1.45;word-break:break-word;">${_escapeHtml(text)}</span>
    </div>`;
}

function _renderAuditChanges(changes) {
    if(!changes) return '';
    const rows = Object.entries(changes);
    if(!rows.length) return '';
    const labels = { name:'ชื่อ', list:'รายการ', city:'เขต', note:'หมายเหตุ', lat:'Lat', lng:'Lng', tags:'Tags', count:'จำนวน' };
    return `<div style="margin-top:10px;padding:10px;border-radius:10px;background:var(--s1);border:0.5px solid var(--bd2);">
        <div style="font-size:10px;font-weight:800;color:var(--tx3);letter-spacing:.04em;text-transform:uppercase;margin-bottom:8px;">รายละเอียดที่เปลี่ยน</div>
        <div style="display:grid;gap:8px;">
            ${rows.map(([key, value]) => `<div style="display:grid;grid-template-columns:72px 1fr;gap:8px;align-items:start;">
                <span style="font-size:11px;color:var(--tx2);font-weight:700;">${_escapeHtml(labels[key] || key)}</span>
                <span style="font-size:11px;color:var(--tx);line-height:1.45;word-break:break-word;">
                    <span style="color:var(--rd);">${_escapeHtml(value.old ?? '')}</span>
                    <span style="color:var(--tx3);padding:0 5px;">→</span>
                    <span style="color:var(--gn);">${_escapeHtml(value.new ?? '')}</span>
                </span>
            </div>`).join('')}
        </div>
    </div>`;
}

function openInfoPanel(mode){
    const body=document.getElementById('infoPanelBody');
    if(mode==='changelog'){
        document.getElementById('infoPanelTitle').textContent='ประวัติการแก้ไข';
        const log=window.getChangelog();
        const actionLabel={add:'เพิ่ม',edit:'แก้ไข',delete:'ลบ'};
        const actionIcon={add:'➕',edit:'✏️',delete:'🗑️'};
        const actionColor={add:'#34a853',edit:'#4285f4',delete:'#ea4335'};
        if(!log.length){body.innerHTML='<div style="padding:24px;text-align:center;color:var(--text3);">\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e21\u0e35\u0e1b\u0e23\u0e30\u0e27\u0e31\u0e15\u0e34</div>';}
        else{body.innerHTML=`<div style="padding:8px 16px;">
            ${log.map(e=>{
                const d=new Date(e.t);
                const ts=d.toLocaleDateString('th-TH',{day:'numeric',month:'short'})+' '+d.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
                const user = e.user || 'unknown';
                const ip = e.ip || 'unknown';
                const details = e.details || `${actionLabel[e.a]} ${e.n}`;
                return `<div style="display:flex;gap:10px;align-items:flex-start;padding:12px 0;border-bottom:1px solid var(--gn);cursor:pointer;" onclick="showChangelogDetail(${e.t})">
                    <span style="font-size:16px;margin-top:2px;">${actionIcon[e.a]||'❓'}</span>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:13px;font-weight:600;color:${actionColor[e.a]||'var(--text)'};">${actionLabel[e.a]||e.a} · ${e.n||'(ไม่มีชื่อ)'}</div>
                        <div style="font-size:12px;color:var(--text);margin-top:2px;">${details}</div>
                        <div style="font-size:10px;color:var(--text3);margin-top:4px;display:flex;gap:8px;flex-wrap:wrap;">
                            <span>👤 ${user}</span>
                            <span>🌐 ${ip}</span>
                            <span>📱 ${getDeviceSummary(e.device || '')}</span>
                            <span>🕐 ${ts}</span>
                        </div>
                    </div>
                    <span style="font-size:12px;color:var(--bl);">›</span>
                </div>`;}).join('')}
        </div>`;}
    } else if(mode==='stats'){
        document.getElementById('infoPanelTitle').textContent='สถิติ';
        const lc={},cc={};
        locations.forEach(l=>{lc[l.list]=(lc[l.list]||0)+1;if(l.city)cc[l.city]=(cc[l.city]||0)+1;});
        const maxL=Math.max(...Object.values(lc),1);
        const sl=Object.entries(lc).sort((a,b)=>b[1]-a[1]);
        const sc=Object.entries(cc).sort((a,b)=>b[1]-a[1]);
        
        // Calculate top 5 and group others
        const top5 = sl.slice(0, 5);
        const others = sl.slice(5);
        const othersCount = others.reduce((sum, [_, c]) => sum + c, 0);
        
        body.innerHTML=`<div class="stats-section">
            <!-- Summary Cards -->
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px;">
                <div style="background:var(--s1);border-radius:12px;padding:12px;text-align:center;border:0.5px solid var(--bd2);">
                    <div style="font-size:24px;font-weight:700;color:var(--bl);">${locations.length}</div>
                    <div style="font-size:10px;color:var(--tx3);text-transform:uppercase;">จุดทั้งหมด</div>
                </div>
                <div style="background:var(--s1);border-radius:12px;padding:12px;text-align:center;border:0.5px solid var(--bd2);">
                    <div style="font-size:24px;font-weight:700;color:var(--bl);">${Object.keys(lc).length}</div>
                    <div style="font-size:10px;color:var(--tx3);text-transform:uppercase;">รายการ</div>
                </div>
                <div style="background:var(--s1);border-radius:12px;padding:12px;text-align:center;border:0.5px solid var(--bd2);">
                    <div style="font-size:24px;font-weight:700;color:var(--bl);">${Object.keys(cc).length}</div>
                    <div style="font-size:10px;color:var(--tx3);text-transform:uppercase;">เขต</div>
                </div>
            </div>
            
            <!-- Top Lists with Pie Chart -->
            <div style="background:var(--s1);border-radius:16px;padding:16px;margin-bottom:16px;border:0.5px solid var(--bd2);">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                    <div style="font-size:12px;font-weight:600;color:var(--tx);">สัดส่วนรายการ (Top ${Math.min(5, sl.length)})</div>
                    <div style="font-size:10px;color:var(--tx3);">${sl.length} รายการทั้งหมด</div>
                </div>
                
                <div style="display:grid;grid-template-columns:1fr 100px;gap:16px;align-items:center;">
                    <!-- List on left -->
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        ${top5.map(([n,c],i)=>`
                            <div style="display:flex;align-items:center;gap:8px;">
                                <div style="width:28px;height:28px;border-radius:8px;background:${getColor(n)};display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:600;">${i+1}</div>
                                <div style="flex:1;min-width:0;">
                                    <div style="font-size:13px;font-weight:500;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${n}</div>
                                    <div style="font-size:10px;color:var(--tx3);">${c} จุด · ${Math.round(c/locations.length*100)}%</div>
                                </div>
                                <div style="font-size:13px;font-weight:600;color:var(--bl);">${c}</div>
                            </div>
                        `).join('')}
                        ${others.length > 0 ? `
                            <div style="display:flex;align-items:center;gap:8px;padding-top:4px;border-top:0.5px solid var(--bd2);">
                                <div style="width:28px;height:28px;border-radius:8px;background:var(--s3);display:flex;align-items:center;justify-content:center;color:var(--tx3);font-size:11px;font-weight:600;">+</div>
                                <div style="flex:1;">
                                    <div style="font-size:12px;color:var(--tx2);">อื่นๆ ${others.length} รายการ</div>
                                    <div style="font-size:10px;color:var(--tx3);">${othersCount} จุด · ${Math.round(othersCount/locations.length*100)}%</div>
                                </div>
                                <div style="font-size:13px;font-weight:600;color:var(--tx2);">${othersCount}</div>
                            </div>
                        ` : ''}
                    </div>
                    
                    <!-- Simple Pie Chart on right -->
                    <div style="position:relative;width:100px;height:100px;">
                        <svg width="100" height="100" viewBox="0 0 100 100" style="transform:rotate(-90deg);">
                            ${(()=>{
                                let accumulated = 0;
                                const total = locations.length;
                                return top5.map(([n,c],i)=>{
                                    const percentage = c/total;
                                    const dashArray = `${percentage * 75} ${100 - percentage * 75}`;
                                    const dashOffset = -accumulated * 75;
                                    accumulated += percentage;
                                    return `<circle cx="50" cy="50" r="25" fill="none" stroke="${getColor(n)}" stroke-width="50" stroke-dasharray="${dashArray}" stroke-dashoffset="${dashOffset}" />`;
                                }).join('') + (othersCount > 0 ? `<circle cx="50" cy="50" r="25" fill="none" stroke="var(--s3)" stroke-width="50" stroke-dasharray="${othersCount/total * 75} ${100 - othersCount/total * 75}" stroke-dashoffset="${-accumulated * 75}" />` : '');
                            })()}
                        </svg>
                        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;">
                            <div style="font-size:16px;font-weight:700;color:var(--bl);">${sl.length}</div>
                            <div style="font-size:8px;color:var(--tx3);">รายการ</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Cities Grid -->
            ${sc.length > 0 ? `
                <div style="background:var(--s1);border-radius:16px;padding:16px;border:0.5px solid var(--bd2);">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                        <div style="font-size:12px;font-weight:600;color:var(--tx);">จุดต่อเขต</div>
                        <div style="font-size:10px;color:var(--tx3);">${sc.length} เขต</div>
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">
                        ${sc.slice(0, 10).map(([n,c],i)=>`
                            <div style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--s2);border-radius:8px;">
                                <div style="width:6px;height:6px;border-radius:50%;background:var(--bl);"></div>
                                <div style="flex:1;min-width:0;">
                                    <div style="font-size:11px;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${n}</div>
                                </div>
                                <div style="font-size:11px;font-weight:600;color:var(--bl);">${c}</div>
                            </div>
                        `).join('')}
                    </div>
                    ${sc.length > 10 ? `<div style="text-align:center;margin-top:8px;font-size:10px;color:var(--tx3);">+${sc.length - 10} เขตอื่นๆ</div>` : ''}
                </div>
            ` : ''}
        </div>`;
    } else if(mode==='audit'){
        // Show detailed audit for a specific location
        const locName = body.dataset.auditName;
        const locLog = window.getChangelog().filter(e => e.n === locName).slice(0, 10);
        document.getElementById('infoPanelTitle').textContent = `ประวัติ: ${locName}`;
        if(!locLog.length){
            body.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text3);">ไม่มีประวัติการแก้ไข</div>';
        } else {
            body.innerHTML = `<div style="padding:8px 16px;">${locLog.map(e=>{
                const d=new Date(e.t);
                const ts=d.toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'medium'});
                const iso=new Date(e.t).toISOString();
                const actionColor={add:'#34a853',edit:'#4285f4',delete:'#ea4335'}[e.a]||'var(--text)';
                const actionLabel={add:'เพิ่มจุด',edit:'แก้ไขจุด',delete:'ลบจุด'}[e.a]||e.a;
                const actionIcon={add:'➕',edit:'✏️',delete:'🗑️'}[e.a]||'•';
                const lat=Number(e.lat), lng=Number(e.lng);
                const hasCoords=Number.isFinite(lat)&&Number.isFinite(lng);
                return `<div style="padding:12px;background:var(--s2);border-radius:12px;margin-bottom:10px;border:1px solid ${actionColor}66;box-shadow:0 8px 22px rgba(0,0,0,0.18);">
                    <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;">
                        <div style="width:30px;height:30px;border-radius:9px;background:${actionColor}22;color:${actionColor};display:grid;place-items:center;font-size:14px;flex-shrink:0;">${actionIcon}</div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:12px;font-weight:800;color:${actionColor};">${actionLabel}</div>
                            <div style="font-size:14px;font-weight:700;color:var(--tx);line-height:1.35;word-break:break-word;">${_escapeHtml(e.n||'(ไม่มีชื่อ)')}</div>
                        </div>
                    </div>
                    <div style="padding:10px;border-radius:10px;background:var(--s1);border:0.5px solid var(--bd2);margin-bottom:10px;">
                        ${_auditField('รายละเอียด', e.details || e.n)}
                        ${_auditField('รายการ', e.list || '')}
                        ${_auditField('เขต', e.city || '')}
                        ${_auditField('หมายเหตุ', e.note || '')}
                        ${_auditField('Tags', Array.isArray(e.tags) ? e.tags.join(', ') : '')}
                    </div>
                    <div style="padding:10px;border-radius:10px;background:var(--s1);border:0.5px solid var(--bd2);margin-bottom:10px;">
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
                            <div style="font-size:10px;font-weight:800;color:var(--tx3);letter-spacing:.04em;text-transform:uppercase;">พิกัด</div>
                            ${hasCoords ? `<div style="display:flex;gap:6px;">
                                <button type="button" class="audit-action-btn" onclick="copyAuditCoords(${lat},${lng},this)">คัดลอก</button>
                                <button type="button" class="audit-action-btn is-map" onclick="openAuditCoords(${lat},${lng},this)">แผนที่</button>
                            </div>` : ''}
                        </div>
                        ${_auditField('Latitude', hasCoords ? lat.toFixed(6) : '')}
                        ${_auditField('Longitude', hasCoords ? lng.toFixed(6) : '')}
                    </div>
                    <div style="padding:10px;border-radius:10px;background:var(--s1);border:0.5px solid var(--bd2);">
                        ${_auditField('ผู้ใช้', e.user || 'unknown')}
                        ${_auditField('IP', e.ip || 'unknown')}
                        ${_auditField('อุปกรณ์', e.device || getDeviceSummary(e.device || ''))}
                        ${_auditField('เวลาไทย', ts)}
                        ${_auditField('เวลา ISO', iso)}
                    </div>
                    ${_renderAuditChanges(e.changes)}
                </div>`;
            }).join('')}</div>`;
        }
    } else {
        document.getElementById('infoPanelTitle').textContent='BT Locations';
        const _syncAgo=getToken()?` · ${Math.round((Date.now()-_lastSyncTime)/1000)}s ago`:'';
        const _darkLabel=document.body.classList.contains('light')?'🌙 Dark mode':'☀️ Light mode';
        const _menuGrid=(title,items)=>`
            <div style="margin-bottom:16px;padding:0 16px;animation:menuSlideIn 0.3s ease-out;">
                <style>
                    @keyframes menuSlideIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
                    @keyframes btnPop{0%{transform:scale(1);}50%{transform:scale(0.96);}100%{transform:scale(1);}}
                    .menu-btn{transition:all 0.2s cubic-bezier(0.4,0,0.2,1);position:relative;overflow:hidden;}
                    .menu-btn:before{content:'';position:absolute;inset:0;background:radial-gradient(circle at center,rgba(255,255,255,0.1) 0%,transparent 70%);opacity:0;transition:opacity 0.3s;}
                    .menu-btn:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,0.15);background:var(--s3);}
                    .menu-btn:hover:before{opacity:1;}
                    .menu-btn:active{transform:scale(0.96) translateY(0);animation:btnPop 0.2s ease-out;}
                </style>
                <div style="font-size:12px;font-weight:600;color:var(--text3);margin-bottom:8px;padding-left:4px;">${title}</div>
                <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">
                    ${items.filter(i=>i[0]!=='—').map(([icon,label,id,cls])=>`
                        <button id="${id}" class="menu-btn" style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--s2);border-radius:12px;border:none;cursor:pointer;color:var(--text);font-size:13px;text-align:left;${cls==='red'?'color:#ff6b6b;':''}">
                            <span style="font-size:18px;flex-shrink:0;transition:transform 0.2s;">${icon}</span>
                            <span style="font-weight:500;flex:1;">${label}</span>
                            <span style="font-size:12px;color:var(--text3);opacity:0.5;transition:transform 0.2s,opacity 0.2s;">›</span>
                        </button>
                    `).join('')}
                </div>
            </div>`;
        body.innerHTML=`
            <div style="padding:20px 0;">
                <div style="padding:0 20px 20px;display:flex;align-items:center;gap:14px;animation:menuSlideIn 0.3s ease-out 0.1s both;">
                    <div style="width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,var(--bl),#6366f1);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 15px rgba(91,143,255,0.3);animation:iconPulse 2s ease-in-out infinite;">
                        <style>@keyframes iconPulse{0%,100%{transform:scale(1);}50%{transform:scale(1.02);}}</style>
                        <span style="font-size:26px;">📍</span>
                    </div>
                    <div>
                        <div style="font-size:18px;font-weight:700;color:var(--text);letter-spacing:-0.3px;">BT Locations</div>
                        <div style="font-size:13px;color:var(--text3);margin-top:2px;">${locations.length.toLocaleString()} สถานที่</div>
                    </div>
                </div>
                ${_menuGrid('จัดการข้อมูล',[
                    ['↩️','เลิกทำ','omUndoM',''],
                    ['↪️','ทำซ้ำ','omRedoM',''],
                    ['📤','Export','omExportM',''],
                    ['📥','Import','omImportM',''],
                    ['🔄','Sync','omSyncM',''],
                ])}
                ${_menuGrid('ดูข้อมูล',[
                    ['📊','สถิติ','omStatsM',''],
                    ['📝','Changelog','omChangelogM',''],
                    ['📈',_mapDebugOverlayEnabled?'ปิด Map Debug':'เปิด Map Debug','omMapDebugM',''],
                ])}
                ${_menuGrid('เส้นทาง',[
                    ['🗺️','เลือกจุดเอง','omManualRouteM',''],
                    [trackingActive?'⏹️':'▶️',trackingActive?'หยุดบันทึก':'บันทึก Track','omTrackM',''],
                    ['👁️','แสดง Track','omShowPathsM',''],
                    ['📤','Export Track','omExportPathsM',''],
                ])}
            </div>`;
        const b=(id,fn)=>{const el=document.getElementById(id);if(el)el.onclick=fn;};
        b('omExportM',  doExport);
        b('omImportM',  ()=>{closeInfo();document.getElementById('fileImport').click();});
        b('omStatsM',   ()=>openInfoPanel('stats'));
        b('omChangelogM',()=>openInfoPanel('changelog'));
        b('omMapDebugM',()=>{closeInfo();setMapDebugOverlay(!_mapDebugOverlayEnabled);});
        b('omSyncM',    ()=>{closeInfo();doSync(false);});
        b('omUndoM',    doUndo);
        b('omRedoM',    doRedo);
        b('omManualRouteM', ()=>{closeInfo();startManualRouteMode();});
        b('omTrackM',   ()=>{closeInfo();toggleTracking();});
        b('omShowPathsM',()=>{closeInfo();showSavedPaths();});
        b('omExportPathsM',()=>{closeInfo();exportPaths();});
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
    const jsonStr = JSON.stringify(buildExportPayload(), null, 2);
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

function buildExportPayload() {
    return {
        schema: 'bt-locations',
        schemaVersion: DATA_SCHEMA_VERSION,
        appVersion: typeof APP_VERSION !== 'undefined' ? APP_VERSION : '',
        exportedAt: new Date().toISOString(),
        count: locations.length,
        locations
    };
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

const DATA_ACTION_CODE = '125355';
function confirmDataAction(label, callback) {
    const code = prompt(`กรอกรหัสยืนยันสำหรับ ${label}`);
    if (code === null) return false;
    if (code !== DATA_ACTION_CODE) {
        showToast('รหัสยืนยันไม่ถูกต้อง', true);
        return false;
    }
    callback();
    return true;
}

function protectedDataAction(action) {
    if (action === 'export') {
        return confirmDataAction('Export', doExport);
    }
    if (action === 'import') {
        return confirmDataAction('Import', () => document.getElementById('fileImport').click());
    }
    if (action === 'importModal') {
        return confirmDataAction('Import', openImportModal);
    }
    if (action === 'deleteAll') {
        return confirmDataAction('ลบข้อมูลทั้งหมด', () => doDeleteAllLocations());
    }
}

function doDeleteAllLocations() {
    if (!locations.length) { showToast('ไม่มีข้อมูลให้ลบ'); return; }
    showConfirm('delete', `ลบทั้งหมด ${locations.length} จุด?`, 'การลบนี้จะบันทึกไว้ใน Undo เพื่อกู้คืนได้ทันที', async () => {
        pushUndo();
        const toDelete = [...locations];
        locations = [];
        _clearSearchMarker();
        saveLocations();
        invalidateCache();
        closePlaceCard();
        update();
        addChangelogEntry('delete', { name: 'ข้อมูลทั้งหมด', lat: 0, lng: 0, list: '', city: '' }, { count: { old: toDelete.length, new: 0 } });
        showToast(`ลบทั้งหมด ${toDelete.length} จุดแล้ว กด Undo เพื่อกู้คืน`, true);
        if (_sbLoaded) {
            const withId = toDelete.filter(l => l.sb_id);
            const withoutId = toDelete.filter(l => !l.sb_id);
            for (const l of withId) await sbDelete(l);
            if (withoutId.length) {
                const coords = withoutId.map(l => `(lat.eq.${l.lat},lng.eq.${l.lng})`);
                const {error} = await _sb.from('locations').delete().or(coords.join(','));
                if (error) console.warn('sbDelete by coord failed:', error.message);
            }
        }
    });
}

// ════════════════════════════════════════════
// MULTI-FORMAT IMPORT (JSON/CSV/KML/GPX/GeoJSON)
// ════════════════════════════════════════════
function parseCSV(text, fallbackList = 'Imported') {
    const parseRow = (line) => {
        const out = [];
        let cur = '', quoted = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
            if (ch === '"') { quoted = !quoted; continue; }
            if (ch === ',' && !quoted) { out.push(cur.trim()); cur = ''; continue; }
            cur += ch;
        }
        out.push(cur.trim());
        return out;
    };
    const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    if(lines.length<2)return[];
    // DMS parser: "13°42'57.7"N 100°30'56.1"E" → {lat, lng}
    function parseDMS(s){
        const m=s.match(/([\d]+)[°º]([\d]+)'([\d.]+)"?\s*([NS])\s+([\d]+)[°º]([\d]+)'([\d.]+)"?\s*([EW])/);
        if(!m)return null;
        const lat=(+m[1]+(+m[2])/60+(+m[3])/3600)*(m[4]==='S'?-1:1);
        const lng=(+m[5]+(+m[6])/60+(+m[7])/3600)*(m[8]==='W'?-1:1);
        return {lat,lng};
    }
    const header=parseRow(lines[0]).map(h=>h.trim().toLowerCase());
    const iLat=header.findIndex(h=>['lat','latitude','gps latitude','gps_latitude','ละติจูด'].includes(h));
    const iLng=header.findIndex(h=>['lng','lon','longitude','long','gps longitude','gps_longitude','ลองจิจูด'].includes(h));
    const iName=header.findIndex(h=>['name','title','topup name','ชื่อ','ชื่อสถานที่','placename'].includes(h));
    const iList=header.findIndex(h=>['list','category','group','รายการ','หมวดหมู่','ป้าย'].includes(h));
    const iCity=header.findIndex(h=>['city','district','area','เขต','อำเภอ'].includes(h));
    const iProvince=header.findIndex(h=>['province','จังหวัด','changwat'].includes(h));
    const iNote=header.findIndex(h=>['note','notes','desc','description','หมายเหตุ','บันทึก','ความคิดเห็น'].includes(h));
    const iUrl=header.findIndex(h=>['url','link','google maps url','maps url'].includes(h));
    // Google Takeout Thai: พิกัด DMS อยู่ใน column ชื่อ (iName) เมื่อไม่มี lat/lng
    const isGoogleTakeout = iLat<0 && iLng<0 && iName>=0;
    if(iLat<0&&iLng<0&&iUrl<0&&!isGoogleTakeout)return[];
    const result=[];
    for(let i=1;i<lines.length;i++){
        const cols=parseRow(lines[i]);
        let lat,lng,nameVal=cols[iName]||'';
        if(iLat>=0&&iLng>=0){lat=parseFloat(cols[iLat]);lng=parseFloat(cols[iLng]);}
        else if(iUrl>=0){
            const m=(cols[iUrl]||'').match(/[/@?=]([-\d.]+),([-\d.]+)/);
            if(m){lat=parseFloat(m[1]);lng=parseFloat(m[2]);}
        }
        // Google Takeout: try DMS from name col, then URL col
        if((!lat||isNaN(lat)) && isGoogleTakeout){
            const dms=parseDMS(nameVal);
            if(dms){lat=dms.lat;lng=dms.lng;nameVal='';}
            if((!lat||isNaN(lat)) && iUrl>=0){
                const mu=(cols[iUrl]||'').match(/search\/([-\d.]+),([-\d.]+)/);
                if(mu){lat=parseFloat(mu[1]);lng=parseFloat(mu[2]);}
            }
        }
        if(!lat||!lng||isNaN(lat)||isNaN(lng))continue;
        const cityVal=iCity>=0?(cols[iCity]||''):'';
        const provVal=iProvince>=0?cols[iProvince]||'':'';
        const cityFinal=cityVal||(provVal!==cityVal?provVal:'');
        const listRaw=iList>=0?(cols[iList]||''):'';
        const listVal=listRaw||cityVal||fallbackList;
        // If no city column exists, use list value as city so it appears in เขต/เมือง
        const cityOut = cityFinal || (iCity<0 ? listVal : '');
        result.push({name:nameVal,lat,lng,list:listVal,city:cityOut,note:cols[iNote]||''});
    }
    return result;
}
function parseKML(text, fallbackList = 'KML Import') {
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
        result.push({name:nameEl?nameEl.textContent.trim():'',lat,lng,list:fallbackList,city:''});
    });
    return result;
}
function parseGPX(text, fallbackList = 'GPX Import') {
    const parser=new DOMParser();
    const doc=parser.parseFromString(text,'text/xml');
    const wpts=doc.querySelectorAll('wpt');
    const result=[];
    wpts.forEach(wpt=>{
        const lat=parseFloat(wpt.getAttribute('lat'));
        const lng=parseFloat(wpt.getAttribute('lon'));
        if(isNaN(lat)||isNaN(lng))return;
        const nameEl=wpt.querySelector('name');
        result.push({name:nameEl?nameEl.textContent.trim():'',lat,lng,list:fallbackList,city:''});
    });
    // Also parse trk > trkseg > trkpt
    doc.querySelectorAll('trkpt').forEach(pt=>{
        const lat=parseFloat(pt.getAttribute('lat'));
        const lng=parseFloat(pt.getAttribute('lon'));
        if(!isNaN(lat)&&!isNaN(lng))result.push({name:'',lat,lng,list:fallbackList,city:''});
    });
    return result;
}
function parseGeoJSON(obj, fallbackList = 'GeoJSON Import') {
    const result=[];
    const features=obj.features||[obj];
    features.forEach(f=>{
        if(!f.geometry||f.geometry.type!=='Point')return;
        const [lng,lat]=f.geometry.coordinates;
        if(isNaN(lat)||isNaN(lng))return;
        const props=f.properties||{};
        result.push({name:props.name||props.title||'',lat,lng,list:props.list||fallbackList,city:props.city||''});
    });
    return result;
}

function normalizeImportedLocations(items, fallbackList = 'Imported') {
    return items.map((l, i) => ({
        ...(l.sb_id || l.id ? { sb_id: l.sb_id || l.id } : { id: Date.now() + i }),
        name: l.name || l.title || l.label || '',
        lat: parseFloat(l.lat ?? l.latitude ?? l.y),
        lng: parseFloat(l.lng ?? l.lon ?? l.longitude ?? l.x),
        list: l.list || l.category || l.group || fallbackList,
        city: l.city || l.district || l.area || '',
        note: l.note || l.notes || l.desc || l.description || '',
        updatedAt: l.updatedAt || Date.now(),
        ...(Array.isArray(l.tags) && l.tags.length ? { tags: l.tags } : {}),
        ...(l.photo ? { photo: l.photo } : {})
    }));
}

function exactCoordKey(loc) {
    return `${Number(loc.lat).toFixed(6)},${Number(loc.lng).toFixed(6)}`;
}

function dedupeExactLocations(items) {
    const seen = new Set();
    const unique = [];
    let removed = 0;
    items.forEach(loc => {
        const key = exactCoordKey(loc);
        if (seen.has(key)) { removed++; return; }
        seen.add(key);
        unique.push(loc);
    });
    return { unique, removed };
}

function prepareImportedLocations(items, fallbackList = 'Imported') {
    const normalized = normalizeImportedLocations(items, fallbackList);
    const valid = [];
    const report = { invalid: 0, outOfBounds: 0, duplicate: 0 };
    normalized.forEach(loc => {
        if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) {
            report.invalid++;
            return;
        }
        if (!isInThailandBounds(loc)) {
            report.outOfBounds++;
            return;
        }
        valid.push(loc);
    });
    const deduped = dedupeExactLocations(valid);
    report.duplicate = deduped.removed;
    return { items: deduped.unique, report };
}

function formatImportReport(report) {
    const parts = [];
    if (report.duplicate) parts.push(`ตัดซ้ำ ${report.duplicate}`);
    if (report.invalid) parts.push(`พิกัดเสีย ${report.invalid}`);
    if (report.outOfBounds) parts.push(`นอกไทย ${report.outOfBounds}`);
    return parts.length ? ` · ${parts.join(' · ')}` : '';
}

function _parseFileText(text, ext, fallbackListName){
    let imp=[];
    if(ext==='csv'){
        imp=parseCSV(text, fallbackListName);
    } else if(ext==='kml'){
        imp=parseKML(text, fallbackListName);
    } else if(ext==='gpx'){
        imp=parseGPX(text, fallbackListName);
    } else if(ext==='geojson'){
        const obj=JSON.parse(text);
        imp=parseGeoJSON(obj, fallbackListName);
    } else {
        const obj=JSON.parse(text);
        if(Array.isArray(obj))imp=obj;
        else if(obj.type==='FeatureCollection'||obj.type==='Feature')imp=parseGeoJSON(obj, fallbackListName);
        else if(obj.schema==='bt-locations'&&Array.isArray(obj.locations))imp=obj.locations;
        else if(obj.locations||obj.points||obj.data)imp=obj.locations||obj.points||obj.data;
        else throw new Error('รูปแบบ JSON ไม่ถูกต้อง');
    }
    return prepareImportedLocations(imp, fallbackListName);
}

document.getElementById('fileImport').onchange=async e=>{
    const files=[...e.target.files]; e.target.value='';
    if(!files.length)return;

    // Read all files concurrently
    const readFile=f=>new Promise((res,rej)=>{
        const r=new FileReader();
        r.onload=ev=>res(ev.target.result);
        r.onerror=()=>rej(new Error('อ่านไฟล์ไม่ได้'));
        r.readAsText(f);
    });

    let allImp=[];
    const importReport = { invalid: 0, outOfBounds: 0, duplicate: 0 };
    const errors=[];
    await Promise.all(files.map(async f=>{
        const ext=f.name.split('.').pop().toLowerCase();
        const name=(f.name.replace(/\.[^.]+$/,'')||'Imported').trim();
        try{
            const text=await readFile(f);
            const parsed=_parseFileText(text,ext,name);
            importReport.invalid += parsed.report.invalid;
            importReport.outOfBounds += parsed.report.outOfBounds;
            importReport.duplicate += parsed.report.duplicate;
            allImp=allImp.concat(parsed.items);
        }catch(err){errors.push(`${f.name}: ${err.message}`);}
    }));

    if(errors.length)showToast('⚠️ '+errors.join(' | '),true);
    const deduped=dedupeExactLocations(allImp);
    importReport.duplicate += deduped.removed;
    allImp=deduped.unique;
    if(!allImp.length){showToast('ไม่พบข้อมูลพิกัดในไฟล์',true);return;}

    const fileNames=files.map(f=>f.name).join(', ');
    const reportText=formatImportReport(importReport);
    const importReportText=reportText?`\nตรวจข้อมูล: ${reportText.replace(/^ · /,'')}`:'';
    const multiText=files.length>1?` (${files.length} ไฟล์)`:'';
    const doMerge=async()=>{
        pushUndo();
        const existing=new Set(locations.map(exactCoordKey));
        const toAdd=[];
        allImp.forEach(loc=>{
            const key=exactCoordKey(loc);
            if(!existing.has(key)){locations.push(loc);existing.add(key);toAdd.push(loc);}
        });
        saveLocations();invalidateCache();update();
        showToast(`Merge: เพิ่ม ${toAdd.length} จุดใหม่ (ข้าม ${allImp.length-toAdd.length} ซ้ำ)`,false,true);
        if(_sbLoaded){for(const loc of toAdd){await sbInsert(loc);}}
    };
    closeImportModal();
    showConfirm('import',`Import ${allImp.length} จุด${multiText}?`,`${fileNames}${importReportText}\nเลือก Merge หรือ Replace`,
        async()=>{pushUndo();locations=allImp;saveLocations();invalidateCache();update();showToast(`Replace: ${allImp.length} จุด`,false,true);if(_sbLoaded){for(const loc of allImp){await sbInsert(loc);}}},
        doMerge
    );
};

function doUndo(){if(!undoStack.length){showToast('ไม่มี Undo');return;}redoStack.push(JSON.stringify(locations));locations=JSON.parse(undoStack.pop());saveLocations();invalidateCache();update();showToast('Undo แล้ว');closeInfo();}
function doRedo(){if(!redoStack.length){showToast('ไม่มี Redo');return;}undoStack.push(JSON.stringify(locations));locations=JSON.parse(redoStack.pop());saveLocations();invalidateCache();update();showToast('Redo แล้ว');closeInfo();}

function doBulkDel(){
    const f=getFiltered();
    if(!filterList&&!filterCity&&!document.getElementById('search').value&&!nearbyMode){showToast('กรุณา filter ก่อน',true);return;}
    if(!f.length){showToast('ไม่มีจุดในตัวกรอง',true);return;}
    showConfirm('delete',`ลบ ${f.length} จุด?`,'จุดที่อยู่ในตัวกรองปัจจุบันจะถูกลบทั้งหมด',()=>{
        pushUndo();const rm=new Set(f);const toDelSb=[...rm];locations=locations.filter(l=>!rm.has(l));_clearSearchMarkerIfDeleted(toDelSb);saveLocations();invalidateCache();update();showToast(`ลบ ${f.length} จุดแล้ว`);
        if(_sbLoaded)toDelSb.forEach(l=>sbDelete(l));
    });
    closeInfo();
}

async function doReset(){
    showConfirm('reset','รีเซ็ตข้อมูล?','ข้อมูลที่แก้ไขจะหาย ระบบจะดึงข้อมูลใหม่จาก Supabase',async()=>{
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
function showConfirm(icon,title,text,cb,mergeCallback){
    const el=document.getElementById('confirmIcon');
    if(el){
        el.className='confirm-icon';
        if(icon==='delete'||icon==='🗑️'||icon==='🗑'){
            el.classList.add('danger');
            el.innerHTML='<i class="fa-solid fa-trash"></i>';
        } else if(icon==='import'||icon==='📥'){
            el.classList.add('info');
            el.innerHTML='<i class="fa-solid fa-file-import"></i>';
        } else if(icon==='reset'||icon==='🔄'){
            el.classList.add('info');
            el.innerHTML='<i class="fa-solid fa-rotate"></i>';
        } else if(icon==='merge'){
            el.classList.add('success');
            el.innerHTML='<i class="fa-solid fa-code-merge"></i>';
        } else {
            el.classList.add('danger');
            el.innerHTML='<i class="fa-solid fa-triangle-exclamation"></i>';
        }
    }
    // ok button style — blue for non-destructive, red for delete
    const okBtn=document.getElementById('confirmOk');
    if(okBtn){
        if(icon==='delete'){ okBtn.className='modal-btn modal-btn-save btn-danger'; okBtn.style.flex='1'; }
        else { okBtn.className='modal-btn modal-btn-save'; okBtn.style.flex='1'; }
    }
    document.getElementById('confirmTitle').textContent=title;
    document.getElementById('confirmText').textContent=text;
    confirmCallback=cb;
    let zone=document.getElementById('confirmFooterZone');
    if(!zone){
        const modal=document.querySelector('#confirmModalOverlay .modal');
        if(modal){ zone=document.createElement('div'); zone.id='confirmFooterZone'; modal.appendChild(zone); }
    }
    if(zone){
        if(mergeCallback){
            zone.innerHTML=`
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 14px 6px;">
                    <button id="_cfMerge" class="action-card" style="border-color:rgba(46,204,144,0.3);width:100%;">
                        <div class="ac-title">Merge</div>
                        <div class="ac-desc">เพิ่มเฉพาะจุดใหม่</div>
                        <span class="ac-chip" style="background:var(--gn-d);color:var(--gn);">MERGE</span>
                    </button>
                    <button id="_cfReplace" class="action-card" style="border-color:rgba(91,143,255,0.3);width:100%;">
                        <div class="ac-title">Replace</div>
                        <div class="ac-desc">แทนที่ข้อมูลทั้งหมด</div>
                        <span class="ac-chip" style="background:var(--bl-d);color:var(--bl);">REPLACE</span>
                    </button>
                </div>
                <div style="padding:6px 14px 14px;">
                    <button id="_cfCancel" class="modal-btn modal-btn-cancel" style="width:100%;">ยกเลิก</button>
                </div>`;
            document.getElementById('_cfMerge').onclick=()=>{ document.getElementById('confirmModalOverlay').classList.remove('open'); mergeCallback(); };
            document.getElementById('_cfReplace').onclick=()=>{ document.getElementById('confirmModalOverlay').classList.remove('open'); if(confirmCallback){confirmCallback();confirmCallback=null;} };
            document.getElementById('_cfCancel').onclick=()=>{ document.getElementById('confirmModalOverlay').classList.remove('open'); };
        } else {
            const isDelete=icon==='delete'||icon==='🗑️'||icon==='🗑';
            const chipLabel=isDelete?'DEL':'OK';
            const chipStyle=isDelete?'background:rgba(255,92,92,0.15);color:var(--rd);':'background:var(--bl-d);color:var(--bl);';
            const okDesc=isDelete?'การดำเนินการนี้ย้อนกลับได้':'ยืนยันการดำเนินการ';
            zone.innerHTML=`
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 14px 6px;">
                    <button id="_cfCancel" class="action-card" style="width:100%;">
                        <div class="ac-title">ยกเลิก</div>
                        <div class="ac-desc">ปิดโดยไม่บันทึก</div>
                        <span class="ac-chip" style="background:var(--s3);color:var(--tx2);">ESC</span>
                    </button>
                    <button id="_cfOk" class="action-card" style="border-color:${isDelete?'rgba(255,92,92,0.3)':'rgba(91,143,255,0.3)'};width:100%;">
                        <div class="ac-title">${isDelete?'ลบ':'ยืนยัน'}</div>
                        <div class="ac-desc">${okDesc}</div>
                        <span class="ac-chip" style="${chipStyle}">${chipLabel}</span>
                    </button>
                </div>
                <div style="height:8px;"></div>`;
            document.getElementById('_cfCancel').onclick=()=>{ document.getElementById('confirmModalOverlay').classList.remove('open'); };
            document.getElementById('_cfOk').onclick=()=>{ document.getElementById('confirmModalOverlay').classList.remove('open'); if(confirmCallback){confirmCallback();confirmCallback=null;} };
        }
    }
    document.getElementById('confirmModalOverlay').classList.add('open');
}
const confirmModalOverlay=document.getElementById('confirmModalOverlay');
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
window._resetToDistrictView=_resetToDistrictView;

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

    // ปิด searchResults เมื่อแตะที่ว่าง
    const sr = document.getElementById('searchResults');
    const msb = document.getElementById('mobSearchRow');
    if(sr && sr.style.display !== 'none' &&
       !(msb && msb.contains(e.target))){
        sr.style.display = 'none';
    }
});

// ════════════════════════════════════════════
// MOBILE: LONG-PRESS TO ADD + SWIPE-CLOSE PLACE CARD
// ════════════════════════════════════════════
if (_mobile) {
    // Long-press on map → add location
    let _lpTimer=null, _lpStart=null;
    window.__btMapLongPressBound = true;
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
style.textContent=`.bt-tooltip{background:rgba(9,13,20,0.54)!important;color:oklch(96% 0.008 250)!important;border:0!important;border-radius:4px!important;padding:2px 5px!important;font-size:9px!important;font-weight:700!important;line-height:1.1!important;box-shadow:0 1px 4px rgba(0,0,0,0.22)!important;text-shadow:0 1px 1px rgba(0,0,0,0.75)!important;white-space:nowrap!important;font-family:inherit!important;}
.bt-field-marker { transition: transform 180ms cubic-bezier(0.22,1,0.36,1), filter 180ms ease !important; }
.bt-field-marker:hover { transform: scale(1.18) !important; }
html.is-mobile-map .bt-field-marker { transition: none !important; will-change: auto !important; }
html.is-mobile-map .bt-field-marker-core { box-shadow: 0 0 0 1px oklch(12% 0.025 265 / 0.62) !important; }
html.is-mobile-map .bt-field-marker-ring,
html.is-mobile-map .bt-field-marker-label,
html.is-mobile-map #map.is-gesture-zooming .leaflet-tooltip { display: none !important; }
html.is-mobile-map #map.is-gesture-zooming .bt-field-marker { filter: none !important; }
html.is-mobile-map #map.show-mobile-marker-labels .bt-field-marker-label { display: grid !important; top: 20px !important; min-width: 72px !important; max-width: 128px !important; padding: 4px 6px 5px !important; gap: 2px !important; background: oklch(13% 0.026 260 / 0.72) !important; border: 1px solid oklch(86% 0.07 230 / 0.18) !important; font-size: 9px !important; opacity: 0.88 !important; transform: translateX(-50%) translateY(0) !important; box-shadow: 0 4px 10px rgba(0,0,0,0.2) !important; transition: none !important; }
html.is-mobile-map .bt-marker-name,
html.is-mobile-map .bt-marker-area { display: block !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }
html.is-mobile-map .bt-marker-name { color: oklch(98% 0.006 250) !important; font-weight: 850 !important; line-height: 1.1 !important; min-height: 10px !important; }
html.is-mobile-map .bt-marker-area { color: oklch(73% 0.11 220) !important; font-size: 8px !important; font-weight: 750 !important; line-height: 1.05 !important; min-height: 8px !important; }
.marker-cluster { transition: opacity 120ms ease !important; }
.leaflet-cluster-anim .leaflet-marker-icon,
.leaflet-cluster-anim .leaflet-marker-shadow { transition: left 0.3s cubic-bezier(0.4,0,0.2,1), top 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease !important; }
.you-are-here-wrap { width:70px !important; height:70px !important; filter:drop-shadow(0 6px 11px rgba(8,20,42,0.28)) !important; }
.you-are-here-cone { position:absolute !important; left:50% !important; top:0 !important; width:34px !important; height:48px !important; transform-origin:50% 35px !important; clip-path:polygon(50% 0%,94% 100%,50% 82%,6% 100%) !important; background:linear-gradient(180deg,rgba(59,130,246,0.32),rgba(59,130,246,0.04)) !important; border-radius:999px !important; z-index:1 !important; }
.you-are-here-ring { width:42px !important; height:42px !important; background:rgba(37,99,235,0.08) !important; border:2px solid rgba(37,99,235,0.46) !important; animation:gps-ring 2.4s ease-out infinite !important; }
.you-are-here { width:24px !important; height:24px !important; box-shadow:0 0 0 1px rgba(37,99,235,0.32),0 4px 11px rgba(37,99,235,0.42) !important; }
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
        const dirtyAtStart = _isDirty();
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
        const remote=data.map(r=>normalizeLocation({
            sb_id:r.id, name:r.name||'', lat:r.lat, lng:r.lng,
            list:r.list||'', city:r.city||'', note:r.note||'',
            tags:r.tags?r.tags.split(',').filter(Boolean):[],
            photo:r.photo||'',
            updatedAt:r.updated_at?new Date(r.updated_at).getTime():Date.now(),
        }));
        
        // 3-way merge or deterministic merge to preserve local changes
        const pendingPush = [];
        let merged = null;
        const dirtyNow = _isDirty();
        const effectiveDirty = dirtyAtStart || dirtyNow;
        const clearingAll = effectiveDirty && locations.length === 0;
        const forceMerge = !_sbLoaded && locations.length > 0 && remote.length === 0;
        // If dirty: always use local as source of truth, merge remote only for non-conflicting items
        if(effectiveDirty || clearingAll){
            if(clearingAll){
                // User deleted everything locally — do not pull remote back
                _clearDirty();
                localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
                invalidateCache(); update();
                _setSyncStatus('ok'); _lastSyncTime = Date.now();
                if(!silent) showToast('✅ ลบทั้งหมดแล้ว', false, true);
                return;
            }
            // Use updatedAt merge strategy
            merged = [];
            const rMap = new Map();
            const coordMap = new Map();
            remote.forEach(l => {
                rMap.set(_syncKey(l), l);
                coordMap.set(_locKey(l), l);
            });

            locations.forEach(local => {
                const key = _syncKey(local);
                const r = rMap.get(key) || (!local.sb_id ? coordMap.get(_locKey(local)) : null);
                if(r){
                    // Conflict: use latest. Keep local on exact timestamp ties so optimistic edits are not rolled back.
                    if(r.updatedAt > local.updatedAt){
                        console.log(`[SYNC] Using REMOTE version for ${r.name} (remote: ${new Date(r.updatedAt).toISOString()}, local: ${new Date(local.updatedAt).toISOString()})`);
                        merged.push(r);
                    } else {
                        console.log(`[SYNC] Using LOCAL version for ${local.name} (remote: ${new Date(r.updatedAt).toISOString()}, local: ${new Date(local.updatedAt).toISOString()})`);
                        const localWinner = {...local, sb_id: local.sb_id || r.sb_id};
                        merged.push(localWinner);
                        if(localWinner.updatedAt > r.updatedAt)pendingPush.push(localWinner);
                    }
                    rMap.delete(_syncKey(r));
                    coordMap.delete(_locKey(r));
                } else if(!local.sb_id){
                    // New local item not yet synced — keep reference so sb_id gets written back
                    merged.push(local);
                    pendingPush.push({loc: local, idx: merged.length - 1});
                }
            });
            // Add remaining remote items (not locally deleted)
            rMap.forEach(r => merged.push(r));
            locations = merged;
        } else {
            locations = remote;
        }

        for(const item of pendingPush){
            let ok;
            if(item.loc){
                // New item — use sbInsert so sb_id gets set on the object itself
                ok = await sbInsert(item.loc);
                if(ok && merged) merged[item.idx] = item.loc; // update reference with new sb_id
            } else {
                ok = await sbUpdate(item);
            }
            if(!ok) console.warn('[SYNC] push failed for', item.loc?.name || item.name);
        }

        _clearDirty();
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
function _syncKey(l){return l && l.sb_id ? `id:${l.sb_id}` : `coord:${_locKey(l)}`;}

// Realtime subscription — all 8 users see live changes
function startRealtimeSync(){
    _sb.channel('locations-rt')
        .on('postgres_changes',{event:'INSERT',schema:'public',table:'locations'},payload=>{
            const r=payload.new;
            // Check both by sb_id and by coord to prevent duplicates from own sbInsert
            const existsById=locations.find(l=>l.sb_id===r.id);
            const existsByCoord=locations.find(l=>l.lat===r.lat&&l.lng===r.lng);
            if(existsByCoord&&!existsByCoord.sb_id){
                // Our own item — just update sb_id back onto the existing object
                existsByCoord.sb_id=r.id;
                _writeCache();
                return;
            }
            if(!existsById&&!existsByCoord){
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
    get dataQuality() { return getDataQualityReport(); },
    get mapStats() {
        return {
            zoom: map.getZoom(),
            mode: _getMarkerRenderMode(),
            visibleMarkers: _visibleMarkerIdxs.size,
            markerLayerMarkers: _individualMarkersLayer ? _individualMarkersLayer.getLayers().length : 0,
            mobileMarkerLimit: _getMobileMarkerLimit(),
            lastMarkerRenderMs: _lastMarkerRenderMs,
            lastFullUpdateMs: _lastFullUpdateMs,
            lastMapOnlyUpdateMs: _lastMapOnlyUpdateMs,
            lastUpdateKind: _lastUpdateKind,
            mapUpdateQueued: !!_mapOnlyUpdateRaf,
            mobileZooming: map.getContainer().classList.contains('is-gesture-zooming')
        };
    },
    get gps() {
        const gpsSnapshot = typeof window.btGpsDebugSnapshot === 'function' ? window.btGpsDebugSnapshot() : null;
        if (gpsSnapshot) return {
            ...gpsSnapshot,
            hasMarker: !!myLocationMarker,
            position: myLatLng
        };
        return {
            active: gpsActive,
            mode: gpsMode,
            tracking: gpsTracking,
            accuracy: _lastGpsAccuracy < Infinity ? Math.round(_lastGpsAccuracy) : null,
            heading: _lastGpsHeading === null ? null : Math.round(_lastGpsHeading),
            deviceHeading: _deviceHeading === null ? null : Math.round(_deviceHeading),
            orientationBound: _orientationBound,
            hasMarker: !!myLocationMarker,
            position: myLatLng
        };
    },
    toggleMapOverlay: (enabled)=>setMapDebugOverlay(enabled === undefined ? !_mapDebugOverlayEnabled : enabled),
    clearSearchPin: ()=>{_clearSearchMarker();showToast('ล้าง search pin แล้ว', false, true);},
    forceSync: ()=>doSync(false),
    clearCache: ()=>{invalidateCache();update();showToast('Cache cleared');},
    refreshApp: ()=>refreshAppNow(),
    exportDebug: ()=>JSON.stringify({appVersion:APP_VERSION,locations:locations.length,lists:Object.keys(locations.reduce((a,l)=>(a[l.list]=1,a),{})),map:window.btDebug.mapStats,gps:window.btDebug.gps,dataQuality:getDataQualityReport(),sha:localStorage.getItem(SYNC_SHA_KEY),ua:navigator.userAgent,screen:`${screen.width}x${screen.height}`,dpr:devicePixelRatio},null,2),
};
console.log('%c🗺️ BT Locations Debug','font-size:14px;font-weight:bold;','→ window.btDebug');

async function refreshAppNow() {
    showToast('กำลังรีโหลดแอป...');
    try {
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.filter(key => key.startsWith('bt-locations-')).map(key => caches.delete(key)));
        }
        if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg) await reg.update();
        }
    } catch (err) {
        console.warn('[BT] App refresh failed:', err);
    } finally {
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set('v', `${APP_VERSION}-${Date.now()}`);
        window.location.replace(nextUrl.toString());
    }
}
window.refreshAppNow = refreshAppNow;

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
    navigator.serviceWorker.register(`./sw.js?v=${encodeURIComponent(APP_VERSION)}`, { updateViaCache: 'none' }).then(reg => {
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
