/* Hot Dashboard - Frontend Application */

// ========== 状态 ==========
let data = null, idx = 0, playing = false, speed = 1, timer = null;
let activeTab = 'stocks', mode = 'replay';
const speeds = [1, 2, 5, 10];
let si = 0;
let liveTimer = null;
const API = window.location.origin;

// ========== 视图模式切换 ==========
function detectMobile() {
  var saved = localStorage.getItem('viewMode');
  if (saved) {
    document.documentElement.classList.toggle('mobile-mode', saved === 'mobile');
  } else {
    document.documentElement.classList.toggle('mobile-mode', window.innerWidth <= 768);
  }
  updateViewToggleBtn();
}

function toggleViewMode() {
  var isMobile = document.documentElement.classList.toggle('mobile-mode');
  localStorage.setItem('viewMode', isMobile ? 'mobile' : 'desktop');
  updateViewToggleBtn();
  render();
}

function updateViewToggleBtn() {
  var btn = document.getElementById('btnViewToggle');
  if (!btn) return;
  var isMobile = document.documentElement.classList.contains('mobile-mode');
  btn.textContent = isMobile ? '🖥' : '📱';
  btn.title = isMobile ? '切换到桌面版' : '切换到移动版';
}

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
  detectMobile();
  fetchAvailableDates();
  setupTabs();
});

function setupTabs() {
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () {
      activeTab = this.getAttribute('data-tab');
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      this.classList.add('active');
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      document.getElementById('panel-' + activeTab).classList.add('active');
      render();
    });
  });
}

// ========== 模式切换 ==========
function switchMode(m) {
  mode = m;
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active', (m === 'replay' && b.textContent.includes('回放')) ||
      (m === 'live' && b.textContent.includes('实时')));
  });
  document.getElementById('datePicker').style.display = m === 'replay' ? 'flex' : 'none';
  document.getElementById('timelineBar').style.display = m === 'replay' ? 'block' : 'none';
  document.getElementById('btnPlay').style.display = m === 'replay' ? '' : 'none';
  document.getElementById('btnSpeed').style.display = m === 'replay' ? '' : 'none';

  if (playing) {
    clearInterval(timer);
    playing = false;
    document.getElementById('btnPlay').textContent = '▶';
    document.getElementById('btnPlay').classList.remove('active');
  }
  if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }

  if (m === 'live') {
    loadLive();
  } else if (data && data.snapshots) {
    initSlider();
    render();
  }
}

// ========== 日期选择 ==========
function fetchAvailableDates() {
  fetch(API + '/api/dates')
    .then(r => r.json())
    .then(dates => {
      const sel = document.getElementById('dateSelect');
      sel.innerHTML = '';
      dates.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.date;
        opt.textContent = d.date + ' (' + d.size_kb + 'KB)';
        sel.appendChild(opt);
      });
      if (dates.length > 0) {
        loadDate(dates[0].date);
      } else {
        document.getElementById('dateLabel').textContent = '暂无数据';
      }
    })
    .catch(() => {
      document.getElementById('dateLabel').textContent = 'API 连接失败';
    });
}

function loadDate(dateStr) {
  document.getElementById('dateLabel').textContent = '加载中 ' + dateStr + '...';
  fetch(API + '/api/day/' + dateStr)
    .then(r => {
      if (!r.ok) throw new Error('not found');
      return r.json();
    })
    .then(d => {
      data = d;
      initSlider();
      render();
    })
    .catch(() => {
      document.getElementById('dateLabel').textContent = '加载失败: ' + dateStr;
    });
}

// ========== 实时模式 ==========
function loadLive() {
  function doFetch() {
    fetch(API + '/api/latest')
      .then(r => r.json())
      .then(d => {
        data = {
          date: d.date, total: d.total_messages,
          snapshots: [{
            t: d.time, msg: d.total_messages, grp: d.active_groups,
            sent: d.overall_sentiment,
            sd: {
              bu: d.sentiment_detail.bull, be: d.sentiment_detail.bear,
              ne: d.sentiment_detail.neutral,
              eh: d.sentiment_detail.extreme_high,
              el: d.sentiment_detail.extreme_low
            },
            act: d.action_summary || {},
            stk: (d.top10_stocks || []).map(t => ({
              c: t.code, n: t.name || '', sc: t.score,
              mc: t.mention_count, gc: t.group_count,
              ac: t.action_count, bu: t.bull, be: t.bear,
              sec: t.sectors || []
            })),
            sec: (d.top8_sectors || []).map(t => ({
              n: t.name, sc: t.score,
              mc: t.mention_count, gc: t.group_count,
              txt: (t.sample_text || '').slice(0, 60),
              gd: (t.group_details || []).map(g => ({
                g: g.group, c: g.count,
                m: g.messages.map(m => ({ t: m.time, x: m.text }))
              }))
            }))
          }]
        };
        idx = 0;
        document.getElementById('dateLabel').textContent = '📅 ' + data.date + ' · 实时';
        document.getElementById('curTime').textContent = data.snapshots[0].t.split(' ')[1];
        render();
      })
      .catch(() => {
        document.getElementById('dateLabel').textContent = '等待实时数据...';
      });
  }
  doFetch();
  liveTimer = setInterval(doFetch, 30000);
}

// ========== 手动采集 ==========
function triggerCollect() {
  const btn = document.getElementById('btnCollect');
  btn.textContent = '⏳ 采集中...';
  btn.disabled = true;
  fetch(API + '/api/collect', { method: 'POST' })
    .then(r => r.json())
    .then(() => {
      btn.textContent = '✅ 完成';
      setTimeout(() => {
        btn.textContent = '🔄 采集';
        btn.disabled = false;
      }, 2000);
      if (mode === 'live') loadLive();
      fetchAvailableDates();
    })
    .catch(() => {
      btn.textContent = '❌ 失败';
      setTimeout(() => {
        btn.textContent = '🔄 采集';
        btn.disabled = false;
      }, 2000);
    });
}

// ========== 时间轴 ==========
function initSlider() {
  if (!data || !data.snapshots) return;
  document.getElementById('dateLabel').textContent = '📅 ' + data.date + ' · 共' + data.total + '条消息';
  var s = data.snapshots;
  document.getElementById('slider').max = s.length - 1;
  document.getElementById('slider').value = s.length - 1;
  idx = s.length - 1;
  document.getElementById('tlS').textContent = s[0].t.split(' ')[1];
  document.getElementById('tlE').textContent = s[s.length - 1].t.split(' ')[1];
  document.getElementById('slider').oninput = function () { idx = +this.value; render(); };
}

function togglePlay() {
  playing = !playing;
  var btn = document.getElementById('btnPlay');
  btn.textContent = playing ? '⏸' : '▶';
  btn.classList.toggle('active', playing);
  if (playing) {
    timer = setInterval(function () {
      idx++;
      if (idx >= data.snapshots.length) idx = 0;
      document.getElementById('slider').value = idx;
      render();
    }, 1000 / speed);
  } else {
    clearInterval(timer);
  }
}

function cycleSpeed() {
  si = (si + 1) % speeds.length;
  speed = speeds[si];
  document.getElementById('btnSpeed').textContent = speed + 'x';
  if (playing) {
    clearInterval(timer);
    timer = setInterval(function () {
      idx++;
      if (idx >= data.snapshots.length) idx = 0;
      document.getElementById('slider').value = idx;
      render();
    }, 1000 / speed);
  }
}

function jumpLatest() { idx = data.snapshots.length - 1; document.getElementById('slider').value = idx; render(); }
function jumpFirst() { idx = 0; document.getElementById('slider').value = 0; render(); }

// ========== 渲染 ==========
function render() {
  if (!data || !data.snapshots || !data.snapshots[idx]) return;
  var snap = data.snapshots[idx];
  document.getElementById('curTime').textContent = snap.t.split(' ')[1];

  document.getElementById('statsBar').innerHTML =
    '<div class="stat"><div class="val" style="color:var(--accent)">' + snap.msg + '</div><div class="label">消息</div></div>' +
    '<div class="stat"><div class="val" style="color:var(--accent)">' + snap.grp + '</div><div class="label">群</div></div>' +
    '<div class="stat"><div class="val" style="color:var(--green)">' + (snap.sd ? snap.sd.bu : '-') + '</div><div class="label">看多</div></div>' +
    '<div class="stat"><div class="val" style="color:var(--red)">' + (snap.sd ? snap.sd.be : '-') + '</div><div class="label">看空</div></div>' +
    '<div class="stat"><div class="val" style="color:var(--gold)">' + snap.sent + '</div><div class="label">情绪</div></div>';

  var maxS = snap.stk && snap.stk.length > 0 ? snap.stk[0].sc : 1;

  var isMobile = document.documentElement.classList.contains('mobile-mode');

  if (activeTab === 'stocks') {
    if (isMobile) renderStocksMobile(snap, maxS);
    else renderStocks(snap, maxS);
  } else if (activeTab === 'sectors') {
    if (isMobile) renderSectorsMobile(snap);
    else renderSectors(snap);
  } else if (activeTab === 'sentiment') {
    if (isMobile) renderSentimentMobile(snap);
    else renderSentiment(snap);
  } else if (activeTab === 'actions') {
    if (isMobile) renderActionsMobile(snap);
    else renderActions(snap);
  }
}

function renderStocks(snap, maxS) {
  var tb = document.getElementById('stockBody');
  if (!snap.stk || !snap.stk.length) {
    tb.innerHTML = '<tr><td colspan="9" class="empty">暂无热点</td></tr>';
    return;
  }
  var h = '';
  snap.stk.forEach(function (it, i) {
    var r = i + 1, rd = r;
    if (r === 1) rd = '🥇'; else if (r === 2) rd = '🥈'; else if (r === 3) rd = '🥉';
    var sc = 'sc-l';
    if (it.sc >= 60) sc = 'sc-h'; else if (it.sc >= 30) sc = 'sc-m';
    var p = Math.min(100, it.sc / maxS * 100);
    var bullTag = it.bu > it.be ? '<span class="tag tag-g">多' + it.bu + '</span>' :
      it.be > it.bu ? '<span class="tag tag-r">空' + it.be + '</span>' :
        '<span class="tag tag-b">均</span>';
    var actTag = it.ac > 0 ? '<span class="tag tag-r">操' + it.ac + '</span>' : '-';
    var secTags = it.sec.slice(0, 3).map(function (s) { return '<span class="tag tag-s">' + s + '</span>'; }).join(' ');
    h += '<tr><td style="font-weight:700">' + rd + '</td>' +
      '<td><span class="code">' + it.c + '</span></td><td>' + (it.n || '-') + '</td>' +
      '<td><span class="' + sc + '">' + it.sc + '</span><span class="pbar"><span class="fill" style="width:' + p + '%"></span></span></td>' +
      '<td>' + it.mc + '</td><td>' + it.gc + '</td><td>' + bullTag + '</td><td>' + secTags + '</td><td>' + actTag + '</td></tr>';
  });
  tb.innerHTML = h;
}

function renderStocksMobile(snap, maxS) {
  var container = document.getElementById('stockMobile');
  if (!snap.stk || !snap.stk.length) {
    container.innerHTML = '<div class="empty">暂无热点</div>';
    return;
  }
  var h = '';
  snap.stk.forEach(function (it, i) {
    var r = i + 1, rd = r;
    if (r === 1) rd = '🥇'; else if (r === 2) rd = '🥈'; else if (r === 3) rd = '🥉';
    var sc = 'sc-l';
    if (it.sc >= 60) sc = 'sc-h'; else if (it.sc >= 30) sc = 'sc-m';
    var p = Math.min(100, it.sc / maxS * 100);
    var bullTag = it.bu > it.be ? '<span class="tag tag-g">多' + it.bu + '</span>' :
      it.be > it.bu ? '<span class="tag tag-r">空' + it.be + '</span>' :
        '<span class="tag tag-b">均</span>';
    var actTag = it.ac > 0 ? '<span class="tag tag-r">操' + it.ac + '</span>' : '';
    var secTags = it.sec.slice(0, 3).map(function (s) { return '<span class="tag tag-s">' + s + '</span>'; }).join(' ');
    var nm = it.n || '-';
    h += '<div class="stock-card">' +
      '<div class="name-row"><div><span class="rank">' + rd + '</span> <span class="code">' + it.c + '</span><span class="name">' + nm + '</span></div><span class="' + sc + '">' + it.sc + '</span></div>' +
      '<div class="heat-bar"><div class="fill" style="width:' + p + '%;background:' + (it.sc >= 60 ? 'var(--green)' : it.sc >= 30 ? 'var(--yellow)' : 'var(--text2)') + '"></div></div>' +
      '<div class="meta">' +
      '<span class="tag tag-b">' + it.mc + '提及</span>' +
      '<span class="tag tag-b">' + it.gc + '群</span>' +
      bullTag + actTag + secTags +
      '</div></div>';
  });
  container.innerHTML = h;
}

function renderSectors(snap) {
  currentSectors = snap.sec || [];
  var grid = document.getElementById('sectorGrid');
  if (!currentSectors.length) {
    grid.innerHTML = '<div class="empty">暂无板块数据</div>';
    return;
  }
  var maxSc = currentSectors[0].sc || 1;
  var colors = ['var(--accent)', 'var(--green)', 'var(--purple)', 'var(--yellow)', 'var(--orange)', 'var(--red)', 'var(--text2)'];
  var h = '';
  currentSectors.forEach(function (it, i) {
    var pct = Math.min(100, it.sc / maxSc * 100);
    var bg = colors[i % colors.length];
    h += '<div class="sector-card" onclick="openSectorModal(' + i + ')">' +
      '<div class="sn">' + it.n + '</div>' +
      '<div class="info">' + it.mc + '次提及 · ' + it.gc + '个群</div>' +
      '<div class="bar"><div class="fill" style="width:' + pct + '%;background:' + bg + '"></div></div>' +
      '<div class="info" style="margin-top:3px;opacity:.7">' + (it.txt || '') + '</div></div>';
  });
  grid.innerHTML = h;
}

function renderSectorsMobile(snap) {
  renderSectors(snap);
}

// ========== 板块详情弹窗 ==========
let currentSectors = [];
function openSectorModal(sectorIdx) {
  var sec = currentSectors[sectorIdx];
  if (!sec) return;
  document.getElementById('modalTitle').textContent = '🏭 ' + sec.n;
  document.getElementById('modalStats').innerHTML =
    '<div class="stat"><div class="val" style="color:var(--accent)">' + sec.mc + '</div><div class="label">提及</div></div>' +
    '<div class="stat"><div class="val" style="color:var(--green)">' + sec.gc + '</div><div class="label">群数</div></div>' +
    '<div class="stat"><div class="val" style="color:var(--gold)">' + sec.sc + '</div><div class="label">热度</div></div>';
  var h = '';
  if (sec.gd && sec.gd.length > 0) {
    sec.gd.forEach(function (g) {
      h += '<div class="msg-group">' +
        '<div class="msg-group-header"><span class="gn">' + g.g + '</span><span class="gc">' + g.c + '条消息</span></div>';
      g.m.forEach(function (m) {
        h += '<div class="msg-item"><div class="mt">' + m.t + '</div><div class="mx">' + escHtml(m.x) + '</div></div>';
      });
      h += '</div>';
    });
  } else {
    h = '<div class="empty">暂无详情</div>';
  }
  document.getElementById('modalBody').innerHTML = h;
  document.getElementById('modalOverlay').classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('show');
  document.body.style.overflow = '';
}
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeModal();
});
function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderSentiment(snap) {
  var sd = snap.sd;
  if (!sd) return;
  var total = sd.bu + sd.be + sd.ne || 1;
  var bp = Math.round(sd.bu / total * 100), ep = Math.round(sd.be / total * 100), np = 100 - bp - ep;
  document.getElementById('sentLabel').textContent = snap.sent;
  document.getElementById('sentMeter').innerHTML =
    '<div class="sent-bar sent-bull" style="width:' + bp + '%"></div>' +
    '<div class="sent-bar sent-neu" style="width:' + np + '%"></div>' +
    '<div class="sent-bar sent-bear" style="width:' + ep + '%"></div>';
  document.getElementById('sentDetails').innerHTML =
    '<div class="stat"><div class="val" style="color:var(--green)">' + sd.bu + '</div><div class="label">看多</div></div>' +
    '<div class="stat"><div class="val" style="color:var(--yellow)">' + sd.ne + '</div><div class="label">观望</div></div>' +
    '<div class="stat"><div class="val" style="color:var(--red)">' + sd.be + '</div><div class="label">看空</div></div>' +
    '<div class="stat"><div class="val" style="color:var(--gold)">' + sd.eh + '</div><div class="label">亢奋</div></div>' +
    '<div class="stat"><div class="val" style="color:var(--red)">' + sd.el + '</div><div class="label">悲观</div></div>';
  var items = [
    { n: '看多', v: sd.bu, c: 'var(--green)' }, { n: '看空', v: sd.be, c: 'var(--red)' },
    { n: '观望', v: sd.ne, c: 'var(--yellow)' }, { n: '极度亢奋', v: sd.eh, c: 'var(--gold)' },
    { n: '极度悲观', v: sd.el, c: 'var(--red)' }
  ];
  var h = '';
  items.forEach(function (it) {
    h += '<tr><td style="color:' + it.c + '">' + it.n + '</td><td>' + it.v + '</td><td>' + Math.round(it.v / total * 100) + '%</td></tr>';
  });
  document.getElementById('sentBody').innerHTML = h;
}

function renderSentimentMobile(snap) {
  var sd = snap.sd;
  if (!sd) return;
  var total = sd.bu + sd.be + sd.ne || 1;
  var bp = Math.round(sd.bu / total * 100), ep = Math.round(sd.be / total * 100), np = 100 - bp - ep;
  document.getElementById('sentLabel').textContent = snap.sent;
  document.getElementById('sentMeter').innerHTML =
    '<div class="sent-bar sent-bull" style="width:' + bp + '%"></div>' +
    '<div class="sent-bar sent-neu" style="width:' + np + '%"></div>' +
    '<div class="sent-bar sent-bear" style="width:' + ep + '%"></div>';
  var items = [
    { n: '看多', v: sd.bu, c: 'var(--green)' }, { n: '看空', v: sd.be, c: 'var(--red)' },
    { n: '观望', v: sd.ne, c: 'var(--yellow)' }, { n: '极度亢奋', v: sd.eh, c: 'var(--gold)' },
    { n: '极度悲观', v: sd.el, c: 'var(--red)' }
  ];
  var ch = '';
  items.forEach(function (it) {
    ch += '<div class="detail-card"><span class="dc-label" style="color:' + it.c + '">' + it.n + '</span>' +
      '<span class="dc-value" style="color:' + it.c + '">' + it.v + ' (' + Math.round(it.v / total * 100) + '%)</span></div>';
  });
  var dc = document.getElementById('sentDetailCards');
  if (dc) dc.innerHTML = ch;
}

function renderActions(snap) {
  var act = snap.act || {};
  var total = 0;
  for (var k in act) total += act[k];
  if (!total) total = 1;
  var icons = { '买入信号': '🟢', '卖出信号': '🔴', '持有建议': '🟡', '风险提示': '⚠️' };
  var grid = document.getElementById('actionGrid'), gh = '';
  for (var k in act) {
    gh += '<div class="action-card"><div class="icon">' + (icons[k] || '📊') + '</div>' +
      '<div class="count">' + act[k] + '</div><div class="label">' + k + '</div></div>';
  }
  grid.innerHTML = gh;
  var keywords = {
    '买入信号': '买/加仓/建仓/上车/抄底/打板',
    '卖出信号': '卖/减仓/清仓/取关/割肉',
    '持有建议': '持有/拿住/格局/等/再看看',
    '风险提示': '风险/注意/谨慎/别追/别急/等回调'
  };
  var h = '';
  for (var k in act) {
    h += '<tr><td>' + k + '</td><td>' + act[k] + '</td><td>' + Math.round(act[k] / total * 100) + '%</td><td style="font-size:10px;color:var(--text2)">' + (keywords[k] || '') + '</td></tr>';
  }
  document.getElementById('actBody').innerHTML = h;
}

function renderActionsMobile(snap) {
  var act = snap.act || {};
  var total = 0;
  for (var k in act) total += act[k];
  if (!total) total = 1;
  var icons = { '买入信号': '🟢', '卖出信号': '🔴', '持有建议': '🟡', '风险提示': '⚠️' };
  var grid = document.getElementById('actionGrid'), gh = '';
  for (var k in act) {
    gh += '<div class="action-card"><div class="icon">' + (icons[k] || '📊') + '</div>' +
      '<div class="count">' + act[k] + '</div><div class="label">' + k + '</div></div>';
  }
  grid.innerHTML = gh;
  var ch = '';
  for (var k in act) {
    ch += '<div class="detail-card"><span class="dc-label">' + k + '</span>' +
      '<span class="dc-value">' + act[k] + ' (' + Math.round(act[k] / total * 100) + '%)</span></div>';
  }
  var dc = document.getElementById('actDetailCards');
  if (dc) dc.innerHTML = ch;
}
