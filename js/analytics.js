'use strict';
if (typeof window.REMGT === 'undefined') window.REMGT = {};

// ============================================================
// ANALYTICS
// ============================================================
function renderAnalytics() {
  const yearSel = document.getElementById('analyticsYear');
  const curY = new Date().getFullYear();
  // 실제 데이터 기반 연도 범위 계산
  const allPayments = getData('payments');
  const allExpenses = getData('expenses');
  const allTenants  = getData('tenants');
  const usedYears = new Set([curY]);
  allPayments.forEach(p => { if (p.yearMonth) usedYears.add(parseInt(p.yearMonth.slice(0,4))); });
  allExpenses.forEach(e => { if (e.date) usedYears.add(parseInt(e.date.slice(0,4))); });
  allTenants.forEach(t => { if (t.startDate) usedYears.add(parseInt(t.startDate.slice(0,4))); });
  const minY = Math.min(...usedYears);
  const maxY = curY; // 손익분석은 현재년도까지
  const prevVal = yearSel.value ? Number(yearSel.value) : curY;
  yearSel.innerHTML = '';
  for (let i = maxY; i >= minY; i--) {
    const o = document.createElement('option');
    o.value = i; o.textContent = i + '년';
    yearSel.appendChild(o);
  }
  yearSel.value = usedYears.has(prevVal) ? prevVal : curY;
  const year = Number(yearSel.value);
  const tenants = getData('tenants').filter(t => t.status==='입주' && t.name);
  const payments = getData('payments');
  const expenses = getData('expenses').filter(e => e.date?.startsWith(year));

  // Monthly data
  const months = Array.from({length:12}, (_,i) => `${year}-${String(i+1).padStart(2,'0')}`);
  const monthLabels = months.map(m => `${parseInt(m.split('-')[1])}월`);
  const monthlyIncome = months.map(ym => {
    return tenants.reduce((s,t) => {
      const p = payments.find(x=>x.tenantId===t.id && x.yearMonth===ym);
      if (p && p.rentPaid) return s + Number(t.rent||0) + (p.mgmtPaid ? Number(t.management||0) : 0);
      return s;
    }, 0);
  });
  const monthlyExpense = months.map(ym => {
    const [y,m] = ym.split('-');
    return expenses.filter(e => e.date?.startsWith(`${y}-${m}`)).reduce((s,e) => s + Number(e.amount||0), 0);
  });
  const monthlyProfit = monthlyIncome.map((v,i) => v - monthlyExpense[i]);
  const monthlyRate = months.map(ym => {
    const total = tenants.reduce((s,t) => s+Number(t.rent||0)+Number(t.management||0), 0);
    const paid = tenants.reduce((s,t) => {
      const p = payments.find(x=>x.tenantId===t.id && x.yearMonth===ym);
      if (p && p.rentPaid) return s + Number(t.rent||0) + (p.mgmtPaid?Number(t.management||0):0);
      return s;
    }, 0);
    return total > 0 ? Math.round(paid/total*100) : 0;
  });

  const totalIncome = monthlyIncome.reduce((a,b)=>a+b,0);
  const totalExpense = monthlyExpense.reduce((a,b)=>a+b,0);
  const totalProfit = totalIncome - totalExpense;
  const avgRate = monthlyRate.filter(r=>r>0).length > 0 ? Math.round(monthlyRate.filter(r=>r>0).reduce((a,b)=>a+b,0)/monthlyRate.filter(r=>r>0).length) : 0;

  document.getElementById('analyticsStats').innerHTML = `
    <div class="stat-card"><div class="stat-icon blue">💰</div><div><div class="stat-label">${year}년 총 수입</div><div class="stat-value">${totalIncome.toLocaleString()}만</div><div class="stat-sub">월평균 ${Math.round(totalIncome/12).toLocaleString()}만</div></div></div>
    <div class="stat-card"><div class="stat-icon red">📤</div><div><div class="stat-label">${year}년 총 지출</div><div class="stat-value">${totalExpense.toLocaleString()}만</div><div class="stat-sub">월평균 ${Math.round(totalExpense/12).toLocaleString()}만</div></div></div>
    <div class="stat-card"><div class="stat-icon green">📊</div><div><div class="stat-label">순수익</div><div class="stat-value" style="color:${totalProfit>=0?'var(--success)':'var(--danger)'}">${totalProfit.toLocaleString()}만</div><div class="stat-sub">수익률 ${totalIncome>0?Math.round(totalProfit/totalIncome*100):0}%</div></div></div>
    <div class="stat-card"><div class="stat-icon orange">📈</div><div><div class="stat-label">평균 수납률</div><div class="stat-value">${avgRate}%</div><div class="stat-sub">연간 평균</div></div></div>
  `;

  // Monthly chart
  destroyChart('monthlyChart');
  const ctx1 = document.getElementById('monthlyChart').getContext('2d');
  chartInstances['monthlyChart'] = new Chart(ctx1, {
    type: 'bar',
    data: {
      labels: monthLabels,
      datasets: [
        { label: '수입', data: monthlyIncome, backgroundColor: 'rgba(37,99,235,0.7)', borderRadius: 4 },
        { label: '지출', data: monthlyExpense, backgroundColor: 'rgba(220,38,38,0.6)', borderRadius: 4 },
        { label: '순수익', data: monthlyProfit, type: 'line', borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,0.1)', borderWidth: 2, pointRadius: 3, fill: false, tension: 0.3 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true, ticks: { callback: v => v.toLocaleString()+'만' } } } }
  });

  // Rate chart
  destroyChart('rateChart');
  const ctx2 = document.getElementById('rateChart').getContext('2d');
  chartInstances['rateChart'] = new Chart(ctx2, {
    type: 'line',
    data: {
      labels: monthLabels,
      datasets: [{ label: '수납률(%)', data: monthlyRate, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.08)', borderWidth: 2.5, pointRadius: 4, fill: true, tension: 0.3 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { y: { min: 0, max: 100, ticks: { callback: v => v + '%' } } } }
  });

  // Expense table
  const expYear = getData('expenses').filter(e => e.date?.startsWith(year)).sort((a,b)=>b.date.localeCompare(a.date));
  const etbody = document.getElementById('expenseTbody');
  etbody.innerHTML = expYear.length === 0
    ? '<tr><td colspan="5"><div class="empty-state" style="padding:24px"><p>지출 내역이 없습니다.</p></div></td></tr>'
    : expYear.map(e => `<tr>
        <td>${fmtDate(e.date)}</td>
        <td><span class="badge badge-primary">${e.category}</span></td>
        <td><strong>${Number(e.amount).toLocaleString()}만원</strong></td>
        <td>${e.memo||'-'}</td>
        <td><button class="btn btn-sm" style="background:var(--danger-light);color:var(--danger)" onclick="deleteExpense('${e.id}')">삭제</button></td>
      </tr>`).join('');

  // Expense pie
  const catMap = {};
  expYear.forEach(e => { catMap[e.category] = (catMap[e.category]||0) + Number(e.amount||0); });
  const catLabels = Object.keys(catMap);
  const catData = catLabels.map(k => catMap[k]);
  const palette = ['#2563eb','#dc2626','#16a34a','#d97706','#7c3aed','#0891b2','#db2777'];
  destroyChart('expenseChart');
  if (catLabels.length > 0) {
    const ctx3 = document.getElementById('expenseChart').getContext('2d');
    chartInstances['expenseChart'] = new Chart(ctx3, {
      type: 'doughnut',
      data: { labels: catLabels, datasets: [{ data: catData, backgroundColor: palette, borderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 12 } } } } }
    });
  }
}

function destroyChart(id) {
  if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
}

