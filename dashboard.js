// ═══════════════════════════════════════════════════════════════
// AAALAY · MCUBE DASHBOARD · dashboard.js
// ═══════════════════════════════════════════════════════════════

let csvFile = null;
let charts = {};
let rawRows = [];
let allDates = [];
let activeFilterDate = 'all';
let tillTargetDate = null;

// ── DOM refs ──────────────────────────────────────────────────
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const fileNameText = document.getElementById('fileNameText');
const loadBtn = document.getElementById('loadBtn');

// ── Drag & drop / file select ────────────────────────────────
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.name.endsWith('.csv')) setFile(f);
});
fileInput.addEventListener('change', e => {
  if (e.target.files[0]) setFile(e.target.files[0]);
});

function setFile(f) {
  csvFile = f;
  fileNameText.textContent = f.name;
  fileNameDisplay.style.display = 'block';
  loadBtn.classList.add('ready');
  loadBtn.disabled = false;
  dropZone.style.borderColor = '#4ade80';
}

function reloadFile() {
  document.getElementById('uploadScreen').style.display = 'flex';
  document.getElementById('dashboardScreen').style.display = 'none';
  csvFile = null; rawRows = []; allDates = [];
  activeFilterDate = 'all'; tillTargetDate = null;
  fileInput.value = '';
  fileNameDisplay.style.display = 'none';
  loadBtn.classList.remove('ready');
  loadBtn.disabled = true;
  dropZone.style.borderColor = '#444';
  Object.values(charts).forEach(c => { try { c.destroy(); } catch(e){} });
  charts = {};
}

// ═══════════════════════════════════════════════════════════════
// AUTO-LOAD — fetch data/report.csv from the same repo on startup
// Place your latest Mcube CSV at data/report.csv in the repo root.
// ═══════════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  fetch('data/report.csv')
    .then(r => {
      if (!r.ok) throw new Error('No bundled CSV found');
      return r.text();
    })
    .then(text => {
      rawRows = parseCSV(text);
      const dateSet = new Set();
      rawRows.forEach(r => {
        const st = r['Start Time'] || '';
        if (st) { const d = new Date(st); if (!isNaN(d)) dateSet.add(st.substring(0,10)); }
      });
      allDates = Array.from(dateSet).sort();
      activeFilterDate = 'all';
      tillTargetDate = allDates.length > 0 ? allDates[allDates.length-1] : null;
      buildDatePills();
      const metrics = calculateMetrics(rawRows);
      renderDashboard(metrics, 'report.csv (auto-loaded)');
    })
    .catch(() => {
      // No bundled CSV — show upload screen as normal
      console.info('No data/report.csv found; showing upload screen.');
    });
});

// ═══════════════════════════════════════════════════════════════
// PART 1 — MANUAL UPLOAD (fallback when no bundled CSV)
// ═══════════════════════════════════════════════════════════════
function processCsv() {
  if (!csvFile) return;
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    rawRows = parseCSV(text);
    const dateSet = new Set();
    rawRows.forEach(r => {
      const st = r['Start Time'] || '';
      if (st) { const d = new Date(st); if (!isNaN(d)) dateSet.add(st.substring(0,10)); }
    });
    allDates = Array.from(dateSet).sort();
    activeFilterDate = 'all';
    tillTargetDate = allDates.length > 0 ? allDates[allDates.length-1] : null;
    buildDatePills();
    const metrics = calculateMetrics(rawRows);
    renderDashboard(metrics, csvFile.name);
  };
  reader.readAsText(csvFile);
}

// ═══════════════════════════════════════════════════════════════
// PART 2 — CSV PARSING
// ═══════════════════════════════════════════════════════════════
function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const headers = parseCSVLine(lines[0]).map(h => h.trim().replace(/^"|"$/g,''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, j) => row[h] = (vals[j] || '').trim().replace(/^"|"$/g,''));
    if (row['Agent Name'] || row['Dial Status']) rows.push(row);
  }
  return rows;
}

function parseCSVLine(line) {
  const result = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
    else cur += ch;
  }
  result.push(cur);
  return result;
}

function parseDuration(s) {
  if (!s || s === '00:00:00') return 0;
  const parts = s.trim().split(':');
  if (parts.length === 3) return parseInt(parts[0])*3600 + parseInt(parts[1])*60 + parseInt(parts[2]);
  return 0;
}

// ═══════════════════════════════════════════════════════════════
// DATE FILTER
// ═══════════════════════════════════════════════════════════════
function buildDatePills() {
  const container = document.getElementById('datePillsContainer');
  if (!container) return;
  container.innerHTML = allDates.map(d => {
    const label = formatDatePill(d);
    return `<span class="date-pill" id="pill-${d}" onclick="applyDateFilter('${d}',this)">${label}</span>`;
  }).join('');
  document.getElementById('pill-all').classList.add('active');
  document.getElementById('pill-tilldate').classList.remove('active');
  updateFilterSummary();
}

function formatDatePill(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-IN', { day:'numeric', month:'short' });
}

function applyDateFilter(mode, clickedEl) {
  document.querySelectorAll('.date-pill').forEach(p => p.classList.remove('active'));
  if (mode === 'all') {
    activeFilterDate = 'all';
    tillTargetDate = allDates.length > 0 ? allDates[allDates.length-1] : null;
    document.getElementById('pill-all').classList.add('active');
  } else if (mode === 'till') {
    activeFilterDate = 'till';
    if (!tillTargetDate) tillTargetDate = allDates[allDates.length-1];
    document.getElementById('pill-tilldate').classList.add('active');
    const targetPill = document.getElementById('pill-'+tillTargetDate);
    if (targetPill) targetPill.classList.add('active');
  } else {
    activeFilterDate = mode;
    tillTargetDate = mode;
    clickedEl.classList.add('active');
    document.getElementById('pill-tilldate').classList.remove('active');
  }
  updateFilterSummary();
  refreshAgentTable();
}

function getFilteredRows() {
  if (activeFilterDate === 'all') return rawRows;
  if (activeFilterDate === 'till') {
    return rawRows.filter(r => {
      const st = r['Start Time'] || '';
      if (!st) return false;
      const d = new Date(st);
      return !isNaN(d) && st.substring(0,10) <= tillTargetDate;
    });
  }
  return rawRows.filter(r => {
    const st = r['Start Time'] || '';
    return st.substring(0,10) === activeFilterDate;
  });
}

function updateFilterSummary() {
  const el = document.getElementById('filterSummary');
  if (!el) return;
  const filtered = getFilteredRows();
  if (activeFilterDate === 'all') {
    el.textContent = `Showing all ${filtered.length} calls across ${allDates.length} day${allDates.length!==1?'s':''}`;
  } else if (activeFilterDate === 'till') {
    const days = allDates.filter(d => d <= tillTargetDate);
    el.textContent = `Cumulative: ${filtered.length} calls across ${days.length} day${days.length!==1?'s':''} → ${formatDatePill(tillTargetDate)}`;
  } else {
    el.textContent = `${filtered.length} calls on ${formatDatePill(activeFilterDate)}`;
  }
}

function refreshAgentTable() {
  const filtered = getFilteredRows();
  const m = calculateMetrics(filtered);
  renderAgentTable(m);
  renderExecBusyBars(m);
  buildQualityChart(m);
  buildTalkChart(m);
  updateFilterSummary();
}

// ═══════════════════════════════════════════════════════════════
// PART 3 — METRICS ENGINE
// ═══════════════════════════════════════════════════════════════
function calculateMetrics(rows) {
  const m = {
    total: rows.length,
    answered: 0, busy: 0, execBusy: 0, cancel: 0,
    quality: 0, ghost: 0, talkSec: 0,
    inbound: 0, missedInbound: [],
    agentEarlyHangup: 0,
    byAgent: {}, byDate: {}, byHour: {},
    durationBuckets: { '<30s':0,'30-60s':0,'1-2min':0,'2-5min':0,'5-10min':0,'>10min':0 },
    discBy: { Customer:0, Executive:0, System:0 },
    outbound: 0,
  };

  rows.forEach(r => {
    const status = r['Dial Status'] || '';
    const callType = r['Call Type'] || '';
    const agent = (r['Agent Name'] || 'Unknown').trim();
    const discBy = r['Disconnected By'] || '';
    const answSec = parseDuration(r['Answered Time']);
    const startTime = r['Start Time'] || '';

    let dateKey = 'Unknown', hourKey = -1;
    if (startTime) {
      const d = new Date(startTime);
      if (!isNaN(d)) { dateKey = startTime.substring(0,10); hourKey = d.getHours(); }
    }

    if (status === 'ANSWER') m.answered++;
    else if (status === 'BUSY') m.busy++;
    else if (status === 'Executive Busy') m.execBusy++;
    else if (status === 'CANCEL') m.cancel++;

    if (callType === 'inbound') {
      m.inbound++;
      if (status === 'CANCEL') m.missedInbound.push({ num: r['Customer Number'], time: startTime, agent });
    } else { m.outbound++; }

    if (status === 'ANSWER') {
      m.talkSec += answSec;
      if (answSec >= 60) m.quality++;
      if (answSec < 30) m.ghost++;
      if (answSec < 30) m.durationBuckets['<30s']++;
      else if (answSec < 60) m.durationBuckets['30-60s']++;
      else if (answSec < 120) m.durationBuckets['1-2min']++;
      else if (answSec < 300) m.durationBuckets['2-5min']++;
      else if (answSec < 600) m.durationBuckets['5-10min']++;
      else m.durationBuckets['>10min']++;
      if (discBy === 'Executive' && answSec < 30) m.agentEarlyHangup++;
    }

    if (discBy === 'Customer') m.discBy.Customer++;
    else if (discBy === 'Executive') m.discBy.Executive++;
    else if (discBy === 'System') m.discBy.System++;

    if (callType !== 'inbound') {
      if (!m.byAgent[agent]) m.byAgent[agent] = { total:0, answered:0, quality:0, ghost:0, talkSec:0, execBusy:0, earlyHangup:0 };
      const ag = m.byAgent[agent];
      ag.total++;
      if (status === 'ANSWER') { ag.answered++; ag.talkSec += answSec; if (answSec>=60) ag.quality++; if (answSec<30) ag.ghost++; }
      if (status === 'Executive Busy') ag.execBusy++;
      if (discBy === 'Executive' && answSec < 30 && status==='ANSWER') ag.earlyHangup++;
    }

    if (!m.byDate[dateKey]) m.byDate[dateKey] = { total:0, answered:0, busy:0 };
    m.byDate[dateKey].total++;
    if (status==='ANSWER') m.byDate[dateKey].answered++;
    if (status==='BUSY') m.byDate[dateKey].busy++;

    if (callType !== 'inbound' && hourKey >= 0) {
      if (!m.byHour[hourKey]) m.byHour[hourKey] = { calls:0, answered:0 };
      m.byHour[hourKey].calls++;
      if (status==='ANSWER') m.byHour[hourKey].answered++;
    }
  });

  m.avgTalkSec = m.answered > 0 ? m.talkSec / m.answered : 0;
  m.answerRate = m.total > 0 ? (m.answered / m.total * 100).toFixed(1) : 0;
  m.effectiveRate = m.total > 0 ? (m.quality / m.total * 100).toFixed(1) : 0;
  m.ghostRate = m.answered > 0 ? (m.ghost / m.answered * 100).toFixed(1) : 0;
  m.inboundMissRate = m.inbound > 0 ? (m.missedInbound.length / m.inbound * 100).toFixed(0) : 0;
  return m;
}

// ═══════════════════════════════════════════════════════════════
// PART 4 — RENDER DASHBOARD
// ═══════════════════════════════════════════════════════════════
function renderDashboard(m, filename) {
  document.getElementById('uploadScreen').style.display = 'none';
  document.getElementById('dashboardScreen').style.display = 'block';
  document.getElementById('navFilename').textContent = filename;

  const dateKeys = Object.keys(m.byDate).sort();
  const label = dateKeys.length > 0 ? dateKeys.join(', ') : 'Today';
  document.getElementById('overviewLabel').textContent = `Call Center Health · ${label} · ${m.total} total calls`;

  renderVerdictStrip(m);
  renderKPIs(m);
  renderOutcomeSummary(m);
  renderDurationNote(m);
  renderAgentTable(m);
  renderExecBusyBars(m);
  renderLeakageKPIs(m);
  renderMissedTable(m);
  renderGhostBars(m);
  renderDiscBars(m);
  renderDiscByBars(m);
  renderTimingInsights(m);
  renderActionPlan(m);
  renderStandupScript(m, filename);

  setTimeout(() => {
    buildDailyChart(m);
    buildOutcomeChart(m);
    buildDurationChart(m);
    buildQualityChart(m);
    buildTalkChart(m);
    buildFunnelChart(m);
    buildHourlyChart(m);
    buildVolumeHourChart(m);
  }, 80);
}

function renderVerdictStrip(m) {
  const strip = document.getElementById('verdictStrip');
  const eff = parseFloat(m.effectiveRate);
  const ghost = parseFloat(m.ghostRate);
  const missed = m.missedInbound.length;
  let msg = `${m.total} calls · ${m.answerRate}% answer rate · ${m.quality} quality calls (${m.effectiveRate}% eff.) · ${m.ghost} ghost calls · ${missed} inbound missed`;
  if (eff < 15 || ghost > 30 || missed > 5) {
    strip.className = 'verdict-strip red'; msg = '⚠ CRITICAL · ' + msg;
  } else if (eff < 20 || ghost > 20) {
    strip.className = 'verdict-strip amber'; msg = '⚠ NEEDS ATTENTION · ' + msg;
  } else {
    strip.className = 'verdict-strip green'; msg = '✓ HEALTHY · ' + msg;
  }
  strip.textContent = msg;
}

function renderKPIs(m) {
  const kpis = [
    { tag:'Total Calls', val:m.total, sub:`${m.outbound} outbound · ${m.inbound} inbound`, color:'blue', verdict:'verdict-blue2', vt:'ALL CALLS' },
    { tag:'Answered', val:m.answered, sub:`${m.answerRate}% answer rate`, color: parseFloat(m.answerRate)>=40?'green':'amber', verdict: parseFloat(m.answerRate)>=40?'verdict-green2':'verdict-amber2', vt: parseFloat(m.answerRate)>=40?'ON TARGET':'BELOW 40%' },
    { tag:'Customer Busy', val:m.busy, sub:'Not reachable — need retry', color:'red', verdict:'verdict-red2', vt:'RETRY QUEUE' },
    { tag:'Agent Busy', val:m.execBusy, sub:'Agent off headset when called', color: m.execBusy>5?'red':'amber', verdict: m.execBusy>5?'verdict-red2':'verdict-amber2', vt: m.execBusy>5?'CRITICAL':'WATCH' },
    { tag:'Quality Calls', val:m.quality, sub:`Answered + talked >60s`, color: parseFloat(m.effectiveRate)>=20?'green':'amber', verdict: parseFloat(m.effectiveRate)>=20?'verdict-green2':'verdict-amber2', vt:`${m.effectiveRate}% OF ALL` },
    { tag:'Ghost Calls', val:m.ghost, sub:'Answered but <30s — wasted', color:'red', verdict:'verdict-red2', vt:`${m.ghostRate}% OF ANSWERED` },
    { tag:'Avg Talk Time', val: m.avgTalkSec>=60 ? Math.round(m.avgTalkSec/60)+'m' : Math.round(m.avgTalkSec)+'s', sub:'Per answered call', color: m.avgTalkSec>=90?'green':'amber', verdict: m.avgTalkSec>=90?'verdict-green2':'verdict-amber2', vt: m.avgTalkSec>=90?'GOOD':'SHORT' },
    { tag:'Inbound Missed', val:m.missedInbound.length, sub:`${m.inbound} inbound · ${m.inboundMissRate}% miss rate`, color: m.missedInbound.length>5?'red':'amber', verdict: m.missedInbound.length>5?'verdict-red2':'verdict-amber2', vt: m.missedInbound.length>0?'CALL BACK NOW':'ALL ANSWERED' },
  ];
  document.getElementById('kpiGrid').innerHTML = kpis.map(k => `
    <div class="kpi-card ${k.color}">
      <div class="kpi-tag">${k.tag}</div>
      <div class="kpi-number">${k.val}</div>
      <div class="kpi-sub">${k.sub}</div>
      <div class="kpi-verdict ${k.verdict}">${k.vt}</div>
    </div>`).join('');
}

function renderOutcomeSummary(m) {
  const items = [
    { val:m.answered, label:`ANSWER (${m.answerRate}%)`, bg:'var(--green-bg)', border:'var(--green-border)', color:'var(--green)' },
    { val:m.busy, label:`BUSY — retry (${(m.busy/m.total*100).toFixed(0)}%)`, bg:'var(--red-bg)', border:'var(--red-border)', color:'var(--red)' },
    { val:m.execBusy, label:`Exec Busy (${(m.execBusy/m.total*100).toFixed(0)}%)`, bg:'var(--amber-bg)', border:'var(--amber-border)', color:'var(--amber)' },
    { val:m.cancel, label:`CANCEL (${(m.cancel/m.total*100).toFixed(0)}%)`, bg:'var(--surface2)', border:'var(--border)', color:'var(--muted)' },
  ];
  document.getElementById('outcomeSummary').innerHTML = items.map(i => `
    <div style="padding:8px;background:${i.bg};border-radius:5px;border:1px solid ${i.border};">
      <div style="font-family:var(--mono);font-weight:700;color:${i.color};font-size:16px;">${i.val}</div>
      <div style="color:var(--muted);font-size:11px;">${i.label}</div>
    </div>`).join('');
}

function renderDurationNote(m) {
  document.getElementById('ghostBadge').textContent = `${m.ghost} ghost calls answered`;
  document.getElementById('durationNote').innerHTML = `
    <div style="font-size:12px;font-weight:600;color:var(--red);margin-bottom:3px;">${m.ghostRate}% of answered calls lasted under 30 seconds — ghost calls, not real conversations</div>
    <div style="font-size:11px;color:var(--muted);">Your actual effective rate is ${m.effectiveRate}% (${m.quality}/${m.total}), not ${m.answerRate}%. Only calls over 60 seconds have real booking potential.</div>`;
}

function renderAgentTable(m) {
  const agents = Object.entries(m.byAgent)
    .map(([name, d]) => ({
      name, total: d.total, answered: d.answered, quality: d.quality,
      ghost: d.ghost, talkMin: (d.talkSec/60).toFixed(1), execBusy: d.execBusy,
      ansRate: d.total > 0 ? (d.answered/d.total*100).toFixed(0) : 0,
      effRate: d.total > 0 ? (d.quality/d.total*100).toFixed(0) : 0,
    }))
    .filter(a => a.total > 0)
    .sort((a,b) => b.effRate - a.effRate);

  const poor = agents.filter(a => parseFloat(a.effRate) < 12);
  document.getElementById('agentAlertBadge').textContent =
    poor.length > 0 ? `${poor.length} agent${poor.length>1?'s':''} need coaching` : 'Team on track';
  document.getElementById('agentAlertBadge').className = poor.length > 0 ? 'panel-badge badge-red' : 'panel-badge badge-green';

  document.getElementById('agentTable').innerHTML = agents.map((a, i) => {
    const eff = parseFloat(a.effRate);
    const bg = eff >= 20 ? 'var(--green-bg)' : eff >= 12 ? 'var(--amber-bg)' : 'var(--red-bg)';
    const sc = eff >= 20 ? 'badge-green' : eff >= 12 ? 'badge-amber' : 'badge-red';
    const st = eff >= 20 ? '✓ Good' : eff >= 12 ? '⚠ Watch' : '🔴 Poor';
    const rc = i===0?'rank-1':i===1?'rank-2':i===2?'rank-3':'rank-other';
    return `<tr style="background:${bg}">
      <td><span class="rank-badge ${rc}">${i+1}</span></td>
      <td class="bold">${a.name}</td>
      <td class="text-mono text-right">${a.total}</td>
      <td class="text-mono text-right">${a.answered}</td>
      <td class="text-mono text-right">${a.ansRate}%</td>
      <td class="text-mono text-right bold" style="color:${eff>=20?'var(--green)':eff>=12?'var(--amber)':'var(--red)'}">${a.quality}</td>
      <td class="text-mono text-right text-red">${a.ghost}</td>
      <td class="text-mono text-right">${a.talkMin}m</td>
      <td class="text-mono text-right" style="color:${a.execBusy>=5?'var(--red)':a.execBusy>=3?'var(--amber)':'var(--muted)'}">${a.execBusy}</td>
      <td class="text-mono text-right bold" style="color:${eff>=20?'var(--green)':eff>=12?'var(--amber)':'var(--red)'}">${a.effRate}%</td>
      <td><span class="panel-badge ${sc}">${st}</span></td>
    </tr>`;
  }).join('');
  renderDashboard._agents = agents;
}

function renderExecBusyBars(m) {
  const agents = Object.entries(m.byAgent)
    .filter(([,d]) => d.execBusy > 0)
    .sort(([,a],[,b]) => b.execBusy - a.execBusy);
  const max = agents[0]?.[1]?.execBusy || 1;
  document.getElementById('execBusyBars').innerHTML = agents.map(([name, d]) => `
    <div style="display:grid;grid-template-columns:130px 1fr 50px;align-items:center;gap:10px;margin-bottom:8px;">
      <div style="font-size:12px;font-weight:600;">${name.split(' ')[0]}</div>
      <div class="mini-bar-wrap"><div class="mini-bar-track"><div class="mini-bar-fill" style="width:${d.execBusy/max*100}%;background:${d.execBusy>=5?'var(--red)':'var(--amber)'}"></div></div></div>
      <div class="text-mono text-right" style="color:${d.execBusy>=5?'var(--red)':'var(--amber)'};font-weight:600">${d.execBusy}</div>
    </div>`).join('') + (agents.length===0 ? '<p style="color:var(--muted);font-size:12px;">No Executive Busy incidents recorded.</p>' : '');
}

function renderLeakageKPIs(m) {
  const kpis = [
    { tag:'BUSY (Retry)', val:m.busy, sub:'Not reachable — call again', verdict:'ALL NEED RETRY', color:'red' },
    { tag:'Ghost Calls', val:m.ghost, sub:'Answered but <30s', verdict:'QUALITY FAILURE', color:'red' },
    { tag:'Inbound Missed', val:m.missedInbound.length, sub:'Parent called, no answer', verdict:'CALL BACK NOW', color:'red' },
    { tag:'Agent Hung Up Early', val:m.agentEarlyHangup, sub:'Agent disc. <30s on answered', verdict:'INVESTIGATE', color:'amber' },
  ];
  document.getElementById('leakageKpis').innerHTML = kpis.map(k => `
    <div class="kpi-card ${k.color}">
      <div class="kpi-tag">${k.tag}</div>
      <div class="kpi-number">${k.val}</div>
      <div class="kpi-sub">${k.sub}</div>
      <div class="kpi-verdict ${k.color==='red'?'verdict-red2':'verdict-amber2'}">${k.verdict}</div>
    </div>`).join('');
}

function renderMissedTable(m) {
  document.getElementById('missedBadge').textContent = `${m.missedInbound.length} missed — call NOW`;
  if (m.missedInbound.length === 0) {
    document.getElementById('missedTable').innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--green);padding:20px;">✓ No missed inbound calls today</td></tr>';
    return;
  }
  const seen = {};
  m.missedInbound.forEach(x => { if (!seen[x.num]) seen[x.num] = { ...x, count:1 }; else seen[x.num].count++; });
  const sorted = Object.values(seen).sort((a,b) => b.count - a.count);
  document.getElementById('missedTable').innerHTML = sorted.map((r, i) => `<tr>
    <td style="font-family:var(--mono);color:var(--dim);font-size:11px;">${i+1}</td>
    <td class="text-mono bold">+91-${r.num}</td>
    <td class="text-muted" style="font-size:11px;">${r.time}${r.count>1?` <span style="color:var(--red);font-weight:600;">(called ${r.count}× — TOP PRIORITY)</span>`:''}</td>
    <td>${r.agent}</td>
    <td><span class="panel-badge badge-red">📞 Call Back NOW</span></td>
  </tr>`).join('');
}

function renderGhostBars(m) {
  const agents = Object.entries(m.byAgent)
    .filter(([,d]) => d.ghost > 0)
    .sort(([,a],[,b]) => b.ghost - a.ghost);
  const max = agents[0]?.[1]?.ghost || 1;
  document.getElementById('ghostBars').innerHTML = agents.map(([name, d]) => `
    <div style="display:grid;grid-template-columns:130px 1fr 90px;align-items:center;gap:10px;margin-bottom:10px;">
      <div style="font-size:12px;font-weight:600;">${name.split(' ')[0]}</div>
      <div class="mini-bar-wrap"><div class="mini-bar-track"><div class="mini-bar-fill" style="width:${d.ghost/max*100}%;background:${d.ghost>=5?'var(--red)':'var(--amber)'}"></div></div></div>
      <div style="text-align:right;font-family:var(--mono);font-size:11px;"><span style="font-weight:600;color:${d.ghost>=5?'var(--red)':'var(--amber)'};">${d.ghost}</span><span style="color:var(--dim);"> of ${d.answered}</span></div>
    </div>`).join('') + '<div style="margin-top:10px;padding:10px;background:var(--amber-bg);border-radius:5px;border:1px solid var(--amber-border);font-size:11px;font-weight:600;color:var(--amber);">Ghost calls = wrong number, stale lead, or agent calling before reading profile. Pull recordings and audit.</div>';
}

function renderDiscBars(m) {
  const agents = Object.entries(m.byAgent)
    .filter(([,d]) => d.earlyHangup > 0)
    .sort(([,a],[,b]) => b.earlyHangup - a.earlyHangup);
  document.getElementById('discBars').innerHTML = agents.length === 0
    ? '<p style="color:var(--green);font-size:12px;">✓ No early agent hangups detected.</p>'
    : agents.map(([name, d]) => `
      <div style="margin-bottom:8px;padding:8px 12px;background:var(--red-bg);border-radius:5px;border:1px solid var(--red-border);display:flex;justify-content:space-between;align-items:center;">
        <span style="font-weight:600;font-size:12px;">${name}</span>
        <span style="font-family:var(--mono);color:var(--red);font-weight:700;">${d.earlyHangup} early hangups</span>
      </div>`).join('');
}

function renderDiscByBars(m) {
  const total = m.discBy.Customer + m.discBy.Executive + m.discBy.System;
  const items = [
    { label:'Customer disconnected', val:m.discBy.Customer, color:'var(--amber)', note:'Normal — healthy' },
    { label:'Executive (agent) disconnected', val:m.discBy.Executive, color:'var(--red)', note: m.total>0&&m.discBy.Executive/total>0.30?'⚠ HIGH — agents hanging up. Pull recordings.':'Within range' },
    { label:'System disconnected', val:m.discBy.System, color:'var(--blue)', note:'Call dropped — flag if frequent' },
  ];
  document.getElementById('discByBars').innerHTML = items.map(it => `
    <div style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <div style="font-size:12px;font-weight:600;">${it.label}</div>
        <div style="font-family:var(--mono);font-size:12px;">${it.val} <span style="color:var(--muted);font-size:10px;">(${total?Math.round(it.val/total*100):0}%)</span></div>
      </div>
      <div class="mini-bar-track" style="height:10px;"><div class="mini-bar-fill" style="width:${total?it.val/total*100:0}%;background:${it.color};"></div></div>
      <div style="font-size:10px;color:var(--muted);margin-top:3px;">${it.note}</div>
    </div>`).join('');
}

function renderTimingInsights(m) {
  const hours = Object.entries(m.byHour)
    .map(([h, d]) => ({ h: parseInt(h), calls: d.calls, ans: d.answered, rate: d.calls>0?Math.round(d.answered/d.calls*100):0 }))
    .sort((a,b) => a.h - b.h);
  const best = [...hours].sort((a,b) => b.rate - a.rate).slice(0,3);
  const worst = [...hours].sort((a,b) => a.rate - b.rate).filter(x=>x.calls>5).slice(0,2);
  const highVol = [...hours].sort((a,b) => b.calls - a.calls)[0];

  document.getElementById('timingInsights').innerHTML = `
    <div style="padding:10px;background:var(--green-bg);border-radius:5px;border:1px solid var(--green-border);">
      <div style="font-size:10px;font-family:var(--mono);color:var(--green);font-weight:700;margin-bottom:3px;">BEST WINDOWS</div>
      <div style="font-size:12px;font-weight:600;">${best.map(x=>`${x.h}:00 (${x.rate}%)`).join(' · ')}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px;">Stack priority leads in these slots</div>
    </div>
    <div style="padding:10px;background:var(--red-bg);border-radius:5px;border:1px solid var(--red-border);">
      <div style="font-size:10px;font-family:var(--mono);color:var(--red);font-weight:700;margin-bottom:3px;">AVOID / CRM TIME</div>
      <div style="font-size:12px;font-weight:600;">${worst.map(x=>`${x.h}:00 (${x.rate}%)`).join(' · ')}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px;">Use for CRM updates, not calls</div>
    </div>
    <div style="padding:10px;background:var(--amber-bg);border-radius:5px;border:1px solid var(--amber-border);">
      <div style="font-size:10px;font-family:var(--mono);color:var(--amber);font-weight:700;margin-bottom:3px;">VOLUME vs RATE GAP</div>
      <div style="font-size:12px;font-weight:600;">${highVol?`${highVol.h}:00 has most calls (${highVol.calls}) but only ${highVol.rate}% answer rate`:'—'}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px;">Shift volume to best windows</div>
    </div>`;
}

function renderActionPlan(m) {
  const actions = [];

  if (m.missedInbound.length > 0)
    actions.push({ num:'01', color:'var(--red)', badge:'badge-red', label:'🔥 CRITICAL — DO NOW',
      title:`Call back ${m.missedInbound.length} missed inbound call${m.missedInbound.length>1?'s':''} immediately`,
      desc:`Parents called YOU — they are the hottest leads. ${m.missedInbound.length} calls went unanswered. Assign Priya to call back within 60 minutes.`,
      owner:'Priya Patil', eta:'Next 60 minutes' });

  if (m.busy > 100)
    actions.push({ num:'02', color:'var(--red)', badge:'badge-red', label:'🔥 CRITICAL — TODAY',
      title:`Retry ${m.busy} BUSY leads — second attempt needed`,
      desc:`${m.busy} calls hit BUSY. At current answer rate, a retry could yield ${Math.round(m.busy*parseFloat(m.answerRate)/100)} more conversations. Filter Mcube for BUSY status, create callback list, run retry blitz 10am–12pm.`,
      owner:'Akash Swami', eta:'10am today' });

  const poorAgents = Object.entries(m.byAgent).filter(([,d]) => d.total>5 && d.quality/d.total < 0.08).map(([n])=>n);
  if (poorAgents.length > 0)
    actions.push({ num:'03', color:'var(--red)', badge:'badge-red', label:'⚠ URGENT — TODAY STANDUP',
      title:`Pull recordings for ${poorAgents.map(n=>n.split(' ')[0]).join(', ')} — poor quality rate`,
      desc:`${poorAgents.join(', ')} have effective rates below 8%. Check for ghost calls, wrong lists, or wrong timing. Listen to 5 recordings each in standup.`,
      owner:'Carol / Akash', eta:'Today standup' });

  const highExec = Object.entries(m.byAgent).filter(([,d]) => d.execBusy >= 5).map(([n,d])=>({n,eb:d.execBusy}));
  if (highExec.length > 0)
    actions.push({ num: String(actions.length+1).padStart(2,'0'), color:'var(--amber)', badge:'badge-amber', label:'⚠ HIGH — TODAY',
      title:`Fix availability for ${highExec.map(x=>x.n.split(' ')[0]).join(', ')} — ${highExec.map(x=>x.eb).join('+')} missed leads`,
      desc:`${highExec.map(x=>`${x.n}: ${x.eb} Executive Busy incidents`).join(', ')}. Rule: toggle Away before leaving desk. Non-negotiable.`,
      owner:'Akash Swami', eta:'Today' });

  if (parseFloat(m.effectiveRate) < 15)
    actions.push({ num: String(actions.length+1).padStart(2,'0'), color:'var(--blue)', badge:'badge-blue', label:'PROCESS — ONGOING',
      title:`Redefine daily KPI to Quality Calls — not raw dials`,
      desc:`Effective rate is ${m.effectiveRate}%. Total calls (${m.total}) sounds good but only ${m.quality} were real conversations. Target: 12 quality calls per agent per day.`,
      owner:'Praveen / Akash', eta:'From tomorrow' });

  document.getElementById('actionPlan').innerHTML = actions.map(a => `
    <div style="display:flex;gap:16px;padding:16px;background:var(--surface);border-radius:8px;box-shadow:var(--shadow);margin-bottom:12px;border-left:4px solid ${a.color};">
      <div style="font-family:var(--mono);font-size:20px;font-weight:700;color:${a.color};min-width:36px;">${a.num}</div>
      <div style="flex:1;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap;">
          <div style="font-size:13px;font-weight:700;">${a.title}</div>
          <span class="panel-badge ${a.badge}">${a.label}</span>
        </div>
        <div style="font-size:11px;color:var(--muted);line-height:1.7;">${a.desc}</div>
        <div style="margin-top:8px;font-size:11px;display:flex;gap:16px;">
          <span><span style="color:var(--dim);">Owner:</span> <span style="font-weight:600;">${a.owner}</span></span>
          <span><span style="color:var(--dim);">ETA:</span> <span style="font-weight:600;color:${a.color}">${a.eta}</span></span>
        </div>
      </div>
    </div>`).join('') || '<div class="alert-box green">✓ No critical actions today — team is performing well.</div>';
}

function renderStandupScript(m, filename) {
  const agents = Object.entries(m.byAgent)
    .map(([name, d]) => ({ name, ...d, effRate: d.total>0?d.quality/d.total*100:0 }))
    .sort((a,b) => b.effRate - a.effRate);
  const top = agents[0];
  const poor = agents.filter(a => a.effRate < 8 && a.total > 5);
  const highEB = agents.filter(a => a.execBusy >= 5);

  document.getElementById('standupScript').innerHTML = `
    <div style="font-family:var(--mono);font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">STANDUP SCRIPT · AKASH READS THIS TO TEAM · AUTO-GENERATED FROM ${filename}</div>
    <div><span style="font-weight:600;">Overall:</span> ${m.total} calls today. ${m.answered} answered (${m.answerRate}%). Only ${m.quality} were real conversations over 60 seconds. Effective rate: ${m.effectiveRate}%. ${parseFloat(m.effectiveRate)<15?'That is not good enough. We fix this today.':'Keep it up.'}</div>
    ${top?`<div style="margin-top:8px;"><span style="font-weight:600;">Top performer:</span> ${top.name} — ${top.total} calls, ${top.total>0?(top.answered/top.total*100).toFixed(0):0}% answer rate, ${(top.talkSec/60).toFixed(0)} mins talk time, ${top.quality} quality calls. This is the standard everyone else measures against.</div>`:''}
    ${poor.length>0?`<div style="margin-top:8px;"><span style="font-weight:600;">Needs coaching:</span> ${poor.map(a=>`${a.name} (${a.quality} quality calls from ${a.total} total — ${a.effRate.toFixed(0)}% eff. rate)`).join(', ')}. Pull 3 recordings each and review today.</div>`:''}
    ${highEB.length>0?`<div style="margin-top:8px;"><span style="font-weight:600;">Availability problem:</span> ${highEB.map(a=>`${a.name.split(' ')[0]} had ${a.execBusy} Executive Busy incidents`).join(', ')}. Toggle Away before you leave your desk.</div>`:''}
    ${m.missedInbound.length>0?`<div style="margin-top:8px;"><span style="font-weight:600;">First task right now:</span> ${m.missedInbound.length} parents called us and got no answer. Assign to Priya. Call back within the hour.</div>`:''}
    <div style="margin-top:8px;"><span style="font-weight:600;">Today's target:</span> Minimum 12 quality calls each. Not dials — quality conversations over 60 seconds.</div>`;
}

// ═══════════════════════════════════════════════════════════════
// PART 5 — CHARTS
// ═══════════════════════════════════════════════════════════════
Chart.defaults.font.family = "'Sora', sans-serif";
Chart.defaults.font.size = 11;

function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

function buildDailyChart(m) {
  destroyChart('dailyChart');
  const dates = Object.keys(m.byDate).sort();
  charts.dailyChart = new Chart(document.getElementById('dailyChart'), {
    type:'bar',
    data:{ labels:dates, datasets:[
      { label:'Total', data:dates.map(d=>m.byDate[d].total), backgroundColor:'rgba(26,75,140,0.2)', borderColor:'rgba(26,75,140,0.5)', borderWidth:1, borderRadius:3, order:2 },
      { label:'Answered', data:dates.map(d=>m.byDate[d].answered), backgroundColor:'rgba(26,107,58,0.7)', borderColor:'rgba(26,107,58,1)', borderWidth:1, borderRadius:3, order:1 },
    ]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{ backgroundColor:'#1a1916', titleColor:'#fff', bodyColor:'#aaa' } }, scales:{ x:{ ticks:{color:'#6b6860',font:{size:10}}, grid:{display:false} }, y:{ ticks:{color:'#6b6860',font:{size:10}}, grid:{color:'rgba(0,0,0,0.05)'} } } }
  });
}

function buildOutcomeChart(m) {
  destroyChart('outcomeChart');
  charts.outcomeChart = new Chart(document.getElementById('outcomeChart'), {
    type:'doughnut',
    data:{ labels:['ANSWER','BUSY','Exec Busy','CANCEL'], datasets:[{ data:[m.answered,m.busy,m.execBusy,m.cancel], backgroundColor:['#1a6b3a','#c8352a','#b85c00','#a8a59e'], borderWidth:0, hoverOffset:4 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'65%', plugins:{ legend:{ position:'right', labels:{ color:'#6b6860', font:{size:10}, padding:10 } } } }
  });
}

function buildDurationChart(m) {
  destroyChart('durationChart');
  const labels = Object.keys(m.durationBuckets);
  const data = Object.values(m.durationBuckets);
  charts.durationChart = new Chart(document.getElementById('durationChart'), {
    type:'bar',
    data:{ labels, datasets:[{ data, backgroundColor:['rgba(200,53,42,0.8)','rgba(184,92,0,0.6)','rgba(26,107,58,0.5)','rgba(26,107,58,0.7)','rgba(26,107,58,0.85)','rgba(26,75,140,0.8)'], borderRadius:3, borderSkipped:false }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, scales:{ x:{ ticks:{color:'#6b6860',font:{size:9}}, grid:{display:false} }, y:{ ticks:{color:'#6b6860',font:{size:10}}, grid:{color:'rgba(0,0,0,0.05)'} } } }
  });
}

function buildQualityChart(m) {
  destroyChart('qualityChart');
  const agents = Object.entries(m.byAgent).filter(([,d])=>d.total>0).sort(([,a],[,b])=>b.quality-a.quality);
  charts.qualityChart = new Chart(document.getElementById('qualityChart'), {
    type:'bar',
    data:{ labels:agents.map(([n])=>n.split(' ')[0]), datasets:[{ data:agents.map(([,d])=>d.quality), backgroundColor:agents.map(([,d])=>d.quality>=12?'rgba(26,107,58,0.8)':d.quality>=7?'rgba(184,92,0,0.7)':'rgba(200,53,42,0.7)'), borderRadius:3, borderSkipped:false }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, scales:{ x:{ ticks:{color:'#6b6860',font:{size:10}}, grid:{display:false} }, y:{ ticks:{color:'#6b6860',font:{size:10}}, grid:{color:'rgba(0,0,0,0.05)'} } } }
  });
}

function buildTalkChart(m) {
  destroyChart('talkChart');
  const agents = Object.entries(m.byAgent).filter(([,d])=>d.total>0).sort(([,a],[,b])=>b.talkSec-a.talkSec);
  charts.talkChart = new Chart(document.getElementById('talkChart'), {
    type:'bar',
    data:{ labels:agents.map(([n])=>n.split(' ')[0]), datasets:[{ data:agents.map(([,d])=>parseFloat((d.talkSec/60).toFixed(1))), backgroundColor:agents.map(([,d])=>d.talkSec/60>=40?'rgba(26,107,58,0.8)':d.talkSec/60>=20?'rgba(184,92,0,0.7)':'rgba(200,53,42,0.7)'), borderRadius:3, borderSkipped:false }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, scales:{ x:{ ticks:{color:'#6b6860',font:{size:10}}, grid:{display:false} }, y:{ ticks:{color:'#6b6860',font:{size:10}}, grid:{color:'rgba(0,0,0,0.05)'} } } }
  });
}

function buildFunnelChart(m) {
  destroyChart('funnelChart');
  const realConv = m.answered - m.ghost;
  charts.funnelChart = new Chart(document.getElementById('funnelChart'), {
    type:'bar',
    data:{ labels:['Total Calls','Answered','Talk >30s','Quality >60s'], datasets:[{ data:[m.total,m.answered,realConv,m.quality], backgroundColor:['rgba(26,75,140,0.6)','rgba(184,92,0,0.6)','rgba(184,92,0,0.8)','rgba(26,107,58,0.8)'], borderRadius:4, borderSkipped:false }] },
    options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, scales:{ x:{ ticks:{color:'#6b6860',font:{size:10}}, grid:{color:'rgba(0,0,0,0.05)'} }, y:{ ticks:{color:'#6b6860',font:{size:10}}, grid:{display:false} } } }
  });
}

function buildHourlyChart(m) {
  destroyChart('hourlyChart');
  const hours = Object.keys(m.byHour).map(Number).sort((a,b)=>a-b);
  const calls = hours.map(h=>m.byHour[h].calls);
  const rates = hours.map(h=>m.byHour[h].calls>0?Math.round(m.byHour[h].answered/m.byHour[h].calls*100):0);
  charts.hourlyChart = new Chart(document.getElementById('hourlyChart'), {
    type:'bar',
    data:{ labels:hours.map(h=>`${h}:00`), datasets:[
      { label:'Total Calls', data:calls, backgroundColor:'rgba(26,75,140,0.2)', borderColor:'rgba(26,75,140,0.4)', borderWidth:1, borderRadius:3, yAxisID:'y', order:2 },
      { label:'Answer Rate %', data:rates, type:'line', borderColor:'#1a6b3a', backgroundColor:'rgba(26,107,58,0.1)', borderWidth:2, pointRadius:4, pointBackgroundColor:'#1a6b3a', yAxisID:'y1', tension:0.3, order:1 }
    ]},
    options:{ responsive:true, maintainAspectRatio:false, interaction:{ mode:'index', intersect:false },
      plugins:{ legend:{ labels:{ color:'#6b6860', font:{size:10} } }, tooltip:{ backgroundColor:'#1a1916', titleColor:'#fff', bodyColor:'#aaa' } },
      scales:{ y:{ ticks:{color:'#6b6860',font:{size:10}}, grid:{color:'rgba(0,0,0,0.05)'}, title:{display:true,text:'Calls',color:'#6b6860',font:{size:9}} }, y1:{ position:'right', ticks:{color:'#1a6b3a',font:{size:10},callback:v=>v+'%'}, grid:{display:false}, min:0, max:100, title:{display:true,text:'Ans%',color:'#1a6b3a',font:{size:9}} }, x:{ ticks:{color:'#6b6860',font:{size:10}}, grid:{display:false} } } }
  });
}

function buildVolumeHourChart(m) {
  destroyChart('volumeHourChart');
  const hours = Object.keys(m.byHour).map(Number).sort((a,b)=>a-b);
  const worstH = hours.reduce((worst,h) => m.byHour[h].calls > 5 && m.byHour[h].answered/m.byHour[h].calls < (m.byHour[worst]?.answered/m.byHour[worst]?.calls??1) ? h : worst, hours[0]);
  const bestH = hours.filter(h=>m.byHour[h].calls>5).reduce((best,h) => m.byHour[h].answered/m.byHour[h].calls > (m.byHour[best]?.answered/m.byHour[best]?.calls??0) ? h : best, hours[0]);
  charts.volumeHourChart = new Chart(document.getElementById('volumeHourChart'), {
    type:'bar',
    data:{ labels:hours.map(h=>`${h}:00`), datasets:[{ data:hours.map(h=>m.byHour[h].calls), backgroundColor:hours.map(h=>h===bestH?'rgba(26,107,58,0.7)':h===worstH?'rgba(200,53,42,0.7)':'rgba(26,75,140,0.3)'), borderRadius:3, borderSkipped:false }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, scales:{ x:{ ticks:{color:'#6b6860',font:{size:10}}, grid:{display:false} }, y:{ ticks:{color:'#6b6860',font:{size:10}}, grid:{color:'rgba(0,0,0,0.05)'} } } }
  });
}

// ═══════════════════════════════════════════════════════════════
// PART 6 — NAVIGATION
// ═══════════════════════════════════════════════════════════════
function showTab(id, btn) {
  document.querySelectorAll('.tab-content').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(el=>el.classList.remove('active'));
  document.getElementById('tab-'+id).classList.add('active');
  if (btn) btn.classList.add('active');
  window.scrollTo({top:48,behavior:'smooth'});
}
