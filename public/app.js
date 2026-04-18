// ===== 状態管理 =====
const state = {
  availableDates: { years: [], months: {} },
  dailyChart: null,
  areaChart: null,
  eventChart: null,
  hourlyLineChart: null,
  hourlyAreaChart: null,
  overviewChart: null,
  seasonChart: null,
  sensorAnalysisChart: null,
  map: null,
  sensorAnalysisMap: null,
  mapMarkers: [],
  sensorAnalysisMarkers: [],
  sharedDate: '',  // 動的マップ・時間帯分析・エリア別で共有する日付
};

// ===== 日付共有 =====
function syncSharedDate(date) {
  if (!date) return;
  state.sharedDate = date;
  ['dynamic-date', 'hourly-date-input', 'area-date-input'].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.value !== date) el.value = date;
  });
}

// ===== ユーティリティ =====
function showLoading() { document.getElementById('loading-overlay').classList.add('show'); }
function hideLoading() { document.getElementById('loading-overlay').classList.remove('show'); }

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

function formatNumber(n) { return Math.round(n).toLocaleString(); }

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

function getDayOfWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return ['日','月','火','水','木','金','土'][d.getDay()];
}

// ===== イベントモーダル =====
function showEventModal(ev) {
  document.getElementById('modal-title').textContent = ev.name;
  document.getElementById('modal-location').textContent = `📍 ${ev.locationName || ''}`;
  document.getElementById('modal-summary').textContent = ev.summary || '概要情報なし';
  const urlEl = document.getElementById('modal-url');
  if (ev.detailedUrl) {
    urlEl.innerHTML = `<a href="${ev.detailedUrl}" target="_blank" class="event-link">🔗 詳細ページを開く</a>`;
  } else {
    urlEl.innerHTML = '';
  }
  document.getElementById('event-modal').classList.add('show');
}
document.getElementById('modal-close').addEventListener('click', () => {
  document.getElementById('event-modal').classList.remove('show');
});

// ESCキーでモーダルを閉じる
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.getElementById('event-modal').classList.remove('show');
  }
});

// モーダル外クリックで閉じる
document.getElementById('event-modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('event-modal')) {
    document.getElementById('event-modal').classList.remove('show');
  }
});

// ===== タブ切替 =====
const VIEW_TITLES = {overview:'全期間比較', daily:'日別人流', dynamic:'動的マップ', hourly:'時間帯分析', area:'エリア別', ranking:'人流ランキング', event:'イベント効果'};

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');

    // Update breadcrumb
    const crumb = document.getElementById('crumb');
    if (crumb) crumb.textContent = VIEW_TITLES[btn.dataset.tab] || btn.dataset.tab;

    // 日付タブ切替: 共有日付を反映して自動ロード + コントロールハイライト
    const DATE_TAB_MAP = { dynamic: 'dynamic-date', hourly: 'hourly-date-input', area: 'area-date-input' };
    const PH_CTRL_MAP  = { dynamic: 'dynamic-placeholder', hourly: 'hourly-placeholder', area: 'area-placeholder' };
    if (DATE_TAB_MAP[btn.dataset.tab]) {
      // プレースホルダーが表示中ならコントロールをハイライト
      const ph = document.getElementById(PH_CTRL_MAP[btn.dataset.tab]);
      const ctrlEl = document.querySelector('#tab-' + btn.dataset.tab + ' .controls');
      if (ph && ph.style.display !== 'none' && ctrlEl) {
        ctrlEl.classList.add('controls-highlight');
        // データロード後にハイライト解除（MutationObserverで監視）
        const obs = new MutationObserver(() => {
          if (ph.style.display === 'none') { ctrlEl.classList.remove('controls-highlight'); obs.disconnect(); }
        });
        obs.observe(ph, { attributes: true, attributeFilter: ['style'] });
      }
      if (state.sharedDate) {
        document.getElementById(DATE_TAB_MAP[btn.dataset.tab]).value = state.sharedDate;
        if (btn.dataset.tab === 'hourly') loadHourlyData();
        if (btn.dataset.tab === 'area') { if (!state.map) initAreaMap(); loadAreaData(); }
        // dynamicは重いので日付だけ同期・ロードはユーザーが手動で
      }
    }

    if (btn.dataset.tab === 'area' && !state.map) initAreaMap();
    if (btn.dataset.tab === 'ranking' && document.getElementById('ranking-list').children.length === 0) loadRanking();
    if (btn.dataset.tab === 'event') {
      initEventFilterButtons();
      if (document.getElementById('event-ranking-list').children.length === 0) loadEventRanking('inner', '0');
    }
    if (btn.dataset.tab === 'overview' && !state.overviewChart) loadOverview();
    // 動的マップのサイズを再計算
    if (btn.dataset.tab === 'dynamic' && state.dynamicMap) {
      setTimeout(() => state.dynamicMap.invalidateSize(), 100);
    }
  });
});

// ===== 動的マップ =====
const dynamicState = {
  map: null,
  sensorCircles: {},  // sensorId -> L.circleMarker
  eventMarkers: [],
  data: null,         // hourly-detail response
  animation: null,    // setInterval handle
  currentHour: 12,
};

document.getElementById('load-dynamic-btn').addEventListener('click', loadDynamicMap);

// 日付変更 → 全タブ同期 + Enterキーで実行
['dynamic-date', 'hourly-date-input', 'area-date-input'].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('change', () => syncSharedDate(el.value));
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      syncSharedDate(el.value);
      if (id === 'dynamic-date') loadDynamicMap();
      else if (id === 'hourly-date-input') loadHourlyData();
      else if (id === 'area-date-input') loadAreaData();
    }
  });
});

async function loadDynamicMap() {
  const date = document.getElementById('dynamic-date').value;
  if (!date) return alert('日付を選択してください');
  syncSharedDate(date);
  stopDynamicAnimation();
  showLoading();
  try {
    const data = await fetchJSON('/api/hourly-detail?date=' + date);
    dynamicState.data = data;

    // 初回のみ地図を初期化
    if (!dynamicState.map) {
      dynamicState.map = L.map('dynamic-map').setView([38.2635, 140.872], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 18,
      }).addTo(dynamicState.map);
    }
    state.dynamicMap = dynamicState.map; // タブ切替時の invalidateSize 用

    initDynamicMarkers(data);
    renderHourlyMinibar(data);
    renderDynamicEventsList(data);

    // ピーク時間にデフォルト設定
    const peakHour = data.hours.reduce((a, b) => a.total > b.total ? a : b).hour;
    document.getElementById('dynamic-slider').value = peakHour;
    dynamicState.currentHour = peakHour;
    updateDynamicMap(peakHour);

    document.getElementById('dynamic-placeholder').style.display = 'none';
    document.getElementById('dynamic-map-wrapper').style.display = 'block';
    setTimeout(() => dynamicState.map.invalidateSize(), 200);
  } catch(e) {
    console.error(e);
    alert('エラー: ' + e.message);
  } finally {
    hideLoading();
  }
}

// イベントのsummaryから時刻（時）を抽出する
function extractEventHours(summary) {
  if (!summary) return null;
  const matches = [...summary.matchAll(/(\d{1,2}):(\d{2})/g)];
  if (matches.length === 0) return null;
  return matches.map(m => parseInt(m[1]));
}

// 現在の時間帯にイベントが開催中かどうか判定する
function isEventActive(eventHours, currentHour) {
  if (!eventHours) {
    // summaryに時刻がない場合はデフォルトで10〜20時を開催中とみなす
    return currentHour >= 10 && currentHour <= 20;
  }
  // 抽出した時刻の前後1時間を開催中とみなす
  return eventHours.some(h => Math.abs(h - currentHour) <= 1);
}

function initDynamicMarkers(data) {
  // 既存マーカー削除（アニメーションも停止）
  Object.values(dynamicState.sensorCircles).forEach(c => {
    if (c.animation) { clearInterval(c.animation); c.animation = null; }
    c.marker.remove();
  });
  dynamicState.sensorCircles = {};
  dynamicState.eventMarkers.forEach(entry => {
    const m = entry.marker || entry;
    if (m && m.remove) m.remove();
  });
  dynamicState.eventMarkers = [];

  // センサーマーカーを事前生成
  const hour0 = data.hours[0];
  hour0.sensors.forEach(s => {
    if (!s.lat || !s.lng) return;
    const circle = L.circleMarker([s.lat, s.lng], {
      radius: 10,
      fillColor: s.areaColor || '#1a6b9a',
      color: '#fff',
      weight: 1.5,
      fillOpacity: 0.5,
      className: 'sensor-marker',
    });
    circle.bindPopup('');
    circle.addTo(dynamicState.map);
    dynamicState.sensorCircles[s.id] = { marker: circle, sensor: s };
  });

  // イベントマーカー（その日は終日固定表示・時間帯によって色が変化）
  const seenEventLoc = new Set();
  data.events.forEach(e => {
    if (!e.lat || !e.lng) return;
    const key = `${e.lat.toFixed(4)},${e.lng.toFixed(4)}`;
    const alreadyThere = seenEventLoc.has(key);
    seenEventLoc.add(key);

    // 同地点に複数イベントがある場合は少しずらす
    const lat = alreadyThere ? e.lat + (Math.random() - 0.5) * 0.0003 : e.lat;
    const lng = alreadyThere ? e.lng + (Math.random() - 0.5) * 0.0003 : e.lng;

    // summaryから時刻情報を抽出してマーカーに保存
    const eventHours = extractEventHours(e.summary || null);

    const marker = L.circleMarker([lat, lng], {
      radius: 11,
      fillColor: '#888888',
      color: '#666666',
      weight: 2.5,
      fillOpacity: 0.6,
      className: 'event-marker',
    });

    const summaryText = e.summary ? `<p style="margin-top:6px;font-size:11px;line-height:1.5;color:#ccc">${e.summary.substring(0, 120)}${e.summary.length > 120 ? '…' : ''}</p>` : '';
    const urlText = e.detailedUrl ? `<a href="${e.detailedUrl}" target="_blank" style="font-size:11px;color:#58a6ff">🔗 詳細を見る</a>` : '';
    marker.bindPopup(`
      <div style="font-family:sans-serif;font-size:13px;max-width:240px">
        <div style="font-weight:700;color:#ffd700;margin-bottom:4px">📅 ${e.name}</div>
        <div style="font-size:11px;color:#aaa">📍 ${e.locationName || ''}</div>
        ${summaryText}
        ${urlText}
      </div>
    `, { maxWidth: 260 });
    marker.addTo(dynamicState.map);

    // イベント情報をエントリとして配列に保存
    dynamicState.eventMarkers.push({ marker, eventHours });
  });
}

// センサーマーカーのサイズ・透明度をアニメーションで補間変化させる
function animateMarker(entry, targetRadius, targetOpacity) {
  const STEPS = 8;
  let step = 0;
  const startRadius = entry.currentRadius !== undefined ? entry.currentRadius : 10;
  const startOpacity = entry.currentOpacity !== undefined ? entry.currentOpacity : 0.5;

  if (entry.animation) {
    clearInterval(entry.animation);
    entry.animation = null;
  }
  entry.animation = setInterval(() => {
    step++;
    const t = step / STEPS;
    const r = startRadius + (targetRadius - startRadius) * t;
    const o = startOpacity + (targetOpacity - startOpacity) * t;
    entry.marker.setRadius(r);
    entry.marker.setStyle({ fillOpacity: o });
    if (step >= STEPS) {
      clearInterval(entry.animation);
      entry.animation = null;
      entry.currentRadius = targetRadius;
      entry.currentOpacity = targetOpacity;
    }
  }, 40); // 40ms × 8 = 320ms で完了
}

function updateDynamicMap(hour) {
  if (!dynamicState.data) return;
  const hourData = dynamicState.data.hours[hour];
  if (!hourData) return;

  dynamicState.currentHour = hour;

  const maxCount = Math.max(...hourData.sensors.map(s => s.count), 1);

  hourData.sensors.forEach(s => {
    const entry = dynamicState.sensorCircles[s.id];
    if (!entry) return;

    const ratio = s.count / maxCount;
    const targetRadius = 7 + ratio * 30;
    const targetOpacity = 0.15 + ratio * 0.8;

    // アニメーションで緩やかにサイズ・透明度を変化させる
    animateMarker(entry, targetRadius, targetOpacity);

    entry.marker.setPopupContent(`
      <div style="font-family:sans-serif;font-size:13px">
        <strong>${s.name}</strong><br>
        <span style="color:#888;font-size:11px">${s.area}</span><br>
        <span style="color:#ccc">${hour}:00の人流: </span><strong>${formatNumber(s.count)}</strong>
      </div>
    `);
  });

  // イベントマーカーの色を時間帯に応じて更新
  dynamicState.eventMarkers.forEach(entry => {
    const { marker, eventHours } = entry;
    const active = isEventActive(eventHours, hour);
    if (active) {
      marker.setStyle({ fillColor: '#ff4444', color: '#cc0000', fillOpacity: 0.9 });
      // SVG要素にパルスクラスを付与
      const el = marker.getElement();
      if (el) el.classList.add('event-marker-active');
    } else {
      marker.setStyle({ fillColor: '#888888', color: '#666666', fillOpacity: 0.6 });
      const el = marker.getElement();
      if (el) el.classList.remove('event-marker-active');
    }
  });

  // UI更新
  document.getElementById('dynamic-hour-label').textContent = `${String(hour).padStart(2,'0')}:00`;
  document.getElementById('dynamic-total-label').textContent = `合計 ${formatNumber(hourData.total)} 人`;
  document.getElementById('dynamic-slider').value = hour;

  // ミニバーのアクティブ更新
  document.querySelectorAll('.minibar-cell').forEach((el, i) => {
    el.classList.toggle('active', i === hour);
  });
}

// スライダー操作
document.getElementById('dynamic-slider').addEventListener('input', (e) => {
  stopDynamicAnimation();
  updateDynamicMap(parseInt(e.target.value));
});

// 再生/停止
document.getElementById('dynamic-play-btn').addEventListener('click', toggleDynamicAnimation);

function toggleDynamicAnimation() {
  if (dynamicState.animation) {
    stopDynamicAnimation();
  } else {
    startDynamicAnimation();
  }
}

function startDynamicAnimation() {
  const btn = document.getElementById('dynamic-play-btn');
  btn.textContent = '⏸ 停止';
  btn.classList.add('playing');

  const speed = parseInt(document.getElementById('dynamic-speed').value);
  dynamicState.animation = setInterval(() => {
    const next = (dynamicState.currentHour + 1) % 24;
    updateDynamicMap(next);
    if (next === 0) stopDynamicAnimation();
  }, speed);
}

function stopDynamicAnimation() {
  if (dynamicState.animation) {
    clearInterval(dynamicState.animation);
    dynamicState.animation = null;
  }
  const btn = document.getElementById('dynamic-play-btn');
  btn.textContent = '▶ 再生';
  btn.classList.remove('playing');
}

function renderHourlyMinibar(data) {
  const container = document.getElementById('hourly-minibar');
  const maxTotal = Math.max(...data.hours.map(h => h.total), 1);

  let html = '';
  data.hours.forEach(h => {
    const ratio = h.total / maxTotal;
    const heightPct = Math.max(4, Math.round(ratio * 100));
    html += `<div class="minibar-cell ${h.hour === dynamicState.currentHour ? 'active' : ''}"
      title="${h.hour}時: ${formatNumber(h.total)}"
      data-hour="${h.hour}"
      style="--bar-h:${heightPct}%">
      <div class="minibar-bar"></div>
      <div class="minibar-label">${h.hour % 3 === 0 ? h.hour : ''}</div>
    </div>`;
  });
  container.innerHTML = html;

  container.querySelectorAll('.minibar-cell').forEach(el => {
    el.addEventListener('click', () => {
      stopDynamicAnimation();
      updateDynamicMap(parseInt(el.dataset.hour));
    });
  });
}

function renderDynamicEventsList(data) {
  const container = document.getElementById('dynamic-events-list');
  if (!data.events || data.events.length === 0) {
    container.innerHTML = '<p class="no-events">この日はイベント情報がありません</p>';
    return;
  }

  let html = `<div class="dev-list-title">📅 この日のイベント（${data.events.length}件）</div><div class="dev-list-grid">`;
  data.events.forEach(e => {
    const hasCoord = e.lat && e.lng;
    html += `
      <div class="dev-card ${hasCoord ? 'has-loc' : ''}">
        <div class="dev-name">${e.name}</div>
        <div class="dev-loc">📍 ${e.locationName || '—'}${hasCoord ? ' <span class="on-map">地図あり</span>' : ''}</div>
        ${e.summary ? `<div class="dev-summary">${e.summary.substring(0, 60)}${e.summary.length > 60 ? '…' : ''}</div>` : ''}
      </div>`;
  });
  html += '</div>';
  container.innerHTML = html;
}

// ===== 利用可能な年月取得 =====
async function initDateSelectors() {
  try {
    const data = await fetchJSON('/api/available-dates');
    state.availableDates = data;

    const yearSel = document.getElementById('year-select');
    for (const y of data.years) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y + '年';
      yearSel.appendChild(opt);
    }
    if (data.years.length > 0) {
      yearSel.value = data.years[data.years.length - 1];
      updateMonthSelector(yearSel.value);
    }
  } catch(e) {
    console.error('Failed to load available dates:', e);
  }
}

function updateMonthSelector(year) {
  const monthSel = document.getElementById('month-select');
  monthSel.innerHTML = '<option value="">全月</option>';
  const months = state.availableDates.months[year] || [];
  for (const m of months) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = parseInt(m) + '月';
    monthSel.appendChild(opt);
  }
}

document.getElementById('year-select').addEventListener('change', (e) => {
  updateMonthSelector(e.target.value);
});

// ===== 全期間比較 =====
async function loadOverview() {
  showLoading();
  try {
    // チャートに必須なデータだけ先に取得
    const [monthly, eventData] = await Promise.all([
      fetchJSON('/api/year-monthly'),
      fetchJSON('/api/event-ranking'),
    ]);
    renderOverviewChart(monthly);
    renderSeasonChart(monthly);
    renderTopEventsSummary(eventData.slice(0, 10));
  } catch(e) {
    console.error('Overview load error:', e);
  } finally {
    hideLoading();
  }
  // KPIは独立して取得（失敗してもチャートに影響しない）
  fetchJSON('/api/stats').then(renderKpiCards).catch(e => console.warn('Stats API:', e));
}

function renderKpiCards(stats) {
  const fmt = n => Math.round(n).toLocaleString();
  const el = id => document.getElementById(id);
  if (!el('kpi-total-flow-val')) return; // HTML未対応時はスキップ

  el('kpi-total-flow-val').textContent = fmt(stats.totalFlow);
  el('kpi-avg-daily-val').textContent = fmt(stats.avgDaily);
  el('kpi-max-day-val').textContent = fmt(stats.maxDay.total);
  el('kpi-max-day-date').textContent = formatDate(stats.maxDay.date) + ' (' + getDayOfWeek(stats.maxDay.date) + ')';
  el('kpi-event-count-val').textContent = stats.eventCount + ' 件';
  if (stats.peakMonth) {
    const [y, m] = stats.peakMonth.split('-');
    el('kpi-peak-month-val').textContent = y + '年' + parseInt(m) + '月';
  }
}

document.getElementById('overview-mode').addEventListener('change', async () => {
  showLoading();
  try {
    const monthly = await fetchJSON('/api/year-monthly');
    renderOverviewChart(monthly);
    renderSeasonChart(monthly);
  } catch(e) {
    console.error(e);
  } finally {
    hideLoading();
  }
});

function renderOverviewChart(monthly) {
  const mode = document.getElementById('overview-mode').value;
  const years = Object.keys(monthly).sort();
  const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
  const monthLabels = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

  const yearColors = {
    '2024': { bg: 'rgba(88,166,255,0.75)', border: 'rgb(88,166,255)' },
    '2025': { bg: 'rgba(63,185,80,0.75)', border: 'rgb(63,185,80)' },
    '2026': { bg: 'rgba(240,136,62,0.75)', border: 'rgb(240,136,62)' },
  };

  const datasets = years.map(year => {
    const data = months.map(m => {
      const d = monthly[year]?.[m];
      if (!d) return null;
      return mode === 'monthly-avg' ? d.avg : d.total;
    });
    const col = yearColors[year] || { bg: 'rgba(210,153,34,0.75)', border: 'rgb(210,153,34)' };
    return {
      label: year + '年',
      data,
      backgroundColor: col.bg,
      borderColor: col.border,
      borderWidth: 1.5,
      borderRadius: 3,
    };
  });

  const ctx = document.getElementById('overviewChart').getContext('2d');
  if (state.overviewChart) state.overviewChart.destroy();
  state.overviewChart = new Chart(ctx, {
    type: 'bar',
    data: { labels: monthLabels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#111111' } },
        tooltip: {
          backgroundColor: '#ffffff',
          titleColor: '#111111',
          bodyColor: '#333333',
          borderColor: 'rgba(0,0,0,0.18)',
          borderWidth: 1,
          callbacks: {
            label: (item) => `${item.dataset.label}: ${formatNumber(item.raw)}${mode === 'monthly-avg' ? ' (日平均)' : ''}`,
          }
        }
      },
      scales: {
        x: { ticks: { color: '#333333' }, grid: { color: 'rgba(0,0,0,0.12)' } },
        y: { ticks: { color: '#333333', callback: v => formatNumber(v) }, grid: { color: 'rgba(0,0,0,0.12)' } }
      }
    }
  });
}

function renderSeasonChart(monthly) {
  // 月別の年平均（季節傾向）
  const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
  const monthLabels = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  const years = Object.keys(monthly).sort();

  const seasonAvg = months.map(m => {
    const vals = years.map(y => monthly[y]?.[m]?.avg).filter(v => v != null);
    return vals.length > 0 ? Math.round(vals.reduce((s,v)=>s+v,0)/vals.length) : 0;
  });

  const ctx = document.getElementById('seasonChart').getContext('2d');
  if (state.seasonChart) state.seasonChart.destroy();
  state.seasonChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: monthLabels,
      datasets: [{
        label: '月別日平均人流量（全年平均）',
        data: seasonAvg,
        borderColor: 'rgb(210,153,34)',
        backgroundColor: 'rgba(210,153,34,0.15)',
        borderWidth: 2.5,
        pointRadius: 5,
        pointBackgroundColor: 'rgb(210,153,34)',
        fill: true,
        tension: 0.3,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#111111' } },
        tooltip: {
          backgroundColor: '#ffffff',
          titleColor: '#111111',
          bodyColor: '#333333',
          borderColor: 'rgba(0,0,0,0.18)',
          borderWidth: 1,
          callbacks: { label: (item) => `日平均: ${formatNumber(item.raw)} 人` }
        }
      },
      scales: {
        x: { ticks: { color: '#333333' }, grid: { color: 'rgba(0,0,0,0.12)' } },
        y: { ticks: { color: '#333333', callback: v => formatNumber(v) }, grid: { color: 'rgba(0,0,0,0.12)' } }
      }
    }
  });
}

function renderTopEventsSummary(events) {
  const container = document.getElementById('top-events-summary');
  container.innerHTML = '';
  events.forEach((ev, idx) => {
    const card = document.createElement('div');
    card.className = 'top-event-card';
    const scoreSign = ev.effectScore >= 0 ? '+' : '';
    const scoreClass = ev.effectScore >= 10 ? 'big-positive' : ev.effectScore >= 0 ? 'small-positive' : 'negative';
    card.innerHTML = `
      <div class="tec-rank">${idx + 1}</div>
      <div class="tec-body">
        <div class="tec-name">${ev.name}</div>
        <div class="tec-loc">📍 ${ev.locationName || ''}</div>
        ${ev.summary ? `<div class="tec-summary">${ev.summary.substring(0, 80)}${ev.summary.length > 80 ? '…' : ''}</div>` : ''}
      </div>
      <div class="tec-score ${scoreClass}">${scoreSign}${ev.effectScore}%</div>
    `;
    card.style.cursor = 'pointer';
    card.title = '詳細を表示';
    card.addEventListener('click', () => showEventModal(ev));
    container.appendChild(card);
  });
}

// ===== 日別人流グラフ =====
document.getElementById('load-daily-btn').addEventListener('click', loadDailyChart);

async function loadDailyChart() {
  showLoading();
  try {
    const year = document.getElementById('year-select').value;
    const month = document.getElementById('month-select').value;
    let url = '/api/daily-summary';
    const params = [];
    if (year) params.push('year=' + year);
    if (year && month) params.push('month=' + month);
    if (params.length) url += '?' + params.join('&');
    const data = await fetchJSON(url);
    renderDailyChart(data);
  } catch(e) {
    console.error(e);
    alert('データ取得エラー: ' + e.message);
  } finally {
    hideLoading();
  }
}

function renderDailyChart(data) {
  const labels = data.map(d => d.date);
  const counts = data.map(d => d.total);
  const bgColors = data.map(d => {
    if (d.events && d.events.length > 0) return 'rgba(62,185,80,0.85)';
    if (d.holiday === 1) return 'rgba(240,136,62,0.85)';
    return 'rgba(88,166,255,0.75)';
  });
  const borderColors = data.map(d => {
    if (d.events && d.events.length > 0) return 'rgb(62,185,80)';
    if (d.holiday === 1) return 'rgb(240,136,62)';
    return 'rgb(88,166,255)';
  });

  const annotations = {};
  data.forEach((d, i) => {
    if (d.events && d.events.length > 0) {
      const topEvent = d.events[0];
      const label = topEvent.name.length > 14 ? topEvent.name.substring(0, 14) + '…' : topEvent.name;
      annotations['event_' + i] = {
        type: 'line',
        xMin: i, xMax: i,
        borderColor: 'rgba(62,185,80,0.5)',
        borderWidth: 1.5,
        label: {
          display: true,
          content: label,
          position: 'start',
          yAdjust: -6,
          backgroundColor: 'rgba(62,185,80,0.85)',
          color: '#111111',
          font: { size: 9, weight: 'bold' },
          padding: { x: 4, y: 2 },
          borderRadius: 3,
        }
      };
    }
  });

  const ctx = document.getElementById('dailyChart').getContext('2d');
  if (state.dailyChart) state.dailyChart.destroy();
  state.dailyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '日次人流量（全センサー合計）',
        data: counts,
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: 1,
        borderRadius: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#111111' } },
        tooltip: {
          backgroundColor: '#ffffff',
          titleColor: '#111111',
          bodyColor: '#333333',
          borderColor: 'rgba(0,0,0,0.18)',
          borderWidth: 1,
          callbacks: {
            title: (items) => {
              const idx = items[0].dataIndex;
              const d = data[idx];
              return `${formatDate(d.date)} (${getDayOfWeek(d.date)})`;
            },
            label: (item) => `人流量: ${formatNumber(item.raw)}`,
            afterLabel: (item) => {
              const d = data[item.dataIndex];
              const lines = [];
              if (d.holiday) lines.push('🎌 休日・祝日');
              if (d.events && d.events.length > 0) {
                lines.push('📅 イベント: ' + d.events.slice(0,3).map(e=>e.name).join(' / '));
                if (d.events.length > 3) lines.push(`  …他${d.events.length - 3}件`);
              }
              return lines;
            }
          }
        },
        annotation: { annotations },
      },
      scales: {
        x: {
          ticks: {
            color: '#333333', maxTicksLimit: 31, maxRotation: 45,
            callback: (val, idx) => {
              const d = data[idx];
              if (!d) return '';
              const date = new Date(d.date + 'T00:00:00');
              return `${date.getMonth()+1}/${date.getDate()}`;
            }
          },
          grid: { color: 'rgba(0,0,0,0.12)' }
        },
        y: { ticks: { color: '#333333', callback: v => formatNumber(v) }, grid: { color: 'rgba(0,0,0,0.12)' } }
      },
      onClick: (event, elements) => {
        if (elements.length > 0) showDayEvents(data[elements[0].index]);
      }
    }
  });
}

function showDayEvents(dayData) {
  const panel = document.getElementById('daily-events-panel');
  if (!dayData.events || dayData.events.length === 0) {
    panel.innerHTML = `<p>${formatDate(dayData.date)} — イベントなし</p>`;
    return;
  }
  let html = `<strong>${formatDate(dayData.date)} のイベント (${dayData.events.length}件):</strong><br style="margin-bottom:8px">`;
  html += dayData.events.map(e =>
    `<span class="event-tag clickable-event" data-name="${encodeURIComponent(e.name)}" data-loc="${encodeURIComponent(e.locationName||'')}" data-summary="${encodeURIComponent(e.summary||'')}" data-url="${encodeURIComponent(e.detailedUrl||'')}">📅 ${e.name} <span class="loc">${e.locationName || ''}</span></span>`
  ).join('');
  panel.innerHTML = html;

  panel.querySelectorAll('.clickable-event').forEach(el => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => {
      showEventModal({
        name: decodeURIComponent(el.dataset.name),
        locationName: decodeURIComponent(el.dataset.loc),
        summary: decodeURIComponent(el.dataset.summary),
        detailedUrl: decodeURIComponent(el.dataset.url),
      });
    });
  });
}

// ===== 時間帯分析 =====
document.getElementById('load-hourly-btn').addEventListener('click', loadHourlyData);

async function loadHourlyData() {
  const date = document.getElementById('hourly-date-input').value;
  if (!date) return alert('日付を選択してください');
  syncSharedDate(date);
  showLoading();
  try {
    const data = await fetchJSON('/api/hourly-detail?date=' + date);
    // コンテナを先に表示してからChart.jsを描画（canvas のサイズが確定してから描画）
    const ph = document.getElementById('hourly-placeholder');
    const content = document.getElementById('hourly-content');
    if (ph) ph.style.display = 'none';
    if (content) content.style.display = 'block';
    renderHourlyCharts(data);
    renderHourlyHeatmap(data);
    renderHourlyEventsBanner(data);
  } catch(e) {
    console.error(e);
    alert('データ取得エラー: ' + e.message);
  } finally {
    hideLoading();
  }
}

function renderHourlyEventsBanner(data) {
  const banner = document.getElementById('hourly-events-banner');
  if (!data.events || data.events.length === 0) {
    banner.innerHTML = '';
    return;
  }
  const tags = data.events.slice(0, 5).map(e =>
    `<span class="event-tag">${e.name}</span>`
  ).join('');
  banner.innerHTML = `<span style="color:var(--text-muted);font-size:12px;margin-right:8px">この日のイベント:</span>${tags}`;
}

function renderHourlyCharts(data) {
  const hours = data.hours.map(h => `${h.hour}時`);
  const totals = data.hours.map(h => h.total);

  // Line chart: 時間帯別合計
  const lineCtx = document.getElementById('hourlyLineChart').getContext('2d');
  if (state.hourlyLineChart) state.hourlyLineChart.destroy();
  state.hourlyLineChart = new Chart(lineCtx, {
    type: 'line',
    data: {
      labels: hours,
      datasets: [{
        label: '時間帯別人流量',
        data: totals,
        borderColor: 'rgb(88,166,255)',
        backgroundColor: 'rgba(88,166,255,0.1)',
        borderWidth: 2,
        pointRadius: 3,
        fill: true,
        tension: 0.3,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#111111' } },
        tooltip: {
          backgroundColor: '#ffffff', titleColor: '#111111', bodyColor: '#333333',
          borderColor: 'rgba(0,0,0,0.18)', borderWidth: 1,
          callbacks: { label: (item) => `人流量: ${formatNumber(item.raw)}` }
        },
        annotation: {
          annotations: (() => {
            if (!data.events || data.events.length === 0) return {};
            const anns = {};
            data.events.forEach((e, idx) => {
              // summaryから時刻抽出
              const timeMatches = e.summary ? [...e.summary.matchAll(/(\d{1,2}):(\d{2})/g)] : [];
              const hours = timeMatches.map(m => parseInt(m[1]));
              if (hours.length === 0) return; // 時間情報なしはスキップ
              const minH = Math.min(...hours) - 1;
              const maxH = Math.max(...hours) + 1;
              const label = e.name.length > 12 ? e.name.substring(0, 12) + '…' : e.name;
              anns['ev_' + idx] = {
                type: 'box',
                xMin: Math.max(0, minH),
                xMax: Math.min(23, maxH),
                backgroundColor: 'rgba(255,166,0,0.1)',
                borderColor: 'rgba(255,166,0,0.3)',
                borderWidth: 1,
                label: {
                  display: true,
                  content: label,
                  color: '#ffa600',
                  font: { size: 9 },
                  position: { x: 'center', y: 'start' },
                }
              };
            });
            return anns;
          })()
        },
      },
      scales: {
        x: { ticks: { color: '#333333' }, grid: { color: 'rgba(0,0,0,0.12)' } },
        y: { ticks: { color: '#333333', callback: v => formatNumber(v) }, grid: { color: 'rgba(0,0,0,0.12)' } }
      }
    }
  });

  // エリア別時間帯棒グラフ（上位5エリアを積み上げ）
  const AREA_COLORS = {
    'アーケード東': '#58a6ff',
    'クリスロード': '#79c0ff',
    'マーブルロード': '#a5d6ff',
    'サンモール一番町': '#d2a8ff',
    'ぶらんど〜む': '#e2b7f7',
    '一番町四丁目': '#f0c27f',
    '定禅寺通': '#3fb950',
    '西公園': '#56d364',
    '仙台市役所': '#d29922',
    '勾当台公園': '#ffa657',
  };

  // エリア別に集計
  const areaMap = {};
  for (const h of data.hours) {
    for (const s of h.sensors) {
      if (!areaMap[s.area]) areaMap[s.area] = Array(24).fill(0);
      areaMap[s.area][h.hour] += s.count;
    }
  }

  const areaDatasets = Object.entries(areaMap).map(([area, counts]) => ({
    label: area,
    data: counts,
    backgroundColor: AREA_COLORS[area] || '#8b949e',
    borderWidth: 0,
    borderRadius: 2,
  }));

  const areaCtx = document.getElementById('hourlyAreaChart').getContext('2d');
  if (state.hourlyAreaChart) state.hourlyAreaChart.destroy();
  state.hourlyAreaChart = new Chart(areaCtx, {
    type: 'bar',
    data: { labels: hours, datasets: areaDatasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#111111', boxWidth: 12, font: { size: 10 } } },
        tooltip: {
          backgroundColor: '#ffffff', titleColor: '#111111', bodyColor: '#333333',
          borderColor: 'rgba(0,0,0,0.18)', borderWidth: 1,
          callbacks: { label: (item) => `${item.dataset.label}: ${formatNumber(item.raw)}` }
        }
      },
      scales: {
        x: { stacked: true, ticks: { color: '#333333' }, grid: { color: 'rgba(0,0,0,0.12)' } },
        y: { stacked: true, ticks: { color: '#333333', callback: v => formatNumber(v) }, grid: { color: 'rgba(0,0,0,0.12)' } }
      }
    }
  });
}

function renderHourlyHeatmap(data) {
  const container = document.getElementById('hourly-heatmap');

  // エリア別に集計
  const areaMap = {};
  for (const h of data.hours) {
    for (const s of h.sensors) {
      if (!areaMap[s.area]) areaMap[s.area] = { counts: Array(24).fill(0), color: s.areaColor };
      areaMap[s.area].counts[h.hour] += s.count;
    }
  }

  const areas = Object.keys(areaMap);
  const allValues = areas.flatMap(a => areaMap[a].counts);
  const maxVal = Math.max(...allValues, 1);

  let html = '<table class="heatmap-table"><thead><tr><th>エリア</th>';
  for (let h = 0; h < 24; h++) html += `<th>${h}</th>`;
  html += '</tr></thead><tbody>';

  for (const area of areas) {
    const { counts, color } = areaMap[area];
    html += `<tr><td class="heatmap-area-name" style="border-left: 3px solid ${color}">${area}</td>`;
    for (let h = 0; h < 24; h++) {
      const val = counts[h];
      const intensity = val / maxVal;
      const alpha = 0.1 + intensity * 0.85;
      const textColor = '#111111';
      html += `<td class="heatmap-cell" style="background: ${hexToRgba(color, alpha)}; color: ${textColor}" title="${area} ${h}時: ${formatNumber(val)}">${val > 0 ? shortNum(val) : ''}</td>`;
    }
    html += '</tr>';
  }

  html += '</tbody></table>';
  container.innerHTML = html;
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function shortNum(n) {
  if (n >= 10000) return Math.round(n/1000) + 'k';
  if (n >= 1000) return (n/1000).toFixed(1) + 'k';
  return Math.round(n);
}

// ===== エリア別 =====
function initAreaMap() {
  state.map = L.map('map').setView([38.2635, 140.872], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 18,
  }).addTo(state.map);
}

document.getElementById('load-area-btn').addEventListener('click', loadAreaData);

async function loadAreaData() {
  const date = document.getElementById('area-date-input').value;
  if (!date) return alert('日付を選択してください');
  syncSharedDate(date);
  showLoading();
  try {
    if (!state.map) initAreaMap();
    const data = await fetchJSON('/api/sensor-detail?date=' + date);
    renderAreaChart(data);
    renderMap(data);
    document.getElementById('area-total').innerHTML =
      `${formatDate(date)} の合計人流量: <strong>${formatNumber(data.total)}</strong> 人`;
    // プレースホルダー非表示
    const ph = document.getElementById('area-placeholder');
    if (ph) ph.style.display = 'none';
  } catch(e) {
    console.error(e);
    alert('データ取得エラー: ' + e.message);
  } finally {
    hideLoading();
  }
}

function renderAreaChart(data) {
  const sensors = data.sensors.sort((a, b) => b.count - a.count);
  const ctx = document.getElementById('areaChart').getContext('2d');
  if (state.areaChart) state.areaChart.destroy();
  const maxCount = Math.max(...sensors.map(s => s.count));

  state.areaChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sensors.map(s => s.name),
      datasets: [{
        label: '人流量',
        data: sensors.map(s => s.count),
        backgroundColor: sensors.map(s => s.areaColor || '#1a6b9a'),
        borderColor: sensors.map(s => s.areaColor || '#58a6ff'),
        borderWidth: 1,
        borderRadius: 3,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#ffffff', titleColor: '#111111', bodyColor: '#333333',
          borderColor: 'rgba(0,0,0,0.18)', borderWidth: 1,
          callbacks: { label: (item) => `人流量: ${formatNumber(item.raw)}` }
        }
      },
      scales: {
        x: { ticks: { color: '#333333', callback: v => formatNumber(v) }, grid: { color: 'rgba(0,0,0,0.12)' } },
        y: { ticks: { color: '#111111', font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.12)' } }
      }
    }
  });
}

function renderMap(data) {
  if (!state.map) initAreaMap();
  state.mapMarkers.forEach(m => m.remove());
  state.mapMarkers = [];

  const sensors = data.sensors.filter(s => s.lat && s.lng);
  if (sensors.length === 0) return;
  const maxCount = Math.max(...sensors.map(s => s.count));

  sensors.forEach(s => {
    const ratio = s.count / (maxCount || 1);
    const radius = 12 + ratio * 30;
    const color = s.areaColor || '#1a6b9a';
    const circle = L.circleMarker([s.lat, s.lng], {
      radius,
      fillColor: color,
      color: '#fff',
      weight: 1.5,
      opacity: 0.9,
      fillOpacity: 0.4 + ratio * 0.5,
    });
    circle.bindPopup(`
      <div style="font-family:sans-serif;font-size:13px">
        <strong>${s.name}</strong><br>
        <span style="color:#888;font-size:11px">${s.area}</span><br>
        人流量: <strong>${formatNumber(s.count)}</strong>
      </div>
    `);
    circle.addTo(state.map);
    state.mapMarkers.push(circle);
  });

  if (data.events) {
    data.events.forEach(e => {
      if (!e.lat || !e.lng) return;
      const marker = L.circleMarker([e.lat, e.lng], {
        radius: 8, fillColor: '#3fb950', color: '#3fb950',
        weight: 2, fillOpacity: 0.7,
      });
      marker.bindPopup(`<strong>📅 ${e.name}</strong><br>${e.locationName || ''}<br><small>${e.summary ? e.summary.substring(0,80)+'…' : ''}</small>`);
      marker.addTo(state.map);
      state.mapMarkers.push(marker);
    });
  }
}

// ===== ランキング =====
document.getElementById('load-ranking-btn').addEventListener('click', loadRanking);

async function loadRanking() {
  showLoading();
  try {
    const data = await fetchJSON('/api/top-days?limit=20');
    renderRanking(data);
  } catch(e) {
    console.error(e);
    alert('データ取得エラー: ' + e.message);
  } finally {
    hideLoading();
  }
}

function renderRanking(data) {
  const list = document.getElementById('ranking-list');
  list.innerHTML = '';

  const maxTotal = Math.max(...data.map(d => d.total), 1);

  data.forEach(item => {
    const div = document.createElement('div');
    div.className = 'ranking-item';
    const rankEmoji = item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : item.rank === 3 ? '🥉' : '';
    const rankClass = item.rank <= 3 ? `top${item.rank}` : '';

    let tagsHtml = '';
    if (item.holiday) tagsHtml += '<span class="tag holiday">🎌 休日</span>';
    else tagsHtml += '<span class="tag weekday">平日</span>';

    const majorEvents = item.events ? item.events.slice(0, 4) : [];
    const extraEvents = item.events ? item.events.slice(4) : [];

    // イベントタグ1件分のHTMLを生成するヘルパー
    const makeEventTagHtml = (e) =>
      `<span class="tag event-tag clickable-event" data-name="${encodeURIComponent(e.name)}" data-loc="${encodeURIComponent(e.locationName||'')}" data-summary="${encodeURIComponent(e.summary||'')}" data-url="${encodeURIComponent(e.detailedUrl||'')}">📅 ${e.name}<button class="jump-hourly-btn" data-date="${item.date}" title="時間帯分析へ">⏱</button></span>`;

    let eventsHtml = '';
    if (majorEvents.length > 0) {
      eventsHtml = majorEvents.map(makeEventTagHtml).join('');
      if (extraEvents.length > 0) {
        eventsHtml += `<button class="tag event-tag expand-events-btn" id="expand-${item.date}" data-date="${item.date}">+${extraEvents.length}件 ▼</button>`;
        eventsHtml += `<div class="expand-events-content" id="expand-content-${item.date}" style="display:none;width:100%;margin-top:4px;display:none;">` +
          extraEvents.map(makeEventTagHtml).join('') +
          `<button class="tag expand-close-btn" data-date="${item.date}">▲ 閉じる</button></div>`;
      }
    }

    div.innerHTML = `
      <div class="rank-num ${rankClass}">${rankEmoji || item.rank}</div>
      <div class="rank-date-wrap">
        <span class="rank-date">${formatDate(item.date)} (${getDayOfWeek(item.date)})</span>
        <button class="jump-map-btn" data-date="${item.date}" title="動的マップへ">🗺</button>
      </div>
      <div class="rank-count">${formatNumber(item.total)}</div>
      <div class="rank-bar-wrap"><div class="rank-bar-fill" style="width:${Math.round(item.total/maxTotal*100)}%"></div></div>
      <div class="rank-tags">${tagsHtml}${eventsHtml}</div>
    `;

    // エリア別に飛ぶ（日付テキスト本体）
    const rankDateEl = div.querySelector('.rank-date');
    rankDateEl.style.cursor = 'pointer';
    rankDateEl.title = 'エリア別を表示';
    rankDateEl.addEventListener('click', () => {
      document.querySelector('[data-tab="area"]').click();
      document.getElementById('area-date-input').value = item.date;
      loadAreaData();
    });

    // 🗺 動的マップへジャンプ
    div.querySelector('.jump-map-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelector('[data-tab="dynamic"]').click();
      document.getElementById('dynamic-date').value = item.date;
      loadDynamicMap();
    });

    // イベントタグクリック（モーダル表示）
    div.querySelectorAll('.clickable-event').forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        showEventModal({
          name: decodeURIComponent(el.dataset.name),
          locationName: decodeURIComponent(el.dataset.loc),
          summary: decodeURIComponent(el.dataset.summary),
          detailedUrl: decodeURIComponent(el.dataset.url),
        });
      });
    });

    // ⏱ 時間帯分析へジャンプ
    div.querySelectorAll('.jump-hourly-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelector('[data-tab="hourly"]').click();
        document.getElementById('hourly-date-input').value = btn.dataset.date;
        loadHourlyData();
      });
    });

    // +N件 展開ボタン
    const expandBtn = div.querySelector(`#expand-${item.date}`);
    if (expandBtn) {
      expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const content = div.querySelector(`#expand-content-${item.date}`);
        content.style.display = 'flex';
        content.style.flexWrap = 'wrap';
        content.style.gap = '6px';
        expandBtn.style.display = 'none';
      });
    }

    // ▲ 閉じるボタン
    const closeBtn = div.querySelector('.expand-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const content = div.querySelector(`#expand-content-${item.date}`);
        content.style.display = 'none';
        expandBtn.style.display = '';
      });
    }

    list.appendChild(div);
  });
}

// ===== イベント効果分析 =====
let eventRankingAllData = null;

async function loadEventRanking(zone = 'inner', noconference = '0') {
  showLoading();
  try {
    const params = new URLSearchParams();
    if (zone) params.set('zone', zone);
    if (noconference === '1') params.set('noconference', '1');
    const qs = params.toString() ? '?' + params.toString() : '';
    const data = await fetchJSON('/api/event-ranking' + qs);
    eventRankingAllData = data;
    renderEventChart(data.slice(0, 15));
    renderEventRankingList(data);
    const note = document.getElementById('event-filter-note');
    if (note) note.textContent = `${data.length}件表示`;
  } catch(e) {
    console.error(e);
    alert('データ取得エラー: ' + e.message);
  } finally {
    hideLoading();
  }
}

// フィルターボタンのイベント設定（タブ切り替え後に呼ぶ）
function initEventFilterButtons() {
  document.querySelectorAll('.event-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.event-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadEventRanking(btn.dataset.zone || '', btn.dataset.noconf || '0');
    });
  });
  initEventSearch();
}

// イベント検索フィルター
function initEventSearch() {
  const input = document.getElementById('event-search-input');
  const dateFrom = document.getElementById('event-date-from');
  const dateTo = document.getElementById('event-date-to');
  const clearBtn = document.getElementById('event-date-clear');

  const applyFilters = () => {
    const q = (input?.value || '').toLowerCase().trim();
    const from = dateFrom?.value || '';
    const to = dateTo?.value || '';
    if (!eventRankingAllData) return;
    let filtered = eventRankingAllData;
    if (q) filtered = filtered.filter(e =>
      e.name.toLowerCase().includes(q) ||
      (e.locationName || '').toLowerCase().includes(q)
    );
    // 開催期間が指定範囲と重なるイベントを絞り込む
    if (from) filtered = filtered.filter(e => !e.maxDate || e.maxDate >= from);
    if (to)   filtered = filtered.filter(e => !e.minDate || e.minDate <= to);
    renderEventChart(filtered.slice(0, 15));
    renderEventRankingList(filtered);
    const note = document.getElementById('event-filter-note');
    if (note) note.textContent = `${filtered.length}件表示`;
  };

  if (input) input.addEventListener('input', applyFilters);
  if (dateFrom) dateFrom.addEventListener('change', applyFilters);
  if (dateTo) dateTo.addEventListener('change', applyFilters);
  if (clearBtn) clearBtn.addEventListener('click', () => {
    if (dateFrom) dateFrom.value = '';
    if (dateTo) dateTo.value = '';
    applyFilters();
  });
}

function renderEventChart(data) {
  const ctx = document.getElementById('eventChart').getContext('2d');
  if (state.eventChart) state.eventChart.destroy();
  const labels = data.map(d => d.name.length > 20 ? d.name.substring(0, 20) + '…' : d.name);
  const eventAvgs = data.map(d => d.eventAvg);
  const overallAvg = data.length > 0 ? data[0].overallAvg : 0;

  state.eventChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: '開催期間中 平均人流量',
          data: eventAvgs,
          backgroundColor: data.map(d => d.effectScore >= 0 ? 'rgba(62,185,80,0.75)' : 'rgba(248,81,73,0.75)'),
          borderColor: data.map(d => d.effectScore >= 0 ? 'rgb(62,185,80)' : 'rgb(248,81,73)'),
          borderWidth: 1,
          borderRadius: 3,
        },
        {
          label: '全期間平均人流量',
          data: Array(data.length).fill(overallAvg),
          type: 'line',
          borderColor: 'rgba(210,153,34,0.9)',
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#111111' } },
        tooltip: {
          backgroundColor: '#ffffff', titleColor: '#111111', bodyColor: '#333333',
          borderColor: 'rgba(0,0,0,0.18)', borderWidth: 1,
          callbacks: {
            label: (item) => {
              if (item.datasetIndex === 0) {
                const d = data[item.dataIndex];
                return [
                  `開催中平均: ${formatNumber(item.raw)}`,
                  `効果スコア: ${d.effectScore > 0 ? '+' : ''}${d.effectScore}%`,
                  `開催日数: ${d.eventDays}日`,
                ];
              }
              return `全期間平均: ${formatNumber(item.raw)}`;
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: '#333333', maxRotation: 45 }, grid: { color: 'rgba(0,0,0,0.12)' } },
        y: { ticks: { color: '#333333', callback: v => formatNumber(v) }, grid: { color: 'rgba(0,0,0,0.12)' } }
      }
    }
  });
}

const CATEGORY_LABELS = {
  conference:   { label: '学術', color: '#8b949e' },
  music:        { label: '音楽', color: '#58a6ff' },
  festival:     { label: '祭り', color: '#ffa657' },
  exhibition:   { label: '展示', color: '#d2a8ff' },
  sports:       { label: 'スポーツ', color: '#3fb950' },
  market:       { label: '市場', color: '#e3b341' },
  illumination: { label: '光', color: '#f0e070' },
  food:         { label: 'グルメ', color: '#ff7b72' },
  shopping:     { label: '買物', color: '#a5d6ff' },
  other:        { label: 'その他', color: '#6e7681' },
};

function renderEventRankingList(data) {
  const list = document.getElementById('event-ranking-list');
  list.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'event-ranking-header';
  header.innerHTML = `
    <div>#</div>
    <div>イベント名</div>
    <div style="text-align:center">開催日数</div>
    <div style="text-align:right">開催中平均</div>
    <div style="text-align:right">効果スコア</div>
  `;
  list.appendChild(header);

  data.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'event-ranking-item';
    const scoreSign = item.effectScore >= 0 ? '+' : '';
    const scoreClass = item.effectScore >= 0 ? 'positive' : 'negative';

    // 距離バッジ
    let distBadge = '';
    if (item.distance !== null && item.distance !== undefined) {
      const zoneClass = item.inZone ? 'zone-inner' : (item.distance <= 3.5 ? 'zone-edge' : 'zone-outer');
      const zoneLabel = item.inZone ? '圏内' : (item.distance <= 3.5 ? '近郊' : '圏外');
      distBadge = `<span class="dist-badge ${zoneClass}">${zoneLabel} ${item.distance}km</span>`;
    }

    // カテゴリバッジ
    const cat = CATEGORY_LABELS[item.category] || CATEGORY_LABELS.other;
    const catBadge = `<span class="cat-badge" style="background:${cat.color}22;color:${cat.color};border-color:${cat.color}44">${cat.label}</span>`;

    // スコア方式バッジ
    const methodBadge = item.scoreMethod === 'proximity'
      ? `<span class="method-badge proximity" title="${item.nearbySensorCount}センサーで近接分析">📡 近接</span>`
      : `<span class="method-badge citywide" title="近接センサーなし、全体値で代替">🌐 全体</span>`;

    // 同日競合イベント警告
    let coOccurBadge = '';
    if (item.avgCoOccurring >= 5) {
      coOccurBadge = `<span class="cooccur-badge high" title="同日に平均${item.avgCoOccurring}件の他イベントあり。スコアの精度が低い可能性があります">⚠️ 同日${item.avgCoOccurring}件</span>`;
    } else if (item.avgCoOccurring >= 2) {
      coOccurBadge = `<span class="cooccur-badge mid" title="同日に平均${item.avgCoOccurring}件の他イベントあり">🔀 同日${item.avgCoOccurring}件</span>`;
    }

    // 調整スコア表示（同日競合ペナルティ適用済み）
    const displayScore = item.adjustedScore !== undefined ? item.adjustedScore : item.effectScore;
    const rawScoreNote = (item.adjustedScore !== undefined && item.adjustedScore !== item.effectScore)
      ? `<div class="raw-score-note">実測 ${scoreSign}${item.effectScore}% → 競合補正後</div>`
      : '';

    div.innerHTML = `
      <div class="event-rank">${idx + 1}</div>
      <div>
        <div class="event-name">${item.name} ${catBadge}</div>
        <div class="event-loc">📍 ${item.locationName || ''} ${distBadge} ${methodBadge} ${coOccurBadge}</div>
        ${item.summary ? `<div class="event-summary-short">${item.summary.substring(0, 80)}${item.summary.length > 80 ? '…' : ''}</div>` : ''}
      </div>
      <div class="event-days">${item.eventDays}日</div>
      <div class="event-avg">${formatNumber(item.eventAvg)}</div>
      <div class="event-score ${scoreClass}">
        ${scoreSign}${displayScore}%
        ${rawScoreNote}
      </div>
    `;
    div.style.cursor = 'pointer';
    div.title = 'クリックで回遊パターン分析';
    div.addEventListener('click', () => loadEventSensorAnalysis(item.name));
    list.appendChild(div);
  });
}

// ===== 回遊パターン分析 =====
async function loadEventSensorAnalysis(eventName) {
  showLoading();
  try {
    const data = await fetchJSON('/api/event-sensor-analysis?name=' + encodeURIComponent(eventName));
    renderEventSensorPanel(data);
  } catch(e) {
    console.error(e);
    alert('エラー: ' + e.message);
  } finally {
    hideLoading();
  }
}

function renderEventSensorPanel(data) {
  const panel = document.getElementById('event-sensor-panel');
  panel.style.display = 'block';
  document.getElementById('panel-event-name').textContent = `📊 回遊パターン: ${data.name}`;

  const summaryEl = document.getElementById('panel-event-summary');
  summaryEl.innerHTML = '';
  if (data.summary) {
    summaryEl.innerHTML = `<span class="panel-summary-text">${data.summary}</span>`;
  }
  if (data.detailedUrl) {
    summaryEl.innerHTML += ` <a href="${data.detailedUrl}" target="_blank" class="event-link">🔗 詳細</a>`;
  }

  // センサー分析グラフ
  const ctx = document.getElementById('sensorAnalysisChart').getContext('2d');
  if (state.sensorAnalysisChart) state.sensorAnalysisChart.destroy();

  const top = data.sensors.slice(0, 12);
  state.sensorAnalysisChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top.map(s => s.name.length > 18 ? s.name.substring(0, 18) + '…' : s.name),
      datasets: [
        {
          label: 'イベント開催中 日平均',
          data: top.map(s => s.eventAvg),
          backgroundColor: top.map(s => s.areaColor || '#3fb950'),
          borderColor: top.map(s => s.areaColor || '#3fb950'),
          borderWidth: 1,
          borderRadius: 3,
        },
        {
          label: '通常日 日平均',
          data: top.map(s => s.baseAvg),
          backgroundColor: 'rgba(139,148,158,0.5)',
          borderColor: '#8b949e',
          borderWidth: 1,
          borderRadius: 3,
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#111111' } },
        tooltip: {
          backgroundColor: '#ffffff', titleColor: '#111111', bodyColor: '#333333',
          borderColor: 'rgba(0,0,0,0.18)', borderWidth: 1,
          callbacks: {
            afterLabel: (item) => {
              if (item.datasetIndex === 0) {
                const s = top[item.dataIndex];
                const sign = s.changeRate >= 0 ? '+' : '';
                return `変化率: ${sign}${s.changeRate}%`;
              }
              return '';
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: '#333333', callback: v => formatNumber(v) }, grid: { color: 'rgba(0,0,0,0.12)' } },
        y: { ticks: { color: '#111111', font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.12)' } }
      }
    }
  });

  // 回遊マップ
  if (!state.sensorAnalysisMap) {
    state.sensorAnalysisMap = L.map('sensor-analysis-map').setView([38.2635, 140.872], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(state.sensorAnalysisMap);
  }
  state.sensorAnalysisMarkers.forEach(m => m.remove());
  state.sensorAnalysisMarkers = [];

  const maxChange = Math.max(...data.sensors.map(s => Math.abs(s.changeRate)));
  data.sensors.filter(s => s.lat && s.lng).forEach(s => {
    const isPositive = s.changeRate >= 0;
    const intensity = maxChange > 0 ? Math.abs(s.changeRate) / maxChange : 0;
    const radius = 10 + intensity * 25;
    const color = isPositive ? '#3fb950' : '#f85149';
    const circle = L.circleMarker([s.lat, s.lng], {
      radius,
      fillColor: color,
      color: '#fff',
      weight: 1.5,
      opacity: 0.9,
      fillOpacity: 0.3 + intensity * 0.6,
    });
    const sign = s.changeRate >= 0 ? '+' : '';
    circle.bindPopup(`
      <div style="font-family:sans-serif;font-size:13px">
        <strong>${s.name}</strong><br>
        <span style="color:#888;font-size:11px">${s.area}</span><br>
        開催中平均: <strong>${formatNumber(s.eventAvg)}</strong><br>
        通常日平均: ${formatNumber(s.baseAvg)}<br>
        変化率: <strong style="color:${color}">${sign}${s.changeRate}%</strong>
      </div>
    `);
    circle.addTo(state.sensorAnalysisMap);
    state.sensorAnalysisMarkers.push(circle);
  });

  // パネルまでスクロール
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.getElementById('panel-close-btn').addEventListener('click', () => {
  document.getElementById('event-sensor-panel').style.display = 'none';
});

// ===== 初期化 =====
async function init() {
  showLoading();
  try {
    await initDateSelectors();
    await loadOverview();
  } catch(e) {
    console.error('Init error:', e);
  } finally {
    hideLoading();
  }
}

// ===== スクロールトップボタン =====
const scrollTopBtn = document.getElementById('scroll-top-btn');
if (scrollTopBtn) {
  window.addEventListener('scroll', () => {
    scrollTopBtn.classList.toggle('visible', window.scrollY > 300);
  });
  scrollTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

init();
