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

// ============================================================
// EXPENSES
// ============================================================
function fillExpDongHosu(buildingName, selDong, selHosu) {
  const props = getData('properties');
  const prop  = props.find(p => p.name === buildingName);
  const rooms = prop?.rooms || [];
  const dongs = [...new Set(rooms.map(r => r.dong||'').filter(Boolean))].sort();
  const dongEl  = document.getElementById('eDong');
  const hosuEl  = document.getElementById('eHosu');
  dongEl.innerHTML  = '<option value="">-</option>' + dongs.map(d=>`<option value="${d}">${d}</option>`).join('');
  hosuEl.innerHTML  = '<option value="">-</option>';
  if (selDong) dongEl.value = selDong;
  const filteredRooms = dongEl.value ? rooms.filter(r => (r.dong||'') === dongEl.value) : rooms;
  filteredRooms.sort((a,b)=>String(a.roomNo||'').localeCompare(String(b.roomNo||''),'ko'));
  hosuEl.innerHTML = '<option value="">-</option>' + filteredRooms.map(r=>`<option value="${r.hosu||r.roomNo}">${r.hosu ? r.hosu+'호' : r.roomNo}</option>`).join('');
  if (selHosu) hosuEl.value = selHosu;
}
function onExpBuildingChange() { fillExpDongHosu(document.getElementById('eBuilding').value, '', ''); }
function onExpDongChange() { fillExpDongHosu(document.getElementById('eBuilding').value, document.getElementById('eDong').value, ''); }

function openExpenseModal(id) {
  const bSel = document.getElementById('eBuilding');
  bSel.innerHTML = '<option value="">공통 / 전체</option>';
  getData('properties').forEach(p => { const opt = document.createElement('option'); opt.value = p.name; opt.textContent = p.name; bSel.appendChild(opt); });
  document.getElementById('expenseModalTitle').textContent = id ? '지출 수정' : '지출 추가';
  document.getElementById('expDeleteBtn').style.display = id ? 'inline-flex' : 'none';
  document.getElementById('expenseId').value = '';
  document.getElementById('eDate').value = today();
  document.getElementById('eAmount').value = '';
  document.getElementById('eCategory').value = '중개수수료';
  document.getElementById('eBuilding').value = '';
  document.getElementById('eDong').innerHTML = '<option value="">-</option>';
  document.getElementById('eHosu').innerHTML = '<option value="">-</option>';
  document.getElementById('eMemo').value = '';
  if (id) {
    const e = getData('expenses').find(x => x.id === id);
    if (e) {
      document.getElementById('expenseId').value = e.id;
      document.getElementById('eDate').value = e.date || '';
      document.getElementById('eAmount').value = e.amount ? Number(e.amount).toLocaleString() : '';
      document.getElementById('eCategory').value = e.category || '기타';
      document.getElementById('eBuilding').value = e.building || '';
      fillExpDongHosu(e.building||'', e.dong||'', e.hosu||'');
      document.getElementById('eMemo').value = e.memo || '';
    }
  }
  openModal('expenseModal');
}

function deleteExpenseFromModal() {
  const id = document.getElementById('expenseId').value;
  if (!id) return;
  confirm('이 지출 항목을 삭제하시겠습니까?', () => {
    setData('expenses', getData('expenses').filter(e=>e.id!==id));
    closeModal('expenseModal');
    renderExpensesPage();
    showToast('삭제되었습니다.');
  });
}

function saveExpense() {
  const date = document.getElementById('eDate').value;
  const amount = document.getElementById('eAmount').value;
  if (!date || !amount) { showToast('날짜와 금액을 입력해주세요.', 'error'); return; }
  const expenses = getData('expenses');
  const id = document.getElementById('expenseId').value;
  const obj = {
    id: id || uid(), date, amount: Number(amount.replace(/,/g,'')),
    category: document.getElementById('eCategory').value,
    building: document.getElementById('eBuilding').value,
    dong:     document.getElementById('eDong').value,
    hosu:     document.getElementById('eHosu').value,
    memo:     document.getElementById('eMemo').value
  };
  if (id) { const idx = expenses.findIndex(e=>e.id===id); expenses[idx]=obj; } else expenses.push(obj);
  setData('expenses', expenses);
  closeModal('expenseModal');
  if (document.getElementById('page-expenses').classList.contains('active')) renderExpensesPage();
  else renderAnalytics();
  showToast('지출이 저장되었습니다.');
}

function deleteExpense(id) {
  confirm('이 지출 항목을 삭제하시겠습니까?', () => {
    setData('expenses', getData('expenses').filter(e=>e.id!==id));
    if (document.getElementById('page-expenses').classList.contains('active')) renderExpensesPage();
    else renderAnalytics();
    showToast('삭제되었습니다.');
  });
}

let expSelectedYear = new Date().getFullYear();
let expSortKey = 'date';
let expSortDir = 'desc';

function sortExpenses(key) {
  if (expSortKey === key) expSortDir = expSortDir === 'asc' ? 'desc' : 'asc';
  else { expSortKey = key; expSortDir = key === 'amount' ? 'desc' : 'asc'; }
  renderExpensesPage();
}
function changeExpYear(delta) { expSelectedYear += delta; renderExpensesPage(); }

function renderExpensesPage() {
  const allExpenses = getData('expenses');
  const properties  = getData('properties');
  const curYear     = new Date().getFullYear();
  const yearLabel = document.getElementById('expYearLabel');
  if (yearLabel) yearLabel.textContent = expSelectedYear + '년';
  const usedYears = [...new Set(allExpenses.map(e=>parseInt(e.date?.slice(0,4))).filter(Boolean))];
  const minY = usedYears.length ? Math.min(...usedYears) : curYear;
  const prevBtn = document.getElementById('expPrevBtn');
  const nextBtn = document.getElementById('expNextBtn');
  if (prevBtn) prevBtn.disabled = expSelectedYear <= minY;
  if (nextBtn) nextBtn.disabled = expSelectedYear >= curYear + 1;
  const bSel = document.getElementById('expFilterBuilding');
  const curB = bSel ? bSel.value : '';
  if (bSel) {
    bSel.innerHTML = '<option value="">전체 건물</option>';
    properties.forEach(p => { const opt = document.createElement('option'); opt.value = p.name; opt.textContent = p.name; bSel.appendChild(opt); });
    bSel.value = curB;
  }
  const filterB = bSel ? bSel.value : '';
  let filtered = allExpenses.filter(e => e.date?.startsWith(String(expSelectedYear)));
  if (filterB) filtered = filtered.filter(e => e.building === filterB);
  filtered.sort((a,b) => {
    let va, vb;
    if (expSortKey==='date') { va=a.date||''; vb=b.date||''; }
    else if (expSortKey==='category') { va=a.category||''; vb=b.category||''; }
    else if (expSortKey==='building') { va=a.building||''; vb=b.building||''; }
    else if (expSortKey==='amount') { va=Number(a.amount||0); vb=Number(b.amount||0); }
    else { va=a.date||''; vb=b.date||''; }
    if (typeof va==='number') return expSortDir==='asc'?va-vb:vb-va;
    return expSortDir==='asc'?va.localeCompare(vb,'ko'):vb.localeCompare(va,'ko');
  });
  ['date','category','building','amount'].forEach(k => {
    const el = document.getElementById('esi-'+k);
    if (el) el.className = 'sort-icon' + (expSortKey===k ? (' '+expSortDir) : '');
  });
  const totalAmt = filtered.reduce((s,e) => s+Number(e.amount||0), 0);
  const catMap = {};
  filtered.forEach(e => { catMap[e.category] = (catMap[e.category]||0)+Number(e.amount||0); });
  const statsEl = document.getElementById('expenseStats');
  const CAT_COLORS = {'중개수수료':'#7c3aed','수선비':'#dc2626','세금':'#d97706','관리비':'#059669','보험료':'#2563eb','광고비':'#db2777','인건비':'#0891b2','기타':'#6b7280'};
  if (statsEl) statsEl.innerHTML = `
    <div class="stat-card" style="flex:0 0 auto;min-width:130px;"><div class="stat-label">총 지출</div><div class="stat-value" style="color:var(--danger);font-size:20px;">${totalAmt.toLocaleString()}<span style="font-size:13px;font-weight:500;">만원</span></div></div>
    <div class="stat-card" style="flex:0 0 auto;min-width:100px;"><div class="stat-label">지출 건수</div><div class="stat-value" style="font-size:20px;">${filtered.length}<span style="font-size:13px;font-weight:500;">건</span></div></div>
    ${Object.entries(catMap).sort((a,b)=>b[1]-a[1]).map(([cat,amt])=>`<div class="stat-card" style="flex:0 0 auto;min-width:100px;"><div class="stat-label" style="color:${CAT_COLORS[cat]||'#6b7280'};font-weight:700;">${cat}</div><div class="stat-value" style="font-size:16px;">${amt.toLocaleString()}<span style="font-size:12px;font-weight:500;">만원</span></div></div>`).join('')}`;
  const totalLabel = document.getElementById('expTotalLabel');
  if (totalLabel) totalLabel.textContent = filtered.length ? `${filtered.length}건 · ${totalAmt.toLocaleString()}만원` : '';
  const tbody = document.getElementById('expenseListTbody');
  if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><p>'+expSelectedYear+'년 지출 내역이 없습니다.</p></div></td></tr>'; return; }
  tbody.innerHTML = filtered.map(e => `
    <tr>
      <td style="white-space:nowrap;text-align:center;">${fmtDate(e.date)}</td>
      <td style="text-align:center;"><span style="font-size:12px;background:#f3f4f6;color:#374151;padding:2px 8px;border-radius:10px;white-space:nowrap;">${e.category}</span></td>
      <td style="text-align:center;">${e.building?`<span style="font-size:12px;background:var(--primary-light);color:var(--primary);padding:2px 8px;border-radius:10px;white-space:nowrap;">${e.building}</span>`:'<span style="color:var(--gray-400);font-size:12px;">-</span>'}</td>
      <td style="font-size:13px;text-align:center;">${e.dong&&e.hosu?e.dong+'동 '+e.hosu+'호':e.dong?e.dong+'동':e.hosu?e.hosu+'호':'-'}</td>
      <td style="text-align:right;padding-right:12px;"><strong style="color:var(--danger);">${Number(e.amount||0).toLocaleString()}만원</strong></td>
      <td style="font-size:12px;color:var(--gray-500);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.memo||'-'}</td>
      <td style="text-align:center;"><button class="btn btn-outline btn-sm" onclick="openExpenseModal('${e.id}')">수정</button></td>
    </tr>`).join('');
}

