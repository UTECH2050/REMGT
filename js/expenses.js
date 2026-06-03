'use strict';
if (typeof window.REMGT === 'undefined') window.REMGT = {};

// ============================================================
// BACKUP / RESTORE
// ============================================================
function refreshHome() {
  // 캐시 무효화 후 홈(대시보드)으로 이동
  navigate('dashboard');
  window.location.reload(true);
}

function resetAllData() {
  if (!confirm('⚠️ 전체 초기화\n\n모든 데이터(물건, 임차인, 계약, 수납, 지출)가 삭제됩니다.\n정말 초기화하시겠습니까?')) return;
  if (!confirm('한 번 더 확인합니다.\n모든 데이터가 영구 삭제됩니다.')) return;
  // remgt_ 로 시작하는 모든 키 삭제
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('remgt_')) keys.push(k);
  }
  keys.forEach(k => localStorage.removeItem(k));
  window.location.reload();
}

function applyImport(mode) {
  closeModal('importOptionModal');
  const { backup, input } = window._pendingBackup || {};
  if (!backup) return;
  const prefix = _currentSession ? 'remgt_u_' + _currentSession.userId + '_' : 'remgt_tmp_';

  if (mode === 'replace') {
    // 기존 데이터 전부 삭제 후 복원
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) keysToRemove.push(k);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    Object.entries(backup.data).forEach(([k, v]) => {
      localStorage.setItem(prefix + k, JSON.stringify(v));
    });

  } else {
    // ── 스마트 병합: 비즈니스 키 기준으로 중복 방지 ──────────────────────

    // 1. properties: 건물명 기준 병합, rooms는 roomNo 기준
    if (backup.data.properties) {
      const existing = JSON.parse(localStorage.getItem(prefix+'properties') || '[]');
      const merged = [...existing];
      backup.data.properties.forEach(bp => {
        const idx = merged.findIndex(p => p.name === bp.name);
        if (idx >= 0) {
          // 기존 건물 업데이트 (rooms 병합)
          const existRooms = merged[idx].rooms || [];
          const backupRooms = bp.rooms || [];
          const mergedRooms = [...existRooms];
          backupRooms.forEach(br => {
            const ri = mergedRooms.findIndex(r => r.roomNo === br.roomNo);
            if (ri >= 0) mergedRooms[ri] = { ...mergedRooms[ri], ...br };
            else mergedRooms.push(br);
          });
          merged[idx] = { ...merged[idx], ...bp, rooms: mergedRooms };
        } else {
          merged.push(bp);
        }
      });
      localStorage.setItem(prefix+'properties', JSON.stringify(merged));
    }

    // 2. tenants: 건물명 + room(동+호수) 기준 병합
    if (backup.data.tenants) {
      const existing = JSON.parse(localStorage.getItem(prefix+'tenants') || '[]');
      const merged = [...existing];
      backup.data.tenants.forEach(bt => {
        const idx = merged.findIndex(t =>
          t.building === bt.building && String(t.room) === String(bt.room)
        );
        if (idx >= 0) merged[idx] = { ...merged[idx], ...bt, id: merged[idx].id }; // id 유지
        else merged.push(bt);
      });
      localStorage.setItem(prefix+'tenants', JSON.stringify(merged));
    }

    // 3. payments: 로컬 임차인(건물+호수 매칭) → yearMonth 기준 병합
    if (backup.data.payments && backup.data.tenants) {
      const localTenants  = JSON.parse(localStorage.getItem(prefix+'tenants') || '[]');
      const backupTenants = backup.data.tenants;
      const existing = JSON.parse(localStorage.getItem(prefix+'payments') || '[]');
      const merged = [...existing];
      backup.data.payments.forEach(bp => {
        // 백업 수납의 임차인을 찾아 건물+호수 파악
        const bTenant = backupTenants.find(t => t.id === bp.tenantId);
        if (!bTenant) return;
        // 로컬에서 동일 건물+호수 임차인 찾기
        const localTenant = localTenants.find(t =>
          t.building === bTenant.building && String(t.room) === String(bTenant.room)
        );
        const targetTenantId = localTenant ? localTenant.id : bp.tenantId;
        const idx = merged.findIndex(p =>
          p.tenantId === targetTenantId && p.yearMonth === bp.yearMonth
        );
        const newPayment = { ...bp, tenantId: targetTenantId };
        if (idx >= 0) merged[idx] = { ...merged[idx], ...newPayment, id: merged[idx].id };
        else merged.push({ ...newPayment, id: newPayment.id || (Date.now().toString(36)+Math.random().toString(36).slice(2)) });
      });
      localStorage.setItem(prefix+'payments', JSON.stringify(merged));
    }

    // 4. expenses: 날짜 + 건물 + 항목 + 금액 기준 병합
    if (backup.data.expenses) {
      const existing = JSON.parse(localStorage.getItem(prefix+'expenses') || '[]');
      const merged = [...existing];
      backup.data.expenses.forEach(be => {
        const idx = merged.findIndex(e =>
          e.date === be.date &&
          (e.building||'') === (be.building||'') &&
          e.category === be.category &&
          Number(e.amount) === Number(be.amount)
        );
        if (idx >= 0) merged[idx] = { ...merged[idx], ...be, id: merged[idx].id };
        else merged.push(be);
      });
      localStorage.setItem(prefix+'expenses', JSON.stringify(merged));
    }

    // 5. 나머지 키 (history 등) — id 기준 단순 병합
    const handled = new Set(['properties','tenants','payments','expenses']);
    Object.entries(backup.data).forEach(([k, v]) => {
      if (handled.has(k)) return;
      try {
        const existing = JSON.parse(localStorage.getItem(prefix+k) || '[]');
        if (Array.isArray(existing) && Array.isArray(v)) {
          const merged = [...existing];
          v.forEach(item => {
            const idx = merged.findIndex(x => x.id && x.id === item.id);
            if (idx >= 0) merged[idx] = item; else merged.push(item);
          });
          localStorage.setItem(prefix+k, JSON.stringify(merged));
        } else {
          localStorage.setItem(prefix+k, JSON.stringify(v));
        }
      } catch(e) {}
    });
  }

  if (input) input.value = '';
  window._pendingBackup = null;
  const statusEl = document.getElementById('backupStatus');
  if (statusEl) {
    statusEl.style.cssText = 'display:block;background:#dcfce7;color:#15803d;padding:10px 14px;border-radius:8px;font-size:13px;';
    statusEl.textContent = '✅ ' + (mode==='replace'?'완전 교체':'스마트 병합') + ' 복구 완료! 페이지를 새로고침합니다.';
  }
  setTimeout(() => window.location.reload(), 1500);
}

function exportData() {
  const prefix = _currentSession ? 'remgt_u_' + _currentSession.userId + '_' : 'remgt_tmp_';
  const backup = { version: 1, exportedAt: new Date().toISOString(), userId: _currentSession?.userId || 'admin', data: {} };
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      const shortKey = key.replace(prefix, '');
      try { backup.data[shortKey] = JSON.parse(localStorage.getItem(key)); } catch(e) {}
    }
  }
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const date = new Date().toISOString().slice(0,10);
  a.href = url; a.download = 'REMGT_backup_' + date + '.json';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  showToast('백업 파일이 다운로드됐습니다.');
}

function importData(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const backup = JSON.parse(e.target.result);
      if (!backup.data || backup.version !== 1) {
        showToast('올바른 백업 파일이 아닙니다.', 'error');
        input.value = ''; return;
      }
      // 복구 옵션 선택 모달 표시
      window._pendingBackup = { backup, input };
      const date = backup.exportedAt ? backup.exportedAt.slice(0,10) : '알 수 없음';
      const keys = Object.keys(backup.data);
      document.getElementById('importModalInfo').innerHTML =
        '<b>백업일:</b> ' + date + '&nbsp;&nbsp;<b>항목:</b> ' + keys.join(', ');
      openModal('importOptionModal');
    } catch(err) {
      showToast('파일 읽기 오류: ' + err.message, 'error');
      input.value = '';
    }
  };
  reader.readAsText(file);
}

// SETTINGS PAGE
// ============================================================
function renderSettings() {
  // 내 계정 정보
  const myEl = document.getElementById('settingsMyAccount');
  if (myEl && _currentSession) {
    const users = getUsers();
    const me = users.find(u => u.id === _currentSession.userId);
    const roleName = _currentSession.role === 'admin' ? '관리자' : '일반';
    myEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
        <div style="font-size:36px;">👤</div>
        <div style="flex:1;">
          <div style="font-size:15px;font-weight:700;color:var(--gray-800);">${me?.name || _currentSession.userId}</div>
          <div style="font-size:13px;color:var(--gray-500);margin-top:2px;">아이디: <b>${_currentSession.userId}</b> &nbsp;·&nbsp; 역할: <b>${roleName}</b></div>
          ${me?.mustChangePassword ? '<div style="font-size:12px;color:#dc2626;margin-top:4px;">⚠️ 비밀번호 변경이 필요합니다</div>' : ''}
        </div>
        <button class="btn btn-outline" onclick="openSelfPasswordChange()">🔑 비밀번호 변경</button>
      </div>`;
  }
  // 계정 목록
  const tbody = document.getElementById('settingsUserTbody');
  if (!tbody) return;
  const users = getUsers();
  tbody.innerHTML = users.map(u => {
    const isSelf   = u.id === _currentSession?.userId;
    const uid_safe = u.id.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    const roleName = u.role === 'admin' ? '관리자' : '일반';
    const emailDisp = u.email
      ? `<span style="color:var(--gray-700);">${u.email}</span>`
      : `<span style="color:var(--gray-400);">-</span>`;
    const pwBtn  = isSelf
      ? `<button class="btn btn-outline btn-sm" onclick="openSelfPasswordChange()">🔑</button>`
      : `<button class="btn btn-outline btn-sm" onclick="openResetPwModal('${uid_safe}','${u.name.replace(/'/g,"\\'")}')">🔑</button>`;
    const delBtn = isSelf ? '' : `<button class="btn btn-danger btn-sm" style="margin-left:4px;" onclick="deleteUser('${uid_safe}')">삭제</button>`;
    return `<tr style="border-bottom:1px solid var(--gray-100);">
      <td style="padding:11px 14px;font-size:13px;white-space:nowrap;">
        <code>${u.id}</code>${isSelf ? ' <span style="font-size:11px;color:var(--primary);">(나)</span>' : ''}
      </td>
      <td style="padding:11px 14px;font-size:13px;white-space:nowrap;">${u.name}</td>
      <td style="padding:11px 14px;font-size:13px;white-space:nowrap;">${roleName}</td>
      <td style="padding:11px 14px;font-size:12px;color:var(--gray-500);white-space:nowrap;">${u.createdAt || '-'}</td>
      <td style="padding:11px 14px;font-size:13px;white-space:nowrap;">${emailDisp}</td>
      <td style="padding:11px 14px;text-align:center;white-space:nowrap;">
        <button class="btn btn-outline btn-sm" onclick="openUserEditModal('${uid_safe}')">수정</button>
        ${pwBtn}
        ${delBtn}
      </td>
    </tr>`;
  }).join('');
}

// 계정 수정 모달 열기
function openUserEditModal(userId) {
  const users = getUsers();
  const user  = users.find(u => u.id === userId);
  if (!user) return;
  document.getElementById('editUserTargetId').value = userId;
  document.getElementById('editUserName').value  = user.name  || '';
  document.getElementById('editUserRole').value  = user.role  || 'user';
  document.getElementById('editUserEmail').value = user.email || '';
  openModal('userEditModal');
}

function saveUserEdit() {
  const userId = document.getElementById('editUserTargetId').value;
  const name   = (document.getElementById('editUserName').value  || '').trim();
  const role   =  document.getElementById('editUserRole').value  || 'user';
  const email  = (document.getElementById('editUserEmail').value || '').trim();
  if (!name) { showToast('이름을 입력해주세요.', 'error'); return; }
  const users = getUsers();
  const user  = users.find(u => u.id === userId);
  if (!user) return;
  user.name  = name;
  user.role  = role;
  user.email = email;
  saveUsers(users);
  if (_currentSession?.userId === userId) {
    _currentSession.name = name;
    _currentSession.role = role;
    localStorage.setItem(SESSION_KEY, JSON.stringify(_currentSession));
  }
  closeModal('userEditModal');
  showToast('저장되었습니다.');
  renderSettings();
}

// 계정 추가 모달 열기
function openAddUserModal() {
  ['newUserId','newUserName','newUserEmail','newUserPw'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const roleEl = document.getElementById('newUserRole');
  if (roleEl) roleEl.value = 'user';
  openModal('addUserModal');
}

async function addUser() {
  const id   = document.getElementById('newUserId').value.trim();
  const name = document.getElementById('newUserName').value.trim();
  const role = document.getElementById('newUserRole').value;
  const pw   = document.getElementById('newUserPw').value;
  if (!id || !name) { showToast('아이디와 이름은 필수입니다.', 'error'); return; }
  if (!pw || pw.length < 8) { showToast('임시 비밀번호는 8자 이상이어야 합니다.', 'error'); return; }
  const users = getUsers();
  if (users.find(u => u.id === id)) { showToast('이미 존재하는 아이디입니다.', 'error'); return; }
  const salt = makeSalt();
  const hash = await sha256(salt + ':' + pw);
  const email = (document.getElementById('newUserEmail')?.value || '').trim();
  users.push({ id, name, role, email, salt, hash, mustChangePassword: true, createdAt: new Date().toISOString().slice(0,10) });
  saveUsers(users);
  closeModal('addUserModal');
  showToast(`'${name}' 계정이 추가되었습니다.`);
  renderSettings();
}

function deleteUser(userId) {
  if (userId === _currentSession?.userId) { showToast('현재 로그인 중인 계정은 삭제할 수 없습니다.', 'error'); return; }
  const user = getUsers().find(u => u.id === userId);
  confirm(`'${user?.name || userId}' 계정을 삭제하시겠습니까?`, () => {
    const users = getUsers().filter(u => u.id !== userId);
    saveUsers(users);
    showToast(`'${userId}' 계정이 삭제되었습니다.`);
    renderSettings();
  });
}

function openResetPwModal(userId, userName) {
  document.getElementById('resetPwTargetId').value = userId;
  document.getElementById('resetPwModalTitle').textContent = `🔑 비밀번호 재설정 — ${userName}`;
  document.getElementById('resetPwNew').value = '';
  document.getElementById('resetPwConfirm').value = '';
  const errEl = document.getElementById('resetPwModalError');
  if (errEl) errEl.style.display = 'none';
  openModal('resetPwModal');
}

async function doResetUserPassword() {
  const userId = document.getElementById('resetPwTargetId').value;
  const newPw  = document.getElementById('resetPwNew').value;
  const conf   = document.getElementById('resetPwConfirm').value;
  const errEl  = document.getElementById('resetPwModalError');
  const btn    = document.getElementById('resetPwBtn');
  errEl.style.display = 'none';
  if (!newPw || !conf) { errEl.textContent = '비밀번호를 입력해주세요.'; errEl.style.display = 'block'; return; }
  if (newPw.length < 8) { errEl.textContent = '비밀번호는 8자 이상이어야 합니다.'; errEl.style.display = 'block'; return; }
  if (newPw !== conf) { errEl.textContent = '비밀번호가 일치하지 않습니다.'; errEl.style.display = 'block'; return; }
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) { errEl.textContent = '사용자를 찾을 수 없습니다.'; errEl.style.display = 'block'; return; }
  btn.disabled = true;
  const newSalt = makeSalt();
  const newHash = await sha256(newSalt + ':' + newPw);
  user.salt = newSalt; user.hash = newHash; user.mustChangePassword = true;
  saveUsers(users);
  btn.disabled = false;
  closeModal('resetPwModal');
  showToast(`'${user.name}' 비밀번호가 재설정되었습니다.`);
  renderSettings();
}

// 본인 비밀번호 변경 (설정 버튼)
function openSelfPasswordChange() {
  ['selfCurrent','selfNew','selfConfirm'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
  const errEl = document.getElementById('selfPwError');
  if (errEl) errEl.style.display = 'none';
  openModal('selfPwModal');
}

async function doSelfChangePassword() {
  const current = document.getElementById('selfCurrent').value;
  const newPw   = document.getElementById('selfNew').value;
  const conf    = document.getElementById('selfConfirm').value;
  const errEl   = document.getElementById('selfPwError');
  const btn     = document.getElementById('selfPwBtn');
  errEl.style.display = 'none';
  if (!current || !newPw || !conf) { errEl.textContent='모든 항목을 입력해주세요.'; errEl.style.display='block'; return; }
  if (newPw.length < 8)  { errEl.textContent='새 비밀번호는 8자 이상이어야 합니다.'; errEl.style.display='block'; return; }
  if (newPw !== conf)    { errEl.textContent='새 비밀번호가 일치하지 않습니다.'; errEl.style.display='block'; return; }
  const users = getUsers();
  const user  = users.find(u => u.id === _currentSession?.userId);
  if (!user)  { errEl.textContent='오류가 발생했습니다.'; errEl.style.display='block'; return; }
  const curHash = await sha256(user.salt + ':' + current);
  if (curHash !== user.hash) { errEl.textContent='현재 비밀번호가 올바르지 않습니다.'; errEl.style.display='block'; return; }
  if (newPw === current) { errEl.textContent='새 비밀번호는 기존 비밀번호와 달라야 합니다.'; errEl.style.display='block'; return; }
  btn.disabled = true;
  const newSalt = makeSalt();
  const newHash = await sha256(newSalt + ':' + newPw);
  user.salt = newSalt; user.hash = newHash; user.mustChangePassword = false;
  saveUsers(users);
  btn.disabled = false;
  closeModal('selfPwModal');
  showToast('비밀번호가 변경되었습니다.');
}

function deleteTenant(id) {
  const t = getData('tenants').find(x => x.id === id);
  confirm(`"${fmtRoom(t.room)} ${t.name}" 임차인을 삭제하시겠습니까?\n관련 수납 데이터도 함께 삭제됩니다.`, () => {
    const tenants = getData('tenants').filter(x => x.id !== id);
    setData('tenants', tenants);
    const payments = getData('payments').filter(x => x.tenantId !== id);
    setData('payments', payments);
    renderTenants();
    updateBadges();
    showToast('삭제되었습니다.');
  });
}

function deleteTenantFromModal() {
  if (!_editingTenantId) return;
  const id = _editingTenantId;
  const t = getData('tenants').find(x => x.id === id);
  if (!t) return;
  confirm(`"${fmtRoom(t.room)} ${t.name}" 임차인을 삭제하시겠습니까?\n관련 수납 데이터도 함께 삭제됩니다.`, () => {
    const tenants = getData('tenants').filter(x => x.id !== id);
    setData('tenants', tenants);
    const payments = getData('payments').filter(x => x.tenantId !== id);
    setData('payments', payments);
    _editingTenantId = null;
    closeModal('registerModal');
    renderTenants();
    updateBadges();
    showToast('삭제되었습니다.');
  });
}

