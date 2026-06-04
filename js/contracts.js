'use strict';
if (typeof window.REMGT === 'undefined') window.REMGT = {};

// ============================================================
// CONTRACTS
// ============================================================
let contractFilter = '', contractDongFilter = '', contractRoomFilter = '', contractStatusFilter = '';
function renderContracts(filter, statusFilter) {
  if (filter !== undefined) contractFilter = filter;
  if (statusFilter !== undefined) contractStatusFilter = statusFilter;

  // 필터바 렌더링
  renderContractFilterBar();

  const properties = getData('properties');
  // 현재 임대중인 계약만 표시 (status === '입주')
  let tenants = getData('tenants').filter(t => t.name && t.status === '입주');
  if (contractFilter) tenants = tenants.filter(t => t.building === contractFilter);
  if (contractDongFilter || contractRoomFilter) {
    tenants = tenants.filter(t => {
      const prop = properties.find(p => p.name === t.building);
      const room = prop?.rooms?.find(r => r.roomNo === t.room);
      if (contractDongFilter && room?.dong !== contractDongFilter) return false;
      if (contractRoomFilter && t.room !== contractRoomFilter) return false;
      return true;
    });
  }
  // 동 조회 헬퍼
  const _sortProps = getData('properties');
  function getTenantDongForSort(t) {
    const prop = _sortProps.find(p => p.name === t.building);
    const rm   = (prop?.rooms || []).find(r => String(r.roomNo) === String(t.room));
    return rm?.dong || '';
  }

  // 정렬: 소팅 버튼 기준 → 동일 값이면 건물명→동→호수 순으로 캐스케이드
  tenants.sort((a, b) => {
    // 1차: 선택된 소팅 키
    let va = a[contractSortKey] ?? '', vb = b[contractSortKey] ?? '';
    const numKeys = ['deposit','rent'];
    let primary;
    if (numKeys.includes(contractSortKey)) {
      primary = contractSortDir==='asc' ? Number(va)-Number(vb) : Number(vb)-Number(va);
    } else {
      const cmp = String(va).localeCompare(String(vb), undefined, {numeric:true});
      primary = contractSortDir==='asc' ? cmp : -cmp;
    }
    if (primary !== 0) return primary;
    // 동일 값이면 2차: 건물명 → 동 → 호수
    const bc = String(a.building||'').localeCompare(String(b.building||''), 'ko');
    if (bc !== 0) return bc;
    const dc = String(getTenantDongForSort(a)).localeCompare(String(getTenantDongForSort(b)), 'ko', {numeric: true});
    if (dc !== 0) return dc;
    return String(a.room||'').localeCompare(String(b.room||''), undefined, {numeric: true});
  });
  updateContractSortIcons();

  const tbody = document.getElementById('contractTbody');
  if (tenants.length === 0) {
    tbody.innerHTML = '<tr><td colspan="13"><div class="empty-state"><div class="empty-icon">📄</div><p>계약 정보가 없습니다.</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = tenants.map((t, idx) => {
    const d = daysUntil(t.contractEnd);
    let badge, dText;
    if (d < 0) { badge = 'badge-danger'; dText = '만료'; }
    else if (d <= 30) { badge = 'badge-danger'; dText = `${d}일 남음`; }
    else if (d <= 90) { badge = 'badge-warning'; dText = `${d}일 남음`; }
    else { badge = 'badge-success'; dText = `${d}일 남음`; }
    return `<tr>
      <td style="text-align:center;color:var(--gray-400);font-size:12px;">${idx + 1}</td>
      <td>${t.building ? t.building : '<span style="color:var(--gray-400);font-size:12px;">-</span>'}</td>
      <td>${getTenantDong(t.building, t.room)}</td>
      <td><strong>${fmtRoom(t.room)}</strong></td>
      <td>${t.name}</td>
      <td>${fmtDate(t.contractStart)}</td>
      <td>${fmtDate(t.contractEnd)}</td>
      <td>${leaseTypeBadge(t.type, t.deposit)}</td>
      <td style="text-align:right;">${t.deposit ? Number(t.deposit).toLocaleString() : '-'}</td>
      <td style="text-align:right;">${t.rent ? Number(t.rent).toLocaleString() : '-'}</td>
      <td><span class="badge ${badge} ${d<=30&&d>=0?'expiry-soon':''}">${dText}</span></td>
      <td><span class="badge ${d<0?'badge-danger':d<=90?'badge-warning':'badge-success'}">${d<0?'만료':d<=90?'만료임박':'계약중'}</span></td>
      <td style="white-space:nowrap;">
        <button class="btn btn-outline btn-sm" onclick="openRegisterEdit('${t.id}')">수정</button>
      </td>
    </tr>`;
  }).join('');
}
function filterContracts(v)         { contractFilter = v; contractDongFilter = ''; contractRoomFilter = ''; renderContracts(); }
function filterContractDong(v)      { contractDongFilter = v; contractRoomFilter = ''; renderContracts(); }
function filterContractRoom(v)      { contractRoomFilter = v; renderContracts(); }
function filterContractStatus(v)    { contractStatusFilter = v; renderContracts(); }

function renderContractFilterBar() {
  const bar = document.getElementById('contractFilterBar');
  if (!bar) return;
  const properties = getData('properties');
  const selStyle = 'height:34px;width:auto;max-width:150px;border-radius:8px;border:1px solid var(--gray-200);padding:0 10px;font-size:13px;background:#fff;color:var(--gray-700);cursor:pointer;';

  const buildOptions = '<option value="">전체 건물</option>' +
    properties.map(p => `<option value="${p.name.replace(/"/g,'&quot;')}"${contractFilter===p.name?' selected':''}>${p.name}</option>`).join('');

  // 동: 건물이 선택된 경우에만 표시
  let dongSel = '';
  if (contractFilter) {
    const prop = properties.find(p => p.name === contractFilter);
    const dongs = [...new Set((prop?.rooms||[]).map(r=>r.dong).filter(Boolean))].sort();
    if (dongs.length > 0) {
      const dongOptions = '<option value="">전체 동</option>' +
        dongs.map(d => `<option value="${d}"${contractDongFilter===d?' selected':''}>${d}</option>`).join('');
      dongSel = `<select onchange="filterContractDong(this.value)" style="${selStyle}">${dongOptions}</select>`;
    }
  }

  bar.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;flex:1;flex-wrap:wrap;">
      <select onchange="filterContracts(this.value)" style="${selStyle}">${buildOptions}</select>
      ${dongSel}
    </div>
    <span style="font-size:12px;color:var(--gray-400);white-space:nowrap;margin-left:8px;">(단위: 만원)</span>
  `;
}

// ============================================================
// 계약 탭 전환
// ============================================================
let _contractTab = 'active';
function switchContractTab(tab) {
  _contractTab = tab;
  document.getElementById('ctab-active').style.display  = tab === 'active'  ? 'block' : 'none';
  document.getElementById('ctab-history').style.display = tab === 'history' ? 'block' : 'none';
  const activeBtn  = document.getElementById('ctab-btn-active');
  const histBtn    = document.getElementById('ctab-btn-history');
  const on  = 'padding:10px 24px;border:none;background:none;font-size:14px;font-weight:700;color:var(--primary);border-bottom:3px solid var(--primary);margin-bottom:-2px;cursor:pointer;';
  const off = 'padding:10px 24px;border:none;background:none;font-size:14px;font-weight:400;color:var(--gray-500);border-bottom:3px solid transparent;margin-bottom:-2px;cursor:pointer;';
  activeBtn.style.cssText = tab === 'active' ? on : off;
  histBtn.style.cssText   = tab === 'history' ? on : off;
  if (tab === 'history') { initHistoryFilters(); }
}

// ============================================================
// 계약 히스토리
// ============================================================
function initHistoryFilters() {
  const buildSel = document.getElementById('histBuildingSel');
  if (!buildSel) return;
  const props = getData('properties');
  buildSel.innerHTML = '<option value="">─ 선택 ─</option><option value="__ALL__">전체 건물</option>' +
    props.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
  const dongSel = document.getElementById('histDongSel');
  const roomSel = document.getElementById('histRoomSel');
  dongSel.innerHTML = '<option value="">동</option>';
  dongSel.disabled = true;
  roomSel.innerHTML = '<option value="">호수</option>';
  roomSel.disabled = true;
  document.getElementById('historyTbody').innerHTML = '';
}

function onHistBuildingChange() {
  const buildName = document.getElementById('histBuildingSel').value;
  const dongSel   = document.getElementById('histDongSel');
  const roomSel   = document.getElementById('histRoomSel');
  dongSel.innerHTML = '<option value="">동</option>';
  roomSel.innerHTML = '<option value="">호수</option>';
  roomSel.disabled = true;
  document.getElementById('historyTbody').innerHTML = '';

  if (buildName === '__ALL__') {
    dongSel.disabled = true;
    roomSel.disabled = true;
    renderContractHistory();
    return;
  }
  if (buildName) {
    const prop  = getData('properties').find(p => p.name === buildName);
    const dongs = [...new Set((prop?.rooms || []).map(r => r.dong).filter(Boolean))].sort();
    if (dongs.length > 0) {
      dongSel.innerHTML += dongs.map(d => `<option value="${d}">${d}</option>`).join('');
      dongSel.disabled = false;
    } else {
      // 동 구분 없는 건물 → 동 skip, 바로 호수 채우기
      dongSel.disabled = true;
      let rooms = (prop?.rooms || []).slice().sort((a, b) =>
        String(a.roomNo).localeCompare(String(b.roomNo), undefined, {numeric: true}));
      roomSel.innerHTML = '<option value="">호수</option>' +
        rooms.map(r => `<option value="${r.roomNo}">${fmtRoom(r.roomNo)}</option>`).join('');
      roomSel.disabled = false;
    }
  } else {
    dongSel.disabled = true;
  }
  renderContractHistory();
}

function onHistDongChange() {
  const buildName = document.getElementById('histBuildingSel').value;
  const dongVal   = document.getElementById('histDongSel').value;
  const roomSel   = document.getElementById('histRoomSel');
  roomSel.innerHTML = '<option value="">호수</option>';
  roomSel.disabled = true;
  document.getElementById('historyTbody').innerHTML = '';

  if (buildName && dongVal) {
    const prop  = getData('properties').find(p => p.name === buildName);
    let rooms = (prop?.rooms || []).filter(r => r.dong === dongVal);
    rooms = rooms.slice().sort((a, b) =>
      String(a.roomNo).localeCompare(String(b.roomNo), undefined, {numeric: true}));
    roomSel.innerHTML = '<option value="">호수</option>' +
      rooms.map(r => `<option value="${r.roomNo}">${fmtRoom(r.roomNo)}</option>`).join('');
    roomSel.disabled = false;
  }
  renderContractHistory();
}

function renderContractHistory() {
  const tbody = document.getElementById('historyTbody');
  if (!tbody) return;
  const buildFilter = document.getElementById('histBuildingSel')?.value || '';
  const dongFilter  = document.getElementById('histDongSel')?.value    || '';
  const roomFilter  = document.getElementById('histRoomSel')?.value    || '';

  // 건물 미선택 시 빈 화면
  if (!buildFilter) { tbody.innerHTML = ''; return; }

  // 과거 계약 이력 (contractHistory) — 구조화 저장에서 flat 로드
  let records = loadAllHistory().map(r => ({...r, _isCurrent: false}));
  const isAll = buildFilter === '__ALL__';
  if (!isAll) records = records.filter(r => r.building === buildFilter);
  if (dongFilter)  records = records.filter(r => r.dong === dongFilter);
  if (roomFilter)  records = records.filter(r => String(r.room) === String(roomFilter));

  // 현재 계약 중인 임차인도 포함
  const activeTenants = (getData('tenants') || []).filter(t => t.name && t.status === '입주');
  let activeFiltered = activeTenants;
  if (!isAll) activeFiltered = activeFiltered.filter(t => t.building === buildFilter);
  if (dongFilter)  activeFiltered = activeFiltered.filter(t => {
    // 동 정보를 props에서 찾아서 비교
    const prop = getData('properties').find(p => p.name === t.building);
    const rm = (prop?.rooms || []).find(r => String(r.roomNo) === String(t.room));
    return rm?.dong === dongFilter;
  });
  if (roomFilter)  activeFiltered = activeFiltered.filter(t => String(t.room) === String(roomFilter));

  // 현재 계약을 동일한 포맷으로 변환
  const activeRecords = activeFiltered.map(t => {
    const prop = getData('properties').find(p => p.name === t.building);
    const rm = (prop?.rooms || []).find(r => String(r.roomNo) === String(t.room));
    return {
      _isCurrent: true, _tenantId: t.id,
      building: t.building, dong: rm?.dong || '', room: t.room,
      name: t.name, phone: t.phone,
      type: t.type || '월세',
      deposit: t.deposit, rent: t.rent, management: t.management,
      payDay: t.payDay, payType: t.payType,
      contractStart: t.contractStart, contractEnd: t.contractEnd,
      moveIn: t.moveIn, extendCount: t.extendCount || 0,
      note: t.note || '',
      archivedAt: ''
    };
  });

  // 합산 후 정렬: 건물명→동→호수→계약시작일 오름차순
  const allRecords = [...records, ...activeRecords];
  allRecords.sort((a, b) => {
    const bc = String(a.building||'').localeCompare(String(b.building||''));
    if (bc !== 0) return bc;
    const dc = String(a.dong||'').localeCompare(String(b.dong||''), undefined, {numeric:true});
    if (dc !== 0) return dc;
    const rc = String(a.room||'').localeCompare(String(b.room||''), undefined, {numeric:true});
    if (rc !== 0) return rc;
    return String(a.contractStart||'').localeCompare(String(b.contractStart||''));
  });

  // 기간 중복 감지: 같은 건물+동+호수에서 계약 기간이 겹치는 경우
  const overlapIds = new Set();
  for (let i = 0; i < allRecords.length; i++) {
    for (let j = i + 1; j < allRecords.length; j++) {
      const a = allRecords[i], b = allRecords[j];
      if (a.building !== b.building || String(a.dong||'') !== String(b.dong||'') || String(a.room||'') !== String(b.room||'')) break;
      const aS = a.contractStart, aE = a.contractEnd || '9999-12-31';
      const bS = b.contractStart, bE = b.contractEnd || '9999-12-31';
      if (aS && bS && aS <= bE && bS <= aE) {
        overlapIds.add(a.id || a._tenantId);
        overlapIds.add(b.id || b._tenantId);
      }
    }
  }

  if (allRecords.length === 0) {
    tbody.innerHTML = `<tr><td colspan="14"><div class="empty-state"><div class="empty-icon">📋</div>
      <p>계약 히스토리가 없습니다.<br><small style="color:var(--gray-400);">퇴거 처리를 하면 이력이 여기에 쌓입니다.</small></p>
    </div></td></tr>`;
    return;
  }

  // 동적 판별용: 같은 건물+호수+동일인(이름+전화)의 더 늦은 계약이 있으면 연장으로 간주
  function isExtension(rec) {
    if (rec._isCurrent) return false;
    if (rec.reason === 'extension') return true;
    if (rec.reason === 'eviction') return false;
    // reason 없는 기존 데이터 동적 판별
    return allRecords.some(r =>
      r !== rec &&
      r.building === rec.building &&
      String(r.room) === String(rec.room) &&
      r.name === rec.name &&
      r.phone && rec.phone && r.phone === rec.phone &&
      String(r.contractStart||'') > String(rec.contractStart||'')
    );
  }

  tbody.innerHTML = allRecords.map(r => {
    const ext = isExtension(r);
    let statusBadge, rowStyle;
    if (r._isCurrent) {
      statusBadge = `<span class="badge badge-success" style="background:#dcfce7;color:#16a34a;border:1px solid #86efac;">임대중</span>`;
      rowStyle = 'background:#f0fdf4;';
    } else if (ext) {
      statusBadge = `<span class="badge" style="background:#eff6ff;color:#2563eb;border:1px solid #93c5fd;">계약연장</span>`;
      rowStyle = '';
    } else {
      statusBadge = `<span class="badge" style="background:#f1f5f9;color:#64748b;border:1px solid #cbd5e1;">퇴거</span>`;
      rowStyle = '';
    }
    const extYN    = r._isCurrent ? '' : ext
      ? `<span style="color:#2563eb;font-weight:700;">O</span>`
      : `<span style="color:#9ca3af;">X</span>`;
    const evictDate = (r._isCurrent || ext) ? '-' : (r.archivedAt || '-');
    const recKey = r.id || r._tenantId;
    const isOverlap = overlapIds.has(recKey);
    const noteDisplay = [
      r.note || '',
      isOverlap ? '<span style="color:#dc2626;font-weight:600;">⚠ 기간 중복</span>' : ''
    ].filter(Boolean).join(' ');
    const manageBtns = r._isCurrent
      ? `<button class="btn btn-outline btn-sm" onclick="openRegisterEdit('${r._tenantId}')">수정</button>`
      : `<button class="btn btn-outline btn-sm" onclick="openHistoryEdit('${r.id}')">수정</button>`;
    return `<tr style="${rowStyle}">
      <td>${r.building||'-'}</td>
      <td>${r.dong||'-'}</td>
      <td><strong>${fmtRoom(r.room)}</strong></td>
      <td>${r.name||'-'}</td>
      <td>${leaseTypeBadge(r.type, r.deposit)}</td>
      <td style="text-align:right;">${r.deposit ? Number(r.deposit).toLocaleString() : '-'}</td>
      <td style="text-align:right;">${r.rent    ? Number(r.rent).toLocaleString()    : '-'}</td>
      <td style="text-align:right;">${r.management ? Number(r.management).toLocaleString() : '-'}</td>
      <td>${fmtDate(r.contractStart)||'-'}</td>
      <td>${fmtDate(r.contractEnd)||'-'}</td>
      <td style="color:#dc2626;">${evictDate}</td>
      <td>${statusBadge}</td>
      <td style="font-size:12px;color:var(--gray-500);max-width:160px;white-space:normal;">${noteDisplay || '-'}</td>
      <td>${manageBtns}</td>
    </tr>`;
  }).join('');
}

// ============================================================
// 계약 히스토리 수정 / 삭제
// ============================================================
function openHistoryEdit(id) {
  const rec = loadAllHistory().find(r => r.id === id);
  if (!rec) return;
  document.getElementById('histEditId').value           = id;
  document.getElementById('histEditName').value         = rec.name || '';
  document.getElementById('histEditType').value         = rec.type || '월세';
  document.getElementById('histEditDeposit').value      = rec.deposit ? Number(rec.deposit).toLocaleString() : '';
  document.getElementById('histEditRent').value         = rec.rent ? Number(rec.rent).toLocaleString() : '';
  document.getElementById('histEditManagement').value   = rec.management ? Number(rec.management).toLocaleString() : '';
  document.getElementById('histEditIsExtension').value  = rec.reason === 'extension' ? 'O' : 'X';
  document.getElementById('histEditContractStart').value = rec.contractStart || '';
  document.getElementById('histEditContractEnd').value  = rec.contractEnd || '';
  document.getElementById('histEditArchivedAt').value   = rec.archivedAt || '';
  document.getElementById('histEditNote').value         = rec.note || '';
  openModal('historyEditModal');
}

function saveHistoryEdit() {
  const id = document.getElementById('histEditId').value;
  const history = loadAllHistory();
  const idx = history.findIndex(r => r.id === id);
  if (idx < 0) return;
  const isExt = document.getElementById('histEditIsExtension').value === 'O';
  history[idx] = {
    ...history[idx],
    name:          document.getElementById('histEditName').value.trim(),
    type:          document.getElementById('histEditType').value,
    deposit:       Number((document.getElementById('histEditDeposit').value || '0').replace(/,/g, '')),
    rent:          Number((document.getElementById('histEditRent').value || '0').replace(/,/g, '')),
    management:    Number((document.getElementById('histEditManagement').value || '0').replace(/,/g, '')),
    reason:        isExt ? 'extension' : 'eviction',
    contractStart: document.getElementById('histEditContractStart').value.trim(),
    contractEnd:   document.getElementById('histEditContractEnd').value.trim(),
    archivedAt:    document.getElementById('histEditArchivedAt').value.trim(),
    note:          document.getElementById('histEditNote').value.trim()
  };
  saveHistory(history);
  closeModal('historyEditModal');
  renderContractHistory();
  showToast('히스토리가 수정됐습니다.');
}

// ============================================================
// 계약 히스토리 수동 추가
// ============================================================
function openHistoryAddModal() {
  // 입력 초기화
  ['haName','haPhone','haDeposit','haRent','haManagement','haContractStart',
   'haContractEnd','haMoveIn','haArchivedAt','haNote'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('haType').value = '월세';
  document.getElementById('haExtendCount').value = '0';
  document.getElementById('haPayDay').value = '';

  // 건물 드롭다운 채우기
  const buildSel = document.getElementById('haBuilding');
  const props = getData('properties') || [];
  buildSel.innerHTML = '<option value="">선택</option>' +
    props.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
  buildSel.value = '';

  // 동/호수 초기화
  document.getElementById('haDong').innerHTML = '<option value="">선택</option>';
  document.getElementById('haDong').disabled = true;
  document.getElementById('haRoom').innerHTML = '<option value="">선택</option>';
  document.getElementById('haRoom').disabled = true;

  openModal('historyAddModal');
}

function onHaBuildingChange() {
  const building = document.getElementById('haBuilding').value;
  const dongSel  = document.getElementById('haDong');
  const roomSel  = document.getElementById('haRoom');
  dongSel.innerHTML = '<option value="">선택</option>';
  roomSel.innerHTML = '<option value="">선택</option>';
  dongSel.disabled = true;
  roomSel.disabled = true;
  if (!building) return;
  const prop = (getData('properties') || []).find(p => p.name === building);
  if (!prop) return;
  const rooms = prop.rooms || [];
  const dongs = [...new Set(rooms.map(r => r.dong).filter(Boolean))];
  if (dongs.length > 0) {
    dongSel.innerHTML = '<option value="">전체</option>' +
      dongs.map(d => `<option value="${d}">${d}</option>`).join('');
    dongSel.disabled = false;
    // 동 없는 경우 바로 호수
  }
  // 호수 채우기 (동 미선택 시 전체)
  const allRooms = rooms.map(r => r.roomNo).filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b), undefined, {numeric:true}));
  roomSel.innerHTML = '<option value="">선택</option>' +
    allRooms.map(rn => `<option value="${rn}">${fmtRoom(String(rn))}</option>`).join('');
  roomSel.disabled = false;
}

function onHaDongChange() {
  const building = document.getElementById('haBuilding').value;
  const dong     = document.getElementById('haDong').value;
  const roomSel  = document.getElementById('haRoom');
  roomSel.innerHTML = '<option value="">선택</option>';
  if (!building) return;
  const prop = (getData('properties') || []).find(p => p.name === building);
  if (!prop) return;
  const rooms = (prop.rooms || []).filter(r => !dong || r.dong === dong);
  const sorted = rooms.map(r => r.roomNo).filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b), undefined, {numeric:true}));
  roomSel.innerHTML = '<option value="">선택</option>' +
    sorted.map(rn => `<option value="${rn}">${fmtRoom(String(rn))}</option>`).join('');
  roomSel.disabled = false;
}

function saveHistoryAdd() {
  const building = document.getElementById('haBuilding').value.trim();
  const roomNo   = document.getElementById('haRoom').value.trim();
  const name     = document.getElementById('haName').value.trim();
  const contractStart = document.getElementById('haContractStart').value.trim();
  if (!building) { showToast('건물을 선택해주세요.', 'error'); return; }
  if (!roomNo)   { showToast('호수를 선택해주세요.', 'error'); return; }
  if (!name)     { showToast('임차인명을 입력해주세요.', 'error'); return; }
  if (!contractStart) { showToast('계약 시작일을 입력해주세요.', 'error'); return; }

  // 동 정보 찾기
  const prop = (getData('properties') || []).find(p => p.name === building);
  const rm   = (prop?.rooms || []).find(r => String(r.roomNo) === String(roomNo));
  const dong = rm?.dong || document.getElementById('haDong').value || '';

  const newRec = {
    id: uid(),
    building, dong, room: roomNo,
    name,
    phone:         document.getElementById('haPhone').value.trim(),
    type:          document.getElementById('haType').value,
    deposit:       Number((document.getElementById('haDeposit').value || '0').replace(/,/g, '')),
    rent:          Number((document.getElementById('haRent').value || '0').replace(/,/g, '')),
    management:    Number((document.getElementById('haManagement').value || '0').replace(/,/g, '')),
    payDay:        Number(document.getElementById('haPayDay').value || 5),
    extendCount:   Number(document.getElementById('haExtendCount').value || 0),
    contractStart,
    contractEnd:   document.getElementById('haContractEnd').value.trim(),
    moveIn:        document.getElementById('haMoveIn').value.trim() || contractStart,
    archivedAt:    document.getElementById('haArchivedAt').value.trim(),
    note:          document.getElementById('haNote').value.trim(),
    reason:        'manual'
  };

  const history = loadAllHistory();
  history.push(newRec);
  saveHistory(history);
  closeModal('historyAddModal');
  showToast('히스토리가 추가됐습니다.');
  renderContractHistory();
}

function deleteHistoryFromModal() {
  const id = document.getElementById('histEditId').value;
  closeModal('historyEditModal');
  deleteHistoryRecord(id);
}

function deleteHistoryRecord(id) {
  const rec = loadAllHistory().find(r => r.id === id);
  if (!rec) return;
  confirm(
    `'${rec.name}' 의 계약 이력(${fmtDate(rec.contractStart)} ~ ${fmtDate(rec.contractEnd)})을 삭제하시겠습니까?`,
    () => {
      const history = loadAllHistory().filter(r => r.id !== id);
      saveHistory(history);
      renderContractHistory();
      showToast('히스토리가 삭제됐습니다.');
    },
    '삭제', 'btn-danger'
  );
}

// ============================================================
// 퇴거 처리 (현재 임차인 → contractHistory 아카이브)
// ============================================================
function archiveTenant(tenantId, extraNote) {
  const tenants = getData('tenants');
  const t = tenants.find(x => x.id === tenantId);
  if (!t || !t.name) return false;

  // 비고: 기존 note + 조기퇴거 사유 합산
  const combinedNote = [t.note, extraNote].filter(Boolean).join('\n');

  // 동 정보 조회
  const prop = getData('properties').find(p => p.name === t.building);
  const rm   = (prop?.rooms || []).find(r => String(r.roomNo) === String(t.room));
  const dong = rm?.dong || '';

  const history = loadAllHistory();
  history.push({
    id: uid(), originalId: t.id,
    building: t.building, dong: dong, room: t.room,
    name: t.name, phone: t.phone,
    type: t.type || '월세',
    deposit: t.deposit, rent: t.rent, management: t.management,
    payDay: t.payDay, payType: t.payType,
    contractStart: t.contractStart, contractEnd: t.contractEnd,
    moveIn: t.moveIn, extendCount: t.extendCount || 0,
    note: combinedNote,
    archivedAt: new Date().toISOString().slice(0, 10),
    reason: 'eviction'
  });
  saveHistory(history);

  // 해당 임차인을 공실 상태로 초기화
  const idx = tenants.findIndex(x => x.id === tenantId);
  tenants[idx] = {
    ...tenants[idx],
    name: '', phone: '', deposit: 0, rent: 0, management: 0,
    contractStart: '', contractEnd: '', moveIn: '',
    extendCount: 0, note: '', type: '월세', status: '공실',
    payDay: 5, payType: '선불'
  };
  setData('tenants', tenants);
  return true;
}

let _evictingTenantId = null;
let _contractEndTenantId = null;

// 수정 모달에서 계약종료 버튼 클릭 시 — 수정 모달 닫고 계약종료 확인창 열기
function openContractEndFromModal() {
  const id = _editingTenantId;
  closeModal('registerModal');
  setTimeout(() => openContractEnd(id), 200);
}

// 종료 유형 선택 (만기/중도)
function selectEndType(type) {
  const isEarly = type === 'early';
  document.getElementById('endTypeExpirySection').style.display = isEarly ? 'none' : 'block';
  document.getElementById('endTypeEarlySection').style.display  = isEarly ? 'block' : 'none';
  const btnExpiry = document.getElementById('btnEndTypeExpiry');
  const btnEarly  = document.getElementById('btnEndTypeEarly');
  const confirmBtn = document.getElementById('contractEndConfirmBtn');
  if (btnExpiry) {
    btnExpiry.style.border = isEarly ? '2px solid #d1d5db' : '2px solid #2563eb';
    btnExpiry.style.background = isEarly ? '#f9fafb' : '#eff6ff';
    btnExpiry.style.color = isEarly ? '#6b7280' : '#1d4ed8';
  }
  if (btnEarly) {
    btnEarly.style.border = isEarly ? '2px solid #dc2626' : '2px solid #d1d5db';
    btnEarly.style.background = isEarly ? '#fff1f0' : '#f9fafb';
    btnEarly.style.color = isEarly ? '#b91c1c' : '#6b7280';
  }
  if (confirmBtn) confirmBtn.textContent = isEarly ? '🚪 중도 해지 확인' : '✅ 만기 종료 확인';
  window._contractEndType = type;
}

// 계약종료 확인 모달 열기
function openContractEnd(tenantId) {
  const t = getData('tenants').find(x => x.id === tenantId);
  if (!t) return;
  _contractEndTenantId = tenantId;
  window._contractEndType = 'expiry'; // 기본값 만기 종료

  const infoEl = document.getElementById('contractEndInfo');
  const prop = getData('properties').find(p => p.name === t.building);
  const rm   = (prop?.rooms || []).find(r => String(r.roomNo) === String(t.room));
  const dong = rm?.dong ? rm.dong + ' ' : '';
  if (infoEl) {
    infoEl.innerHTML =
      `<strong>임차인:</strong> ${t.name}<br>` +
      `<strong>호실:</strong> ${t.building} ${dong}${fmtRoom(t.room)}<br>` +
      `<strong>계약 기간:</strong> ${fmtDate(t.contractStart)} ~ ${fmtDate(t.contractEnd)}<br>` +
      `<strong>임대유형:</strong> ${t.type || '월세'} &nbsp;|&nbsp; <strong>보증금:</strong> ${t.deposit ? Number(t.deposit).toLocaleString() + '만원' : '-'}`;
  }
  const dateInput = document.getElementById('contractEndDateInput');
  if (dateInput) dateInput.value = t.contractEnd || '';
  const earlyInput = document.getElementById('earlyEndDateInput');
  if (earlyInput) earlyInput.value = today();
  const earlyReason = document.getElementById('earlyEndReason');
  if (earlyReason) earlyReason.value = '';

  // 초기 상태 만기 종료로 설정
  selectEndType('expiry');
  openModal('contractEndModal');
}

// 계약종료 확인 처리
function confirmContractEnd() {
  const id = _contractEndTenantId;
  if (!id) return;
  const endType = window._contractEndType || 'expiry';
  const tenants = getData('tenants');
  const idx = tenants.findIndex(x => x.id === id);
  if (idx < 0) return;
  const t = tenants[idx];

  if (endType === 'expiry') {
    // 만기 종료
    const newEndDate = (document.getElementById('contractEndDateInput')?.value || '').trim();
    if (!newEndDate || newEndDate.length < 10) {
      showToast('계약 종료일을 입력해주세요.', 'error'); return;
    }
    tenants[idx].contractEnd = newEndDate;
    tenants[idx].endType = 'expiry';
    setData('tenants', tenants);
    closeModal('contractEndModal');
    archiveTenant(id, '만기 종료');
    updateBadges();
    showToast(`'${t.name}' 만기 종료 처리 완료. 계약 히스토리에 기록됐습니다.`);
  } else {
    // 중도 해지
    const earlyDate = (document.getElementById('earlyEndDateInput')?.value || '').trim();
    if (!earlyDate || earlyDate.length < 10) {
      showToast('중도 해지일을 입력해주세요.', 'error'); return;
    }
    const reason = (document.getElementById('earlyEndReason')?.value || '').trim();
    tenants[idx].earlyEndDate = earlyDate;   // 실제 해지일
    tenants[idx].earlyEndReason = reason;
    tenants[idx].endType = 'early';
    setData('tenants', tenants);
    closeModal('contractEndModal');
    archiveTenant(id, '중도 해지' + (reason ? ': ' + reason : ''));
    updateBadges();
    showToast(`'${t.name}' 중도 해지 처리 완료 (${earlyDate}). 계약 히스토리에 기록됐습니다.`);
  }
  if (currentPage === 'tenants')   renderTenants();
  if (currentPage === 'contracts') renderContracts();
}

function evictTenant() {
  const id = _editingTenantId;
  if (!id) return;
  const t = getData('tenants').find(x => x.id === id);
  if (!t?.name) return;

  // 계약 종료일까지 1개월(30일) 초과 남았으면 조기 퇴거 → 사유 입력
  const daysLeft = t.contractEnd ? daysUntil(t.contractEnd) : 0;
  if (daysLeft > 30) {
    _evictingTenantId = id;
    const infoEl = document.getElementById('evictReasonInfo');
    if (infoEl) {
      infoEl.innerHTML = `<strong>⚠️ 조기 퇴거 안내</strong><br>
        임차인: <b>${t.name}</b> &nbsp;|&nbsp; 호실: <b>${t.building} ${fmtRoom(t.room)}</b><br>
        계약 종료일: <b>${fmtDate(t.contractEnd)}</b> (${daysLeft}일 남음)<br>
        계약 기간이 <b>${daysLeft}일</b> 남아 있습니다. 퇴거 사유를 입력해 주세요.`;
    }
    const reasonEl = document.getElementById('evictReasonText');
    if (reasonEl) reasonEl.value = '';
    openModal('evictReasonModal');
  } else {
    // 계약 종료 임박 or 경과 → 바로 확인
    _evictingTenantId = id;
    confirm(
      `'${t.name}' 임차인을 퇴거 처리하시겠습니까?\n계약 정보가 히스토리로 보존되고,\n해당 호실은 공실로 변경됩니다.`,
      () => { _doEvict(id, ''); },
      '퇴거 처리', 'btn-danger'
    );
  }
}

function confirmEvictWithReason() {
  const reason = document.getElementById('evictReasonText')?.value.trim();
  if (!reason) { showToast('퇴거 사유를 입력해주세요.', 'error'); return; }
  const id = _evictingTenantId;
  if (!id) return;
  closeModal('evictReasonModal');
  _doEvict(id, `[조기퇴거] ${reason}`);
}

function _doEvict(id, extraNote) {
  const t = getData('tenants').find(x => x.id === id);
  archiveTenant(id, extraNote);
  updateBadges();
  closeModal('registerModal');
  showToast(`'${t?.name}' 퇴거 처리 완료. 계약 히스토리에 기록됐습니다.`);
  if (currentPage === 'tenants')   renderTenants();
  if (currentPage === 'contracts') renderContracts();
}