import json

with open(r'C:\Users\T\Documents\GitHub\bt-locations\all_locations.json', 'r', encoding='utf-8') as f:
    locs = json.load(f)

lists = sorted(set(l['list'] for l in locs))

filter_options = ''.join(f'<option value="{l}">{l}</option>' for l in lists)

html = f'''<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BT Locations Map</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css" />
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: 'Segoe UI', Tahoma, sans-serif; }}
        #map {{ width: 100%; height: 100vh; }}
        .controls {{
            position: absolute; top: 10px; left: 50px; z-index: 1000;
            background: white; border-radius: 8px; padding: 8px 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; gap: 8px; align-items: center;
            flex-wrap: wrap; max-width: 90vw;
        }}
        .controls input, .controls select {{
            border: 1px solid #ddd; border-radius: 6px; padding: 6px 10px;
            font-size: 13px; outline: none;
        }}
        .controls input {{ width: 160px; }}
        .controls select {{ max-width: 180px; }}
        .controls input:focus, .controls select:focus {{ border-color: #4285f4; }}
        .count-badge {{
            background: #4285f4; color: white; border-radius: 12px;
            padding: 4px 10px; font-size: 12px; font-weight: bold;
        }}
        .btn {{
            border: none; border-radius: 6px; padding: 6px 12px;
            font-size: 12px; cursor: pointer; font-weight: 500;
        }}
        .btn-add {{ background: #34a853; color: white; }}
        .btn-add:hover {{ background: #2d9249; }}
        .btn-edit {{ background: #fbbc04; color: #333; }}
        .btn-edit:hover {{ background: #f0b400; }}
        .btn-delete {{ background: #ea4335; color: white; }}
        .btn-delete:hover {{ background: #d33426; }}
        .btn-export {{ background: #4285f4; color: white; }}
        .btn-export:hover {{ background: #3275e4; }}
        .btn-import {{ background: #9334e6; color: white; }}
        .btn-import:hover {{ background: #7b28c4; }}
        .btn-reset {{ background: #666; color: white; }}
        .btn-reset:hover {{ background: #555; }}
        .btn-github {{ background: #24292e; color: white; }}
        .btn-github:hover {{ background: #1b1f23; }}
        .btn-github.saving {{ background: #666; cursor: wait; }}
        .save-status {{ font-size: 11px; color: #34a853; font-weight: 500; display: none; }}
        .save-status.show {{ display: inline; }}
        .save-status.error {{ color: #ea4335; }}
        .custom-popup .leaflet-popup-content-wrapper {{
            border-radius: 8px; font-size: 14px;
        }}
        .bt-label {{
            background: transparent; border: none; box-shadow: none;
            font-size: 11px; font-weight: bold; color: #1a73e8;
            white-space: nowrap;
        }}
        .popup-content {{ text-align: center; }}
        .popup-content h3 {{ color: #1a73e8; margin-bottom: 6px; font-size: 16px; }}
        .popup-content p {{ color: #555; margin: 2px 0; font-size: 12px; }}
        .popup-content a, .popup-content button {{
            display: inline-block; margin-top: 4px; padding: 4px 10px;
            border-radius: 4px; text-decoration: none; font-size: 12px;
            cursor: pointer; border: none;
        }}
        .popup-content .link-gmaps {{ background: #1a73e8; color: white; }}
        .popup-content .link-gmaps:hover {{ background: #1557b0; }}
        .popup-content .btn-popup-edit {{ background: #fbbc04; color: #333; margin-left: 4px; }}
        .popup-content .btn-popup-delete {{ background: #ea4335; color: white; margin-left: 4px; }}
        .list-panel {{
            position: absolute; bottom: 0; left: 0; right: 0; z-index: 1000;
            background: white; max-height: 35vh; overflow-y: auto;
            box-shadow: 0 -2px 8px rgba(0,0,0,0.2); display: none;
        }}
        .list-panel.open {{ display: block; }}
        .list-toggle {{
            position: absolute; bottom: 10px; right: 10px; z-index: 1001;
            background: #4285f4; color: white; border: none; border-radius: 50%;
            width: 48px; height: 48px; font-size: 20px; cursor: pointer;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }}
        .list-item {{
            padding: 8px 16px; border-bottom: 1px solid #eee; cursor: pointer;
            display: flex; justify-content: space-between; align-items: center;
        }}
        .list-item:hover {{ background: #f5f5f5; }}
        .list-item .name {{ font-weight: 500; font-size: 14px; }}
        .list-item .detail {{ color: #888; font-size: 12px; }}
        /* Modal */
        .modal-overlay {{
            display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5); z-index: 2000; justify-content: center; align-items: center;
        }}
        .modal-overlay.open {{ display: flex; }}
        .modal {{
            background: white; border-radius: 12px; padding: 24px; width: 90vw; max-width: 400px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }}
        .modal h2 {{ margin-bottom: 16px; font-size: 18px; color: #333; }}
        .modal label {{ display: block; margin-bottom: 4px; font-size: 13px; color: #555; font-weight: 500; }}
        .modal input {{
            width: 100%; border: 1px solid #ddd; border-radius: 6px; padding: 8px 10px;
            font-size: 14px; margin-bottom: 12px; outline: none;
        }}
        .modal input:focus {{ border-color: #4285f4; }}
        .modal-btns {{ display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }}
        .modal-btns .btn {{ padding: 8px 16px; font-size: 14px; }}
        .btn-cancel {{ background: #eee; color: #333; }}
        .btn-cancel:hover {{ background: #ddd; }}
        .btn-save {{ background: #4285f4; color: white; }}
        .btn-save:hover {{ background: #3275e4; }}
        .add-mode-banner {{
            display: none; position: absolute; top: 60px; left: 50%; transform: translateX(-50%);
            z-index: 1500; background: #34a853; color: white; padding: 10px 20px;
            border-radius: 8px; font-size: 14px; font-weight: 500;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }}
        .add-mode-banner.show {{ display: block; }}
        .add-mode-banner .btn-cancel-add {{
            background: white; color: #34a853; border: none; border-radius: 4px;
            padding: 4px 12px; margin-left: 12px; cursor: pointer; font-size: 12px;
        }}
        @media (max-width: 600px) {{
            .controls {{ left: 10px; top: 10px; padding: 6px 8px; gap: 4px; }}
            .controls input {{ width: 100px; font-size: 12px; }}
            .controls select {{ max-width: 120px; font-size: 12px; }}
            .btn {{ font-size: 11px; padding: 5px 8px; }}
        }}
    </style>
</head>
<body>
    <div id="map"></div>
    <div class="controls">
        <input type="text" id="search" placeholder="ค้นหา...">
        <select id="listFilter">
            <option value="">ทุกรายการ</option>
            {filter_options}
        </select>
        <span class="count-badge" id="count">0 จุด</span>
        <button class="btn btn-add" id="btnAdd">+ เพิ่มจุด</button>
        <button class="btn btn-github" id="btnGithub">Save to GitHub</button>
        <span class="save-status" id="saveStatus"></span>
        <button class="btn btn-export" id="btnExport">Export</button>
        <button class="btn btn-import" id="btnImport">Import</button>
        <button class="btn btn-reset" id="btnReset">Reset</button>
    </div>
    <div class="add-mode-banner" id="addBanner">
        คลิกบนแผนที่เพื่อเพิ่มจุดใหม่
        <button class="btn-cancel-add" id="btnCancelAdd">ยกเลิก</button>
    </div>
    <button class="list-toggle" id="listToggle">☰</button>
    <div class="list-panel" id="listPanel">
        <div id="listBody"></div>
    </div>
    <input type="file" id="fileImport" accept=".json" style="display:none">

    <!-- Token Modal -->
    <div class="modal-overlay" id="tokenModalOverlay">
        <div class="modal">
            <h2>GitHub Token</h2>
            <p style="font-size:13px;color:#555;margin-bottom:12px;">ใส่ Personal Access Token เพื่อบันทึกข้อมูลขึ้น GitHub<br><small>Token จะเก็บใน browser นี้เท่านั้น</small></p>
            <label>GitHub Token</label>
            <input type="password" id="tokenInput" placeholder="github_pat_...">
            <div class="modal-btns">
                <button class="btn btn-cancel" id="tokenCancel">ยกเลิก</button>
                <button class="btn btn-save" id="tokenSave">บันทึก Token</button>
            </div>
        </div>
    </div>

    <!-- Edit/Add Modal -->
    <div class="modal-overlay" id="modalOverlay">
        <div class="modal">
            <h2 id="modalTitle">แก้ไขจุด</h2>
            <label>ชื่อ</label>
            <input type="text" id="modalName" placeholder="ชื่อจุด">
            <label>รายการ (List)</label>
            <input type="text" id="modalList" placeholder="เช่น BT-Topup, ดินแดง">
            <label>เขต (City)</label>
            <input type="text" id="modalCity" placeholder="เขต/อำเภอ">
            <label>Latitude</label>
            <input type="number" id="modalLat" step="any" placeholder="13.xxxx">
            <label>Longitude</label>
            <input type="number" id="modalLng" step="any" placeholder="100.xxxx">
            <div class="modal-btns">
                <button class="btn btn-cancel" id="modalCancel">ยกเลิก</button>
                <button class="btn btn-save" id="modalSave">บันทึก</button>
            </div>
        </div>
    </div>

    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
    <script>
        const STORAGE_KEY = 'bt_locations_data';
        const JSON_URL = 'https://raw.githubusercontent.com/valrinx/bt-locations/main/all_locations.json';

        function saveLocations() {{
            localStorage.setItem(STORAGE_KEY, JSON.stringify(locations));
        }}

        let locations = [];
        let addMode = false;
        let editingIndex = -1;

        const map = L.map('map').setView([13.75, 100.5], 11);
        L.tileLayer('https://{{s}}.tile.openstreetmap.org/{{z}}/{{x}}/{{y}}.png', {{
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19
        }}).addTo(map);

        let markerCluster = L.markerClusterGroup();
        let currentMarkers = [];

        function getPopupHTML(loc, idx) {{
            return `<div class="popup-content">
                <h3>${{loc.name || 'ไม่มีชื่อ'}}</h3>
                ${{loc.city ? `<p>เขต: ${{loc.city}}</p>` : ''}}
                <p>รายการ: ${{loc.list}}</p>
                <p>Lat: ${{loc.lat}}, Lng: ${{loc.lng}}</p>
                <a class="link-gmaps" href="https://www.google.com/maps?q=${{loc.lat}},${{loc.lng}}" target="_blank">Google Maps</a>
                <button class="btn-popup-edit" onclick="openEdit(${{idx}})">แก้ไข</button>
                <button class="btn-popup-delete" onclick="deleteLoc(${{idx}})">ลบ</button>
            </div>`;
        }}

        function renderMarkers(filtered) {{
            map.removeLayer(markerCluster);
            markerCluster = L.markerClusterGroup();
            currentMarkers = [];
            filtered.forEach(loc => {{
                const idx = locations.indexOf(loc);
                const marker = L.marker([loc.lat, loc.lng]);
                const label = loc.name || loc.list;
                marker.bindTooltip(label, {{
                    permanent: true, direction: 'top', offset: [0, -10],
                    className: 'bt-label'
                }});
                marker.bindPopup(getPopupHTML(loc, idx), {{className: 'custom-popup'}});
                markerCluster.addLayer(marker);
                currentMarkers.push({{loc, marker, idx}});
            }});
            map.addLayer(markerCluster);
            document.getElementById('count').textContent = filtered.length + ' จุด';
        }}

        function getFiltered() {{
            const q = document.getElementById('search').value.toLowerCase();
            const list = document.getElementById('listFilter').value;
            return locations.filter(l => {{
                const matchList = !list || l.list === list;
                const matchSearch = !q || (l.name && l.name.toLowerCase().includes(q)) || l.list.toLowerCase().includes(q) || (l.city && l.city.toLowerCase().includes(q));
                return matchList && matchSearch;
            }});
        }}

        function update() {{
            const filtered = getFiltered();
            renderMarkers(filtered);
            renderList(filtered);
            updateFilterOptions();
        }}

        function updateFilterOptions() {{
            const sel = document.getElementById('listFilter');
            const current = sel.value;
            const lists = [...new Set(locations.map(l => l.list))].sort();
            sel.innerHTML = '<option value="">ทุกรายการ</option>' + lists.map(l => `<option value="${{l}}">${{l}}</option>`).join('');
            sel.value = current;
        }}

        document.getElementById('search').addEventListener('input', update);
        document.getElementById('listFilter').addEventListener('change', update);

        // List panel
        const listBody = document.getElementById('listBody');
        const listToggle = document.getElementById('listToggle');
        const listPanel = document.getElementById('listPanel');

        function renderList(filtered) {{
            listBody.innerHTML = '';
            filtered.forEach(loc => {{
                const item = document.createElement('div');
                item.className = 'list-item';
                item.innerHTML = `<div><span class="name">${{loc.name || 'ไม่มีชื่อ'}}</span>${{loc.city ? ` <span class="detail">(${{loc.city}})</span>` : ''}}<br><span class="detail">${{loc.list}} | ${{loc.lat}}, ${{loc.lng}}</span></div>`;
                item.onclick = () => {{
                    map.setView([loc.lat, loc.lng], 17);
                    listPanel.classList.remove('open');
                    const found = currentMarkers.find(m => m.loc === loc);
                    if (found) {{
                        markerCluster.zoomToShowLayer(found.marker, () => found.marker.openPopup());
                    }}
                }};
                listBody.appendChild(item);
            }});
        }}

        listToggle.onclick = () => listPanel.classList.toggle('open');

        // === ADD MODE ===
        const addBanner = document.getElementById('addBanner');
        document.getElementById('btnAdd').onclick = () => {{
            addMode = true;
            addBanner.classList.add('show');
            map.getContainer().style.cursor = 'crosshair';
        }};
        document.getElementById('btnCancelAdd').onclick = () => {{
            addMode = false;
            addBanner.classList.remove('show');
            map.getContainer().style.cursor = '';
        }};

        map.on('click', (e) => {{
            if (!addMode) return;
            addMode = false;
            addBanner.classList.remove('show');
            map.getContainer().style.cursor = '';
            editingIndex = -1;
            document.getElementById('modalTitle').textContent = 'เพิ่มจุดใหม่';
            document.getElementById('modalName').value = '';
            document.getElementById('modalList').value = '';
            document.getElementById('modalCity').value = '';
            document.getElementById('modalLat').value = e.latlng.lat.toFixed(6);
            document.getElementById('modalLng').value = e.latlng.lng.toFixed(6);
            document.getElementById('modalOverlay').classList.add('open');
        }});

        // === EDIT ===
        window.openEdit = function(idx) {{
            const loc = locations[idx];
            if (!loc) return;
            editingIndex = idx;
            document.getElementById('modalTitle').textContent = 'แก้ไขจุด';
            document.getElementById('modalName').value = loc.name || '';
            document.getElementById('modalList').value = loc.list || '';
            document.getElementById('modalCity').value = loc.city || '';
            document.getElementById('modalLat').value = loc.lat;
            document.getElementById('modalLng').value = loc.lng;
            map.closePopup();
            document.getElementById('modalOverlay').classList.add('open');
        }};

        // === DELETE ===
        window.deleteLoc = function(idx) {{
            const loc = locations[idx];
            if (!loc) return;
            const name = loc.name || loc.list || 'ไม่มีชื่อ';
            if (!confirm(`ลบจุด "${{name}}" ?`)) return;
            locations.splice(idx, 1);
            saveLocations();
            map.closePopup();
            update();
        }};

        // === MODAL ===
        document.getElementById('modalCancel').onclick = () => {{
            document.getElementById('modalOverlay').classList.remove('open');
        }};
        document.getElementById('modalOverlay').onclick = (e) => {{
            if (e.target === document.getElementById('modalOverlay'))
                document.getElementById('modalOverlay').classList.remove('open');
        }};

        document.getElementById('modalSave').onclick = () => {{
            const name = document.getElementById('modalName').value.trim();
            const list = document.getElementById('modalList').value.trim() || 'ไม่มีรายการ';
            const city = document.getElementById('modalCity').value.trim();
            const lat = parseFloat(document.getElementById('modalLat').value);
            const lng = parseFloat(document.getElementById('modalLng').value);
            if (isNaN(lat) || isNaN(lng)) {{ alert('กรุณากรอก Lat/Lng ให้ถูกต้อง'); return; }}

            if (editingIndex >= 0) {{
                locations[editingIndex] = {{ name, lat, lng, list, city }};
            }} else {{
                locations.push({{ name, lat, lng, list, city }});
            }}
            saveLocations();
            document.getElementById('modalOverlay').classList.remove('open');
            update();
            if (editingIndex < 0) {{
                map.setView([lat, lng], 15);
            }}
        }};

        // === EXPORT ===
        document.getElementById('btnExport').onclick = () => {{
            const blob = new Blob([JSON.stringify(locations, null, 2)], {{type: 'application/json'}});
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'bt_locations_export.json';
            a.click();
        }};

        // === IMPORT ===
        document.getElementById('btnImport').onclick = () => {{
            document.getElementById('fileImport').click();
        }};
        document.getElementById('fileImport').onchange = (e) => {{
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {{
                try {{
                    const imported = JSON.parse(ev.target.result);
                    if (!Array.isArray(imported)) {{ alert('ไฟล์ไม่ถูกต้อง'); return; }}
                    if (confirm(`Import ${{imported.length}} จุด? (จะแทนที่ข้อมูลปัจจุบัน)`)) {{
                        locations = imported;
                        saveLocations();
                        update();
                        alert('Import สำเร็จ!');
                    }}
                }} catch(err) {{ alert('ไฟล์ JSON ไม่ถูกต้อง'); }}
            }};
            reader.readAsText(file);
            e.target.value = '';
        }};

        // === RESET ===
        document.getElementById('btnReset').onclick = () => {{
            if (confirm('รีเซ็ตข้อมูลทั้งหมดกลับเป็นค่าเริ่มต้น?')) {{
                localStorage.removeItem(STORAGE_KEY);
                locations = JSON.parse(JSON.stringify(DEFAULT_LOCATIONS));
                update();
                alert('รีเซ็ตสำเร็จ!');
            }}
        }};

        // === SAVE TO GITHUB ===
        const GITHUB_TOKEN_KEY = 'bt_github_token';
        const REPO_OWNER = 'valrinx';
        const REPO_NAME = 'bt-locations';

        function getToken() {{ return localStorage.getItem(GITHUB_TOKEN_KEY) || ''; }}
        function setToken(t) {{ localStorage.setItem(GITHUB_TOKEN_KEY, t); }}

        function showSaveStatus(msg, isError) {{
            const el = document.getElementById('saveStatus');
            el.textContent = msg;
            el.className = 'save-status show' + (isError ? ' error' : '');
            setTimeout(() => el.classList.remove('show'), 5000);
        }}

        async function githubGetFile(path, token) {{
            const res = await fetch(`https://api.github.com/repos/${{REPO_OWNER}}/${{REPO_NAME}}/contents/${{path}}`, {{
                headers: {{ 'Authorization': `token ${{token}}`, 'Accept': 'application/vnd.github.v3+json' }}
            }});
            if (res.status === 404) return {{ sha: null, content: null }};
            if (!res.ok) throw new Error(`GitHub API error: ${{res.status}}`);
            const data = await res.json();
            return {{ sha: data.sha, content: data.content }};
        }}

        async function githubPutFile(path, content, sha, token, msg) {{
            const body = {{ message: msg, content: btoa(unescape(encodeURIComponent(content))) }};
            if (sha) body.sha = sha;
            const res = await fetch(`https://api.github.com/repos/${{REPO_OWNER}}/${{REPO_NAME}}/contents/${{path}}`, {{
                method: 'PUT',
                headers: {{ 'Authorization': `token ${{token}}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' }},
                body: JSON.stringify(body)
            }});
            if (!res.ok) {{
                const err = await res.json();
                throw new Error(err.message || `GitHub error: ${{res.status}}`);
            }}
            return await res.json();
        }}

        document.getElementById('btnGithub').onclick = async () => {{
            let token = getToken();
            if (!token) {{
                document.getElementById('tokenInput').value = '';
                document.getElementById('tokenModalOverlay').classList.add('open');
                return;
            }}
            await doGithubSave(token);
        }};

        document.getElementById('tokenCancel').onclick = () => {{
            document.getElementById('tokenModalOverlay').classList.remove('open');
        }};
        document.getElementById('tokenModalOverlay').onclick = (e) => {{
            if (e.target === document.getElementById('tokenModalOverlay'))
                document.getElementById('tokenModalOverlay').classList.remove('open');
        }};
        document.getElementById('tokenSave').onclick = async () => {{
            const token = document.getElementById('tokenInput').value.trim();
            if (!token) {{ alert('กรุณากรอก Token'); return; }}
            setToken(token);
            document.getElementById('tokenModalOverlay').classList.remove('open');
            await doGithubSave(token);
        }};

        async function doGithubSave(token) {{
            const btn = document.getElementById('btnGithub');
            btn.classList.add('saving');
            btn.textContent = 'กำลังบันทึก...';
            try {{
                const jsonContent = JSON.stringify(locations, null, 2);
                const fileInfo = await githubGetFile('all_locations.json', token);
                await githubPutFile('all_locations.json', jsonContent, fileInfo.sha, token, 'Update locations from web app');
                showSaveStatus('บันทึกสำเร็จ!', false);
            }} catch(err) {{
                console.error(err);
                if (err.message.includes('401') || err.message.includes('Bad credentials')) {{
                    localStorage.removeItem(GITHUB_TOKEN_KEY);
                    showSaveStatus('Token ไม่ถูกต้อง กรุณาใส่ใหม่', true);
                }} else {{
                    showSaveStatus('ผิดพลาด: ' + err.message, true);
                }}
            }} finally {{
                btn.classList.remove('saving');
                btn.textContent = 'Save to GitHub';
            }}
        }}

        // Init: load from GitHub JSON, fallback to localStorage
        async function init() {{
            document.getElementById('count').textContent = 'กำลังโหลด...';
            try {{
                const res = await fetch(JSON_URL + '?t=' + Date.now());
                if (res.ok) {{
                    locations = await res.json();
                    saveLocations();
                }}
            }} catch(e) {{
                console.warn('Failed to fetch from GitHub, using localStorage');
                const saved = localStorage.getItem(STORAGE_KEY);
                if (saved) {{
                    try {{ locations = JSON.parse(saved); }} catch(e2) {{}}
                }}
            }}
            if (!locations.length) {{
                document.getElementById('count').textContent = 'ไม่มีข้อมูล';
                return;
            }}
            update();
        }}
        init();
    </script>
</body>
</html>'''

with open(r'C:\Users\T\Documents\GitHub\bt-locations\docs\index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print(f'Done! Generated HTML with {len(locs)} locations from {len(lists)} lists')
