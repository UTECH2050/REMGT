'use strict';
if (typeof window.REMGT === 'undefined') window.REMGT = {};

// ============================================================
// PAYMENTS
// ============================================================
let selectedYM = getYM();
let selectedYear = new Date().getFullYear();

function getYearRange() {
  const curYear = new Date().getFullYear();
  const payments = getData('payments');
  const tenants = getData('tenants');
  const usedYears = new Set([curYear]);
  payments.forEach(p => { if (p.yearMonth) usedYears.add(parseInt(p.yearMonth.split('-')[0])); });
  tenants.forEach(t => { if (t.startDate) usedYears.add(parseInt(t.startDate.split('-')[0])); });
  return { minYear: Math.min(...usedYears), maxYear: curYear + 1 };
}

function renderPayments() {
  const tabs = document.getElementById('paymentMonthTabs');
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;
  const { minYear, maxYear } = getYearRange();

  const canPrev = selectedYear > minYear;
  const canNext = selectedYear < maxYear;

  let html = `<div class="ym-year-nav">`;
  html += `<button class="ym-arrow" onclick="changeYear(-1)"${canPrev?'':' disabled'}>&#8249;</button>`;
  html += `<span class="ym-year-label">${selectedYear}년</span>`;
  html += `<button class="ym-arrow" onclick="changeYear(1)"${canNext?'':' disabled'}>&#8250;</button>`;
  html += `</div><div class="ym-divider"></div><div class="ym-months">`;
  for (let m = 1; m <= 12; m++) {
    const ym = `${selectedYear}-${String(m).padStart(2,'0')}`;
    const isFuture = selectedYear > curYear || (selectedYear === curYear && m > curMonth + 1);
    const isActive = ym === selectedYM;
    html += `<button class="ym-btn${isActive?' active':''}${isFuture?' disabled':''}" onclick="selectMonth('${ym}')">${m}월</button>`;
  }
  html += `</div>`;
  tabs.innerHTML = html;
  renderPaymentTable();
}

function changeYear(delta) {
  const { minYear, maxYear } = getYearRange();
  selectedYear = Math.max(minYear, Math.min(maxYear, selectedYear + delta));
  renderPayments();
}

function selectMonth(ym) {
  selectedYM = ym;
  selectedYear = parseInt(ym.split('-')[0]);
  renderPayments();
}

function renderPaymentTable() {
  const payments = getData('payments');
  // 수납 대상: 입주 중 + 중도해지(해지일 이후 월은 제외) + 만기종료(종료월 포함)
  const [selY, selM] = selectedYM.split('-').map(Number);
  const selDate = new Date(selY, selM - 1, 1); // 선택 월 1일

  const tenants = getData('tenants').filter(t => {
    if (!t.name || (Number(t.rent||0) === 0 && Number(t.management||0) === 0)) return false;
    if (t.status === '입주') return true;
    // 중도 해지: 해지일이 선택 월 이후면 수납 대상
    if (t.endType === 'early' && t.earlyEndDate) {
      const earlyEnd = new Date(t.earlyEndDate);
      return earlyEnd >= selDate; // 해지월까지 포함
    }
    // 만기 종료: 계약종료월까지 포함
    if (t.endType === 'expiry' && t.contractEnd) {
      const contractEnd = new Date(t.contractEnd);
      return contractEnd >= selDate;
    }
    return false;
  });
  tenants.sort((a,b) => {
    let va = a[paymentSortKey] ?? '', vb = b[paymentSortKey] ?? '';
    if (paymentSortKey === 'paidDate') {
      const pa = payments.find(p => p.tenantId===a.id && p.yearMonth===selectedYM);
      const pb = payments.find(p => p.tenantId===b.id && p.yearMonth===selectedYM);
      va = pa?.paidDate || ''; vb = pb?.paidDate || '';
    }
    if (paymentSortKey === 'unpaidMonths') {
      va = payments.filter(x=>x.tenantId===a.id && (!x.rentPaid||!x.mgmtPaid)).length;
      vb = payments.filter(x=>x.tenantId===b.id && (!x.rentPaid||!x.mgmtPaid)).length;
      return paymentSortDir==='asc' ? va-vb : vb-va;
    }
    const numKeys = ['rent','management'];
    if (numKeys.includes(paymentSortKey)) { va = Number(va); vb = Number(vb); return paymentSortDir==='asc' ? va-vb : vb-va; }
    const cmp = String(va).localeCompare(String(vb), undefined, {numeric:true});
    return paymentSortDir==='asc' ? cmp : -cmp;
  });
  updatePaymentSortIcons();

  let paidCount = 0, unpaidCount = 0, paidAmt = 0, totalAmt = 0;

  const rows = tenants.map(t => {
    let p = payments.find(x => x.tenantId===t.id && x.yearMonth===selectedYM);
    if (!p) {
      p = { id: uid(), tenantId: t.id, yearMonth: selectedYM, rentPaid: false, mgmtPaid: false, paidDate: '', note: '' };
    }
    const total = Number(t.rent||0) + Number(t.management||0);
    const _hasRentAmt = Number(t.rent||0) > 0;
    const _hasMgmtAmt = Number(t.management||0) > 0;
    totalAmt += total;
    // 적용 항목이 모두 납부된 경우만 납부 카운트
    const _allPaid = (!_hasRentAmt || p.rentPaid) && (!_hasMgmtAmt || p.mgmtPaid);
    if (_allPaid) { paidCount++; paidAmt += total; }
    else unpaidCount++;

    // 누적 미납 계산: 해당 항목(월세/관리비)이 있는 경우만 미납 월 수 카운트
    const allP = payments.filter(x => x.tenantId === t.id);
    const unpaidRentMonths = Number(t.rent||0) > 0 ? allP.filter(x => !x.rentPaid).length : 0;
    const unpaidMgmtMonths = Number(t.management||0) > 0 ? allP.filter(x => !x.mgmtPaid).length : 0;
    const unpaidMonths = Math.max(unpaidRentMonths, unpaidMgmtMonths);
    t._unpaidMonths = unpaidMonths; // 소팅용

    let unpaidCell = '';
    if (unpaidMonths === 0) {
      unpaidCell = '<span style="color:var(--gray-400);font-size:12px;">-</span>';
    } else if (unpaidMonths === 1) {
      unpaidCell = '<span style="background:#fef3c7;color:#92400e;padding:3px 8px;border-radius:6px;font-size:12px;font-weight:600;">⚠️ 1개월</span>';
    } else if (unpaidMonths === 2) {
      unpaidCell = `<span style="background:#fee2e2;color:#b91c1c;padding:3px 8px;border-radius:6px;font-size:12px;font-weight:600;">🔴 ${unpaidMonths}개월 누적</span>`;
    } else {
      unpaidCell = `<span style="background:#7f1d1d;color:#fff;padding:3px 8px;border-radius:6px;font-size:12px;font-weight:700;">🚨 ${unpaidMonths}개월 누적</span>`;
    }

    // 납부현황: 월세·관리비 분리 컬럼
    const hasRent = Number(t.rent||0) > 0;
    const hasMgmt = Number(t.management||0) > 0;
    const naChip = `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:36px;height:24px;border:1.5px solid #d1d5db;border-radius:6px;font-size:10px;font-weight:700;color:#9ca3af;padding:0 6px;">N/A</span>`;
    const mkPayBtn = (paid, tid, ym, type) => {
      const bg = paid ? '#16a34a' : '#dc2626';
      return `<button style="background:${bg};color:#fff;border:none;padding:4px 12px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;min-width:48px;" onclick="togglePayHistMonth('${tid}','${ym}','${type}',${!paid})">${paid?'납부':'미납'}</button>`;
    };
    const rentCell = hasRent ? mkPayBtn(p.rentPaid, t.id, selectedYM, 'rent') : naChip;
    const mgmtCell = hasMgmt ? mkPayBtn(p.mgmtPaid, t.id, selectedYM, 'mgmt') : naChip;
    return `<tr${unpaidMonths >= 2 ? ' style="background:#fff5f5;"' : ''}>
      <td>${t.building ? t.building : '<span style="color:var(--gray-400);font-size:12px;">-</span>'}</td>
      <td>${getTenantDong(t.building, t.room)}</td>
      <td><strong>${fmtRoom(t.room)}</strong></td>
      <td>${t.name}</td>
      <td style="text-align:right;">${Number(t.rent||0)>0?Number(t.rent).toLocaleString():'<span style="color:var(--gray-300)">-</span>'}</td>
      <td style="text-align:right;">${Number(t.management||0)>0?Number(t.management).toLocaleString():'<span style="color:var(--gray-300)">-</span>'}</td>
      <td style="text-align:right;"><strong>${Number(total||0).toLocaleString()}</strong></td>
      <td style="text-align:center;">${rentCell}</td>
      <td style="text-align:center;">${mgmtCell}</td>
      <td>${p.paidDate ? fmtDate(p.paidDate) : '-'}</td>
      <td>${unpaidCell}</td>
      <td><input type="text" value="${p.note||''}" placeholder="메모" style="width:100px;padding:4px 8px;font-size:12px" onchange="updatePaymentNote('${t.id}','${selectedYM}',this.value)"></td>
      <td><button class="btn btn-outline btn-sm" onclick="openPaymentHistory('${t.id}')">수정</button></td>
    </tr>`;
  }).join('');

  document.getElementById('paymentTbody').innerHTML = rows || '<tr><td colspan="13"><div class="empty-state"><p>입주중인 임차인이 없습니다.</p></div></td></tr>';

  document.getElementById('paidCount').textContent = paidCount;
  document.getElementById('unpaidCount').textContent = unpaidCount;
  document.getElementById('paidAmount').textContent = paidAmt.toLocaleString() + '만원';
  document.getElementById('unpaidAmount').textContent = (totalAmt - paidAmt).toLocaleString() + '만원';
  document.getElementById('totalBillAmount').textContent = totalAmt.toLocaleString() + '만원';
  const rate = totalAmt > 0 ? Math.round(paidAmt / totalAmt * 100) : 0;
  document.getElementById('paymentProgressBar').style.width = rate + '%';
  document.getElementById('paymentProgressText').textContent = `${rate}% 수납 완료`;
  updateBadges();
}

// 납부/미납 토글 버튼 (월세+관리비 통합)
function togglePaymentAll(tenantId, ym, setPaid) {
  const payments = getData('payments');
  let p = payments.find(x => x.tenantId===tenantId && x.yearMonth===ym);
  if (!p) {
    p = { id: uid(), tenantId, yearMonth: ym, rentPaid: false, mgmtPaid: false, paidDate: '', note: '' };
    payments.push(p);
  }
  p.rentPaid = setPaid; p.mgmtPaid = setPaid;
  if (setPaid && !p.paidDate) p.paidDate = today();
  if (!setPaid) p.paidDate = '';
  setData('payments', payments);
  renderPaymentTable();
  showToast(setPaid ? '납부 처리됐습니다.' : '미납으로 변경됐습니다.');
}

// 월별 수납 내역 수정 모달
let _payHistTenantId = null;
function openPaymentHistory(tenantId) {
  _payHistTenantId = tenantId;
  const t = getData('tenants').find(x => x.id === tenantId);
  if (!t) return;
  document.getElementById('payHistTitle').textContent =
    `${t.building} ${getTenantDong(t.building,t.room) !== '-' ? getTenantDong(t.building,t.room)+' ' : ''}${fmtRoom(t.room)} · ${t.name}`;
  renderPayHistMonths(tenantId);
  openModal('paymentHistModal');
}

function renderPayHistMonths(tenantId) {
  const t = getData('tenants').find(x => x.id === tenantId);
  if (!t || !t.contractStart) {
    document.getElementById('payHistBody').innerHTML =
      '<p style="text-align:center;color:var(--gray-400);padding:20px;">계약 시작일 정보가 없습니다.</p>'; return;
  }
  const payments = getData('payments');
  const startStr = t.contractStart.replace(/[^\d]/g,'');
  const startYear = +startStr.slice(0,4), startMon = +startStr.slice(4,6);
  const now = new Date();
  const endYear = now.getFullYear(), endMon = now.getMonth()+1;

  // 계약 시작월 ~ 현재월 목록 생성
  const months = [];
  let y = startYear, m = startMon;
  while (y < endYear || (y === endYear && m <= endMon)) {
    months.push(`${y}-${String(m).padStart(2,'0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }

  const hasRent = Number(t.rent||0) > 0;
  const hasMgmt = Number(t.management||0) > 0;

  const rows = months.reverse().map(ym => {
    let p = payments.find(x => x.tenantId===tenantId && x.yearMonth===ym);
    const rPaid = p?.rentPaid || false;
    const mPaid = p?.mgmtPaid || false;
    const [yr, mn] = ym.split('-');
    const btnStyle = (paid) => paid
      ? 'background:#16a34a;color:#fff;border:none;padding:3px 12px;border-radius:5px;font-size:12px;font-weight:600;cursor:pointer;'
      : 'background:#dc2626;color:#fff;border:none;padding:3px 12px;border-radius:5px;font-size:12px;font-weight:600;cursor:pointer;';
    return `<tr>
      <td style="font-weight:600;white-space:nowrap;">${yr}년 ${+mn}월</td>
      ${hasRent ? `<td style="text-align:center;">
        <button style="${btnStyle(rPaid)}" onclick="togglePayHistMonth('${tenantId}','${ym}','rent',${!rPaid})">${rPaid?'납부':'미납'}</button>
      </td>` : '<td style="color:var(--gray-300);text-align:center;">-</td>'}
      ${hasMgmt ? `<td style="text-align:center;">
        <button style="${btnStyle(mPaid)}" onclick="togglePayHistMonth('${tenantId}','${ym}','mgmt',${!mPaid})">${mPaid?'납부':'미납'}</button>
      </td>` : '<td style="color:var(--gray-300);text-align:center;">-</td>'}
      <td style="text-align:center;">
        <button style="background:#f3f4f6;color:#374151;border:none;padding:3px 10px;border-radius:5px;font-size:12px;cursor:pointer;"
          onclick="togglePayHistMonth('${tenantId}','${ym}','all',${!(rPaid&&mPaid)})">
          ${(rPaid&&mPaid)?'전체납부':'전체미납'}
        </button>
      </td>
      <td style="font-size:12px;color:var(--gray-500);">${p?.paidDate ? fmtDate(p.paidDate) : '-'}</td>
    </tr>`;
  }).join('');

  document.getElementById('payHistBody').innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:13.5px;">
      <thead>
        <tr style="background:var(--gray-50);">
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:var(--gray-500);">월</th>
          ${hasRent ? `<th style="padding:8px 12px;text-align:center;font-size:12px;color:var(--gray-500);">월세</th>` : ''}
          ${hasMgmt ? `<th style="padding:8px 12px;text-align:center;font-size:12px;color:var(--gray-500);">관리비</th>` : ''}
          <th style="padding:8px 12px;text-align:center;font-size:12px;color:var(--gray-500);">전체</th>
          <th style="padding:8px 12px;text-align:center;font-size:12px;color:var(--gray-500);">납부일</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function togglePayHistMonth(tenantId, ym, type, setPaid) {
  const payments = getData('payments');
  let p = payments.find(x => x.tenantId===tenantId && x.yearMonth===ym);
  if (!p) {
    p = { id: uid(), tenantId, yearMonth: ym, rentPaid: false, mgmtPaid: false, paidDate: '', note: '' };
    payments.push(p);
  }
  if (type === 'rent') p.rentPaid = setPaid;
  else if (type === 'mgmt') p.mgmtPaid = setPaid;
  else { p.rentPaid = setPaid; p.mgmtPaid = setPaid; }
  if ((p.rentPaid || p.mgmtPaid) && !p.paidDate) p.paidDate = today();
  if (!p.rentPaid && !p.mgmtPaid) p.paidDate = '';
  setData('payments', payments);
  renderPayHistMonths(tenantId);
  if (currentPage === 'payments') renderPaymentTable();
  updateBadges();
}

function togglePayment(tenantId, type, checked, ym) {
  const payments = getData('payments');
  let p = payments.find(x => x.tenantId===tenantId && x.yearMonth===ym);
  if (!p) {
    p = { id: uid(), tenantId, yearMonth: ym, rentPaid: false, mgmtPaid: false, paidDate: '', note: '' };
    payments.push(p);
  }
  if (type === 'rent') p.rentPaid = checked;
  if (type === 'mgmt') p.mgmtPaid = checked;
  if (checked && !p.paidDate) p.paidDate = today();
  if (!p.rentPaid && !p.mgmtPaid) p.paidDate = '';
  setData('payments', payments);
  renderPaymentTable();
  showToast(checked ? '납부 처리되었습니다.' : '납부 취소되었습니다.');
}

function updatePaymentNote(tenantId, ym, note) {
  const payments = getData('payments');
  let p = payments.find(x => x.tenantId===tenantId && x.yearMonth===ym);
  if (!p) { p = {id:uid(),tenantId,yearMonth:ym,rentPaid:false,mgmtPaid:false,paidDate:'',note:''}; payments.push(p); }
  p.note = note;
  setData('payments', payments);
}

function markAllPaid() {
  confirm(`${selectedYM.replace('-','년 ')}월 전체 임차인을 납부 처리하시겠습니까?`, () => {
    const tenants = getData('tenants').filter(t => t.status==='입주' && t.name);
    const payments = getData('payments');
    tenants.forEach(t => {
      let p = payments.find(x => x.tenantId===t.id && x.yearMonth===selectedYM);
      if (!p) { p = {id:uid(),tenantId:t.id,yearMonth:selectedYM,rentPaid:false,mgmtPaid:false,paidDate:'',note:''}; payments.push(p); }
      p.rentPaid = true; p.mgmtPaid = true;
      if (!p.paidDate) p.paidDate = today();
    });
    setData('payments', payments);
    renderPaymentTable();
    showToast('전체 납부 처리되었습니다.');
  }, '전체 납부처리', 'btn-success');
}