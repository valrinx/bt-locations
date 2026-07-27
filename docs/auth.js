(function () {
    'use strict';

    const client = window.btSupabase;
    if (!client) {
        console.error('BT Auth: Supabase client is unavailable.');
        return;
    }

    const permissions = ['edit', 'delete', 'import', 'restore'];
    const labels = {
        edit: 'แก้ไข',
        delete: 'ลบ',
        import: 'Import',
        restore: 'Restore'
    };
    const state = {
        session: null,
        user: null,
        profile: null,
        ready: false,
        mode: 'signin'
    };

    const el = id => document.getElementById(id);
    const setOpen = (node, open) => {
        if (!node) return;
        node.classList.toggle('open', open);
        node.setAttribute('aria-hidden', open ? 'false' : 'true');
    };
    const message = (node, text, kind = '') => {
        if (!node) return;
        node.textContent = text || '';
        node.className = `auth-message${kind ? ` ${kind}` : ''}`;
    };
    const actor = () => {
        const profile = state.profile;
        return profile
            ? (profile.display_name || profile.email || '')
            : (state.user?.email || '');
    };
    const isAdmin = () => state.profile?.is_admin === true;
    const has = permission => {
        if (!state.user || !state.profile) return false;
        return isAdmin() || state.profile[`can_${permission}`] === true;
    };

    function requirePermission(permission, actionLabel) {
        if (!state.ready) {
            window.showToast?.('กำลังตรวจสอบสิทธิ์ กรุณาลองอีกครั้ง', true);
            return false;
        }
        if (!state.user) {
            open();
            message(el('authMessage'), `เข้าสู่ระบบก่อน${actionLabel || labels[permission] || 'ทำรายการนี้'}`, 'error');
            return false;
        }
        if (!has(permission)) {
            window.showToast?.(`บัญชีนี้ไม่มีสิทธิ์${actionLabel || labels[permission] || 'ทำรายการนี้'}`, true);
            return false;
        }
        return true;
    }

    function setMode(mode) {
        state.mode = mode;
        const signingUp = mode === 'signup';
        el('authSignInTab')?.classList.toggle('active', !signingUp);
        el('authSignUpTab')?.classList.toggle('active', signingUp);
        if (el('authDisplayNameRow')) el('authDisplayNameRow').hidden = !signingUp;
        if (el('authPassword')) {
            el('authPassword').autocomplete = signingUp ? 'new-password' : 'current-password';
        }
        if (el('authSubmit')) el('authSubmit').textContent = signingUp ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ';
        if (el('authForgotPassword')) el('authForgotPassword').hidden = signingUp;
        message(el('authMessage'), '');
    }

    function open() {
        renderAccount();
        setOpen(el('authModalOverlay'), true);
        window.setTimeout(() => {
            (state.user ? el('authSignOut') : el('authEmail'))?.focus();
        }, 40);
    }

    function close() {
        setOpen(el('authModalOverlay'), false);
    }

    function renderPermissionSummary() {
        const root = el('authPermissionSummary');
        if (!root) return;
        root.replaceChildren();
        if (!state.profile) return;
        permissions.forEach(permission => {
            const chip = document.createElement('span');
            chip.className = `auth-permission-chip${has(permission) ? ' on' : ''}`;
            chip.textContent = `${has(permission) ? '✓' : '–'} ${labels[permission]}`;
            root.appendChild(chip);
        });
    }

    function renderAccount() {
        const signedIn = Boolean(state.user);
        if (el('authGuestView')) el('authGuestView').hidden = signedIn;
        if (el('authAccountView')) el('authAccountView').hidden = !signedIn;
        if (el('authModalSubtitle')) {
            el('authModalSubtitle').textContent = signedIn
                ? 'ตรวจสอบบัญชีและสิทธิ์ที่ได้รับ'
                : 'เข้าสู่ระบบเพื่อจัดการข้อมูล';
        }
        if (!signedIn) return;

        const displayName = actor() || 'ผู้ใช้งาน';
        const first = displayName.charAt(0).toUpperCase() || 'B';
        if (el('authAccountAvatar')) el('authAccountAvatar').textContent = first;
        if (el('authAccountName')) el('authAccountName').textContent = state.profile?.display_name || 'ผู้ใช้งาน';
        if (el('authAccountEmail')) el('authAccountEmail').textContent = state.user.email || '';
        if (el('authRoleBadge')) {
            const role = isAdmin()
                ? 'Admin'
                : (permissions.some(permission => has(permission)) ? 'Collaborator' : 'Viewer');
            el('authRoleBadge').textContent = role;
            el('authRoleBadge').classList.toggle('admin', isAdmin());
        }
        if (el('authManageUsers')) el('authManageUsers').hidden = !isAdmin();
        renderPermissionSummary();
    }

    function renderGlobalState() {
        const displayName = actor();
        const avatar = el('searchAvatar');
        if (avatar) {
            avatar.textContent = displayName.charAt(0).toUpperCase() || 'B';
            avatar.dataset.state = state.user ? 'signed-in' : 'guest';
            avatar.title = state.user
                ? `${state.user.email}${isAdmin() ? ' · Admin' : ''}`
                : 'เข้าสู่ระบบหรือสมัครสมาชิก';
        }
        if (el('mobAccountTitle')) {
            el('mobAccountTitle').textContent = state.user ? (state.profile?.display_name || 'บัญชีของฉัน') : 'เข้าสู่ระบบ';
        }
        if (el('mobAccountDetail')) {
            el('mobAccountDetail').textContent = state.user
                ? `${state.user.email}${isAdmin() ? ' · Admin' : ''}`
                : 'ลงชื่อเข้าใช้เพื่อจัดการข้อมูล';
        }
        if (el('mobAdminUsers')) el('mobAdminUsers').hidden = !isAdmin();

        document.querySelectorAll('[data-auth-permission]').forEach(node => {
            const allowed = has(node.dataset.authPermission);
            if (node.hasAttribute('data-auth-hide')) {
                node.hidden = !allowed;
            }
            node.setAttribute('aria-disabled', allowed ? 'false' : 'true');
            if ('disabled' in node) node.disabled = !allowed;
        });

        if (displayName) localStorage.setItem('bt_username', displayName);
        renderAccount();
        window.dispatchEvent(new CustomEvent('bt-auth-changed', {
            detail: { user: state.user, profile: state.profile }
        }));
    }

    async function loadProfile() {
        state.profile = null;
        if (!state.user) return;
        const { data, error } = await client
            .from('profiles')
            .select('id,email,display_name,is_admin,can_edit,can_delete,can_import,can_restore')
            .eq('id', state.user.id)
            .maybeSingle();
        if (error) {
            console.warn('BT Auth profile load failed:', error.message);
            return;
        }
        state.profile = data || null;
    }

    async function applySession(session) {
        state.session = session || null;
        state.user = session?.user || null;
        await loadProfile();
        state.ready = true;
        renderGlobalState();
    }

    async function submitAuth(event) {
        event.preventDefault();
        const email = el('authEmail')?.value.trim();
        const password = el('authPassword')?.value || '';
        const submit = el('authSubmit');
        message(el('authMessage'), '');
        if (password.length < 8) {
            message(el('authMessage'), 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร', 'error');
            return;
        }
        if (submit) submit.disabled = true;
        try {
            if (state.mode === 'signup') {
                const displayName = el('authDisplayName')?.value.trim() || '';
                const { data, error } = await client.auth.signUp({
                    email,
                    password,
                    options: { data: { display_name: displayName } }
                });
                if (error) throw error;
                if (data.session) {
                    message(el('authMessage'), 'สมัครสมาชิกและเข้าสู่ระบบแล้ว', 'success');
                    window.setTimeout(close, 600);
                } else {
                    message(el('authMessage'), 'สมัครสมาชิกแล้ว โปรดยืนยันอีเมลจากกล่องจดหมายก่อนเข้าสู่ระบบ', 'success');
                }
            } else {
                const { error } = await client.auth.signInWithPassword({ email, password });
                if (error) throw error;
                message(el('authMessage'), 'เข้าสู่ระบบสำเร็จ', 'success');
                window.setTimeout(close, 450);
            }
        } catch (error) {
            message(el('authMessage'), error.message || 'ไม่สามารถดำเนินการได้', 'error');
        } finally {
            if (submit) submit.disabled = false;
        }
    }

    async function requestPasswordReset() {
        const email = el('authEmail')?.value.trim();
        if (!email) {
            message(el('authMessage'), 'กรอกอีเมลก่อนขอลิงก์ตั้งรหัสผ่านใหม่', 'error');
            el('authEmail')?.focus();
            return;
        }
        const redirectTo = `${location.origin}${location.pathname}`;
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
        message(
            el('authMessage'),
            error ? error.message : 'ส่งลิงก์ตั้งรหัสผ่านใหม่แล้ว กรุณาตรวจอีเมล',
            error ? 'error' : 'success'
        );
    }

    async function signOut() {
        const { error } = await client.auth.signOut();
        if (error) {
            window.showToast?.(error.message, true);
            return;
        }
        close();
        window.showToast?.('ออกจากระบบแล้ว');
    }

    async function submitRecovery(event) {
        event.preventDefault();
        const password = el('passwordRecoveryValue')?.value || '';
        if (password.length < 8) {
            message(el('passwordRecoveryMessage'), 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร', 'error');
            return;
        }
        const { error } = await client.auth.updateUser({ password });
        if (error) {
            message(el('passwordRecoveryMessage'), error.message, 'error');
            return;
        }
        message(el('passwordRecoveryMessage'), 'บันทึกรหัสผ่านใหม่แล้ว', 'success');
        window.setTimeout(() => setOpen(el('passwordRecoveryOverlay'), false), 700);
    }

    function createPermissionToggle(profile, permission) {
        const label = document.createElement('label');
        label.className = 'auth-permission-toggle';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.dataset.permission = permission;
        input.checked = profile.is_admin || profile[`can_${permission}`] === true;
        input.disabled = profile.is_admin;
        const text = document.createElement('span');
        text.textContent = labels[permission];
        label.append(input, text);
        return label;
    }

    function renderAdminUsers(profiles) {
        const root = el('adminUsersList');
        if (!root) return;
        root.replaceChildren();
        if (!profiles.length) {
            const empty = document.createElement('div');
            empty.className = 'auth-empty';
            empty.textContent = 'ยังไม่มีผู้ใช้งาน';
            root.appendChild(empty);
            return;
        }

        profiles.forEach(profile => {
            const row = document.createElement('div');
            row.className = `auth-user-row${profile.is_admin ? ' admin-user' : ''}`;
            row.dataset.userId = profile.id;

            const identity = document.createElement('div');
            identity.className = 'auth-user-identity';
            const name = document.createElement('strong');
            name.textContent = profile.display_name || profile.email;
            const email = document.createElement('small');
            email.textContent = `${profile.email}${profile.is_admin ? ' · Admin' : ''}`;
            identity.append(name, email);
            row.appendChild(identity);

            permissions.forEach(permission => row.appendChild(createPermissionToggle(profile, permission)));

            const save = document.createElement('button');
            save.type = 'button';
            save.className = 'auth-user-save';
            save.textContent = profile.is_admin ? 'ADMIN' : 'บันทึก';
            save.disabled = profile.is_admin;
            save.addEventListener('click', () => savePermissions(row, profile));
            row.appendChild(save);
            root.appendChild(row);
        });
    }

    async function loadAdminUsers() {
        const root = el('adminUsersList');
        if (root) root.innerHTML = '<div class="auth-loading">กำลังโหลดผู้ใช้…</div>';
        message(el('adminUsersMessage'), '');
        const { data, error } = await client
            .from('profiles')
            .select('id,email,display_name,is_admin,can_edit,can_delete,can_import,can_restore,created_at')
            .order('is_admin', { ascending: false })
            .order('created_at', { ascending: true });
        if (error) {
            message(el('adminUsersMessage'), error.message, 'error');
            if (root) root.replaceChildren();
            return;
        }
        renderAdminUsers(data || []);
    }

    async function savePermissions(row, profile) {
        const save = row.querySelector('.auth-user-save');
        const values = {};
        permissions.forEach(permission => {
            values[permission] = row.querySelector(`[data-permission="${permission}"]`)?.checked === true;
        });
        save.disabled = true;
        save.textContent = '…';
        const { error } = await client.rpc('admin_set_permissions', {
            target_user_id: profile.id,
            allow_edit: values.edit,
            allow_delete: values.delete,
            allow_import: values.import,
            allow_restore: values.restore
        });
        if (error) {
            message(el('adminUsersMessage'), error.message, 'error');
            save.disabled = false;
            save.textContent = 'บันทึก';
            return;
        }
        message(el('adminUsersMessage'), `บันทึกสิทธิ์ของ ${profile.email} แล้ว`, 'success');
        save.textContent = 'สำเร็จ';
        window.setTimeout(() => {
            save.disabled = false;
            save.textContent = 'บันทึก';
        }, 900);
    }

    async function openAdmin() {
        if (!state.ready || !state.user) {
            open();
            return;
        }
        if (!isAdmin()) {
            window.showToast?.('เฉพาะ Admin เท่านั้นที่จัดการสิทธิ์ได้', true);
            return;
        }
        close();
        setOpen(el('adminUsersOverlay'), true);
        await loadAdminUsers();
    }

    el('searchAvatar')?.addEventListener('click', open);
    el('authSignInTab')?.addEventListener('click', () => setMode('signin'));
    el('authSignUpTab')?.addEventListener('click', () => setMode('signup'));
    el('authForm')?.addEventListener('submit', submitAuth);
    el('authForgotPassword')?.addEventListener('click', requestPasswordReset);
    el('authSignOut')?.addEventListener('click', signOut);
    el('authManageUsers')?.addEventListener('click', openAdmin);
    el('passwordRecoveryForm')?.addEventListener('submit', submitRecovery);
    document.querySelectorAll('[data-auth-close]').forEach(node => node.addEventListener('click', close));
    document.querySelectorAll('[data-admin-close]').forEach(node => node.addEventListener('click', () => setOpen(el('adminUsersOverlay'), false)));
    document.querySelectorAll('[data-recovery-close]').forEach(node => node.addEventListener('click', () => setOpen(el('passwordRecoveryOverlay'), false)));
    el('authModalOverlay')?.addEventListener('click', event => {
        if (event.target === el('authModalOverlay')) close();
    });
    el('adminUsersOverlay')?.addEventListener('click', event => {
        if (event.target === el('adminUsersOverlay')) setOpen(el('adminUsersOverlay'), false);
    });

    window.btAuth = {
        get state() { return state; },
        has,
        require: requirePermission,
        actor,
        open,
        openAdmin,
        refresh: async () => {
            await loadProfile();
            renderGlobalState();
        }
    };

    setMode('signin');
    client.auth.onAuthStateChange((event, session) => {
        window.setTimeout(async () => {
            await applySession(session);
            if (event === 'PASSWORD_RECOVERY') {
                close();
                message(el('passwordRecoveryMessage'), '');
                setOpen(el('passwordRecoveryOverlay'), true);
            }
        }, 0);
    });

    window.btAuthReady = client.auth.getSession()
        .then(({ data }) => applySession(data.session))
        .catch(error => {
            console.warn('BT Auth initialization failed:', error);
            state.ready = true;
            renderGlobalState();
        });
}());
