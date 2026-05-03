// Mobile Nav Switch View Helper
function mobSwitchView(view) {
    document.querySelectorAll('.mob-nb').forEach(el => el.classList.remove('on'));
    const btn = document.getElementById('mn-' + view) || document.querySelector(`.mob-nb[onclick*="${view}"]`);
    if(btn) btn.classList.add('on');
    
    // Close existing panels safely before opening new ones
    if (typeof window.closeListPanel === 'function') window.closeListPanel();
    if (typeof window.closeInfo === 'function') window.closeInfo();

    if (view === 'list') {
        const listPanel = document.getElementById('listPanel');
        if (listPanel) {
            listPanel.classList.add('open');
            if (typeof window.renderListPanel === 'function') {
                const data = window.btDebug ? window.btDebug.filtered : [];
                window.renderListPanel(data);
            }
        }
    } else if (view === 'stats') {
        if (typeof window.openInfoPanel === 'function') {
            window.openInfoPanel('stats');
        }
    }
}

// Map interactions, Google Maps nav, and custom markers patch
window.addEventListener('load', function() {
    setTimeout(function() {
        if (!window.map) return;
        
        // 11. Long-press to Add New Location
        let pressTimer;
        window.map.on('mousedown touchstart', function(e) {
            pressTimer = window.setTimeout(function() {
                const addBtn = document.getElementById('btAdd');
                if (addBtn) addBtn.click();
            }, 800);
        });
        window.map.on('mouseup mousemove touchend touchmove', function() {
            clearTimeout(pressTimer);
        });
        window.map.on('contextmenu', function(e) {
            const addBtn = document.getElementById('btAdd');
            if (addBtn) addBtn.click();
        });

        // 10. Realistic marker clustering
        if (window.markers && typeof window.markers.options !== 'undefined') {
            window.markers.options.maxClusterRadius = 40;
            window.markers.options.disableClusteringAtZoom = 17;
        }

        // 12. Smart Google Maps Navigation
        if (typeof window.showLocationDetails === 'function') {
            const _origShowLocationDetails = window.showLocationDetails;
            window.showLocationDetails = function(loc, idx) {
                _origShowLocationDetails(loc, idx);
                setTimeout(() => {
                    const btns = document.querySelectorAll('.place-action-btn');
                    btns.forEach(btn => {
                        if (btn.textContent.includes('เส้นทาง')) {
                            btn.onclick = function(e) {
                                e.stopPropagation();
                                window.open(`https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`, '_blank');
                            };
                        }
                    });
                }, 50);
            };
        }

        // 13. Sync bottom nav state when panels close naturally (e.g. dragging down or close button)
        if (typeof window.closeListPanel === 'function') {
            const _origCloseListPanel = window.closeListPanel;
            window.closeListPanel = function() {
                _origCloseListPanel();
                document.querySelectorAll('.mob-nb').forEach(el => el.classList.remove('on'));
                document.getElementById('mn-map')?.classList.add('on');
            };
        }
        if (typeof window.closeInfo === 'function') {
            const _origCloseInfo = window.closeInfo;
            window.closeInfo = function() {
                _origCloseInfo();
                document.querySelectorAll('.mob-nb').forEach(el => el.classList.remove('on'));
                document.getElementById('mn-map')?.classList.add('on');
            };
        }

        // 14. Fetch current user IP for online checking
        fetch('https://api.ipify.org?format=json')
            .then(res => res.json())
            .then(data => {
                const ip = data.ip;
                const onlineCount = document.getElementById('onlineCount');
                const svOnline = document.getElementById('svOnline');
                if (onlineCount) onlineCount.textContent = 'IP: ' + ip;
                if (svOnline) svOnline.textContent = ip;
            })
            .catch(err => console.error('Failed to fetch IP', err));

        // 15. Fix Desktop Stats View (renderStatsView was missing)
        window.renderStatsView = function() {
            const locs = window.btDebug ? window.btDebug.locations : null;
            if (!locs || !locs.length) return;
            
            const svTotal = document.getElementById('svTotal');
            if(svTotal) svTotal.textContent = locs.length;
            
            const cities = {}, lists = {};
            locs.forEach(l => {
                if(l.city) cities[l.city] = (cities[l.city] || 0) + 1;
                if(l.list) lists[l.list] = (lists[l.list] || 0) + 1;
            });
            
            const svCities = document.getElementById('svCities');
            if(svCities) svCities.textContent = Object.keys(cities).length;
            
            const svLists = document.getElementById('svLists');
            if(svLists) svLists.textContent = Object.keys(lists).length;
            
            const cityBars = document.getElementById('cityBars');
            if(cityBars) {
                const sortedCities = Object.entries(cities).sort((a,b) => b[1] - a[1]);
                const maxCity = sortedCities.length ? sortedCities[0][1] : 1;
                cityBars.innerHTML = sortedCities.map(([city, count]) => `
                    <div style="display:flex;align-items:center;margin-bottom:8px;font-size:13px;">
                        <div style="width:100px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--tx2);">${city}</div>
                        <div style="flex:1;height:6px;background:var(--s3);border-radius:3px;margin:0 10px;position:relative;">
                            <div style="position:absolute;left:0;top:0;bottom:0;background:var(--bl);border-radius:3px;width:${(count/maxCity)*100}%;"></div>
                        </div>
                        <div style="width:30px;text-align:right;font-weight:600;color:var(--tx);">${count}</div>
                    </div>
                `).join('');
            }
            
            const donutSvg = document.getElementById('donutSvg');
            const donutLegend = document.getElementById('donutLegend');
            if(donutSvg && donutLegend) {
                const sortedLists = Object.entries(lists).sort((a,b) => b[1] - a[1]);
                let svgHtml = '', legendHtml = '', startAngle = 0;
                sortedLists.forEach(([list, count], i) => {
                    const color = window.getColor ? window.getColor(list) : ['#34a853','#4285f4','#ea4335','#fbbc04','#ff6d01'][i%5];
                    const sliceAngle = (count / (locs.length||1)) * 360;
                    const x1 = 40 + 40 * Math.cos(Math.PI * startAngle / 180);
                    const y1 = 40 + 40 * Math.sin(Math.PI * startAngle / 180);
                    const x2 = 40 + 40 * Math.cos(Math.PI * (startAngle + sliceAngle) / 180);
                    const y2 = 40 + 40 * Math.sin(Math.PI * (startAngle + sliceAngle) / 180);
                    const largeArc = sliceAngle > 180 ? 1 : 0;
                    
                    if (sliceAngle === 360) {
                        svgHtml += `<circle cx="40" cy="40" r="40" fill="${color}" />`;
                    } else if (sliceAngle > 0) {
                        svgHtml += `<path d="M40,40 L${x1},${y1} A40,40 0 ${largeArc},1 ${x2},${y2} Z" fill="${color}" />`;
                    }
                    
                    legendHtml += `
                        <div style="display:flex;align-items:center;margin-bottom:4px;font-size:12px;">
                            <span style="width:10px;height:10px;border-radius:50%;background:${color};margin-right:8px;"></span>
                            <span style="flex:1;color:var(--tx2);">${list}</span>
                            <span style="font-weight:600;color:var(--tx);">${count}</span>
                        </div>
                    `;
                    startAngle += sliceAngle;
                });
                svgHtml += `<circle cx="40" cy="40" r="25" fill="var(--s2)" />`;
                donutSvg.innerHTML = svgHtml;
                donutLegend.innerHTML = legendHtml;
            }
            
            const recentList = document.getElementById('recentList');
            if(recentList) {
                const recent = [...locs].reverse().slice(0, 5);
                recentList.innerHTML = recent.map(l => `
                    <div style="padding:10px 0;border-bottom:1px solid var(--bd3);display:flex;align-items:center;">
                        <div style="width:32px;height:32px;border-radius:8px;background:var(--s3);display:flex;align-items:center;justify-content:center;margin-right:12px;font-size:16px;">📍</div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:13px;font-weight:600;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${l.name || l.list}</div>
                            <div style="font-size:11px;color:var(--tx3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${l.list} • ${l.city || '-'}</div>
                        </div>
                    </div>
                `).join('');
            }
        };

        // 16. Patch switchView to gracefully open listPanel since view-list is missing
        if (typeof window.switchView === 'function') {
            const _origSwitchView = window.switchView;
            window.switchView = function(view) {
                if (view === 'list') {
                    document.querySelectorAll('.vt').forEach(v=>v.classList.remove('on'));
                    document.getElementById('vt-list')?.classList.add('on');
                    if (typeof window.closeInfo === 'function') window.closeInfo();
                    const lp = document.getElementById('listPanel');
                    if(lp) {
                        lp.classList.add('open');
                        if (typeof window.renderListPanel === 'function') {
                            const data = window.btDebug ? window.btDebug.filtered : [];
                            window.renderListPanel(data);
                        }
                    }
                    return;
                }
                _origSwitchView(view);
            };
        }
            
    }, 1500);
});

