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

