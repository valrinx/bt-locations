(function () {
    'use strict';

    const STATUS_LABELS = {
        new: 'ใหม่',
        assigned: 'มอบหมายแล้ว',
        in_progress: 'กำลังดำเนินการ',
        verified: 'ตรวจสอบแล้ว',
        not_found: 'หาไม่พบ',
        completed: 'เสร็จสิ้น'
    };
    const state = {
        tab: 'quality',
        selected: new Set(),
        profiles: [],
        query: '',
        historyLocationId: ''
    };
    const $ = (selector, root = document) => root.querySelector(selector);
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
    const locations = () => window.btDebug?.locations || [];
    const can = permission => window.btAuth?.has(permission) === true;
    const locationId = loc => loc?.sb_id || '';
    const displayName = loc => String(loc?.name || '').trim() || 'ไม่มีชื่อ';
    const coords = loc => `${Number(loc.lat).toFixed(6)}, ${Number(loc.lng).toFixed(6)}`;

    function qualityReport() {
        const rows = locations();
        const exact = new Map();
        rows.forEach((loc, index) => {
            const key = `${Number(loc.lat).toFixed(6)}|${Number(loc.lng).toFixed(6)}`;
            if (!exact.has(key)) exact.set(key, []);
            exact.get(key).push({ loc, index });
        });
        const duplicateGroups = [...exact.values()].filter(group => group.length > 1);
        const missingNames = rows
            .map((loc, index) => ({ loc, index }))
            .filter(item => !String(item.loc.name || '').trim());
        const coordinateNames = rows
            .map((loc, index) => ({ loc, index }))
            .filter(item => /^\s*-?\d{1,2}\.\d+\s*,\s*-?\d{2,3}\.\d+\s*$/.test(item.loc.name || ''));
        return {
            missingNames,
            coordinateNames,
            duplicateGroups,
            count: missingNames.length + coordinateNames.length + duplicateGroups.length
        };
    }

    function ensureShell() {
        if ($('#fieldOpsShell')) return;
        const shell = document.createElement('div');
        shell.id = 'fieldOpsShell';
        shell.className = 'field-ops-shell';
        shell.setAttribute('aria-hidden', 'true');
        shell.innerHTML = `
            <div class="field-ops-scrim" data-field-ops-close></div>
            <section class="field-ops-panel" role="dialog" aria-modal="true" aria-labelledby="fieldOpsTitle">
                <header class="field-ops-head">
                    <div>
                        <div class="field-ops-kicker">FIELD OPERATIONS</div>
                        <h2 id="fieldOpsTitle">ศูนย์จัดการข้อมูล</h2>
                    </div>
                    <button type="button" class="field-ops-close" data-field-ops-close aria-label="ปิด">✕</button>
                </header>
                <nav class="field-ops-tabs" role="tablist" aria-label="เครื่องมือข้อมูล">
                    <button class="field-ops-tab" data-tab="quality" role="tab">คุณภาพข้อมูล</button>
                    <button class="field-ops-tab" data-tab="work" role="tab">งานของทีม</button>
                    <button class="field-ops-tab" data-tab="bulk" role="tab">แก้หลายจุด</button>
                    <button class="field-ops-tab" data-tab="history" role="tab">ประวัติ</button>
                    <button class="field-ops-tab" data-tab="sync" role="tab">Offline</button>
                </nav>
                <div class="field-ops-body" id="fieldOpsBody"></div>
            </section>`;
        document.body.appendChild(shell);
        shell.addEventListener('click', onShellClick);
        shell.addEventListener('change', onShellChange);
        shell.addEventListener('input', onShellInput);
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && shell.classList.contains('open')) close();
        });
    }

    function installTriggers() {
        const report = qualityReport();
        const desktopHost = $('.sfoot');
        if (desktopHost && !$('#fieldOpsDesktopTrigger')) {
            const button = document.createElement('button');
            button.id = 'fieldOpsDesktopTrigger';
            button.type = 'button';
            button.className = 'field-ops-trigger';
            button.innerHTML = `<span>ศูนย์จัดการข้อมูล</span><span class="field-ops-count">${report.count}</span>`;
            button.addEventListener('click', open);
            desktopHost.prepend(button);
        }
        const mobileHost = $('#mobDrawer');
        if (mobileHost && !$('#fieldOpsMobileTrigger')) {
            const button = document.createElement('button');
            button.id = 'fieldOpsMobileTrigger';
            button.type = 'button';
            button.className = 'mob-menu-item';
            button.innerHTML = `<span>ศูนย์จัดการข้อมูล</span><small class="field-ops-count">${report.count}</small>`;
            button.addEventListener('click', () => {
                window.closeMobDrawer?.();
                open();
            });
            mobileHost.querySelector('.mob-drawer-panel')?.appendChild(button);
        }
    }

    async function open(tab = state.tab) {
        ensureShell();
        state.tab = tab;
        const shell = $('#fieldOpsShell');
        shell.classList.add('open');
        shell.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        try {
            await loadProfiles();
        } catch (error) {
            console.warn('Field Ops profile list unavailable:', error);
        }
        render();
        $('.field-ops-close', shell)?.focus();
    }

    function close() {
        const shell = $('#fieldOpsShell');
        if (!shell) return;
        shell.classList.remove('open');
        shell.setAttribute('aria-hidden', 'true');
        document.body.style.removeProperty('overflow');
    }

    async function loadProfiles() {
        if (!window.btSupabase || !window.btAuth?.state?.user) return;
        const { data, error } = await window.btSupabase
            .from('profiles')
            .select('id,email,display_name')
            .order('display_name', { ascending: true });
        if (!error) state.profiles = data || [];
    }

    function render() {
        const shell = $('#fieldOpsShell');
        if (!shell) return;
        shell.querySelectorAll('[data-tab]').forEach(tab => {
            tab.setAttribute('aria-selected', tab.dataset.tab === state.tab ? 'true' : 'false');
        });
        const body = $('#fieldOpsBody');
        if (state.tab === 'quality') renderQuality(body);
        if (state.tab === 'work') renderWork(body);
        if (state.tab === 'bulk') renderBulk(body);
        if (state.tab === 'history') renderHistory(body);
        if (state.tab === 'sync') renderSync(body);
        updateCounts();
    }

    function renderQuality(body) {
        const report = qualityReport();
        const missing = report.missingNames.slice(0, 100);
        const duplicateRows = report.duplicateGroups.slice(0, 100);
        body.innerHTML = `
            <div class="field-ops-summary">
                <strong>รายการที่ควรตรวจ ${report.count.toLocaleString()} รายการ</strong>
                <span>แสดงสูงสุดประเภทละ 100</span>
            </div>
            ${!can('edit') ? '<div class="field-ops-notice">บัญชีนี้ดูรายการได้ แต่ต้องมีสิทธิ์แก้ไขจึงจะเปลี่ยนข้อมูลได้</div>' : ''}
            <div class="field-ops-summary"><strong>ไม่มีชื่อ ${report.missingNames.length.toLocaleString()}</strong></div>
            <div class="field-ops-list">
                ${missing.map(({ loc, index }) => rowHtml(
                    displayName(loc),
                    `${escapeHtml(loc.list)} · ${escapeHtml(loc.city)} · ${coords(loc)}`,
                    `<button class="field-ops-btn primary" data-edit-index="${index}" ${can('edit') ? '' : 'disabled'}>เพิ่มชื่อ</button>`
                )).join('') || emptyHtml('ไม่พบจุดที่ไม่มีชื่อ')}
            </div>
            <div class="field-ops-summary" style="margin-top:20px"><strong>พิกัดซ้ำ ${report.duplicateGroups.length.toLocaleString()} กลุ่ม</strong></div>
            <div class="field-ops-list">
                ${duplicateRows.map((group, groupIndex) => rowHtml(
                    `${group.length} จุดที่พิกัดเดียวกัน`,
                    `${coords(group[0].loc)} · ${group.map(item => displayName(item.loc)).join(' / ')}`,
                    `<button class="field-ops-btn danger" data-merge-group="${groupIndex}"
                        ${can('edit') && can('delete') && group.every(item => locationId(item.loc)) ? '' : 'disabled'}>รวมข้อมูล</button>`
                )).join('') || emptyHtml('ไม่พบพิกัดซ้ำ')}
            </div>`;
        body._duplicateGroups = duplicateRows;
    }

    function workflowOptions(selected = '') {
        return Object.entries(STATUS_LABELS).map(([value, label]) =>
            `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`
        ).join('');
    }

    function assigneeOptions(selected = '') {
        return `<option value="">ยังไม่มอบหมาย</option>` + state.profiles.map(profile => {
            const label = profile.display_name || profile.email;
            return `<option value="${profile.id}" ${profile.id === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
        }).join('');
    }

    function renderWork(body) {
        const query = state.query.toLowerCase();
        const rows = locations().filter(loc => !query ||
            displayName(loc).toLowerCase().includes(query) ||
            String(loc.city || '').toLowerCase().includes(query));
        body.innerHTML = `
            <div class="field-ops-form">
                <label class="field-ops-field wide">
                    <span>ค้นหางาน</span>
                    <input id="fieldOpsWorkSearch" value="${escapeHtml(state.query)}" placeholder="ชื่อ เมือง หรือรายการ">
                </label>
            </div>
            <div class="field-ops-summary">
                <strong>${rows.length.toLocaleString()} จุด</strong>
                <span>เปลี่ยนสถานะและผู้รับผิดชอบ</span>
            </div>
            <div class="field-ops-list">
                ${rows.slice(0, 150).map(loc => {
                    const id = locationId(loc);
                    return `<div class="field-ops-row">
                        <div class="field-ops-row-main">
                            <div class="field-ops-row-title">${escapeHtml(displayName(loc))}</div>
                            <div class="field-ops-row-meta">${escapeHtml(loc.list)} · ${escapeHtml(loc.city)}</div>
                            <span class="field-ops-status">${STATUS_LABELS[loc.workflow_status] || STATUS_LABELS.new}</span>
                        </div>
                        <div class="field-ops-actions">
                            <select aria-label="สถานะ" data-work-status="${id}" ${can('edit') && id ? '' : 'disabled'}>
                                ${workflowOptions(loc.workflow_status || 'new')}
                            </select>
                            <select aria-label="ผู้รับผิดชอบ" data-work-assignee="${id}" ${can('edit') && id ? '' : 'disabled'}>
                                ${assigneeOptions(loc.assigned_to || '')}
                            </select>
                            <button class="field-ops-btn primary" data-save-work="${id}" ${can('edit') && id ? '' : 'disabled'}>บันทึก</button>
                        </div>
                    </div>`;
                }).join('') || emptyHtml('ไม่พบงาน')}
            </div>`;
    }

    function renderBulk(body) {
        const query = state.query.toLowerCase();
        const rows = locations().filter(loc => !query ||
            displayName(loc).toLowerCase().includes(query) ||
            String(loc.list || '').toLowerCase().includes(query) ||
            String(loc.city || '').toLowerCase().includes(query));
        body.innerHTML = `
            <div class="field-ops-form">
                <label class="field-ops-field wide">
                    <span>ค้นหาและเลือกจุด (สูงสุด 500)</span>
                    <input id="fieldOpsBulkSearch" value="${escapeHtml(state.query)}" placeholder="ชื่อ เมือง หรือรายการ">
                </label>
                <label class="field-ops-field"><span>รายการใหม่</span><input id="fieldOpsBulkList" placeholder="ไม่เปลี่ยน"></label>
                <label class="field-ops-field"><span>เมืองใหม่</span><input id="fieldOpsBulkCity" placeholder="ไม่เปลี่ยน"></label>
                <label class="field-ops-field"><span>สถานะ</span><select id="fieldOpsBulkStatus"><option value="">ไม่เปลี่ยน</option>${workflowOptions()}</select></label>
                <label class="field-ops-field"><span>ผู้รับผิดชอบ</span><select id="fieldOpsBulkAssignee"><option value="__unchanged__">ไม่เปลี่ยน</option>${assigneeOptions()}</select></label>
            </div>
            <div class="field-ops-summary">
                <strong>เลือกแล้ว ${state.selected.size.toLocaleString()} จุด</strong>
                <span>
                    <button class="field-ops-btn" data-select-visible>เลือกที่แสดง</button>
                    <button class="field-ops-btn" data-clear-selected>ล้าง</button>
                    <button class="field-ops-btn primary" data-apply-bulk
                        ${can('edit') && state.selected.size ? '' : 'disabled'}>ตรวจสอบและบันทึก</button>
                </span>
            </div>
            <div class="field-ops-list">
                ${rows.slice(0, 200).map(loc => {
                    const id = locationId(loc);
                    return `<label class="field-ops-row">
                        <div class="field-ops-row-main">
                            <div class="field-ops-row-title">${escapeHtml(displayName(loc))}</div>
                            <div class="field-ops-row-meta">${escapeHtml(loc.list)} · ${escapeHtml(loc.city)} · ${coords(loc)}</div>
                        </div>
                        <input class="field-ops-check" type="checkbox" data-bulk-id="${id}"
                            ${state.selected.has(id) ? 'checked' : ''} ${id ? '' : 'disabled'}>
                    </label>`;
                }).join('') || emptyHtml('ไม่พบข้อมูล')}
            </div>`;
        body._visibleBulkIds = rows.slice(0, 200).map(locationId).filter(Boolean);
    }

    async function renderHistory(body) {
        const options = locations().filter(locationId).slice(0, 500).map(loc =>
            `<option value="${locationId(loc)}" ${locationId(loc) === state.historyLocationId ? 'selected' : ''}>${escapeHtml(displayName(loc))} · ${escapeHtml(loc.city)}</option>`
        ).join('');
        body.innerHTML = `
            <div class="field-ops-form">
                <label class="field-ops-field wide">
                    <span>เลือกสถานที่</span>
                    <select id="fieldOpsHistoryLocation"><option value="">เลือกสถานที่</option>${options}</select>
                </label>
            </div>
            <div id="fieldOpsHistoryRows">${emptyHtml('เลือกสถานที่เพื่อดูประวัติจากเซิร์ฟเวอร์')}</div>`;
        if (state.historyLocationId) await loadHistory();
    }

    async function loadHistory() {
        const host = $('#fieldOpsHistoryRows');
        if (!host || !state.historyLocationId) return;
        host.innerHTML = emptyHtml('กำลังโหลดประวัติ...');
        const { data, error } = await window.btSupabase
            .from('location_revisions')
            .select('id,action,before_data,after_data,changed_by,changed_at')
            .eq('location_id', state.historyLocationId)
            .order('changed_at', { ascending: false })
            .limit(100);
        if (error) {
            host.innerHTML = `<div class="field-ops-notice">ยังอ่านประวัติไม่ได้ กรุณาตรวจว่าใช้ migration 004 แล้ว</div>`;
            return;
        }
        host.innerHTML = `<div class="field-ops-list">${(data || []).map(revision => rowHtml(
            `${revision.action.toUpperCase()} · ${new Date(revision.changed_at).toLocaleString('th-TH')}`,
            describeRevision(revision),
            `<button class="field-ops-btn" data-rollback="${revision.id}"
                ${can('restore') && revision.before_data ? '' : 'disabled'}>ย้อนกลับ</button>`
        )).join('') || emptyHtml('ยังไม่มีประวัติ')}</div>`;
    }

    function describeRevision(revision) {
        const before = revision.before_data || {};
        const after = revision.after_data || {};
        const keys = ['name', 'list', 'city', 'workflow_status', 'assigned_to', 'due_at', 'deleted_at'];
        const changed = keys.filter(key => String(before[key] ?? '') !== String(after[key] ?? ''));
        return escapeHtml(changed.length ? `เปลี่ยน: ${changed.join(', ')}` : 'บันทึกข้อมูล');
    }

    function renderSync(body) {
        const outbox = window.btOutbox?.list?.() || [];
        const online = navigator.onLine;
        body.innerHTML = `
            <div class="field-ops-summary">
                <strong>${online ? 'ออนไลน์' : 'ออฟไลน์'}</strong>
                <span>${outbox.length.toLocaleString()} รายการรอส่ง</span>
            </div>
            <div class="field-ops-notice">
                การแก้ไขขณะไม่มีอินเทอร์เน็ตจะเก็บไว้ในอุปกรณ์นี้ และส่งใหม่ตามลำดับเมื่อกลับมาออนไลน์
                ห้ามล้างข้อมูลเว็บไซต์ก่อนรายการรอส่งเป็นศูนย์
            </div>
            <div class="field-ops-actions" style="margin-bottom:14px">
                <button class="field-ops-btn primary" data-retry-outbox ${online && outbox.length ? '' : 'disabled'}>ลองส่งอีกครั้ง</button>
                <button class="field-ops-btn" data-export-outbox ${outbox.length ? '' : 'disabled'}>Export รายการรอส่ง</button>
            </div>
            <div class="field-ops-list">
                ${outbox.map(item => rowHtml(
                    `${String(item.operation || '').toUpperCase()} · ${escapeHtml(item.location?.name || item.locationId || '')}`,
                    `${new Date(item.createdAt).toLocaleString('th-TH')} · ลองแล้ว ${item.attempts || 0} ครั้ง`,
                    ''
                )).join('') || emptyHtml('ข้อมูลทั้งหมดส่งถึงเซิร์ฟเวอร์แล้ว')}
            </div>`;
    }

    function rowHtml(title, meta, actions) {
        return `<div class="field-ops-row">
            <div class="field-ops-row-main">
                <div class="field-ops-row-title">${title}</div>
                <div class="field-ops-row-meta">${meta}</div>
            </div>
            ${actions ? `<div class="field-ops-actions">${actions}</div>` : ''}
        </div>`;
    }

    function emptyHtml(message) {
        return `<div class="field-ops-empty">${escapeHtml(message)}</div>`;
    }

    async function onShellClick(event) {
        if (event.target.closest('[data-field-ops-close]')) return close();
        const tab = event.target.closest('[data-tab]');
        if (tab) {
            state.tab = tab.dataset.tab;
            state.query = '';
            return render();
        }
        const edit = event.target.closest('[data-edit-index]');
        if (edit) {
            close();
            window.openEdit?.(Number(edit.dataset.editIndex));
            return;
        }
        const merge = event.target.closest('[data-merge-group]');
        if (merge) return mergeDuplicateGroup(Number(merge.dataset.mergeGroup));
        const saveWork = event.target.closest('[data-save-work]');
        if (saveWork) return saveWorkflow(saveWork.dataset.saveWork);
        if (event.target.closest('[data-select-visible]')) {
            ($('#fieldOpsBody')._visibleBulkIds || []).slice(0, 500).forEach(id => state.selected.add(id));
            return render();
        }
        if (event.target.closest('[data-clear-selected]')) {
            state.selected.clear();
            return render();
        }
        if (event.target.closest('[data-apply-bulk]')) return applyBulk();
        const rollback = event.target.closest('[data-rollback]');
        if (rollback) return rollbackRevision(Number(rollback.dataset.rollback));
        if (event.target.closest('[data-retry-outbox]')) {
            await window.btOutbox?.drain?.();
            return render();
        }
        if (event.target.closest('[data-export-outbox]')) return exportOutbox();
    }

    function onShellChange(event) {
        if (event.target.matches('[data-bulk-id]')) {
            if (event.target.checked) state.selected.add(event.target.dataset.bulkId);
            else state.selected.delete(event.target.dataset.bulkId);
            $('.field-ops-summary strong', $('#fieldOpsBody')).textContent = `เลือกแล้ว ${state.selected.size.toLocaleString()} จุด`;
            const apply = $('[data-apply-bulk]', $('#fieldOpsBody'));
            if (apply) apply.disabled = !can('edit') || state.selected.size === 0;
        }
        if (event.target.id === 'fieldOpsHistoryLocation') {
            state.historyLocationId = event.target.value;
            loadHistory();
        }
    }

    function onShellInput(event) {
        if (event.target.id === 'fieldOpsWorkSearch' || event.target.id === 'fieldOpsBulkSearch') {
            state.query = event.target.value;
            window.clearTimeout(onShellInput.timer);
            onShellInput.timer = window.setTimeout(render, 180);
        }
    }

    async function mergeDuplicateGroup(groupIndex) {
        if (!window.btAuth?.require('edit', 'รวมข้อมูลซ้ำ') || !window.btAuth?.require('delete', 'รวมข้อมูลซ้ำ')) return;
        const group = $('#fieldOpsBody')._duplicateGroups?.[groupIndex];
        if (!group || group.length < 2) return;
        const keep = group.find(item => String(item.loc.name || '').trim()) || group[0];
        const removeIds = group.filter(item => item !== keep).map(item => locationId(item.loc));
        if (!confirm(`เก็บ "${displayName(keep.loc)}" และรวมอีก ${removeIds.length} จุดเข้าด้วยกัน?\nข้อมูลเดิมสามารถกู้จากประวัติได้`)) return;
        setBusy(true);
        const { error } = await window.btSupabase.rpc('merge_locations', {
            keep_id: locationId(keep.loc),
            remove_ids: removeIds
        });
        setBusy(false);
        if (error) return window.showToast?.(`รวมข้อมูลไม่สำเร็จ: ${error.message}`, true);
        await window.doSync?.(true);
        window.showToast?.('รวมข้อมูลซ้ำแล้ว', false, true);
        render();
    }

    async function saveWorkflow(id) {
        if (!window.btAuth?.require('edit', 'เปลี่ยนสถานะงาน')) return;
        const status = $(`[data-work-status="${CSS.escape(id)}"]`)?.value || 'new';
        const assignee = $(`[data-work-assignee="${CSS.escape(id)}"]`)?.value || null;
        setBusy(true);
        const { error } = await window.btSupabase.rpc('update_location_workflow', {
            target_id: id,
            next_status: status,
            next_assignee: assignee,
            next_due_at: null
        });
        setBusy(false);
        if (error) return window.showToast?.(`บันทึกสถานะไม่สำเร็จ: ${error.message}`, true);
        await window.doSync?.(true);
        window.showToast?.('บันทึกสถานะงานแล้ว', false, true);
        render();
    }

    async function applyBulk() {
        if (!window.btAuth?.require('edit', 'แก้ไขหลายจุด')) return;
        const patch = {};
        const list = $('#fieldOpsBulkList')?.value.trim();
        const city = $('#fieldOpsBulkCity')?.value.trim();
        const status = $('#fieldOpsBulkStatus')?.value;
        const assignee = $('#fieldOpsBulkAssignee')?.value;
        if (list) patch.list = list;
        if (city) patch.city = city;
        if (status) patch.workflow_status = status;
        if (assignee !== '__unchanged__') patch.assigned_to = assignee;
        if (!Object.keys(patch).length) return window.showToast?.('ระบุข้อมูลที่ต้องการเปลี่ยนก่อน', true);
        if (!confirm(`แก้ไข ${state.selected.size} จุด?\nระบบจะเก็บประวัติทุกจุดและสามารถย้อนกลับได้`)) return;
        setBusy(true);
        const { data, error } = await window.btSupabase.rpc('bulk_update_locations', {
            location_ids: [...state.selected].slice(0, 500),
            patch
        });
        setBusy(false);
        if (error) return window.showToast?.(`แก้ไขหลายจุดไม่สำเร็จ: ${error.message}`, true);
        state.selected.clear();
        await window.doSync?.(true);
        window.showToast?.(`แก้ไข ${data || 0} จุดแล้ว`, false, true);
        render();
    }

    async function rollbackRevision(id) {
        if (!window.btAuth?.require('restore', 'ย้อนกลับข้อมูล')) return;
        if (!confirm('ย้อนสถานที่กลับไปก่อน revision นี้?\nการย้อนกลับครั้งนี้จะถูกบันทึกเป็น revision ใหม่')) return;
        setBusy(true);
        const { error } = await window.btSupabase.rpc('rollback_location', { revision_id: id });
        setBusy(false);
        if (error) return window.showToast?.(`ย้อนกลับไม่สำเร็จ: ${error.message}`, true);
        await window.doSync?.(true);
        window.showToast?.('ย้อนกลับข้อมูลแล้ว', false, true);
        await loadHistory();
    }

    function exportOutbox() {
        const payload = JSON.stringify({
            schema: 'bt-locations-offline-outbox',
            exportedAt: new Date().toISOString(),
            items: window.btOutbox?.list?.() || []
        }, null, 2);
        const blob = new Blob([payload], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `bt-offline-outbox-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    function setBusy(busy) {
        $('#fieldOpsShell')?.classList.toggle('is-busy', busy);
        $('#fieldOpsShell')?.querySelectorAll('button,select,input').forEach(node => {
            if (busy) {
                node.dataset.wasDisabled = node.disabled ? '1' : '0';
                node.disabled = true;
            } else if (node.dataset.wasDisabled === '0') {
                node.disabled = false;
            }
        });
    }

    function updateCounts() {
        const count = qualityReport().count;
        document.querySelectorAll('.field-ops-count').forEach(node => {
            node.textContent = count.toLocaleString();
        });
    }

    window.btFieldOps = { open, close, qualityReport };
    window.addEventListener('bt-auth-changed', () => {
        installTriggers();
        updateCounts();
        if (navigator.onLine) window.btOutbox?.drain?.();
    });
    window.addEventListener('bt-locations-updated', updateCounts);
    window.addEventListener('online', () => {
        window.btOutbox?.drain?.();
        if ($('#fieldOpsShell')?.classList.contains('open') && state.tab === 'sync') render();
    });
    window.addEventListener('offline', () => {
        if ($('#fieldOpsShell')?.classList.contains('open') && state.tab === 'sync') render();
    });
    ensureShell();
    installTriggers();
}());
