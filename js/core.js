'use strict';
// REMGT 전역 네임스페이스
if (typeof window.REMGT === 'undefined') window.REMGT = {};

// ============================================================
// DATA STORE (localStorage)
// ============================================================
function _dataPrefix() {
  return _currentSession ? `remgt_u_${_currentSession.userId}_` : 'remgt_tmp_';
}
function getData(key) {
  try { return JSON.parse(localStorage.getItem(_dataPrefix() + key)) || []; } catch { return []; }
}
function setData(key, val) {
  localStorage.setItem(_dataPrefix() + key, JSON.stringify(val));
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }


// ============================================================
// UTILITIES
// ============================================================
function fmtMoney(v) { return Number(v||0).toLocaleString() + '만원'; }
function fmtRoom(r) { if (!r) return ''; return r.replace(/^\S*동/, '').replace(/호+$/, ''); }
// 임대유형 뱃지: 전세=주황, 반전세(월세+보증금5000↑)=앰버, 월세=노랑
function leaseTypeBadge(type, deposit) {
  if (type === '전세') {
    return `<span style="display:inline-block;padding:3px 9px;border-radius:20px;font-size:12px;font-weight:700;background:#fff0e6;color:#c2410c;">전세</span>`;
  } else if (type === '반전세') {
    return `<span style="display:inline-block;padding:3px 9px;border-radius:20px;font-size:12px;font-weight:700;background:#fef3c7;color:#b45309;">반전세</span>`;
  } else {
    return `<span style="display:inline-block;padding:3px 9px;border-radius:20px;font-size:12px;font-weight:700;background:#fefce8;color:#a16207;">월세</span>`;
  }
}
function getTenantDong(building, roomNo) {
  const prop = getData('properties').find(p => p.name === building);
  const rm   = (prop?.rooms || []).find(r => String(r.roomNo) === String(roomNo));
  return rm?.dong || '-';
}
function fmtDate(d) { if(!d) return '-'; return d.replace(/-/g, '.'); }
function today() { return new Date().toISOString().slice(0,10); }
function getYM() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function showToast(msg, type='success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = type === 'error' ? 'var(--danger)' : 'var(--gray-900)';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2600);
}
function daysUntil(dateStr) {
  if (!dateStr) return 9999;
  const diff = new Date(dateStr) - new Date(today());
  return Math.ceil(diff / 86400000);
}
function closeModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  overlay.classList.remove('open', 'dragging');
  const modal = overlay.querySelector('.modal');
  if (modal) {
    modal.style.position = '';
    modal.style.left = '';
    modal.style.top  = '';
    modal.style.margin = '';
    modal.classList.remove('is-dragging');
  }
}
function openModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  overlay.classList.add('open');
  // 드래그 초기화
  const modal = overlay.querySelector('.modal');
  if (modal) {
    modal.style.position = '';
    modal.style.left = '';
    modal.style.top  = '';
    modal.style.margin = '';
    overlay.classList.remove('dragging');
    initModalDrag(overlay, modal);
  }
}

// 드래그 기능 초기화 (중복 등록 방지)
function initModalDrag(overlay, modal) {
  const header = modal.querySelector('.modal-header');
  if (!header || header._dragInit) return;
  header._dragInit = true;
  let startX, startY, startL, startT, dragging = false;

  header.addEventListener('mousedown', e => {
    // 닫기 버튼 클릭 시 드래그 제외
    if (e.target.closest('.modal-close')) return;
    dragging = true;
    // 아직 위치가 없으면 현재 화면 중앙 위치로 픽스
    if (!modal.style.left) {
      const rect = modal.getBoundingClientRect();
      modal.style.position = 'fixed';
      modal.style.left  = rect.left + 'px';
      modal.style.top   = rect.top  + 'px';
      modal.style.margin = '0';
      overlay.classList.add('dragging');
    }
    startX = e.clientX;
    startY = e.clientY;
    startL = parseInt(modal.style.left) || 0;
    startT = parseInt(modal.style.top)  || 0;
    modal.classList.add('is-dragging');
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    // 화면 밖으로 나가지 않도록 제한
    const maxL = window.innerWidth  - modal.offsetWidth;
    const maxT = window.innerHeight - 60;
    modal.style.left = Math.max(0, Math.min(maxL, startL + dx)) + 'px';
    modal.style.top  = Math.max(0, Math.min(maxT, startT + dy)) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false;
      modal.classList.remove('is-dragging');
    }
  });
}

// ESC 키 및 외부 클릭으로 팝업 닫기 기능 비활성화 (사용자 요청)

// Confirm helper
let _confirmCb = null;
function confirm(msg, cb, okLabel='삭제', okClass='btn-danger') {
  document.getElementById('confirmMessage').textContent = msg;
  const btn = document.getElementById('confirmOkBtn');
  btn.textContent = okLabel;
  btn.className = 'btn ' + okClass;
  _confirmCb = cb;
  btn.onclick = () => { closeModal('confirmModal'); if(_confirmCb) _confirmCb(); };
  openModal('confirmModal');
}

function updateBadges() {
  const tenants = getData('tenants').filter(t => t.status === '입주' && t.name);
  const ym = getYM();
  const payments = getData('payments').filter(p => p.yearMonth === ym);
  let unpaid = 0;
  tenants.forEach(t => {
    const p = payments.find(x => x.tenantId === t.id);
    if (!p || !p.rentPaid) unpaid++;
  });
  const b1 = document.getElementById('unpaidBadge');
  b1.style.display = unpaid > 0 ? '' : 'none';
  b1.textContent = unpaid;

  let expiring = 0, expired = 0;
  getData('tenants').filter(t => t.status === '입주' && t.contractEnd).forEach(t => {
    const d = daysUntil(t.contractEnd);
    if (d < 0) expired++;
    else if (d <= 90) expiring++;
  });
  const b2 = document.getElementById('expiryBadge');
  const total = expired + expiring;
  b2.style.display = total > 0 ? '' : 'none';
  b2.textContent = total;
  b2.classList.toggle('orange', expired === 0 && expiring > 0); // 임박만 있으면 주황
  // expired > 0 이면 기본 빨강(.nav-badge) 유지

  // 공실 = 물건 등록 기준 전체 호실 순회, 매칭 임차인이 입주+이름 있는 경우만 활성
  // (임차인 레코드와 물건 등록이 불일치하는 케이스도 정확하게 처리)
  const _allProps   = getData('properties') || [];
  const _allTenants = getData('tenants');
  let totalRooms = 0, activeRooms = 0;
  _allProps.forEach(p => {
    (p.rooms || []).forEach(r => {
      totalRooms++;
      const t = _allTenants.find(x => x.building === p.name && String(x.room) === String(r.roomNo));
      if (t?.status === '입주' && t?.name) activeRooms++;
    });
  });
  const vacant = Math.max(0, totalRooms - activeRooms);
  const b3 = document.getElementById('vacantBadge');
  if (b3) {
    b3.style.display = vacant > 0 ? '' : 'none';
    b3.textContent = vacant;
    b3.classList.add('orange');
  }
}


// ============================================================
// NAVIGATION
// ============================================================
const pageTitles = { dashboard:'대시보드', tenants:'임대 등록', payments:'수납 관리', contracts:'계약 관리', analytics:'손익분석', settings:'설정' };
let currentPage = 'dashboard';
let chartInstances = {};

function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => { if(n.getAttribute('onclick')?.includes(page)) n.classList.add('active'); });

  // 페이지 이동 시 해당 페이지 필터 초기화
  if (page === 'tenants') {
    tenantFilter = ''; tenantDongFilter = ''; tenantRoomFilter = ''; tenantStatusFilter = '';
  }
  if (page === 'contracts') {
    contractFilter = ''; contractDongFilter = ''; contractRoomFilter = ''; contractStatusFilter = '';
    // 계약히스토리 탭에 있었던 경우 현재계약 탭으로 초기화
    switchContractTab('active');
  }
  if (page === 'payments') {
    paymentSortKey = 'room'; paymentSortDir = 'asc';
  }

  // Render
  updateBadges();
  if (page === 'dashboard') renderDashboard();
  if (page === 'properties') renderPropertiesPage();
  if (page === 'tenants') renderTenants();
  if (page === 'payments') renderPayments();
  if (page === 'contracts') renderContracts();
  if (page === 'analytics') renderAnalytics();
  if (page === 'expenses') renderExpensesPage();
  if (page === 'settings') renderSettings();
}

