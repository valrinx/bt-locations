import json

with open(r'C:\Users\T\Documents\GitHub\bt-locations\all_locations.json', 'r', encoding='utf-8') as f:
    locs = json.load(f)

lists = sorted(set(l['list'] for l in locs))

js_entries = []
for l in locs:
    name = l['name'].replace('"', '\\"') if l['name'] else ''
    lst = l['list'].replace('"', '\\"')
    js_entries.append(f'{{name:"{name}",lat:{l["lat"]},lng:{l["lng"]},list:"{lst}"}}')

js_array = ',\n            '.join(js_entries)

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
        .popup-content a {{
            display: inline-block; margin-top: 8px; padding: 4px 12px;
            background: #1a73e8; color: white; border-radius: 4px;
            text-decoration: none; font-size: 12px;
        }}
        .popup-content a:hover {{ background: #1557b0; }}
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
        @media (max-width: 600px) {{
            .controls {{ left: 10px; top: 10px; padding: 6px 8px; gap: 4px; }}
            .controls input {{ width: 120px; font-size: 12px; }}
            .controls select {{ max-width: 140px; font-size: 12px; }}
        }}
    </style>
</head>
<body>
    <div id="map"></div>
    <div class="controls">
        <input type="text" id="search" placeholder="ค้นหา...">
        <select id="listFilter">
            <option value="">ทุกรายการ ({len(locs)})</option>
            {filter_options}
        </select>
        <span class="count-badge" id="count">{len(locs)} จุด</span>
    </div>
    <button class="list-toggle" id="listToggle">☰</button>
    <div class="list-panel" id="listPanel">
        <div id="listBody"></div>
    </div>

    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
    <script>
        const locations = [
            {js_array}
        ];

        const map = L.map('map').setView([13.75, 100.5], 11);
        L.tileLayer('https://{{s}}.tile.openstreetmap.org/{{z}}/{{x}}/{{y}}.png', {{
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19
        }}).addTo(map);

        let markers = L.markerClusterGroup();
        const markerMap = {{}};
        let currentMarkers = [];

        function renderMarkers(filtered) {{
            map.removeLayer(markers);
            markers = L.markerClusterGroup();
            currentMarkers = [];
            filtered.forEach(loc => {{
                const marker = L.marker([loc.lat, loc.lng]);
                const label = loc.name || loc.list;
                marker.bindTooltip(label, {{
                    permanent: true, direction: 'top', offset: [0, -10],
                    className: 'bt-label'
                }});
                marker.bindPopup(`
                    <div class="popup-content">
                        <h3>${{loc.name || 'ไม่มีชื่อ'}}</h3>
                        <p>รายการ: ${{loc.list}}</p>
                        <p>Lat: ${{loc.lat}}, Lng: ${{loc.lng}}</p>
                        <a href="https://www.google.com/maps?q=${{loc.lat}},${{loc.lng}}" target="_blank">เปิดใน Google Maps</a>
                    </div>
                `, {{className: 'custom-popup'}});
                markers.addLayer(marker);
                currentMarkers.push({{loc, marker}});
            }});
            map.addLayer(markers);
            document.getElementById('count').textContent = filtered.length + ' จุด';
        }}

        function getFiltered() {{
            const q = document.getElementById('search').value.toLowerCase();
            const list = document.getElementById('listFilter').value;
            return locations.filter(l => {{
                const matchList = !list || l.list === list;
                const matchSearch = !q || (l.name && l.name.toLowerCase().includes(q)) || l.list.toLowerCase().includes(q);
                return matchList && matchSearch;
            }});
        }}

        function update() {{
            const filtered = getFiltered();
            renderMarkers(filtered);
            renderList(filtered);
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
                item.innerHTML = `<div><span class="name">${{loc.name || 'ไม่มีชื่อ'}}</span><br><span class="detail">${{loc.list}} | ${{loc.lat}}, ${{loc.lng}}</span></div>`;
                item.onclick = () => {{
                    map.setView([loc.lat, loc.lng], 17);
                    listPanel.classList.remove('open');
                    const found = currentMarkers.find(m => m.loc === loc);
                    if (found) {{
                        markers.zoomToShowLayer(found.marker, () => found.marker.openPopup());
                    }}
                }};
                listBody.appendChild(item);
            }});
        }}

        listToggle.onclick = () => listPanel.classList.toggle('open');

        // Init
        renderMarkers(locations);
        renderList(locations);
    </script>
</body>
</html>'''

with open(r'C:\Users\T\Documents\GitHub\bt-locations\docs\index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print(f'Done! Generated HTML with {len(locs)} locations from {len(lists)} lists')
