'use strict';
if (typeof window.REMGT === 'undefined') window.REMGT = {};

// ============================================================
// TENANTS
// ============================================================
let tenantFilter = '', tenantDongFilter = '', tenantRoomFilter = '', tenantStatusFilter = '';
let tenantSortKey = 'room', tenantSortDir = 'asc';
let _editingTenantId = null;
let _originalContractEnd = '';  // 계약 연장 시 원본 만기일 보존

function sortTenants(key) {
  if (tenantSortKey === key) tenantSortDir = tenantSortDir === 'asc' ? 'desc' : 'asc';
  else { tenantSortKey = key; tenantSortDir = 'asc'; }
  renderTenants();
}

function updateSortIcons() {
  const keys = ['building','room','name','deposit','rent','management','contractStart','contractEnd','moveIn','status'];
  keys.forEach(k => {
    const el = document.getElementById('si-' + k);
    if (!el) return;
    if (k === tenantSortKey) {
      el.textContent = tenantSortDir === 'asc' ? '↑' : '↓';
      el.className = 'sort-icon ' + tenantSortDir;
    } else {
      el.textContent = '⇅'; el.className = 'sort-icon';
    }
  });
}

// 동호수 기반 임대 등록 현황 렌더링
function renderTenants(filter, statusFilter) {
  if (filter !== undefined) tenantFilter = filter;
  if (statusFilter !== undefined) tenantStatusFilter = statusFilter;

  const properties = getData('properties');
  const tenants    = getData('tenants');
  const tbody      = document.getElementById('tenantTbody');

  // 필터바 갱신
  renderTenantFilterBar();

  // 등록된 물건이 없으면 안내
  const hasAnyRoom = properties.some(p => (p.rooms||[]).length > 0);
  if (properties.length === 0 || !hasAnyRoom) {
    tbody.innerHTML = `<tr><td colspan="12"><div class="empty-state">
      <div class="empty-icon">🏠</div>
      <p>등록된 동호수가 없습니다.<br><small style="color:var(--gray-400)">물건 등록 메뉴에서 동호수를 먼저 등록해주세요.</small></p>
    </div></td></tr>`;
    return;
  }

  const today = new Date(); today.setHours(0,0,0,0);
  const rows = [];

  // 건물명 가나다 순 정렬
  const sortedProperties = properties.slice().sort((a, b) =>
    String(a.name||'').localeCompare(String(b.name||''), 'ko')
  );

  sortedProperties.forEach(prop => {
    // 건물명 필터 (정확 매칭)
    if (tenantFilter && prop.name !== tenantFilter) return;

    const rooms = (prop.rooms || []).slice().sort((a, b) => {
      const dc = String(a.dong||'').localeCompare(String(b.dong||''), 'ko', {numeric: true});
      if (dc !== 0) return dc;
      return String(a.roomNo||'').localeCompare(String(b.roomNo||''), undefined, {numeric: true});
    });
    rooms.forEach(room => {
      // 동 필터
      if (tenantDongFilter && room.dong !== tenantDongFilter) return;
      // 호수 필터
      if (tenantRoomFilter && room.roomNo !== tenantRoomFilter) return;

      // 이 물건+호실에 연결된 임차인 찾기
      const t = tenants.find(x => x.building === prop.name && x.room === room.roomNo);
      const tStatus = t?.status || '공실';

      // 상태 필터 ('임대중' 선택 시 내부 상태값 '입주'와 매칭)
      if (tenantStatusFilter) {
        const filterVal = tenantStatusFilter === '임대중' ? '입주' : tenantStatusFilter;
        if (tStatus !== filterVal) return;
      }

      // 상태 뱃지 계산
      let statusBadge;
      if (t?.status === '입주') {
        if (t?.contractEnd) {
          const endStr  = t.contractEnd.replace(/[^\d]/g,'');
          if (endStr.length === 8) {
            const endDate  = new Date(+endStr.slice(0,4), +endStr.slice(4,6)-1, +endStr.slice(6,8));
            const diffDays = Math.ceil((endDate - today) / 86400000);
            if (diffDays < 0)        statusBadge = `<span class="badge badge-danger">계약경과</span>`;
            else if (diffDays <= 90) statusBadge = `<span class="badge badge-warning" title="${t.contractEnd} 만기">D-${diffDays}</span>`;
            else                     statusBadge = `<span class="badge badge-success">임대중</span>`;
          } else {
            statusBadge = `<span class="badge badge-success">임대중</span>`;
          }
        } else {
          statusBadge = `<span class="badge badge-success">임대중</span>`;
        }
      } else {
        statusBadge = `<span class="badge badge-gray">공실</span>`;
      }

      // data-* 속성으로 onclick 파라미터 전달 (한국어 문자열 오류 방지)
      rows.push(`
      <tr>
        <td style="text-align:center;color:var(--gray-400);font-size:12px;">${rows.length + 1}</td>
        <td>${prop.name}</td>
        <td>${room.dong||'-'}</td>
        <td><strong>${fmtRoom(room.roomNo)}</strong></td>
        <td>${t?.name || '<span style="color:var(--gray-400);">-</span>'}</td>
        <td style="text-align:right;">${t?.deposit ? Number(t.deposit).toLocaleString() : '-'}</td>
        <td style="text-align:right;">${t?.rent ? Number(t.rent).toLocaleString() : '-'}</td>
        <td style="text-align:right;">${t?.management ? Number(t.management).toLocaleString() : '-'}</td>
        <td><span style="font-size:12px;">${fmtDate(t?.contractStart)||'-'}</span></td>
        <td><span style="font-size:12px;">${fmtDate(t?.contractEnd)||'-'}</span></td>
        <td>${statusBadge}</td>
        <td>
          <button class="btn ${t ? 'btn-outline' : 'btn-primary'} btn-sm"
            data-propid="${prop.id}" data-roomno="${room.roomNo}"
            onclick="openRegisterForRoom(this)">${t ? '수정' : '등록'}</button>
        </td>
      </tr>`);
    });
  });

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12"><div class="empty-state"><div class="empty-icon">🔍</div><p>검색 결과가 없습니다.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = rows.join('');
}

// 물건+호실 기준으로 임차인 등록/수정 팝업 열기
function openRegisterForRoom(btn) {
  const propId = btn.dataset.propid;
  const roomNo = btn.dataset.roomno;
  const prop   = getData('properties').find(p => p.id === propId);
  if (!prop) return;

  const t = getData('tenants').find(x => x.building === prop.name && x.room === roomNo);
  if (t) {
    // 기존 임차인 수정
    openRegisterEdit(t.id);
  } else {
    // 신규 등록 - 건물·호실 자동 선택
    _editingTenantId = null;
    clearRegisterForm();
    const alertEl = document.getElementById('regNoPropAlert');
    if (alertEl) alertEl.style.display = 'none';
    const resetBtn  = document.getElementById('regResetBtn');
    const cancelBtn = document.getElementById('regCancelBtn');
    if (resetBtn)  resetBtn.style.display  = 'none';
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';
    // 타이틀: 임차인 등록: 건물명 호실
    const titleEl = document.getElementById('regCardTitle');
    if (titleEl) titleEl.textContent = `➕ 임차인 등록: ${prop.name} ${roomNo}`;
    openModal('registerModal');
    // 모달 렌더 후 건물·호실 선택
    setTimeout(() => {
      const buildingSel = document.getElementById('regBuilding');
      if (buildingSel) {
        buildingSel.value = prop.name;
        onRegBuildingChange();
        setTimeout(() => {
          const roomSel = document.getElementById('regRoom');
          if (roomSel) roomSel.value = roomNo;
        }, 60);
      }
    }, 60);
  }
}

function filterTenantBuilding(v) { tenantFilter = v; tenantDongFilter = ''; tenantRoomFilter = ''; renderTenantFilterBar(); renderTenants(); }
function filterTenantDong(v)     { tenantDongFilter = v; tenantRoomFilter = ''; renderTenantFilterBar(); renderTenants(); }
function filterTenantRoom(v)     { tenantRoomFilter = v; renderTenantFilterBar(); renderTenants(); }
function filterTenantStatus(v)   { tenantStatusFilter = v; renderTenantFilterBar(); renderTenants(); }
function filterTenants(v)        { filterTenantBuilding(v); }

function renderTenantFilterBar() {
  const bar = document.getElementById('tenantFilterBar');
  if (!bar) return;
  const properties = getData('properties');
  const selStyle = 'height:34px;width:auto;max-width:150px;border-radius:8px;border:1px solid var(--gray-200);padding:0 10px;font-size:13px;background:#fff;color:var(--gray-700);cursor:pointer;';

  // 건물명
  const buildOptions = '<option value="">전체 건물</option>' +
    properties.map(p => `<option value="${p.name.replace(/"/g,'&quot;')}"${tenantFilter===p.name?' selected':''}>${p.name}</option>`).join('');

  // 동: 건물이 선택된 경우에만 표시
  let dongSel = '';
  if (tenantFilter) {
    const prop = properties.find(p => p.name === tenantFilter);
    const dongs = [...new Set((prop?.rooms||[]).map(r=>r.dong).filter(Boolean))].sort();
    if (dongs.length > 0) {
      const dongOptions = '<option value="">전체 동</option>' +
        dongs.map(d => `<option value="${d}"${tenantDongFilter===d?' selected':''}>${d}</option>`).join('');
      dongSel = `<select onchange="filterTenantDong(this.value)" style="${selStyle}">${dongOptions}</select>`;
    }
  }

  // 상태: 항상 표시
  const statusSel = `
    <select onchange="filterTenantStatus(this.value)" style="${selStyle}">
      <option value=""${tenantStatusFilter===''?' selected':''}>전체</option>
      <option value="임대중"${tenantStatusFilter==='임대중'?' selected':''}>임대중</option>
      <option value="공실"${tenantStatusFilter==='공실'?' selected':''}>공실</option>
    </select>`;

  bar.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;flex:1;flex-wrap:wrap;">
      <select onchange="filterTenantBuilding(this.value)" style="${selStyle}">${buildOptions}</select>
      ${dongSel}
      ${statusSel}
    </div>
    <span style="font-size:12px;color:var(--gray-400);white-space:nowrap;margin-left:8px;">(단위: 만원)</span>
  `;
}

// 수납 관리 소팅
let paymentSortKey = 'room', paymentSortDir = 'asc';
function sortPayments(key) {
  if (paymentSortKey === key) paymentSortDir = paymentSortDir === 'asc' ? 'desc' : 'asc';
  else { paymentSortKey = key; paymentSortDir = 'asc'; }
  renderPayments();
}
function updatePaymentSortIcons() {
  ['building','room','name','rent','management','paidDate','unpaidMonths'].forEach(k => {
    const el = document.getElementById('psi-' + k);
    if (!el) return;
    if (k === paymentSortKey) { el.textContent = paymentSortDir === 'asc' ? '↑' : '↓'; el.className = 'sort-icon ' + paymentSortDir; }
    else { el.textContent = '⇅'; el.className = 'sort-icon'; }
  });
}

// 계약 관리 소팅
let contractSortKey = 'contractEnd', contractSortDir = 'asc';
function sortContracts(key) {
  if (contractSortKey === key) contractSortDir = contractSortDir === 'asc' ? 'desc' : 'asc';
  else { contractSortKey = key; contractSortDir = 'asc'; }
  renderContracts();
}
function updateContractSortIcons() {
  ['building','room','name','contractStart','contractEnd','deposit','rent'].forEach(k => {
    const el = document.getElementById('csi-' + k);
    if (!el) return;
    if (k === contractSortKey) { el.textContent = contractSortDir === 'asc' ? '↑' : '↓'; el.className = 'sort-icon ' + contractSortDir; }
    else { el.textContent = '⇅'; el.className = 'sort-icon'; }
  });
}

function openTenantModal(id) {
  const fields = ['tBuilding','tRoom','tName','tPhone','tDeposit','tRent','tManagement','tPayDay','tContractStart','tContractEnd','tMoveIn','tNote'];
  fields.forEach(f => { const el = document.getElementById(f); if(el) el.value = ''; });
  document.getElementById('tenantId').value = '';
  document.getElementById('tType').value = '월세';
  document.getElementById('tStatus').value = '입주';
  document.getElementById('tenantModalTitle').textContent = id ? '임대차 수정' : '임대차 추가';
  if (id) {
    const t = getData('tenants').find(x => x.id === id);
    if (t) {
      document.getElementById('tenantId').value = t.id;
      document.getElementById('tBuilding').value = t.building || '';
      document.getElementById('tRoom').value = t.room;
      document.getElementById('tName').value = t.name;
      document.getElementById('tPhone').value = t.phone;
      document.getElementById('tDeposit').value = t.deposit ? Number(t.deposit).toLocaleString() : '';
      document.getElementById('tRent').value = t.rent ? Number(t.rent).toLocaleString() : '';
      document.getElementById('tManagement').value = t.management ? Number(t.management).toLocaleString() : '';
      document.getElementById('tPayDay').value = t.payDay;
      document.getElementById('tContractStart').value = t.contractStart;
      document.getElementById('tContractEnd').value = t.contractEnd;
      document.getElementById('tMoveIn').value = t.moveIn;
      document.getElementById('tType').value = t.type;
      document.getElementById('tStatus').value = t.status;
      document.getElementById('tNote').value = t.note;
    }
  }
  openModal('tenantModal');
}

function saveTenant() {
  const room = document.getElementById('tRoom').value.trim();
  const name = document.getElementById('tName').value.trim();
  const contractStart = document.getElementById('tContractStart').value;
  const contractEnd = document.getElementById('tContractEnd').value;
  const status = document.getElementById('tStatus').value;
  if (!room) { showToast('호실 번호를 입력해주세요.', 'error'); return; }
  if (status === '입주' && !name) { showToast('임차인명을 입력해주세요.', 'error'); return; }

  const tenants = getData('tenants');
  const id = document.getElementById('tenantId').value;
  const obj = {
    id: id || uid(),
    building: document.getElementById('tBuilding').value.trim(),
    room, name, phone: document.getElementById('tPhone').value,
    deposit: Number(document.getElementById('tDeposit').value.replace(/,/g,''))||0,
    rent: Number(document.getElementById('tRent').value.replace(/,/g,''))||0,
    management: Number(document.getElementById('tManagement').value.replace(/,/g,''))||0,
    payDay: Number(document.getElementById('tPayDay').value)||5,
    contractStart, contractEnd,
    moveIn: document.getElementById('tMoveIn').value,
    type: document.getElementById('tType').value,
    status, note: document.getElementById('tNote').value
  };
  if (id) {
    const idx = tenants.findIndex(t => t.id === id);
    tenants[idx] = obj;
  } else {
    tenants.push(obj);
  }
  setData('tenants', tenants);
  closeModal('tenantModal');
  renderTenants();
  updateBadges();
  showToast(id ? '임차인 정보가 수정되었습니다.' : '임차인이 추가되었습니다.');
}

// ============================================================
// 소유부동산 (PROPERTIES)
// ============================================================
function renderPropertiesPage() {
  const TYPE_ORDER = ['아파트','오피스텔','상가','사무실','주택','기타'];
  const props = getData('properties').slice().sort((a, b) => {
    const ta = TYPE_ORDER.indexOf(a.type||'기타');
    const tb = TYPE_ORDER.indexOf(b.type||'기타');
    const ti = (ta < 0 ? 99 : ta) - (tb < 0 ? 99 : tb);
    if (ti !== 0) return ti;
    return String(a.name||'').localeCompare(String(b.name||''), 'ko');
  });
  const list  = document.getElementById('propList');
  if (!list) return;
  if (props.length === 0) {
    list.innerHTML = `<div style="text-align:center;padding:48px;color:var(--gray-400);">
      <div style="font-size:48px;margin-bottom:12px;">🏠</div>
      <div style="font-size:15px;font-weight:600;">등록된 건물이 없습니다.</div>
      <div style="font-size:13px;margin-top:6px;">위의 "건물 추가" 버튼으로 소유 건물을 등록해주세요.</div>
    </div>`;
    return;
  }
  list.innerHTML = props.map(p => {
    const rooms = p.rooms || [];
    const roomCount = rooms.length;
    const roomRows = roomCount > 0
      ? rooms.map(r => {
          const total = (Number(r.acqPrice)||0) + (Number(r.acqTax)||0) + (Number(r.acqFee)||0);
          const curPrice = Number(r.curPrice) || 0;
          const profit = curPrice ? curPrice - total : null;
          const profitRate = (profit !== null && total > 0) ? (profit / total * 100) : null;
          const profitColor = profit === null ? 'var(--gray-400)' : (profit < 0 ? '#dc2626' : 'var(--gray-700)');
          const curPriceDateStr = r.curPriceDate ? `<div style="font-size:10px;color:#6b7280;margin-top:2px;">${r.curPriceDate}</div>` : '';
          return `<tr>
          <td style="padding:9px 14px;text-align:center;">${r.dong||'-'}</td>
          <td style="padding:9px 14px;text-align:center;font-weight:700;">${fmtRoom(r.roomNo)}</td>
          <td style="padding:9px 14px;text-align:center;font-size:13px;">
            ${r.supplyPyeong ? `<span style="font-weight:600;">${Math.round(r.supplyPyeong*10)/10}평</span><span style="font-size:11px;color:var(--gray-400);margin-left:4px;">${(+(r.supplyM2||(r.supplyPyeong*3.3058))).toFixed(1)}㎡</span>` : '<span style="color:var(--gray-400);">-</span>'}
          </td>
          <td style="padding:9px 14px;text-align:center;font-size:13px;">
            ${r.exclPyeong ? `<span style="font-weight:600;">${Math.round(r.exclPyeong*10)/10}평</span><span style="font-size:11px;color:var(--gray-400);margin-left:4px;">${(+(r.exclM2||(r.exclPyeong*3.3058))).toFixed(1)}㎡</span>` : '<span style="color:var(--gray-400);">-</span>'}
          </td>
          <td style="padding:9px 14px;text-align:center;">${r.acqDate || '-'}</td>
          <td style="padding:9px 14px;text-align:right;">${r.acqPrice ? Number(r.acqPrice).toLocaleString() : '-'}</td>
          <td style="padding:9px 14px;text-align:right;">${r.acqTax   ? Number(r.acqTax).toLocaleString()   : '-'}</td>
          <td style="padding:9px 14px;text-align:right;">${r.acqFee   ? Number(r.acqFee).toLocaleString()   : '-'}</td>
          <td style="padding:9px 14px;text-align:right;font-weight:700;color:var(--primary);">${total ? total.toLocaleString() : '-'}</td>
          <td style="padding:9px 14px;text-align:right;">
            ${curPrice ? `<div style="font-weight:700;color:#059669;">${curPrice.toLocaleString()}</div>${curPriceDateStr}` : '<span style="color:var(--gray-400);">-</span>'}
          </td>
          <td style="padding:9px 14px;text-align:right;font-weight:700;color:${profitColor};white-space:nowrap;">
            ${profit !== null ? profit.toLocaleString() : '<span style="color:var(--gray-400);">-</span>'}
            ${profitRate !== null ? `<span style="font-size:11px;font-weight:400;color:${profitColor};margin-left:5px;">(${Math.round(profitRate*10)/10}%)</span>` : ''}
          </td>
          <td style="padding:9px 14px;text-align:center;color:var(--gray-500);">${r.note || '-'}</td>
          <td style="padding:9px 14px;text-align:center;">
            <button class="btn btn-outline btn-sm" onclick="openRoomModal('${p.id}','${r.id}')">수정</button>
          </td>
        </tr>`;}).join('')
      : `<tr><td colspan="13" style="padding:14px;text-align:center;color:var(--gray-400);font-size:13px;">등록된 동호수가 없습니다.</td></tr>`;
    const bodyId = 'propRooms_' + p.id;
    const hasRooms = roomCount > 0;
    const deleteBtnStyle = hasRooms
      ? 'opacity:0.35;cursor:not-allowed;pointer-events:none;'
      : '';
    const deleteBtnTitle = hasRooms ? `title="동호수가 있으면 건물을 삭제할 수 없습니다"` : '';
    return `
    <div class="card" style="margin-bottom:20px;">
      <div class="card-header" style="cursor:pointer;display:flex;align-items:center;gap:12px;" onclick="togglePropRooms('${p.id}')">
        <div class="prop-header-grid" style="display:grid;grid-template-columns:18px 1fr;align-items:center;gap:0 8px;flex:1;min-width:0;">
          <span id="propArrow_${p.id}" style="font-size:12px;color:var(--gray-400);transition:transform 0.2s;">▶</span>

          <span style="display:flex;align-items:flex-start;gap:8px;overflow:hidden;flex-direction:column;justify-content:center;">
            <span style="display:flex;align-items:center;gap:6px;">
              <span class="badge badge-primary">${p.type||'주거'}</span>
              <span style="font-size:15px;font-weight:700;white-space:nowrap;">${p.name}${roomCount > 0 ? `<span style="font-size:13px;font-weight:400;color:var(--gray-400);margin-left:5px;">(${roomCount})</span>` : ''}</span>
            </span>
            ${(p.roadAddress||p.address) ? `<span style="font-size:12px;color:var(--gray-500);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-left:2px;">📍 ${p.roadAddress||p.address}${p.approvalDate ? ` <span style="color:var(--gray-300);">/</span> 사용승인 ${p.approvalDate.replace(/-/g,'.')} <span style="color:var(--gray-400);font-size:11px;">(${Math.floor((new Date()-new Date(p.approvalDate))/31536000000)}년)</span>` : ''}${p.units ? ` <span style="color:var(--gray-300);">/</span> ${Number(p.units).toLocaleString()}세대` : ''}${p.far ? ` <span style="color:var(--gray-300);">/</span> 용적률 ${p.far}%` : ''}</span>` : ''}
          </span>
        </div>
        <div style="display:flex;gap:6px;" onclick="event.stopPropagation()">
          <button class="btn btn-outline btn-sm" onclick="openRoomModal('${p.id}')">+ 동호수</button>
          <button class="btn btn-outline btn-sm" onclick="openPropertyModal('${p.id}')">수정</button>
        </div>
      </div>
      <div id="${bodyId}" style="display:none;">
        <div style="padding:0;">
          <table style="width:100%;border-collapse:collapse;font-size:13.5px;">
            <thead>
              <tr style="background:var(--gray-50);">
                <th style="padding:9px 14px;font-weight:600;color:var(--gray-600);font-size:12px;text-align:center;">동</th>
                <th style="padding:9px 14px;font-weight:600;color:var(--gray-600);font-size:12px;text-align:center;">호수</th>
                <th style="padding:9px 14px;font-weight:600;color:var(--gray-600);font-size:12px;text-align:center;">공급(평)</th>
                <th style="padding:9px 14px;font-weight:600;color:var(--gray-600);font-size:12px;text-align:center;">전용(평)</th>
                <th style="padding:9px 14px;font-weight:600;color:var(--gray-600);font-size:12px;text-align:center;">취득일자</th>
                <th style="padding:9px 14px;font-weight:600;color:var(--gray-600);font-size:12px;text-align:right;">매입가</th>
                <th style="padding:9px 14px;font-weight:600;color:var(--gray-600);font-size:12px;text-align:right;">세금</th>
                <th style="padding:9px 14px;font-weight:600;color:var(--gray-600);font-size:12px;text-align:right;">수수료</th>
                <th style="padding:9px 14px;font-weight:600;color:var(--primary);font-size:12px;text-align:right;white-space:nowrap;">총금액</th>
                <th style="padding:9px 14px;font-weight:600;color:#059669;font-size:12px;text-align:right;white-space:nowrap;">현재 가치</th>
                <th style="padding:9px 14px;font-weight:600;color:#6d28d9;font-size:12px;text-align:center;white-space:nowrap;">수익</th>
                <th style="padding:9px 14px;font-weight:600;color:var(--gray-600);font-size:12px;text-align:center;">비고</th>
                <th style="padding:9px 14px;font-weight:600;color:var(--gray-600);font-size:12px;text-align:center;">관리</th>
              </tr>
            </thead>
            <tbody>${roomRows}</tbody>
          </table>
        </div>
      </div>
    </div>`;
  }).join('');
  requestAnimationFrame(alignPropNameColumns);
}

function alignPropNameColumns() {
  const cells = document.querySelectorAll('.prop-name-cell');
  let maxW = 0;
  cells.forEach(el => { maxW = Math.max(maxW, el.offsetWidth); });
  if (maxW > 0) {
    document.querySelectorAll('.prop-header-grid').forEach(el => {
      el.style.gridTemplateColumns = `18px ${maxW}px 1fr`;
    });
  }
}

function togglePropRooms(propId) {
  const body  = document.getElementById('propRooms_' + propId);
  const arrow = document.getElementById('propArrow_' + propId);
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display  = isOpen ? 'none' : 'block';
  if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(90deg)';
}

function openPropertyModal(id) {
  document.getElementById('propId').value          = '';
  document.getElementById('propName').value        = '';
  document.getElementById('propAddress').value     = '';
  document.getElementById('propRoadAddress').value = '';
  document.getElementById('propUnits').value       = '';
  document.getElementById('propFar').value         = '';
  document.getElementById('propApprovalDate').value = '';
  document.getElementById('propMgmtPhone').value   = '';
  document.getElementById('propNote').value        = '';
  document.getElementById('propType').value        = '아파트';
  const addrHelper = document.getElementById('propAddrHelper');
  if (addrHelper) addrHelper.innerHTML = '📍 주소 검색 후 자동으로 입력됩니다. 필요시 직접 수정하세요.';
  const daumWrap = document.getElementById('propDaumWrap');
  if (daumWrap) { daumWrap.style.display = 'none'; daumWrap.innerHTML = ''; }
  document.getElementById('propertyModalTitle').textContent = id ? '🏠 건물 수정' : '🏠 건물 추가';
  if (id) {
    const p = getData('properties').find(x => x.id === id);
    if (p) {
      document.getElementById('propId').value           = p.id;
      document.getElementById('propName').value         = p.name;
      document.getElementById('propAddress').value      = p.address || '';
      document.getElementById('propRoadAddress').value  = p.roadAddress || '';
      document.getElementById('propUnits').value        = p.units ? Number(p.units).toLocaleString() : '';
      document.getElementById('propFar').value          = p.far   || '';
      document.getElementById('propApprovalDate').value = p.approvalDate || '';
      document.getElementById('propMgmtPhone').value    = p.mgmtPhone || '';
      document.getElementById('propNote').value         = p.note  || '';
      document.getElementById('propType').value         = p.type  || '아파트';
    }
  }
  // 삭제 버튼: 수정 시에만 표시 (동호수 없을 때만 활성화)
  const propDelBtn = document.getElementById('propDeleteBtn');
  if (propDelBtn) {
    if (id) {
      const prop = getData('properties').find(x => x.id === id);
      const hasRooms = (prop?.rooms?.length || 0) > 0;
      propDelBtn.style.display = 'inline-flex';
      propDelBtn.disabled = hasRooms;
      propDelBtn.title = hasRooms ? '동호수가 있으면 건물을 삭제할 수 없습니다' : '';
      propDelBtn.style.opacity = hasRooms ? '0.4' : '1';
    } else {
      propDelBtn.style.display = 'none';
    }
  }
  openModal('propertyModal');
}

function deletePropertyFromModal() {
  const id = document.getElementById('propId').value;
  if (!id) return;
  confirm('이 건물을 삭제하시겠습니까?', () => {
    closeModal('propertyModal');
    deleteProperty(id);
  });
}

function saveProperty() {
  const name = document.getElementById('propName').value.trim();
  if (!name) { showToast('건물명을 입력해주세요.', 'error'); return; }
  const props = getData('properties');
  const id    = document.getElementById('propId').value;
  if (id) {
    const idx = props.findIndex(x => x.id === id);
    if (idx >= 0) {
      const oldName = props[idx].name;
      props[idx].name        = name;
      props[idx].type        = document.getElementById('propType').value;
      props[idx].address      = document.getElementById('propAddress').value.trim();
      props[idx].roadAddress  = document.getElementById('propRoadAddress').value.trim();
      props[idx].units        = document.getElementById('propUnits').value.replace(/,/g,'').trim();
      props[idx].far          = document.getElementById('propFar').value.trim();
      props[idx].approvalDate = normalizeApprovalDate(document.getElementById('propApprovalDate').value);
      props[idx].mgmtPhone    = document.getElementById('propMgmtPhone').value.trim();
      props[idx].note         = document.getElementById('propNote').value;
      // 건물명이 바뀐 경우 임대차 데이터의 building 필드도 일괄 업데이트
      if (oldName !== name) {
        const tenants = getData('tenants');
        let changed = false;
        tenants.forEach(t => { if (t.building === oldName) { t.building = name; changed = true; } });
        if (changed) setData('tenants', tenants);
      }
    }
  } else {
    props.push({ id: uid(), name, type: document.getElementById('propType').value,
      address:      document.getElementById('propAddress').value.trim(),
      roadAddress:  document.getElementById('propRoadAddress').value.trim(),
      units:        document.getElementById('propUnits').value.replace(/,/g,'').trim(),
      far:          document.getElementById('propFar').value.trim(),
      approvalDate: normalizeApprovalDate(document.getElementById('propApprovalDate').value),
      mgmtPhone:    document.getElementById('propMgmtPhone').value.trim(),
      note:         document.getElementById('propNote').value,
      rooms: [] });
  }
  setData('properties', props);
  closeModal('propertyModal');
  renderPropertiesPage();
  showToast(id ? '건물 정보가 수정되었습니다.' : `'${name}' 건물이 추가되었습니다.`);
}

function deleteProperty(id) {
  const p = getData('properties').find(x => x.id === id);
  if (!p) return;
  // 임차인이 등록된 호실이 있으면 삭제 불가
  if (p.rooms && p.rooms.length > 0) {
    const tenants  = getData('tenants');
    const occupied = p.rooms.filter(r =>
      tenants.some(t => t.building === p.name && t.room === r.roomNo && t.name)
    );
    if (occupied.length > 0) {
      showToast(`'${p.name}' 건물의 ${occupied.map(r=>r.roomNo).join(', ')} 호실에 임차인이 등록되어 있습니다. 임차인을 먼저 삭제한 후 건물을 삭제해주세요.`, 'error');
      return;
    }
    showToast(`'${p.name}' 건물에 등록된 동호수(${p.rooms.length}개)가 있습니다. 동호수를 모두 삭제한 후 건물을 삭제해주세요.`, 'error');
    return;
  }
  confirm(`'${p.name}' 건물을 삭제하시겠습니까?`, () => {
    setData('properties', getData('properties').filter(x => x.id !== id));
    renderPropertiesPage();
    showToast('건물이 삭제되었습니다.');
  });
}

function openRoomModal(propId, roomId) {
  document.getElementById('rmPropId').value   = propId;
  document.getElementById('rmRoomId').value   = roomId || '';
  document.getElementById('rmDong').value         = '';
  document.getElementById('rmHosu').value         = '';
  document.getElementById('rmSupplyM2').value     = '';
  document.getElementById('rmSupplyPyeong').value = '';
  document.getElementById('rmExclM2').value       = '';
  document.getElementById('rmExclPyeong').value   = '';
  document.getElementById('rmAcqDate').value  = '';
  document.getElementById('rmAcqPrice').value   = '';
  document.getElementById('rmAcqTax').value     = '';
  document.getElementById('rmAcqFee').value     = '';
  document.getElementById('rmCurPrice').value   = '';
  document.getElementById('rmCurPriceDate').value = '';
  document.getElementById('rmNote').value       = '';
  document.getElementById('roomModalTitle').textContent = roomId ? '동호수 수정' : '동호수 추가';
  if (roomId) {
    const prop = getData('properties').find(x => x.id === propId);
    const room = prop?.rooms?.find(r => r.id === roomId);
    if (room) {
      document.getElementById('rmDong').value             = room.dong || '';
      document.getElementById('rmHosu').value             = room.hosu || room.roomNo || '';
      document.getElementById('rmSupplyPyeong').value = room.supplyPyeong || '';
      document.getElementById('rmExclPyeong').value   = room.exclPyeong   || '';
      // ㎡ 필드: 저장된 값 우선, 없으면 평에서 환산
      document.getElementById('rmSupplyM2').value = room.supplyM2 ||
        (room.supplyPyeong ? (parseFloat(room.supplyPyeong) * 3.3058).toFixed(2) : '');
      document.getElementById('rmExclM2').value   = room.exclM2   ||
        (room.exclPyeong   ? (parseFloat(room.exclPyeong)   * 3.3058).toFixed(2) : '');
      document.getElementById('rmAcqDate').value      = room.acqDate || '';
      document.getElementById('rmAcqPrice').value     = room.acqPrice ? Number(room.acqPrice).toLocaleString() : '';
      document.getElementById('rmAcqTax').value       = room.acqTax   ? Number(room.acqTax).toLocaleString()   : '';
      document.getElementById('rmAcqFee').value       = room.acqFee   ? Number(room.acqFee).toLocaleString()   : '';
      document.getElementById('rmCurPrice').value     = room.curPrice ? Number(room.curPrice).toLocaleString() : '';
      document.getElementById('rmCurPriceDate').value = room.curPriceDate || '';
      document.getElementById('rmNote').value         = room.note || '';
    }
  }
  // 삭제 버튼: 수정 시에만 표시
  const rmDelBtn = document.getElementById('rmDeleteBtn');
  if (rmDelBtn) rmDelBtn.style.display = roomId ? 'inline-flex' : 'none';
  openModal('roomModal');
}

function deleteRoomFromModal() {
  const propId = document.getElementById('rmPropId').value;
  const roomId = document.getElementById('rmRoomId').value;
  if (!roomId) return;

  // 임차인이 등록된 호실은 삭제 불가
  const prop = getData('properties').find(x => x.id === propId);
  const room = prop?.rooms?.find(r => r.id === roomId);
  if (room) {
    const tenant = getData('tenants').find(t => t.building === prop.name && t.room === room.roomNo && t.name);
    if (tenant) {
      showToast(`${room.roomNo} 호실에 임차인(${tenant.name})이 등록되어 있습니다. 임차인을 먼저 삭제한 후 동호수를 삭제해주세요.`, 'error');
      return;
    }
  }

  // 입력된 데이터가 있는지 확인
  const hasData = room && (
    room.acqPrice || room.acqTax || room.acqFee ||
    room.supplyPyeong || room.exclPyeong || room.curPrice ||
    room.acqDate || room.note
  );

  if (hasData) {
    // 1차 확인
    confirm('이 동호수를 삭제하시겠습니까?', () => {
      // 2차 확인 (데이터 있을 때 추가)
      confirm(
        '⚠️ 입력된 정보가 있습니다.\n정말로 삭제하시겠습니까?\n삭제 후에는 복구할 수 없습니다.',
        () => {
          closeModal('roomModal');
          deleteRoom(propId, roomId);
        },
        '정말 삭제',
        'btn-danger'
      );
    }, '삭제', 'btn-danger');
  } else {
    // 데이터 없으면 1차 확인만
    confirm('이 동호수를 삭제하시겠습니까?', () => {
      closeModal('roomModal');
      deleteRoom(propId, roomId);
    });
  }
}

// ============================================================
// 주소 검색 (카카오 우편번호 서비스)
// ============================================================
function setPropAddrDisplay(jibun, road) {
  const span = document.getElementById('propAddrText');
  if (!span) return;
  if (jibun && road) {
    span.innerHTML = jibun
      + ' <span style="color:var(--gray-300);margin:0 6px;">/</span>'
      + ' '
      + road;
  } else if (jibun) {
    span.textContent = jibun;
  }
  span.style.color = 'var(--gray-700)';
}

function searchPropAddress() {
  const wrap = document.getElementById('propDaumWrap');
  if (!wrap) return;

  function doEmbed() {
    wrap.innerHTML = '';
    wrap.style.display = 'block';
    // 모달 스크롤을 embed 위치로 이동
    wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    new daum.Postcode({
      oncomplete: function(data) {
        const jibun = data.jibunAddress || data.autoJibunAddress || data.address || '';
        const road  = data.roadAddress  || data.autoRoadAddress  || '';
        document.getElementById('propAddress').value     = jibun;
        document.getElementById('propRoadAddress').value = road;
        const helper = document.getElementById('propAddrHelper');
        if (helper) helper.innerHTML = '✅ 주소가 입력되었습니다. 필요시 직접 수정하세요.';
        wrap.style.display = 'none';
      },
      onclose: function() {
        wrap.style.display = 'none';
      },
      width:  '100%',
      height: '350px'
    }).embed(wrap, { autoClose: true });
  }

  if (window.daum && window.daum.Postcode) {
    doEmbed();
  } else {
    const s = document.createElement('script');
    s.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    s.onload = doEmbed;
    document.head.appendChild(s);
  }
}


function openKBSearch() {
  const propId  = document.getElementById('rmPropId').value;
  const roomId  = document.getElementById('rmRoomId').value;
  const prop    = getData('properties').find(x => x.id === propId);
  const room    = prop?.rooms?.find(r => r.id === roomId);
  const propName = prop?.name   || '';
  const addr     = prop?.address || '';
  const roomNo   = room?.roomNo || document.getElementById('rmHosu').value || '';
  const exclP    = room?.exclPyeong || document.getElementById('rmExclPyeong').value || '';
  const area     = exclP ? (parseFloat(exclP) * 3.3058).toFixed(1) : (room?.area || '');

  // 조회 대상 정보 표시
  const el = document.getElementById('kbTargetInfo');
  el.innerHTML = [
    propName ? `<span style="font-weight:700;">${propName}</span>` : '',
    roomNo   ? `<span style="background:#fde68a;padding:1px 7px;border-radius:12px;font-size:12px;">${roomNo}</span>` : '',
    addr     ? `<span style="color:#6b7280;font-size:12px;">📍 ${addr}</span>` : '',
    exclP    ? `<span style="color:#6b7280;font-size:12px;">전용 ${exclP}평</span>` : '',
  ].filter(Boolean).join('&nbsp;&nbsp;');

  // 기준일 오늘 날짜 자동입력
  const today = new Date().toISOString().slice(0,10);
  document.getElementById('kbPriceDate').value = today;
  document.getElementById('kbPriceHigh').value = '';
  document.getElementById('kbPriceLow').value  = '';
  document.getElementById('kbCalcPreview').innerHTML = '<span style="color:#9ca3af;">상·하한가를 입력하면 자동 계산됩니다</span>';

  // 이벤트 리스너로 미리보기 업데이트
  ['kbPriceHigh','kbPriceLow','kbApplyType'].forEach(id => {
    document.getElementById(id).oninput = updateKBPreview;
    document.getElementById(id).onchange = updateKBPreview;
  });

  // KB 모달 열기 (roomModal 위에 겹쳐서 표시)
  document.getElementById('kbModal').classList.add('open');
  // 검색 키워드 저장 (사이트 오픈용)
  document.getElementById('kbModal').dataset.propName = propName;
  document.getElementById('kbModal').dataset.addr     = addr;
  document.getElementById('kbModal').dataset.roomNo   = roomNo;
}

function kbOpenSite(type) {
  const modal   = document.getElementById('kbModal');
  const propName = modal.dataset.propName || '';
  const addr     = modal.dataset.addr     || '';
  const roomNo   = modal.dataset.roomNo   || '';
  const q = encodeURIComponent(propName || addr);

  if (type === 'kb') {
    // KB Land 단지 시세 검색
    window.open(`https://kbland.kr/map?sel=apt&q=${q}`, '_blank');
  } else {
    // 국토부 실거래가 조회 (지역 기반)
    window.open(`https://rt.molit.go.kr/new/gis/getAllMapView.do?menuGubun=APT&searchGubun=APT&searchWord=${q}`, '_blank');
  }
}

function updateKBPreview() {
  const high = Number((document.getElementById('kbPriceHigh').value || '').replace(/,/g,'')) || 0;
  const low  = Number((document.getElementById('kbPriceLow').value  || '').replace(/,/g,'')) || 0;
  const type = document.getElementById('kbApplyType').value;
  const prev = document.getElementById('kbCalcPreview');
  if (!high && !low) {
    prev.innerHTML = '<span style="color:#9ca3af;">상·하한가를 입력하면 자동 계산됩니다</span>';
    return;
  }
  let applied = 0, label = '';
  if (type === 'high') { applied = high; label = '상한가'; }
  else if (type === 'low')  { applied = low;  label = '하한가'; }
  else { applied = Math.round((high + low) / 2); label = '평균'; }
  prev.innerHTML = `적용 금액 (${label}): <strong style="font-size:15px;">${applied.toLocaleString()}만원</strong>` +
    (high && low ? ` &nbsp;<span style="color:#6b7280;font-size:11px;">(${low.toLocaleString()} ~ ${high.toLocaleString()})</span>` : '');
}


function applyKBPrice() {
  const high = Number((document.getElementById('kbPriceHigh').value || '').replace(/,/g,'')) || 0;
  const low  = Number((document.getElementById('kbPriceLow').value  || '').replace(/,/g,'')) || 0;
  const type = document.getElementById('kbApplyType').value;
  const date = document.getElementById('kbPriceDate').value;
  let applied = 0;
  if (type === 'high') applied = high;
  else if (type === 'low') applied = low;
  else applied = Math.round((high + low) / 2);

  if (!applied) { showToast('시세를 입력해주세요.', 'error'); return; }

  document.getElementById('rmCurPrice').value     = applied.toLocaleString();
  document.getElementById('rmCurPriceDate').value = date;
  closeModal('kbModal');
  showToast(`현재 가치 ${applied.toLocaleString()}만원이 적용됐습니다.`);
}

function updateRoomPreview() {
  const dong  = (document.getElementById('rmDong')?.value  || '').trim();
  const hosu  = (document.getElementById('rmHosu')?.value  || '').trim();
  const prev  = document.getElementById('rmRoomPreview');
  if (!prev) return;
  if (!dong && !hosu) {
    prev.innerHTML = '<span style="color:var(--gray-400);">자동 조합 미리보기</span>';
  } else {
    const label = dong ? `${dong}동 ${hosu}호` : (hosu ? `${hosu}호` : '');
    prev.textContent = label;
  }
}

function buildRoomNo(dong, hosu) {
  dong = (dong || '').trim().replace(/동+$/, '');   // '102동' → '102'
  hosu = (hosu || '').trim().replace(/호+$/, '');   // '1405호' → '1405'
  if (dong && hosu) return `${dong}동 ${hosu}호`;
  if (hosu) return `${hosu}호`;
  return dong;
}

function saveRoom() {
  const dong   = document.getElementById('rmDong').value.trim();
  const hosu   = document.getElementById('rmHosu').value.trim();
  if (!hosu) { showToast('호수를 입력해주세요.', 'error'); return; }
  const roomNo = buildRoomNo(dong, hosu);
  const props  = getData('properties');
  const propId = document.getElementById('rmPropId').value;
  const roomId = document.getElementById('rmRoomId').value;
  const prop   = props.find(x => x.id === propId);
  if (!prop) return;
  if (!prop.rooms) prop.rooms = [];
  const obj = {
    id: roomId || uid(), dong, hosu, roomNo,
    supplyM2:     document.getElementById('rmSupplyM2').value.trim(),
    supplyPyeong: document.getElementById('rmSupplyPyeong').value.trim(),
    exclM2:       document.getElementById('rmExclM2').value.trim(),
    exclPyeong:   document.getElementById('rmExclPyeong').value.trim(),
    area: document.getElementById('rmExclM2').value.trim() ||
          (() => { const v = parseFloat(document.getElementById('rmExclPyeong').value); return v > 0 ? (v * 3.3058).toFixed(2) : ''; })(),
    acqDate:  document.getElementById('rmAcqDate').value.trim(),
    acqPrice:     Number(document.getElementById('rmAcqPrice').value.replace(/,/g,''))   || 0,
    acqTax:       Number(document.getElementById('rmAcqTax').value.replace(/,/g,''))     || 0,
    acqFee:       Number(document.getElementById('rmAcqFee').value.replace(/,/g,''))     || 0,
    curPrice:     Number(document.getElementById('rmCurPrice').value.replace(/,/g,''))   || 0,
    curPriceDate: document.getElementById('rmCurPriceDate').value.trim(),
    note:         document.getElementById('rmNote').value
  };
  if (roomId) {
    const idx = prop.rooms.findIndex(r => r.id === roomId);
    if (idx >= 0) prop.rooms[idx] = obj;
  } else {
    prop.rooms.push(obj);
  }
  setData('properties', props);
  closeModal('roomModal');
  renderPropertiesPage();
  // 작업한 건물 드롭다운 다시 열기
  setTimeout(() => { const b = document.getElementById('propRooms_'+propId); if(b){ b.style.display='block'; const a=document.getElementById('propArrow_'+propId); if(a) a.style.transform='rotate(90deg)'; } }, 0);
  showToast(roomId ? '동호수 정보가 수정되었습니다.' : `'${roomNo}' 동호수가 추가되었습니다.`);
}

function deleteRoom(propId, roomId) {
  const props = getData('properties');
  const prop  = props.find(x => x.id === propId);
  const room  = prop?.rooms?.find(r => r.id === roomId);
  confirm(`'${room?.roomNo}' 동호수를 삭제하시겠습니까?`, () => {
    prop.rooms = prop.rooms.filter(r => r.id !== roomId);
    setData('properties', props);
    renderPropertiesPage();
    // 작업한 건물 드롭다운 다시 열기
    setTimeout(() => { const b = document.getElementById('propRooms_'+propId); if(b){ b.style.display='block'; const a=document.getElementById('propArrow_'+propId); if(a) a.style.transform='rotate(90deg)'; } }, 0);
    showToast('동호수가 삭제되었습니다.');
  });
}

// ============================================================
// 임대차 등록 페이지 (소유부동산 드롭다운 연동)
// ============================================================
function initRegisterPage() {
  populateBuildingDropdown();
  if (_editingTenantId) {
    prefillRegisterForm(_editingTenantId);
  } else {
    clearRegisterForm();
  }
  const props = getData('properties');
  const alert = document.getElementById('regNoPropAlert');
  if (alert) alert.style.display = props.length === 0 ? 'flex' : 'none';
}

// ── 입력 자동 포맷 함수 ──────────────────────────────────
function fmtPhone(el) {
  const v = el.value.replace(/\D/g, '').slice(0, 11);
  if (v.length === 0) { el.value = ''; return; }
  // 02 지역번호: 02-XXX-XXXX (9자리) 또는 02-XXXX-XXXX (10자리)
  if (v.startsWith('02')) {
    if (v.length <= 2)       el.value = v;
    else if (v.length <= 5)  el.value = v.slice(0,2) + '-' + v.slice(2);
    else if (v.length <= 9)  el.value = v.slice(0,2) + '-' + v.slice(2,5) + '-' + v.slice(5);
    else                     el.value = v.slice(0,2) + '-' + v.slice(2,6) + '-' + v.slice(6);
  }
  // 휴대폰·일반 3자리 지역번호: 11자리 → 010-XXXX-XXXX, 10자리 → 0XX-XXX-XXXX
  else if (v.length <= 10)   el.value = v.slice(0,3) + (v.length>3?'-':'') + v.slice(3,6) + (v.length>6?'-':'') + v.slice(6);
  else                       el.value = v.slice(0,3) + '-' + v.slice(3,7) + '-' + v.slice(7);
}

// 평 입력 → ㎡ 환산 힌트 표시
// 면적 자동 환산 (1평 = 3.3058㎡)
function syncArea(type, from) {
  const RATE   = 3.3058;
  const m2El     = document.getElementById(type === 'supply' ? 'rmSupplyM2'     : 'rmExclM2');
  const pyeongEl = document.getElementById(type === 'supply' ? 'rmSupplyPyeong' : 'rmExclPyeong');
  if (!m2El || !pyeongEl) return;
  if (from === 'm2') {
    const v = parseFloat(m2El.value);
    pyeongEl.value = v > 0 ? (v / RATE).toFixed(2) : '';
  } else {
    const v = parseFloat(pyeongEl.value);
    m2El.value = v > 0 ? (v * RATE).toFixed(2) : '';
  }
}
// 구 버전 호환 (호출부 잔재 대비)
function updateAreaHint() {}

function normalizeApprovalDate(val) {
  const d = val.replace(/\D/g, '');
  if (d.length === 8) return d.slice(0,4) + '-' + d.slice(4,6) + '-' + d.slice(6);
  return val;
}

function fmtApprovalDate(el) {
  // 숫자만 추출
  const digits = el.value.replace(/\D/g, '').slice(0, 8);
  let out = digits;
  if (digits.length > 4 && digits.length <= 6) {
    out = digits.slice(0,4) + '-' + digits.slice(4);
  } else if (digits.length > 6) {
    out = digits.slice(0,4) + '-' + digits.slice(4,6) + '-' + digits.slice(6);
  }
  el.value = out;
}

function fmtComma(el) {
  const raw = el.value.replace(/[^\d]/g, '');
  el.value = raw ? Number(raw).toLocaleString() : '';
}

function fmtIsoDate(el) {
  const d = el.value.replace(/[^\d]/g, '').slice(0, 8);
  let v = d;
  if (d.length > 4) v = d.slice(0,4) + '-' + d.slice(4);
  if (d.length > 6) v = d.slice(0,4) + '-' + d.slice(4,6) + '-' + d.slice(6);
  el.value = v;
  // 계약 시작일 변경 시 만기일 자동 계산
  if (el.id === 'regContractStart') calcContractEnd();
}

function parseKorDate(str) {
  const d = str.replace(/[^\d]/g, '');
  if (d.length === 8) return d.slice(0,4) + '-' + d.slice(4,6) + '-' + d.slice(6,8);
  return str.includes('-') ? str : str; // already YYYY-MM-DD or raw
}

function calcContractEnd() {
  const dur = document.getElementById('regContractDur')?.value;
  if (!dur || dur === '기타') return;
  const startVal = document.getElementById('regContractStart').value.replace(/[^\d]/g,'');
  if (startVal.length < 8) return;
  const y = parseInt(startVal.slice(0,4));
  const m = parseInt(startVal.slice(4,6));
  const dd = parseInt(startVal.slice(6,8));
  const years = parseInt(dur);
  // 만기일 = 시작일 기준 N년 후 -1일
  const endDate = new Date(y + years, m - 1, dd - 1);
  const ey = endDate.getFullYear();
  const em = String(endDate.getMonth()+1).padStart(2,'0');
  const ed = String(endDate.getDate()).padStart(2,'0');
  const endEl = document.getElementById('regContractEnd');
  if (endEl) endEl.value = `${ey}-${em}-${ed}`;
}

function onContractDurChange() {
  const dur = document.getElementById('regContractDur').value;
  const endWrap = document.getElementById('regContractEndWrap');
  if (dur === '기타') {
    endWrap.style.display = 'block';
    document.getElementById('regContractEnd').value = '';
  } else {
    endWrap.style.display = 'none';
    calcContractEnd();
  }
}

function fmtDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// 계약 연장 버튼: 기존 계약 기간을 자동 감지하여 동일 기간 연장 (확인 후 반영)
function extendContract() {
  const startVal = document.getElementById('regContractStart').value;
  const endVal   = document.getElementById('regContractEnd').value;
  const startDig = startVal.replace(/[^\d]/g, '');
  const endDig   = endVal.replace(/[^\d]/g, '');

  if (startDig.length < 8 || endDig.length < 8) {
    showToast('계약 시작일과 종료일을 먼저 입력해주세요.', 'error');
    return;
  }

  const startDate = new Date(+startDig.slice(0,4), +startDig.slice(4,6)-1, +startDig.slice(6,8));
  const endDate   = new Date(+endDig.slice(0,4),   +endDig.slice(4,6)-1,   +endDig.slice(6,8));

  // 기존 계약 기간(일수) 계산 후 연장 단위 결정
  const durationDays = Math.round((endDate - startDate) / 86400000) + 1;
  const extendYears  = durationDays <= 400 ? 1 : 2;

  // 새 계약시작일 = 기존 종료일 + 1일
  const newStart = new Date(endDate);
  newStart.setDate(newStart.getDate() + 1);

  // 새 계약종료일 = 새 시작일 + N년 - 1일
  const newEnd = new Date(newStart.getFullYear() + extendYears, newStart.getMonth(), newStart.getDate() - 1);

  const newStartStr = fmtDateStr(newStart);
  const newEndStr   = fmtDateStr(newEnd);

  // 확인 팝업 → 승인 시 날짜 반영
  confirm(
    `${extendYears}년 연장 후 계약기간을\n${newStartStr} ~ ${newEndStr}\n으로 반영할까요?`,
    () => {
      // ── 연장 전 계약 조건을 히스토리에 스냅샷 저장 ──
      const tid = _editingTenantId;
      if (tid) {
        const tenants = getData('tenants');
        const t = tenants.find(x => x.id === tid);
        if (t && t.name) {
          const prop = getData('properties').find(p => p.name === t.building);
          const rm   = (prop?.rooms||[]).find(r => String(r.roomNo) === String(t.room));
          const extNo = (t.extendCount || 0) + 1;
          const history = loadAllHistory();
          history.push({
            id: uid(), originalId: t.id,
            building: t.building, dong: rm?.dong || '', room: t.room,
            name: t.name, phone: t.phone,
            type: t.type || '월세',
            deposit: t.deposit, rent: t.rent, management: t.management,
            payDay: t.payDay, payType: t.payType,
            contractStart: t.contractStart, contractEnd: t.contractEnd,
            moveIn: t.moveIn, extendCount: t.extendCount || 0,
            note: (t.note ? t.note + '\n' : '') + `[${extNo}차 연장 전 계약]`,
            archivedAt: today(),
            reason: 'extension'
          });
          saveHistory(history);
          // 연장 횟수 즉시 반영
          const idx = tenants.findIndex(x => x.id === tid);
          tenants[idx] = { ...tenants[idx], extendCount: extNo };
          setData('tenants', tenants);
        }
      }

      // 최초 계약일 고정 (첫 연장 시만 현재 시작일로 설정)
      const origStartEl   = document.getElementById('regOrigStart');
      const origStartWrap = document.getElementById('regOrigStartWrap');
      const wrapVisible   = origStartWrap && origStartWrap.style.display !== 'none';
      if (!wrapVisible && origStartEl) origStartEl.value = startVal;
      if (origStartWrap) origStartWrap.style.display = 'block';

      document.getElementById('regContractStart').value = newStartStr;
      document.getElementById('regContractEnd').value   = newEndStr;
      updatePayDateDisplay();
      showToast(`${extendYears}년 연장 반영됐습니다. (${newStartStr} ~ ${newEndStr})`);
    },
    '반영',
    'btn-primary'
  );
}

// 전세/월세 선택 변경 시 관련 필드 표시 제어
function onLeaseTypeChange() {
  const leaseType    = document.getElementById('regLeaseType')?.value || '월세';
  const rentWrap     = document.getElementById('regRentWrap');
  const mgmtWrap     = document.getElementById('regMgmtWrap');
  const payTypeWrap  = document.getElementById('regPayTypeWrap');
  const isJeonse     = leaseType === '전세';
  // 월세·관리비 표시 제어 (전세만 숨김, 반전세·월세는 표시)
  if (rentWrap)    rentWrap.style.display    = isJeonse ? 'none' : 'block';
  if (mgmtWrap)    mgmtWrap.style.display    = isJeonse ? 'none' : 'block';
  // 선불/후불·납부일 표시 제어
  if (payTypeWrap) payTypeWrap.style.display = isJeonse ? 'none' : 'block';
  // 전세 선택 시 월세·관리비 값 초기화
  if (isJeonse) {
    const rentEl = document.getElementById('regRent');
    const mgmtEl = document.getElementById('regManagement');
    if (rentEl) rentEl.value = '';
    if (mgmtEl) mgmtEl.value = '';
  }
  updatePayDateDisplay();
}

// 계약기간 선택 → 종료일 자동 계산
function autoCalcEndDate() {
  const period = document.getElementById('regContractPeriod')?.value;
  const endEl  = document.getElementById('regContractEnd');
  if (!endEl) return;
  // 기타(0) 또는 미선택: 종료일 직접 입력 가능
  if (!period || period === '0') {
    endEl.readOnly = false;
    endEl.style.background = '';
    endEl.style.color = '';
    return;
  }
  // 1년 / 2년: 시작일 기준 자동 계산 (n년 후 -1일)
  const startVal = document.getElementById('regContractStart')?.value || '';
  const m = startVal.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return; // 시작일 미입력 시 대기
  const years   = parseInt(period, 10);
  const endDate = new Date(+m[1], +m[2] - 1, +m[3]);
  endDate.setFullYear(endDate.getFullYear() + years);
  endDate.setDate(endDate.getDate() - 1);
  const yy = endDate.getFullYear();
  const mm = String(endDate.getMonth() + 1).padStart(2, '0');
  const dd = String(endDate.getDate()).padStart(2, '0');
  endEl.value    = `${yy}-${mm}-${dd}`;
  endEl.readOnly = true;
  endEl.style.background = '#f3f4f6';
  endEl.style.color      = '#6b7280';
  updatePayDateDisplay();
}

// 납부일 표시: 선불=계약시작일의 일, 후불=계약종료일의 일 → "매월 N일"
function updatePayDateDisplay() {
  const leaseType = document.getElementById('regLeaseType')?.value || '월세';
  const display   = document.getElementById('regPayDateDisplay');
  if (!display) return;
  if (leaseType === '전세') { display.textContent = '-'; return; }
  const payType = document.getElementById('regPayType')?.value || '선불';
  const dateVal = payType === '선불'
    ? (document.getElementById('regContractStart')?.value || '')
    : (document.getElementById('regContractEnd')?.value  || '');
  const m = dateVal.match(/(\d{4})-(\d{2})-(\d{2})/);
  display.textContent = m ? `매월 ${parseInt(m[3], 10)}일` : '-';
}

function clearRegisterForm() {
  _editingTenantId = null;
  ['regName','regPhone','regDeposit','regRent','regManagement',
   'regContractStart','regContractEnd','regNote'].forEach(f => {
    const el = document.getElementById(f);
    if (el) el.value = '';
  });
  const payTypeEl = document.getElementById('regPayType');
  if (payTypeEl) payTypeEl.value = '선불';
  // 계약기간 선택 초기화 + 종료일 readonly 해제
  const periodEl = document.getElementById('regContractPeriod');
  if (periodEl) periodEl.value = '';
  const endElReset = document.getElementById('regContractEnd');
  if (endElReset) { endElReset.readOnly = false; endElReset.style.background = ''; endElReset.style.color = ''; }
  // 전세/월세 리셋
  const leaseTypeEl = document.getElementById('regLeaseType');
  if (leaseTypeEl) leaseTypeEl.value = '월세';
  const rentWrap = document.getElementById('regRentWrap');
  if (rentWrap) rentWrap.style.display = 'block';
  const mgmtWrap = document.getElementById('regMgmtWrap');
  if (mgmtWrap) mgmtWrap.style.display = 'block';
  const payTypeWrap = document.getElementById('regPayTypeWrap');
  if (payTypeWrap) payTypeWrap.style.display = 'block';
  // 계약연장·삭제 버튼 초기화
  const extBtn2 = document.getElementById('regExtendBtn');
  if (extBtn2) extBtn2.style.display = 'none';
  // 입금일자 리셋
  const pd = document.getElementById('regPayDateDisplay');
  if (pd) pd.textContent = '-';
  populateBuildingDropdown();
  const titleEl = document.getElementById('regCardTitle');
  if (titleEl) titleEl.textContent = '➕ 임대차 등록';
  const saveBtn = document.getElementById('regSaveBtn');
  if (saveBtn) saveBtn.textContent = '💾 등록 저장';
  const delBtn = document.getElementById('regDeleteBtn');
  if (delBtn) delBtn.style.display = 'none';
}

function openRegisterModal() {
  _editingTenantId = null;
  clearRegisterForm();
  const props = getData('properties');
  const alert = document.getElementById('regNoPropAlert');
  if (alert) alert.style.display = props.length === 0 ? 'flex' : 'none';
  // 신규 등록: 초기화 표시, 취소 숨김
  const resetBtn  = document.getElementById('regResetBtn');
  const cancelBtn = document.getElementById('regCancelBtn');
  if (resetBtn)  resetBtn.style.display  = 'inline-flex';
  if (cancelBtn) cancelBtn.style.display = 'none';
  openModal('registerModal');
}

function openRegisterEdit(id) {
  _editingTenantId = id;
  populateBuildingDropdown();
  prefillRegisterForm(id);
  const alert = document.getElementById('regNoPropAlert');
  if (alert) alert.style.display = 'none';
  const delBtn = document.getElementById('regDeleteBtn');
  // 계약관리 페이지에서 열면: 삭제 숨김, 계약연장 버튼 표시
  if (delBtn) delBtn.style.display = currentPage === 'contracts' ? 'none' : 'inline-flex';
  const extBtn = document.getElementById('regExtendBtn');
  if (extBtn) extBtn.style.display = currentPage === 'contracts' ? 'inline-flex' : 'none';
  const contractEndBtn = document.getElementById('regContractEndBtn');
  if (contractEndBtn) contractEndBtn.style.display = currentPage === 'contracts' ? 'inline-flex' : 'none';
  // 수정 모드: 초기화 숨김, 취소 표시
  const resetBtn  = document.getElementById('regResetBtn');
  const cancelBtn = document.getElementById('regCancelBtn');
  if (resetBtn)  resetBtn.style.display  = 'none';
  if (cancelBtn) cancelBtn.style.display = 'inline-flex';
  openModal('registerModal');
  // 모달이 화면에 렌더된 뒤 특이사항 높이 재계산
  setTimeout(() => {
    const n = document.getElementById('regNote');
    if (n) { n.style.height = 'auto'; n.style.height = n.scrollHeight + 'px'; }
  }, 0);
}

function prefillRegisterForm(id) {
  const t = getData('tenants').find(x => x.id === id);
  if (!t) { clearRegisterForm(); return; }

  // 카드 타이틀·버튼 변경
  const titleEl = document.getElementById('regCardTitle');
  if (titleEl) titleEl.textContent = `✏️ 임차인 수정: ${t.building || ''} ${t.room || ''}`.trimEnd();
  const saveBtn = document.getElementById('regSaveBtn');
  if (saveBtn) saveBtn.textContent = '💾 수정 저장';

  // 건물 선택 후 호실 목록 로드
  const buildingSel = document.getElementById('regBuilding');
  if (buildingSel) {
    buildingSel.value = t.building || '';
    onRegBuildingChange();
  }
  // 호실 선택 (드롭다운 옵션이 채워진 뒤)
  setTimeout(() => {
    const roomSel = document.getElementById('regRoom');
    if (roomSel) roomSel.value = t.room || '';
  }, 0);


  // 임차인명 / 연락처
  const nameEl = document.getElementById('regName');
  if (nameEl) nameEl.value = t.name || '';
  const phoneEl = document.getElementById('regPhone');
  if (phoneEl) phoneEl.value = t.phone || '';

  // 보증금 (콤마 포맷)
  const depEl = document.getElementById('regDeposit');
  if (depEl) depEl.value = t.deposit ? Number(t.deposit).toLocaleString() : '';

  // 월세 / 관리비
  const rentEl = document.getElementById('regRent');
  if (rentEl) rentEl.value = t.rent ? Number(t.rent).toLocaleString() : '';
  const mgmtEl = document.getElementById('regManagement');
  if (mgmtEl) mgmtEl.value = t.management ? Number(t.management).toLocaleString() : '';

  // 선불후불
  const payTypeEl = document.getElementById('regPayType');
  if (payTypeEl) payTypeEl.value = t.payType || '선불';

  // 전세/월세 유형 (t.type: '전세' 또는 '월세')
  const leaseTypeEl2 = document.getElementById('regLeaseType');
  if (leaseTypeEl2) {
    leaseTypeEl2.value = (t.type === '전세' || t.type === '반전세' || t.type === '월세') ? t.type : '월세';
    onLeaseTypeChange();
  }

  // 계약 시작일
  const startEl = document.getElementById('regContractStart');
  if (startEl) startEl.value = t.contractStart || '';

  // 계약 종료일 (수정 모드: 편집 가능, 기간 선택 '기타'로 초기화)
  const endEl2 = document.getElementById('regContractEnd');
  if (endEl2) {
    endEl2.value    = t.contractEnd || '';
    endEl2.readOnly = false;
    endEl2.style.background = '';
    endEl2.style.color      = '';
  }
  // 기간 선택: 시작~종료일 차이로 1년/2년 자동 감지, 그 외 기타
  const periodEl2 = document.getElementById('regContractPeriod');
  if (periodEl2 && t.contractStart && t.contractEnd) {
    const s = new Date(t.contractStart), e = new Date(t.contractEnd);
    const diffDays = Math.round((e - s) / 86400000) + 1;
    if (diffDays >= 364 && diffDays <= 366)      periodEl2.value = '1';
    else if (diffDays >= 729 && diffDays <= 731) periodEl2.value = '2';
    else                                          periodEl2.value = '0'; // 기타
  } else if (periodEl2) {
    periodEl2.value = '';
  }


  // 입금일자 표시 업데이트
  updatePayDateDisplay();

  // 특이사항 (내용에 맞춰 높이 자동 조절)
  const noteEl = document.getElementById('regNote');
  if (noteEl) {
    noteEl.value = t.note || '';
    noteEl.style.height = 'auto';
    noteEl.style.height = noteEl.scrollHeight + 'px';
  }
}

function populateBuildingDropdown() {
  const props = getData('properties');
  const sel   = document.getElementById('regBuilding');
  if (!sel) return;
  sel.innerHTML = '<option value="">-- 건물 선택 --</option>' +
    props.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
  const roomSel = document.getElementById('regRoom');
  if (roomSel) roomSel.innerHTML = '<option value="">-- 건물 먼저 선택 --</option>';
}

function onRegBuildingChange() {
  const buildingName = document.getElementById('regBuilding').value;
  const roomSel      = document.getElementById('regRoom');
  if (!roomSel) return;
  if (!buildingName) {
    roomSel.innerHTML = '<option value="">-- 건물 먼저 선택 --</option>';
    return;
  }
  const prop = getData('properties').find(p => p.name === buildingName);
  const rooms = prop?.rooms || [];
  if (rooms.length === 0) {
    roomSel.innerHTML = '<option value="">-- 등록된 호실 없음 --</option>';
  } else {
    roomSel.innerHTML = '<option value="">-- 호실 선택 --</option>' +
      rooms.map(r => `<option value="${r.roomNo}">${r.roomNo}${r.exclPyeong ? ' (전용 ' + r.exclPyeong + '평)' : r.area ? ' (' + r.area + '㎡)' : ''}</option>`).join('');
  }
}

function saveRegisterTenant() {
  const building = document.getElementById('regBuilding').value;
  let   room     = document.getElementById('regRoom').value.trim();
  const name     = document.getElementById('regName').value.trim();
  if (!building) { showToast('건물을 선택해주세요.', 'error'); return; }
  // 수정 모드에서 호실 드롭다운이 비어있으면 저장된 기존 값 사용
  if (!room && _editingTenantId) {
    const existing = getData('tenants').find(t => t.id === _editingTenantId);
    if (existing?.room) room = existing.room;
  }
  if (!room) { showToast('호실을 선택해주세요.', 'error'); return; }
  const deposit = Number(document.getElementById('regDeposit').value.replace(/,/g,'')) || 0;
  const rent    = Number(document.getElementById('regRent').value.replace(/,/g,'')) || 0;
  // 임대유형: regLeaseType 선택값 사용
  const type   = document.getElementById('regLeaseType')?.value || (rent > 0 ? '월세' : deposit > 0 ? '전세' : '월세');
  // 상태 자동 결정: 임차인명 + 계약시작일 있으면 입주, 없으면 공실
  const contractStart = document.getElementById('regContractStart').value;
  const status = (name && contractStart) ? '입주' : '공실';
  const tenants = getData('tenants');
  const fields = {
    building, room, name,
    phone: document.getElementById('regPhone').value,
    deposit, rent,
    management: Number(document.getElementById('regManagement').value.replace(/,/g,'')) || 0,
    payDay: (() => {
      // 선불: 계약시작일의 일(day), 후불: 계약종료일의 일(day)
      const pt = document.getElementById('regPayType')?.value || '선불';
      const dateStr = pt === '선불'
        ? (document.getElementById('regContractStart')?.value || '')
        : (document.getElementById('regContractEnd')?.value || '');
      const m = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
      return m ? parseInt(m[3], 10) : 5;
    })(),
    payType: document.getElementById('regPayType')?.value || '선불',
    contractStart,
    contractEnd: document.getElementById('regContractEnd').value,
    moveIn: contractStart,
    type, status,
    note: document.getElementById('regNote').value
  };
  if (_editingTenantId) {
    const idx = tenants.findIndex(t => t.id === _editingTenantId);
    if (idx !== -1) {
      fields.extendCount = tenants[idx].extendCount || 0;
      tenants[idx] = { ...tenants[idx], ...fields };
      setData('tenants', tenants);
      _editingTenantId = null;
      updateBadges();
      closeModal('registerModal');
      showToast('임대차 정보가 수정되었습니다.');
      if (currentPage === 'tenants') renderTenants();
      else if (currentPage === 'contracts') renderContracts();
    } else {
      showToast('수정할 데이터를 찾을 수 없습니다.', 'error');
    }
  } else {
    tenants.push({ id: uid(), ...fields });
    setData('tenants', tenants);
    updateBadges();
    closeModal('registerModal');
    showToast('임대차 정보가 등록되었습니다.');
    if (currentPage === 'tenants') renderTenants();
  }
}

function deleteTenant(id) {
  const t = getData('tenants').find(x => x.id === id);
  if (!t) return;
  confirm('"' + fmtRoom(t.room) + ' ' + t.name + '" 임차인을 삭제하시겠습니까?\n관련 수납 데이터도 함께 삭제됩니다.', () => {
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
  confirm('"' + fmtRoom(t.room) + ' ' + t.name + '" 임차인을 삭제하시겠습니까?\n관련 수납 데이터도 함께 삭제됩니다.', () => {
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
