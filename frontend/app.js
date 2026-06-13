/* Hot Dashboard - Frontend Application */

// ========== 状态 ==========
let data = null, idx = 0, playing = false, speed = 1, timer = null;
let activeTab = 'stocks', mode = 'replay';
const speeds = [1, 2, 5, 10];
let si = 0;
let liveTimer = null;
const API = window.location.origin;

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
  fetchAvailableDates();
  setupTabs();
});

function setupTabs() {
  document.querySelectorAll('[data-tab]').forEach(function (t) {
    t.addEventListener('click', function () {
      activeTab = this.getAttribute('data-tab');
      document.querySelectorAll('[data-tab]').forEach(x => {
        x.classList.remove('btn-primary');
        x.classList.add('btn-ghost');
      });
      this.classList.remove('btn-ghost');
      this.classList.add('btn-primary');
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      document.getElementById('panel-' + activeTab).classList.add('active');
      render();
    });
  });
}

// ========== 模式切换 ==========
function switchMode(m) {
  mode = m;
  document.querySelectorAll('.mode-bar button').forEach(b => {
    b.classList.remove('btn-primary');
    b.classList.add('btn-ghost');
  });
  var activeBtn = m === 'replay'
    ? Array.from(document.querySelectorAll('.mode-bar button')).find(b => b.textContent.includes('回放'))
    : Array.from(document.querySelectorAll('.mode-bar button')).find(b => b.textContent.includes('实时'));
  if (activeBtn) {
    activeBtn.classList.remove('btn-ghost');
    activeBtn.classList.add('btn-primary');
  }
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

  if (activeTab === 'stocks') {
    renderStocks(snap);
  } else if (activeTab === 'sectors') {
    renderSectors(snap);
  } else if (activeTab === 'sentiment') {
    renderSentiment(snap);
  } else if (activeTab === 'actions') {
    renderActions(snap);
  }
}


function renderStocks(snap) {
  var container = document.getElementById('stockMobile');
  if (!snap.stk || !snap.stk.length) {
    container.innerHTML = '<div class="empty">暂无热点</div>';
    return;
  }
  var h = '';
  snap.stk.forEach(function (it, i) {
    var rank = i + 1;
    var heatColor = it.sc >= 80 ? 'success' : it.sc >= 60 ? 'warning' : 'error';
    var heatGradient = it.sc >= 80 ? 'from-success to-green-700' : it.sc >= 60 ? 'from-warning to-yellow-700' : 'from-error to-red-700';
    var sentText = it.bu > it.be ? '看多' : it.be > it.bu ? '看空' : '观望';
    var sentTag = sentText === '看多' ? 'badge-success' : sentText === '看空' ? 'badge-error' : 'badge-warning';
    var secTags = it.sec.slice(0, 2).map(function (s) { return '<span class="badge badge-info badge-sm">' + s + '</span>'; }).join('');

    h += '<div class="bg-base-200 border border-base-300 rounded-lg p-3 hover:border-primary transition-colors cursor-pointer">' +
      '<div class="flex justify-between items-center mb-2">' +
        '<span class="text-xs text-slate-400 font-semibold">#' + rank + '</span>' +
        '<span class="text-xl font-bold text-' + heatColor + '">' + it.sc + '</span>' +
      '</div>' +
      '<div class="text-sm font-bold text-white mb-0.5">' + (it.n || '-') + '</div>' +
      '<div class="text-xs text-primary font-mono mb-2">' + it.c + '</div>' +
      '<div class="flex gap-1 flex-wrap mb-2">' +
        '<span class="badge ' + sentTag + ' badge-sm">' + sentText + '</span>' +
        (it.sec.length > 0 ? secTags : '') +
      '</div>' +
      '<div class="h-1 bg-base-300 rounded-full overflow-hidden">' +
        '<div class="h-full bg-gradient-to-r ' + heatGradient + ' rounded-full" style="width:' + Math.min(100, it.sc) + '%"></div>' +
      '</div>' +
      '<div class="text-xs text-slate-400 mt-1.5">提及 ' + it.mc + ' 次 · ' + it.gc + ' 个群</div>' +
    '</div>';
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
  var html = currentSectors.map(function (s, i) {
    return '<div class="bg-base-200 border border-base-300 rounded-lg p-3 hover:border-primary transition-colors cursor-pointer" onclick="openSectorModal(' + i + ')">' +
      '<div class="text-base font-bold text-white mb-1">' + s.n + '</div>' +
      '<div class="text-xs text-slate-400 mb-2">提及 ' + s.mc + ' 次 · ' + s.gc + ' 个群</div>' +
      '<div class="h-1 bg-base-300 rounded-full overflow-hidden">' +
        '<div class="h-full bg-gradient-to-r from-primary to-blue-700 rounded-full" style="width:' + Math.min(100, s.sc) + '%"></div>' +
      '</div>' +
    '</div>';
  }).join('');
  grid.innerHTML = html;
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
  var bp = Math.round(sd.bu / total * 100);
  var ep = Math.round(sd.be / total * 100);
  var np = 100 - bp - ep;

  var sentColor = snap.sent && snap.sent.includes('多') ? 'success' : snap.sent && snap.sent.includes('空') ? 'error' : 'warning';
  var sentLabelEn = snap.sent && snap.sent.includes('多') ? 'Bullish' : snap.sent && snap.sent.includes('空') ? 'Bearish' : 'Neutral';

  var sentLabel = document.getElementById('sentLabel');
  sentLabel.textContent = snap.sent + ' (' + sentLabelEn + ')';
  sentLabel.className = 'text-lg font-bold mb-2 text-' + sentColor;

  var meter = document.getElementById('sentMeter');
  meter.innerHTML =
    '<div class="w-[' + bp + '%] h-full bg-gradient-to-r from-success to-green-700"></div>' +
    '<div class="w-[' + np + '%] h-full bg-slate-500"></div>' +
    '<div class="w-[' + ep + '%] h-full bg-gradient-to-r from-error to-red-700"></div>';
}

