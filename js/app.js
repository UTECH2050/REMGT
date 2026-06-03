'use strict';
// REMGT 전역 네임스페이스
if (typeof window.REMGT === 'undefined') window.REMGT = {};

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const dashDateEl = document.getElementById('dashDate');
  if (dashDateEl) dashDateEl.textContent = new Date().toLocaleDateString('ko-KR', {year:'numeric',month:'long',day:'numeric',weekday:'long'});

  // 기존 remgt_tmp_ 데이터를 remgt_u_admin_ 으로 마이그레이션 (1회)
  const KEYS = ['properties','tenants','payments','contracts','expenses','history'];
  KEYS.forEach(k => {
    const tmpKey = 'remgt_tmp_' + k, adminKey = 'remgt_u_admin_' + k;
    try {
      const tmpData = localStorage.getItem(tmpKey), adminData = localStorage.getItem(adminKey);
      if (tmpData && (!adminData || adminData === '[]')) localStorage.setItem(adminKey, tmpData);
    } catch(e) {}
  });

  // 세션 복원 또는 로그인 화면 표시
  let _saved = null;
  try { _saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch(e) {}
  if (_saved && _saved.userId) {
    _currentSession = _saved;
    document.getElementById('loginOverlay').style.display = 'none';
    try { seedDemoData(); } catch(e) { console.error(e); }
    try { updateBadges(); } catch(e) { console.error(e); }
    try { renderDashboard(); } catch(e) { console.error(e); }
  } else {
    document.getElementById('loginOverlay').style.display = 'flex';
  }
});

// 외부 클릭으로 팝업 닫기 비활성화 (사용자 요청)
