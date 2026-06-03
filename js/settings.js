'use strict';
if (typeof window.REMGT === 'undefined') window.REMGT = {};

// SETTINGS
function renderSettings() {
  // 내 계정 정보 + 비밀번호 변경 + 보안 질문 포함
  const myEl = document.getElementById('settingsMyAccount');
  if (myEl && _currentSession) {
    const users = getUsers();
    const me = users.find(u => u.id === _currentSession.userId);
    const roleName = _currentSession.role === 'admin' ? '관리자' : '일반';
    const r = getRecovery();
    const qStatus = r
      ? '<span style="color:#16a34a;font-weight:600;">✅ 등록됨: ' + r.question + '</span>'
      : '<span style="color:#dc2626;font-weight:600;">⚠️ 미등록</span>';
    myEl.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
        <!-- 계정 정보 + 비밀번호 변경 -->
        <div style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:12px;padding:20px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
            <div style="font-size:32px;">👤</div>
            <div>
              <div style="font-size:15px;font-weight:700;color:var(--gray-800);">${me?.name || _currentSession.userId}</div>
              <div style="font-size:12px;color:var(--gray-500);">아이디: <b>${_currentSession.userId}</b> · 역할: <b>${roleName}</b></div>
            </div>
          </div>
          <div style="font-size:13px;font-weight:700;color:var(--gray-700);margin-bottom:10px;">🔑 비밀번호 변경</div>
          <div id="spError" style="display:none;font-size:12px;padding:8px 12px;border-radius:6px;margin-bottom:8px;"></div>
          <input type="password" id="spCurrent" placeholder="현재 비밀번호"
            style="width:100%;padding:8px 12px;border:1px solid var(--gray-200);border-radius:8px;font-size:13px;margin-bottom:6px;box-sizing:border-box;">
          <input type="password" id="spNew" placeholder="새 비밀번호 (6자 이상)"
            style="width:100%;padding:8px 12px;border:1px solid var(--gray-200);border-radius:8px;font-size:13px;margin-bottom:6px;box-sizing:border-box;">
          <input type="password" id="spConfirm" placeholder="새 비밀번호 확인"
            style="width:100%;padding:8px 12px;border:1px solid var(--gray-200);border-radius:8px;font-size:13px;margin-bottom:10px;box-sizing:border-box;">
          <button class="btn btn-primary" onclick="doChangePwdSettings()" style="width:100%;">변경 저장</button>
        </div>
        <!-- 보안 질문 -->
        <div style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:12px;padding:20px;">
          <div style="font-size:13px;font-weight:700;color:var(--gray-700);margin-bottom:8px;">❓ 보안 질문</div>
          <div style="font-size:12px;color:var(--gray-500);margin-bottom:16px;line-height:1.6;">
            비밀번호를 잊어버렸을 때 본인 확인에 사용됩니다.<br>${qStatus}
          </div>
          <button class="btn btn-outline" onclick="openSecurityQuestionModal()" style="width:100%;">
            ${r ? '🔄 보안 질문 변경' : '➕ 보안 질문 등록'}
          </button>
        </div>
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

// 보안 질문 모달
function openSecurityQuestionModal() {
  const r = getRecovery();
  const statusEl = document.getElementById('sqModalStatus');
  if (statusEl) statusEl.textContent = r ? '현재 질문: ' + r.question : '보안 질문이 등록되지 않았습니다.';
  const errEl = document.getElementById('sqModalError');
  if (errEl) errEl.style.display = 'none';
  const ansEl = document.getElementById('sqModalAnswer');
  if (ansEl) ansEl.value = '';
  openModal('securityQuestionModal');
}

function doSaveRecoveryModal() {
  const q   = document.getElementById('sqModalQuestion')?.value || '';
  const ans = document.getElementById('sqModalAnswer')?.value || '';
  const errEl = document.getElementById('sqModalError');
  if (!ans.trim()) {
    if (errEl) { errEl.textContent='답변을 입력해주세요.'; errEl.style.display='block'; } return;
  }
  saveRecovery(q, ans);
  closeModal('securityQuestionModal');
  showToast('✅ 보안 질문이 저장됐습니다.');
  renderSettings();
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

function addUser() {
  const id   = document.getElementById('newUserId').value.trim();
  const name = document.getElementById('newUserName').value.trim();
  const role = document.getElementById('newUserRole').value;
  const pw   = document.getElementById('newUserPw').value;
  if (!id || !name) { showToast('아이디와 이름은 필수입니다.', 'error'); return; }
  if (!pw || pw.length < 8) { showToast('임시 비밀번호는 8자 이상이어야 합니다.', 'error'); return; }
  const users = getUsers();
  if (users.find(u => u.id === id)) { showToast('이미 존재하는 아이디입니다.', 'error'); return; }
  const salt = MASTER_SALT;
  const hash = hashPwd(pw);
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