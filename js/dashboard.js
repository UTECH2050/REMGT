'use strict';
// REMGT 전역 네임스페이스
if (typeof window.REMGT === 'undefined') window.REMGT = {};

// ============================================================
// DASHBOARD
// ============================================================
function renderDashboard() {
  const tenants = getData('tenants');
  // 물건 등록 기준으로 순회 — 뷰와 동일한 로직으로 활성/공실 집계
  const _dProps = getData('properties') || [];
  let totalRooms2 = 0, activeCount = 0;
  _dProps.forEach(p => {
    (p.rooms || []).forEach(r => {
      totalRooms2++;
      const t2 = tenants.find(x => x.building === p.name && String(x.room) === String(r.roomNo));
      if (t2?.status === '입주' && t2?.name) activeCount++;
    });
  });
  const active = tenants.filter(t => t.status === '입주' && t.name); // 수입 계산용
  const vacantCount = Math.max(0, totalRooms2 - activeCount);
  const total = totalRooms2;

  // This month payments
  const ym = getYM();
  const payments = getData('payments').filter(p => p.yearMonth === ym);
  let paidRent = 0, unpaidRent = 0;
  active.forEach(t => {
    const p = payments.find(x => x.tenantId === t.id);
    if (p && p.rentPaid) paidRent++;
    else unpaidRent++;
  });

  const monthlyIncome = active.reduce((s, t) => s + Number(t.rent||0) + Number(t.management||0), 0);

  // Stats
  document.getElementById('dashStats').innerHTML = `
    <div class="stat-card">
      <div class="stat-icon blue">🏠</div>
      <div>
        <div class="stat-label">총 호실</div>
        <div class="stat-value">${total}개</div>
        <div class="stat-sub">입주 ${activeCount} / 공실 ${vacantCount}</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon green">📈</div>
      <div>
        <div class="stat-label">입주율</div>
        <div class="stat-value">${total > 0 ? Math.round(activeCount / total * 100) : 0}%</div>
        <div class="stat-sub">공실 ${vacantCount}개</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon orange">💰</div>
      <div>
        <div class="stat-label">월 예상 수입</div>
        <div class="stat-value">${monthlyIncome.toLocaleString()}만</div>
        <div class="stat-sub">월세+관리비 합산</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon red">⚠️</div>
      <div>
        <div class="stat-label">이번달 미납</div>
        <div class="stat-value">${unpaidRent}건</div>
        <div class="stat-sub">납부완료 ${paidRent}건</div>
      </div>
    </div>
  `;

  // Month
  const now = new Date();
  document.getElementById('dashMonth').textContent = `${now.getFullYear()}년 ${now.getMonth()+1}월`;

  // Payment summary
  const paidAmt = active.filter(t => { const p = payments.find(x=>x.tenantId===t.id); return p&&p.rentPaid; }).reduce((s,t)=>s+Number(t.rent||0)+Number(t.management||0),0);
  const totalAmt = active.reduce((s,t)=>s+Number(t.rent||0)+Number(t.management||0),0);
  const rate = totalAmt > 0 ? Math.round(paidAmt/totalAmt*100) : 0;
  document.getElementById('dashPaymentSummary').innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:12px">
      <span style="font-size:28px;font-weight:800;color:var(--primary)">${rate}%</span>
      <span style="font-size:13px;color:var(--gray-500);margin-left:16px;">${paidAmt.toLocaleString()} / ${totalAmt.toLocaleString()} 만원</span>
    </div>
    <div class="progress-bar" style="height:12px;margin-bottom:16px">
      <div class="progress-fill" style="background:var(--primary);width:${rate}%"></div>
    </div>
    ${(() => {
      const mkRow = (t, allPaid) => {
        const prop = getData('properties').find(x=>x.name===t.building);
        const room = (prop?.rooms||[]).find(r=>String(r.roomNo)===String(t.room));
        const dong = room?.dong || '';
        const hosu = room?.hosu || fmtRoom(t.room);
        return `<div style="display:flex;align-items:center;font-size:12.5px;padding:6px 4px;border-bottom:1px solid var(--gray-100);gap:8px;">
          <span class="badge ${allPaid?'badge-success':'badge-danger'}" style="width:auto;min-width:40px;flex-shrink:0;">${allPaid?'납부':'미납'}</span>
          <span style="color:var(--gray-600);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            <span style="font-weight:600;color:var(--gray-800);">${t.building||''}</span>
            ${dong?`<span style="color:var(--gray-400);margin:0 3px;">·</span>${dong}동`:''}
            <span style="color:var(--gray-400);margin:0 3px;">·</span>${hosu}호
            <span style="color:var(--gray-400);margin:0 4px;">|</span>${t.name}

          </span>
        </div>`;
      };
      const paidList   = active.filter(t => { const p=payments.find(x=>x.tenantId===t.id); const hasR=Number(t.rent||0)>0; const hasM=Number(t.management||0)>0; return (!hasR||(p&&p.rentPaid))&&(!hasM||(p&&p.mgmtPaid)); });
      const unpaidList = active.filter(t => { const p=payments.find(x=>x.tenantId===t.id); const hasR=Number(t.rent||0)>0; const hasM=Number(t.management||0)>0; return !( (!hasR||(p&&p.rentPaid))&&(!hasM||(p&&p.mgmtPaid)) ); });
      return (unpaidList.length ? '<div style="font-size:11.5px;font-weight:700;color:#dc2626;margin:8px 0 2px;letter-spacing:0.03em;">미납 '+unpaidList.length+'건</div>'
        + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:0 20px;margin-bottom:12px;">'+unpaidList.map(t=>mkRow(t,false)).join('')+'</div>' : '')
      + (paidList.length ? '<div style="font-size:11.5px;font-weight:700;color:#16a34a;margin:8px 0 2px;letter-spacing:0.03em;">납부 '+paidList.length+'건</div>'
        + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:0 20px;">'+paidList.map(t=>mkRow(t,true)).join('')+'</div>' : '');
    })()}
  `;

  // Expiry list
  const expiring = getData('tenants').filter(t => t.status==='입주' && t.contractEnd && daysUntil(t.contractEnd) <= 90 && daysUntil(t.contractEnd) >= 0);
  document.getElementById('dashExpiryList').innerHTML = expiring.length === 0
    ? '<div class="empty-state"><div class="empty-icon">✅</div><p>90일 내 만료 예정 계약 없음</p></div>'
    : expiring.map(t => {
        const d = daysUntil(t.contractEnd);
        const prop2 = getData('properties').find(x=>x.name===t.building);
        const room2 = (prop2?.rooms||[]).find(r=>String(r.roomNo)===String(t.room));
        const dong2 = room2?.dong || '';
        const hosu2 = room2?.hosu || fmtRoom(t.room);
        return `<div style="display:flex;align-items:center;padding:8px 10px;border-bottom:1px solid #fed7aa;cursor:pointer;border-radius:8px;margin-bottom:3px;background:${d<=30?'#fff1f0':'#fff7ed'};border:1px solid ${d<=30?'#fecaca':'#fed7aa'};transition:filter 0.12s;"
          onmouseover="this.style.filter='brightness(0.96)'" onmouseout="this.style.filter=''"
          onclick="navigate('contracts');setTimeout(()=>openRegisterEdit('${t.id}'),200)">
          <div style="font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            <span style="font-weight:700;color:var(--gray-800);">${t.building||''}</span>
            ${dong2?` <span style="color:var(--gray-400);">·</span> ${dong2}동`:''}
            <span style="color:var(--gray-400);"> · </span>${hosu2}호
            <span style="color:var(--gray-400);"> | </span>${t.name}
            <span style="color:var(--gray-400);font-size:11.5px;margin-left:6px;">${fmtDate(t.contractEnd)}</span>
            <span style="color:#dc2626;font-size:12px;font-weight:700;margin-left:10px;">${d}일 남음(D-${d})</span>
          </div>
        </div>`;
      }).join('');

  // Room grid — properties 등록 호실 기준 (공실 포함)
  const props = getData('properties');
  renderDashboardRoomGrid();
}

function renderDashboardRoomGrid() {
  const props = getData('properties');
  const tenants = getData('tenants');

  // 건물 필터 드롭다운 채우기
  const sel = document.getElementById('dashRoomBuildingFilter');
  if (sel) {
    const curVal = sel.value;
    sel.innerHTML = '<option value="">전체 건물</option>';
    props.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.name; opt.textContent = p.name;
      sel.appendChild(opt);
    });
    sel.value = curVal;
  }
  const filterBuilding = sel ? sel.value : '';

  const roomCards = [];
  props.forEach(p => {
    if (filterBuilding && p.name !== filterBuilding) return;
    (p.rooms || []).forEach(r => {
      const t = tenants.find(x => x.building === p.name && String(x.room) === String(r.roomNo) && x.status === '입주' && x.name);
      const dong = r.dong || '';
      const label = (dong ? dong + '/' : '') + fmtRoom(r.roomNo);
      // 정렬 우선순위: 0=계약임박, 1=임대중, 2=공실
      const exp = t && t.contractEnd && daysUntil(t.contractEnd) <= 90 && daysUntil(t.contractEnd) >= 0;
      const statusOrder = t ? (exp ? 0 : 1) : 2;
      const roomSortKey = String(statusOrder) + '|' + (p.name||'') + '|' + (dong||'') + '|' + String(r.roomNo||'');

      if (t) {
        roomCards.push({ sortKey: roomSortKey, statusOrder, html: `<div style="background:${exp?'var(--warning-light)':'var(--success-light)'};border:1px solid ${exp?'#fde68a':'#bbf7d0'};border-radius:8px;padding:10px 8px;text-align:center;cursor:pointer;" onclick="navigate('tenants')">
          <div style="font-size:10px;font-weight:700;color:${exp?'#b45309':'#16a34a'};margin-bottom:2px;">${exp?'⚠️ 계약임박':'● 임대중'}</div>
          <div style="font-size:11px;color:var(--gray-500);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}</div>
          <div style="font-size:13px;font-weight:700;color:var(--gray-800);">${label}</div>
          <div style="font-size:11px;color:var(--gray-600);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.name}</div>
          <div style="font-size:11px;color:var(--gray-500);margin-top:1px;">${Number(t.rent||0)+Number(t.management||0)}만</div>
        </div>` });
      } else {
        roomCards.push({ sortKey: roomSortKey, statusOrder, html: `<div style="background:var(--gray-100);border:1px solid var(--gray-200);border-radius:8px;padding:10px 8px;text-align:center;cursor:pointer;" onclick="navigate('tenants')">
          <div style="font-size:10px;font-weight:700;color:var(--gray-400);margin-bottom:2px;">○ 공실</div>
          <div style="font-size:11px;color:var(--gray-400);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}</div>
          <div style="font-size:13px;font-weight:700;color:var(--gray-400);">${label}</div>
        </div>` });
      }
    });
  });
  // 계약임박 → 임대중 → 공실 순 정렬, 같은 상태 내에서는 건물명·동·호수 순
  roomCards.sort((a,b) => {
    if (a.statusOrder !== b.statusOrder) return a.statusOrder - b.statusOrder;
    return a.sortKey.localeCompare(b.sortKey, 'ko', {numeric:true});
  });
  const gridEl = document.getElementById('dashRoomGrid');
  gridEl.innerHTML = roomCards.length
    ? roomCards.map(c=>c.html).join('')
    : '<div style="color:var(--gray-400);font-size:13px;padding:12px;">등록된 호실이 없습니다.</div>';
}


