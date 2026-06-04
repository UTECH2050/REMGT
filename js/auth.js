'use strict';
// REMGT 전역 네임스페이스
if (typeof window.REMGT === 'undefined') window.REMGT = {};

// ============================================================
// AUTH SYSTEM
// ============================================================
// AUTH v2 — 듀얼 해시 (소스 고정 + localStorage) + 보안 질문 복구
// ============================================================
let _currentSession = null;

const USERS_KEY    = 'remgt_sys_users';
const SESSION_KEY  = 'remgt_sys_session';
const AUTH_KEY     = 'remgt_auth_v1';
const RECOVERY_KEY = 'remgt_recovery_v1';
const MASTER_SALT  = 'remgt_auth_2024_v1';
// 소스코드 고정 해시: sha256(MASTER_SALT + 'admin1522')
const MASTER_HASH  = 'ec09c36ed6a142332d69bf425ad07bb65ecee36fb89bd3fefad3ed739a05ae95';

// ── 순수 JS SHA-256 (동기, crypto.subtle 불필요) ─────────────────────────────
function sha256sync(ascii) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let i, j, result = '';
  const words = [];
  const asciiBitLength = ascii.length * 8;
  let hash = [], k = [];
  let primeCounter = 0;
  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) isComposite[i] = candidate;
      hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1/3) * maxWord) | 0;
    }
  }
  ascii += '\x80';
  while (ascii.length % 64 - 56) ascii += '\x00';
  for (i = 0; i < ascii.length; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return '';
    words[i >> 2] |= j << ((3 - i) % 4) * 8;
  }
  words[words.length] = ((asciiBitLength / maxWord) | 0);
  words[words.length] = (asciiBitLength);
  for (j = 0; j < words.length;) {
    const w = words.slice(j, j += 16);
    const oldHash = hash.slice(0, 8);
    for (i = 0; i < 64; i++) {
      const w15 = w[i-15], w2 = w[i-2];
      const a = hash[0], e = hash[4];
      const temp1 = hash[7]
        + (rightRotate(e,6) ^ rightRotate(e,11) ^ rightRotate(e,25))
        + ((e & hash[5]) ^ (~e & hash[6]))
        + k[i]
        + (w[i] = (i<16) ? w[i] : (
            w[i-16]
            + (rightRotate(w15,7) ^ rightRotate(w15,18) ^ (w15>>>3))
            + w[i-7]
            + (rightRotate(w2,17) ^ rightRotate(w2,19) ^ (w2>>>10))
          ) | 0);
      const temp2 = (rightRotate(a,2) ^ rightRotate(a,13) ^ rightRotate(a,22))
        + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(temp1+temp2)|0].concat(hash);
      hash[4] = (hash[4]+temp1)|0;
      hash.length = 8;
    }
    hash = hash.map((x,i) => (x + oldHash[i]) | 0);
  }
  for (i = 0; i < 8; i++) {
    for (j = 3; j+1; j--) {
      const b = (hash[i] >> (j*8)) & 255;
      result += ((b<16)?'0':'') + b.toString(16);
    }
  }
  return result;
}

function getUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; } catch(e) { return []; }
}
function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function hashPwd(pwd) {
  return sha256sync(MASTER_SALT + pwd);
}

// 저장된 해시: localStorage 우선, 없으면 소스 고정값
function getStoredHash() {
  try {
    const a = JSON.parse(localStorage.getItem(AUTH_KEY) || '{}');
    return a.hash || MASTER_HASH;
  } catch(e) { return MASTER_HASH; }
}

function verifyPassword(pwd) {
  return hashPwd(pwd) === getStoredHash();
}

function savePasswordHash(pwd) {
  localStorage.setItem(AUTH_KEY, JSON.stringify({
    hash: hashPwd(pwd), updatedAt: new Date().toISOString()
  }));
}

// 보안 질문 저장/검증
function getRecovery() {
  try { return JSON.parse(localStorage.getItem(RECOVERY_KEY) || 'null'); } catch(e) { return null; }
}
function saveRecovery(question, answer) {
  localStorage.setItem(RECOVERY_KEY, JSON.stringify({
    question,
    answerHash: sha256sync(answer.toLowerCase().trim())
  }));
}
function verifyRecoveryAnswer(answer) {
  const r = getRecovery();
  if (!r) return false;
  return sha256sync(answer.toLowerCase().trim()) === r.answerHash;
}

// 시스템 초기화 (호환성용)
function initAuthSystem() {}

// ── 로그인 ───────────────────────────────────────────────────────────────────
function doLogin() {
  const id  = (document.getElementById('loginId')?.value || '').trim().toLowerCase();
  const pwd = (document.getElementById('loginPw')?.value || '');
  const errEl = document.getElementById('loginError');
  if (errEl) errEl.style.display = 'none';

  if (!id || !pwd) {
    if (errEl) { errEl.textContent='아이디와 비밀번호를 입력해주세요.'; errEl.style.display='block'; }
    return;
  }
  if (id !== 'admin') {
    if (errEl) { errEl.textContent='등록되지 않은 아이디입니다.'; errEl.style.display='block'; }
    return;
  }
  if (!verifyPassword(pwd)) {
    if (errEl) { errEl.textContent='비밀번호가 올바르지 않습니다.'; errEl.style.display='block'; }
    return;
  }
  _currentSession = { userId: 'admin', name: '관리자', role: 'admin' };
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(_currentSession)); } catch(e) {}
  document.getElementById('loginOverlay').style.display = 'none';
  try { seedDemoData(); } catch(e) { console.error(e); }
  try { updateBadges(); } catch(e) { console.error(e); }
  try { renderDashboard(); } catch(e) { console.error(e); }
  // 보안 질문 미설정 시 안내
  if (!getRecovery()) {
    setTimeout(() => showToast('⚠️ 비밀번호 복구를 위해 설정 → 보안 질문을 등록해주세요.'), 1500);
  }
}

// ── 비밀번호 변경 (설정 페이지) ──────────────────────────────────────────────
function doChangePwdSettings() {
  const cur  = document.getElementById('spCurrent')?.value || '';
  const nw   = document.getElementById('spNew')?.value || '';
  const conf = document.getElementById('spConfirm')?.value || '';
  const errEl = document.getElementById('spError');
  if (errEl) errEl.style.display = 'none';

  if (!cur || !nw || !conf) {
    if (errEl) { errEl.textContent='모든 항목을 입력해주세요.'; errEl.style.display='block'; } return;
  }
  if (!verifyPassword(cur)) {
    if (errEl) { errEl.textContent='현재 비밀번호가 올바르지 않습니다.'; errEl.style.display='block'; } return;
  }
  if (nw.length < 6) {
    if (errEl) { errEl.textContent='새 비밀번호는 6자 이상이어야 합니다.'; errEl.style.display='block'; } return;
  }
  if (nw !== conf) {
    if (errEl) { errEl.textContent='새 비밀번호가 일치하지 않습니다.'; errEl.style.display='block'; } return;
  }
  savePasswordHash(nw);
  if (errEl) { errEl.style.background='#dcfce7'; errEl.style.color='#15803d'; errEl.textContent='✅ 비밀번호가 변경됐습니다.'; errEl.style.display='block'; }
  document.getElementById('spCurrent').value='';
  document.getElementById('spNew').value='';
  document.getElementById('spConfirm').value='';
}

// ── 보안 질문 저장 (설정 페이지) ─────────────────────────────────────────────
function doSaveRecovery() {
  const q   = document.getElementById('sqQuestion')?.value || '';
  const ans = document.getElementById('sqAnswer')?.value || '';
  const errEl = document.getElementById('sqError');
  if (errEl) errEl.style.display = 'none';
  if (!q || !ans) {
    if (errEl) { errEl.textContent='질문과 답변을 모두 입력해주세요.'; errEl.style.display='block'; } return;
  }
  saveRecovery(q, ans);
  if (errEl) { errEl.style.background='#dcfce7'; errEl.style.color='#15803d'; errEl.textContent='✅ 보안 질문이 저장됐습니다.'; errEl.style.display='block'; }
  document.getElementById('sqAnswer').value='';
  renderSettings();
}

// ── 비밀번호 찾기 (로그인 화면) ──────────────────────────────────────────────
function showRecoveryPanel() {
  const panel = document.getElementById('recoveryPanel');
  const r = getRecovery();
  if (!r) {
    document.getElementById('recoveryNoSetup').style.display = 'block';
    document.getElementById('recoveryStep1').style.display = 'none';
  } else {
    document.getElementById('recoveryNoSetup').style.display = 'none';
    document.getElementById('recoveryQuestionText').textContent = r.question;
    document.getElementById('recoveryStep1').style.display = 'block';
  }
  document.getElementById('recoveryStep2').style.display = 'none';
  document.getElementById('recoveryMsg').style.display = 'none';
  if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function doVerifyRecovery() {
  const ans = document.getElementById('recoveryAnswer')?.value || '';
  const msgEl = document.getElementById('recoveryMsg');
  if (!verifyRecoveryAnswer(ans)) {
    if (msgEl) { msgEl.style.background='#fee2e2'; msgEl.style.color='#dc2626'; msgEl.textContent='답변이 올바르지 않습니다.'; msgEl.style.display='block'; }
    return;
  }
  document.getElementById('recoveryStep1').style.display = 'none';
  document.getElementById('recoveryStep2').style.display = 'block';
  if (msgEl) msgEl.style.display = 'none';
}

function doRecoveryReset() {
  const nw   = document.getElementById('recoveryNewPwd')?.value || '';
  const conf = document.getElementById('recoveryConfirmPwd')?.value || '';
  const msgEl = document.getElementById('recoveryMsg');
  if (nw.length < 6) {
    if (msgEl) { msgEl.style.background='#fee2e2'; msgEl.style.color='#dc2626'; msgEl.textContent='비밀번호는 6자 이상이어야 합니다.'; msgEl.style.display='block'; } return;
  }
  if (nw !== conf) {
    if (msgEl) { msgEl.style.background='#fee2e2'; msgEl.style.color='#dc2626'; msgEl.textContent='비밀번호가 일치하지 않습니다.'; msgEl.style.display='block'; } return;
  }
  savePasswordHash(nw);
  if (msgEl) { msgEl.style.background='#dcfce7'; msgEl.style.color='#15803d'; msgEl.textContent='✅ 비밀번호가 재설정됐습니다. 새 비밀번호로 로그인하세요.'; msgEl.style.display='block'; }
  setTimeout(() => {
    document.getElementById('recoveryPanel').style.display = 'none';
    document.getElementById('loginPw').focus();
  }, 1800);
}


// ── 하위 호환 stub (이전 auth 오버레이에서 호출) ──────────────────────────
function doChangePassword() {
  // 초기 비밀번호 변경 (changePwOverlay에서 호출)
  const cur  = document.getElementById('cpCurrent')?.value || '';
  const nw   = document.getElementById('cpNew')?.value || '';
  const conf = document.getElementById('cpConfirm')?.value || '';
  const errEl = document.getElementById('changePwError');
  if (errEl) errEl.style.display = 'none';
  if (!cur || !nw || !conf) {
    if (errEl) { errEl.textContent='모든 항목을 입력해주세요.'; errEl.style.display='block'; } return;
  }
  if (!verifyPassword(cur)) {
    if (errEl) { errEl.textContent='현재 비밀번호가 올바르지 않습니다.'; errEl.style.display='block'; } return;
  }
  if (nw.length < 6) {
    if (errEl) { errEl.textContent='새 비밀번호는 6자 이상이어야 합니다.'; errEl.style.display='block'; } return;
  }
  if (nw !== conf) {
    if (errEl) { errEl.textContent='비밀번호가 일치하지 않습니다.'; errEl.style.display='block'; } return;
  }
  savePasswordHash(nw);
  const overlay = document.getElementById('changePwOverlay');
  if (overlay) overlay.classList.add('hidden');
  _currentSession = { userId: 'admin', name: '관리자', role: 'admin' };
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(_currentSession)); } catch(e) {}
  document.getElementById('loginOverlay').style.display = 'none';
  try { if(typeof seedDemoData==='function') seedDemoData(); } catch(e) {}
  try { if(typeof updateBadges==='function') updateBadges(); } catch(e) {}
  try { if(typeof renderDashboard==='function') renderDashboard(); } catch(e) {}
}

function verifyEmailForReset() {
  const id    = (document.getElementById('erId')?.value || '').trim();
  const email = (document.getElementById('erEmail')?.value || '').trim();
  const msgEl = document.getElementById('emailResetMsg');
  if (!id || !email) {
    if (msgEl) { msgEl.className=''; msgEl.style.cssText='display:block;background:#fee2e2;color:#dc2626;padding:8px 12px;border-radius:6px;font-size:12px;';
      msgEl.textContent='아이디와 이메일을 입력해주세요.'; } return;
  }
  // 보안 질문 방식으로 전환
  if (msgEl) { msgEl.style.cssText='display:block;background:#fef3c7;color:#92400e;padding:8px 12px;border-radius:6px;font-size:12px;';
    msgEl.textContent='이메일 인증은 지원하지 않습니다. 로그인 후 설정에서 보안 질문을 이용해 주세요.'; }
}

function doEmailReset() {
  verifyEmailForReset();
}

function doLogout() {
  _currentSession = null;
  try { localStorage.removeItem(SESSION_KEY); } catch(e) {}
  document.getElementById('loginOverlay').style.display = 'flex';
  const pwEl = document.getElementById('loginPw');
  if (pwEl) pwEl.value = '';
}

function showAuthError(el, msg) {
  el.textContent = msg; el.style.display = 'block';
}

async function showApp() {
  document.getElementById('loginOverlay').classList.add('hidden');
  document.getElementById('changePwOverlay').classList.add('hidden');
  // 설정 버튼에 계정 정보 표시
  const acctEl = document.getElementById('sidebarAccountInfo');
  if (acctEl && _currentSession) {
    const roleName = _currentSession.role === 'admin' ? '관리자' : '일반';
    acctEl.textContent = `${_currentSession.userId} (${roleName})`;
  }
  // 먼저 로컬 기준으로 앱 표시 (빠른 초기화)
  seedDemoData();
  updateBadges();
  renderDashboard();
}


