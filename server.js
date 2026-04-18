const express = require('express');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const app = express();
const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');

app.use(express.static(path.join(__dirname, 'public')));

// ===== 仙台主要施設 座標マスタ =====
const KNOWN_VENUE_COORDS = {
  // 商店街・アーケード
  'ハピナ名掛丁商店街':         [38.261976, 140.880226],
  'クリスロード商店街':         [38.261282, 140.876218],
  'マーブルロードおおまち商店街': [38.260910, 140.874275],
  'サンモール一番町商店街':      [38.259262, 140.872430],
  'ぶらんど〜む一番町商店街':    [38.260705, 140.871950],
  '一番町四丁目商店街':         [38.263984, 140.870905],
  // 公園・広場
  '勾当台公園':                [38.266856, 140.870365],
  '勾当台公園（市民広場）':     [38.266856, 140.870365],
  '勾当台公園市民広場':         [38.266856, 140.870365],
  '勾当台公園（仮設広場）':     [38.267015, 140.872178],
  '勾当台公園全域':             [38.266856, 140.870365],
  '勾当台公園（カフェ前）':     [38.266507, 140.870839],
  '定禅寺通':                  [38.265496, 140.867825],
  '西公園':                    [38.264498, 140.863027],
  '西公園SL広場':              [38.264498, 140.863027],
  '錦町公園':                  [38.265800, 140.864500],
  '宮城野通り':                [38.262700, 140.885210],
  // ホール・コンサート施設
  '仙台国際センター':           [38.263210, 140.868230],
  '仙台国際センター展示棟':     [38.263210, 140.868230],
  '東京エレクトロンホール宮城': [38.265490, 140.867820],
  '東京エレクトロンホール宮城（宮城県民会館）': [38.265490, 140.867820],
  '宮城県民会館':              [38.265490, 140.867820],
  '日立システムズホール仙台':   [38.266090, 140.872400],
  'トークネットホール仙台':     [38.271240, 140.868660],
  '電力ホール':                [38.261870, 140.875300],
  '仙台サンプラザホール':       [38.253900, 140.887600],
  // スポーツ施設
  'セキスイハイムスーパーアリーナ': [38.283600, 140.921400],
  '楽天モバイルパーク宮城':    [38.248080, 140.901340],
  'ユアテックスタジアム仙台':  [38.248080, 140.901340],
  'カメイアリーナ仙台':        [38.249600, 140.881000],
  'ゼビオアリーナ仙台':        [38.249600, 140.881000],
  '夢メッセみやぎ':            [38.298500, 140.896900],
  // 商業施設
  '仙台三越':                  [38.260520, 140.875080],
  '藤崎':                      [38.260620, 140.876830],
  'S-PAL仙台':                 [38.260560, 140.882430],
  'エスパル仙台':              [38.260560, 140.882430],
  'アエル':                    [38.261180, 140.880030],
  '仙台PARCO':                 [38.260010, 140.880450],
  '仙台フォーラス':            [38.260630, 140.879920],
  // 行政・文化施設
  '仙台市役所':                [38.267358, 140.869660],
  '仙台市博物館':              [38.259510, 140.868430],
  '仙台市歴史民俗資料館':      [38.264040, 140.905200],
  '仙臺緑彩館':                [38.252350, 140.856920],
  '仙台市宮城野区文化センター': [38.265270, 140.900110],
  '宮城野区文化センター':      [38.265270, 140.900110],
  'スリーエム仙台市科学館':    [38.264500, 140.863000],
  // 大学
  '東北大学川内キャンパス':    [38.259500, 140.844800],
  '東北大学青葉山キャンパス':  [38.251300, 140.842000],
  '東北大学片平キャンパス':    [38.256500, 140.866500],
  '東北医科薬科大学小松島キャンパス': [38.244000, 140.889000],
  // 駅・交通
  '仙台駅':                    [38.260120, 140.882430],
  '仙台駅東口広場':            [38.260530, 140.883130],
  '仙台中心部':                [38.263000, 140.872000],
  '仙台市中心部':              [38.263000, 140.872000],
  '仙台市中小企業活性化センター': [38.262000, 140.879000],
  // ホテル・宴会場
  '仙台ガーデンパレス':          [38.265800, 140.881400],
  '江陽グランドホテル':          [38.263400, 140.881400],
  'ホテルメトロポリタン仙台':    [38.261100, 140.882600],
  'ウェスティンホテル仙台':      [38.265700, 140.881700],
  'ホテルJALシティ仙台':        [38.264200, 140.882300],
  'TKPガーデンシティ仙台':      [38.263300, 140.878100],
  'TKPガーデンシティ':          [38.263300, 140.878100],
  // 神社・寺院
  '野中神社':                    [38.258045, 140.872162],
  '三瀧山不動院':                [38.262100, 140.874200],
  '瀧澤神社':                    [38.261900, 140.873800],
  '仙台東照宮':                  [38.276500, 140.876200],
  '大崎八幡宮':                  [38.271200, 140.857300],
  '榴岡天満宮':                  [38.262900, 140.887500],
  // その他中心部施設
  'AERアトリウム':               [38.261200, 140.880000],
  'アエルアトリウム':            [38.261200, 140.880000],
  'フォレスト仙台':              [38.265400, 140.869200],
  '仙台市戦災復興記念館':        [38.266100, 140.871400],
  'つなぎ横丁':                  [38.266515, 140.870092],
  '定禅寺通緑地':                [38.265500, 140.869600],
  '肴町公園':                    [38.264800, 140.869800],
  // 仙台国際センター周辺
  '仙台国際センター':            [38.263210, 140.868230],
  '仙台国際センター展示棟':      [38.263210, 140.868230],
  '仙台国際センター会議棟':      [38.263210, 140.868230],
  // 大学（追加）
  '東北大学川内萩ホール':        [38.259500, 140.848000],
  '東北大学星陵オーディトリアム': [38.246000, 140.877000],
  '東北大学片平さくらホール':    [38.256500, 140.866500],
  '東北大学金属材料研究所':      [38.256800, 140.866600],
  // スポーツ（追加）
  'シェルコムせんだい':          [38.248100, 140.881000],
  'セントラルスポーツ宮城G21プール': [38.248100, 140.881000],
  // 中心部全域フォールバック
  '中心部全域':                  [38.263000, 140.872000],
  '仙台市中心部全域':            [38.263000, 140.872000],
  '一番町':                      [38.262000, 140.872000],
  '青葉山公園':                  [38.252350, 140.856920],
  '青葉山公園 仙臺緑彩館':       [38.252350, 140.856920],
};

// ===== 会場座標キャッシュ（CSVデータ + 静的マスタ融合） =====
let _locationCoords = null;
function getLocationCoords() {
  if (_locationCoords) return _locationCoords;
  const coordMap = { ...KNOWN_VENUE_COORDS };
  // CSVに座標が入っているものを抽出
  const rows = readCSV(path.join(DATA_DIR, 'events.csv'));
  for (const r of rows) {
    if (r.locationName && r.latitude && r.longitude) {
      const lat = parseFloat(r.latitude);
      const lng = parseFloat(r.longitude);
      if (lat && lng && Math.abs(lat) > 0.001 && Math.abs(lng) > 0.001) {
        if (!coordMap[r.locationName]) coordMap[r.locationName] = [lat, lng];
      }
    }
  }
  _locationCoords = coordMap;
  const total = Object.keys(coordMap).length;
  console.log(`Location coords cache built: ${total} venues`);
  return coordMap;
}

// 部分一致で座標を探す（完全一致で見つからなかった場合のフォールバック）
function lookupCoordPartial(locName, coordMap) {
  if (!locName || locName.length < 3) return null;
  // coordMapのキーがlocNameに含まれる（例: "勾当台公園" in "勾当台公園（市民広場）"）
  for (const [key, coords] of Object.entries(coordMap)) {
    if (key.length >= 4 && locName.includes(key)) return coords;
  }
  // locNameがcoordMapのキーに含まれる（例: "仙台駅" in "仙台駅東口"）
  for (const [key, coords] of Object.entries(coordMap)) {
    if (locName.length >= 4 && key.includes(locName)) return coords;
  }
  return null;
}

// ===== Haversine距離計算（km） =====
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ===== 最近傍センサーまでの距離 =====
function distanceToNearestSensor(lat, lng) {
  const sensors = loadSensors();
  let minDist = Infinity, nearest = null;
  for (const s of sensors) {
    const d = haversineKm(lat, lng, s.lat, s.lng);
    if (d < minDist) { minDist = d; nearest = s; }
  }
  return { dist: Math.round(minDist * 100) / 100, name: nearest ? nearest.name : null };
}

// ===== イベントカテゴリ分類 =====
function classifyEvent(name, locationName) {
  const text = (name + ' ' + locationName);
  if (/学会|学術|シンポジウム|カンファレンス|フォーラム|研究大会|研究会|学術大会|大学院|講演会|セミナー|学習会/.test(text)) return 'conference';
  if (/コンサート|ライブ|音楽祭|ジャズ|クラシック|オーケストラ|バンド|ライブハウス|LIVE|演奏会/.test(text)) return 'music';
  if (/まつり|祭り|七夕|どんと祭|青葉まつり|定禅寺ストリートジャズ|縁日|盆踊り|夏祭り|花火/.test(text)) return 'festival';
  if (/展示|展覧会|博覧|ギャラリー|アート展|美術展|写真展|作品展/.test(text)) return 'exhibition';
  if (/マラソン|駅伝|スポーツ|野球|サッカー|バスケ|バレー|水泳|陸上|競技大会|選手権|試合|ゲーム/.test(text)) return 'sports';
  if (/マーケット|朝市|フリマ|バザー|手作り市|蚤の市|クラフト市/.test(text)) return 'market';
  if (/イルミネーション|光のページェント|ライトアップ|イルミ/.test(text)) return 'illumination';
  if (/グルメ|フード|ビール|B級|食フェス|ラーメン|牛タン|食の/.test(text)) return 'food';
  if (/ショッピング|セール|バーゲン|アウトレット/.test(text)) return 'shopping';
  return 'other';
}

// ===== センサーエリアマスタ =====
const SENSOR_AREA_MAP = {
  'jp.sendai.Blesensor.per3600.1':  { area: 'アーケード東', color: '#58a6ff', areaDesc: '仙台駅西口から伸びるアーケード東入口', icon: '🏬' },
  'jp.sendai.Blesensor.per3600.2':  { area: 'アーケード東', color: '#58a6ff', areaDesc: '仙台駅西口から伸びるアーケード東入口', icon: '🏬' },
  'jp.sendai.Blesensor.per3600.3':  { area: 'クリスロード', color: '#79c0ff', areaDesc: 'クリスロード商店街アーケード', icon: '🛍' },
  'jp.sendai.Blesensor.per3600.4':  { area: 'クリスロード', color: '#79c0ff', areaDesc: 'クリスロード商店街アーケード', icon: '🛍' },
  'jp.sendai.Blesensor.per3600.5':  { area: 'マーブルロード', color: '#a5d6ff', areaDesc: 'マーブルロードおおまち商店街', icon: '🛒' },
  'jp.sendai.Blesensor.per3600.6':  { area: 'マーブルロード', color: '#a5d6ff', areaDesc: 'マーブルロードおおまち商店街', icon: '🛒' },
  'jp.sendai.Blesensor.per3600.7':  { area: 'サンモール一番町', color: '#d2a8ff', areaDesc: 'サンモール一番町商店街', icon: '🏪' },
  'jp.sendai.Blesensor.per3600.8':  { area: 'サンモール一番町', color: '#d2a8ff', areaDesc: 'サンモール一番町商店街', icon: '🏪' },
  'jp.sendai.Blesensor.per3600.9':  { area: 'ぶらんど〜む', color: '#e2b7f7', areaDesc: 'ぶらんど〜む一番町商店街', icon: '🎪' },
  'jp.sendai.Blesensor.per3600.10': { area: 'ぶらんど〜む', color: '#e2b7f7', areaDesc: 'ぶらんど〜む一番町商店街', icon: '🎪' },
  'jp.sendai.Blesensor.per3600.11': { area: '一番町四丁目', color: '#f0c27f', areaDesc: '一番町四丁目商店街', icon: '🏢' },
  'jp.sendai.Blesensor.per3600.12': { area: '一番町四丁目', color: '#f0c27f', areaDesc: '一番町四丁目商店街', icon: '🏢' },
  'jp.sendai.Blesensor.per3600.13': { area: '一番町四丁目', color: '#f0c27f', areaDesc: '一番町四丁目商店街', icon: '🏢' },
  'jp.sendai.Blesensor.per3600.14': { area: '定禅寺通', color: '#3fb950', areaDesc: '定禅寺通ケヤキ並木 東側（夏の思い出像付近）', icon: '🌳' },
  'jp.sendai.Blesensor.per3600.15': { area: '定禅寺通', color: '#3fb950', areaDesc: '定禅寺通ケヤキ並木 中央（県民会館前）', icon: '🌳' },
  'jp.sendai.Blesensor.per3600.16': { area: '定禅寺通', color: '#3fb950', areaDesc: '定禅寺通ケヤキ並木 西側（春日町交差点）', icon: '🌳' },
  'jp.sendai.Blesensor.per3600.17': { area: '定禅寺通', color: '#3fb950', areaDesc: '定禅寺通ケヤキ並木 西端（水浴の女像付近）', icon: '🌳' },
  'jp.sendai.Blesensor.per3600.18': { area: '西公園', color: '#56d364', areaDesc: '西公園SL広場', icon: '🌿' },
  'jp.sendai.Blesensor.per3600.19': { area: '仙台市役所', color: '#d29922', areaDesc: '仙台市役所本庁舎敷地 南東', icon: '🏛' },
  'jp.sendai.Blesensor.per3600.20': { area: '仙台市役所', color: '#d29922', areaDesc: '仙台市役所本庁舎敷地 南', icon: '🏛' },
  'jp.sendai.Blesensor.per3600.21': { area: '勾当台公園', color: '#ffa657', areaDesc: '勾当台公園市民広場（主要イベント会場）', icon: '🎡' },
  'jp.sendai.Blesensor.per3600.22': { area: '勾当台公園', color: '#ffa657', areaDesc: '勾当台公園円形広場', icon: '🎡' },
  'jp.sendai.Blesensor.per3600.23': { area: '勾当台公園', color: '#ffa657', areaDesc: 'つなぎ横丁（飲食エリア）', icon: '🍺' },
  'jp.sendai.Blesensor.per3600.24': { area: '勾当台公園', color: '#ffa657', areaDesc: '勾当台公園いこいのゾーン 南西', icon: '🎡' },
  'jp.sendai.Blesensor.per3600.25': { area: '勾当台公園', color: '#ffa657', areaDesc: '勾当台公園いこいのゾーン 中央', icon: '🎡' },
  'jp.sendai.Blesensor.per3600.26': { area: '勾当台公園', color: '#ffa657', areaDesc: '勾当台公園いこいのゾーン 北西', icon: '🎡' },
  'jp.sendai.Blesensor.per3600.27': { area: '勾当台公園', color: '#ffa657', areaDesc: '勾当台公園いこいのゾーン 北東', icon: '🎡' },
  'jp.sendai.Blesensor.per3600.28': { area: '勾当台公園', color: '#ffa657', areaDesc: '勾当台公園歴史のゾーン 北', icon: '🏺' },
};

// ===== キャッシュ =====
let cache = {
  sensors: null,
  events: null,
  dailySummary: null,
  hourlySummary: null,
  topDays: null,
};

// ===== CSV読み込みユーティリティ =====
function readCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  });
}

// ===== センサーマスタ読み込み =====
function loadSensors() {
  if (cache.sensors) return cache.sensors;
  const rows = readCSV(path.join(DATA_DIR, 'sensors.csv'));
  cache.sensors = rows.map(r => {
    const areaInfo = SENSOR_AREA_MAP[r.identifcation] || { area: 'その他', color: '#8b949e', areaDesc: '', icon: '📍' };
    return {
      id: r.identifcation,
      name: r.locationName,
      lat: parseFloat(r.latitude),
      lng: parseFloat(r.longitude),
      num: parseInt(r._id),
      area: areaInfo.area,
      areaDesc: areaInfo.areaDesc,
      areaColor: areaInfo.color,
      icon: areaInfo.icon,
    };
  });
  console.log(`Sensors loaded: ${cache.sensors.length}`);
  return cache.sensors;
}

// ===== イベント読み込み（summary・URLを含む） =====
function loadEvents() {
  if (cache.events) return cache.events;
  const rows = readCSV(path.join(DATA_DIR, 'events.csv'));
  const seen = new Set();
  cache.events = [];
  for (const r of rows) {
    if (!r.startDate || !r.endDate) continue;
    const key = `${r.name}|${r.startDate}|${r.endDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cache.events.push({
      name: r.name || '',
      locationName: r.locationName || '',
      startDate: r.startDate.substring(0, 10),
      endDate: r.endDate.substring(0, 10),
      summary: r.summary || '',
      detailedUrl: r.detailedUrl || '',
      lat: null,   // 後で補完
      lng: null,
      address: r.locationAddress || '',
      _rawLat: r.latitude,
      _rawLng: r.longitude,
      _locName: r.locationName || '',
    });
  }

  // ===== 座標補完 =====
  const locCoords = getLocationCoords();
  let enriched = 0, enrichedPartial = 0;
  for (const ev of cache.events) {
    const rawLat = parseFloat(ev._rawLat);
    const rawLng = parseFloat(ev._rawLng);
    if (rawLat && rawLng && Math.abs(rawLat) > 0.001) {
      ev.lat = rawLat;
      ev.lng = rawLng;
    } else if (locCoords[ev._locName]) {
      ev.lat = locCoords[ev._locName][0];
      ev.lng = locCoords[ev._locName][1];
      enriched++;
    } else {
      // 部分一致フォールバック
      const partial = lookupCoordPartial(ev._locName, locCoords);
      if (partial) {
        ev.lat = partial[0];
        ev.lng = partial[1];
        enrichedPartial++;
      }
    }
    delete ev._rawLat; delete ev._rawLng; delete ev._locName;
  }
  const withCoords = cache.events.filter(e => e.lat && e.lng).length;
  console.log(`Events loaded: ${cache.events.length}, with coords: ${withCoords} (exact ${enriched}, partial ${enrichedPartial})`);
  return cache.events;
}

// ===== 人流データ集計（日次 + 時間帯を同時構築） =====
function buildSummaries() {
  if (cache.dailySummary && cache.hourlySummary) return;

  console.log('Building daily + hourly summary caches...');
  const daily = {};
  const hourly = {};

  const files = ['people-flow-2024.csv', 'people-flow-2025.csv', 'people-flow-2026.csv'];
  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.log(`File not found: ${file}`);
      continue;
    }
    console.log(`Processing ${file}...`);
    const rows = readCSV(filePath);
    for (const r of rows) {
      if (!r.dateObservedFrom || !r.identifcation) continue;
      const date = r.dateObservedFrom.substring(0, 10);
      const hour = r.dateObservedFrom.substring(11, 13);
      const count = parseFloat(r.peopleCount) || 0;
      const sensorId = r.identifcation;
      const holiday = parseInt(r.holidayFlg) || 0;

      // 日次
      if (!daily[date]) daily[date] = { total: 0, sensors: {}, holiday };
      daily[date].total += count;
      daily[date].sensors[sensorId] = (daily[date].sensors[sensorId] || 0) + count;

      // 時間帯
      if (!hourly[date]) hourly[date] = {};
      if (!hourly[date][hour]) hourly[date][hour] = { total: 0, sensors: {} };
      hourly[date][hour].total += count;
      hourly[date][hour].sensors[sensorId] = (hourly[date][hour].sensors[sensorId] || 0) + count;
    }
    console.log(`  Done. Dates so far: ${Object.keys(daily).length}`);
  }

  cache.dailySummary = daily;
  cache.hourlySummary = hourly;
  console.log('Summaries built. Total dates:', Object.keys(daily).length);
}

function buildDailySummary() {
  if (!cache.dailySummary) buildSummaries();
  return cache.dailySummary;
}

function buildHourlySummary() {
  if (!cache.hourlySummary) buildSummaries();
  return cache.hourlySummary;
}

// ===== 各日のイベント情報を取得 =====
function getEventsForDate(dateStr, events) {
  return events.filter(e => e.startDate <= dateStr && e.endDate >= dateStr);
}

// ===== API: センサー一覧（エリア情報付き） =====
app.get('/api/sensors', (req, res) => {
  res.json(loadSensors());
});

// ===== API: 日別サマリー =====
app.get('/api/daily-summary', (req, res) => {
  const { year, month } = req.query;
  const summary = buildDailySummary();
  const events = loadEvents();

  let dates = Object.keys(summary).sort();
  if (year) dates = dates.filter(d => d.startsWith(year));
  if (year && month) {
    const m = String(month).padStart(2, '0');
    dates = dates.filter(d => d.startsWith(`${year}-${m}`));
  }

  const result = dates.map(date => {
    const s = summary[date];
    const dayEvents = getEventsForDate(date, events);
    return {
      date,
      total: Math.round(s.total),
      holiday: s.holiday,
      events: dayEvents.map(e => ({
        name: e.name,
        locationName: e.locationName,
        summary: e.summary,
        detailedUrl: e.detailedUrl,
      })),
    };
  });

  res.json(result);
});

// ===== API: センサー別詳細（特定日） =====
app.get('/api/sensor-detail', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date is required' });

  const summary = buildDailySummary();
  const sensors = loadSensors();
  const events = loadEvents();

  const dayData = summary[date];
  if (!dayData) return res.json({ date, sensors: [], events: [], total: 0 });

  const sensorDetails = sensors.map(s => ({
    id: s.id,
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    area: s.area,
    areaColor: s.areaColor,
    count: Math.round(dayData.sensors[s.id] || 0),
  }));

  const dayEvents = getEventsForDate(date, events);

  res.json({
    date,
    sensors: sensorDetails,
    events: dayEvents.map(e => ({
      name: e.name,
      locationName: e.locationName,
      summary: e.summary,
      detailedUrl: e.detailedUrl,
      lat: e.lat,
      lng: e.lng,
    })),
    total: Math.round(dayData.total),
  });
});

// ===== API: 時間帯別詳細 =====
app.get('/api/hourly-detail', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date is required' });

  const hourly = buildHourlySummary();
  const sensors = loadSensors();
  const events = loadEvents();
  const dateData = hourly[date] || {};

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const result = hours.map(h => {
    const d = dateData[h] || { total: 0, sensors: {} };
    return {
      hour: parseInt(h),
      total: Math.round(d.total),
      sensors: sensors.map(s => ({
        id: s.id,
        name: s.name,
        area: s.area,
        areaColor: s.areaColor,
        lat: s.lat,
        lng: s.lng,
        count: Math.round(d.sensors[s.id] || 0),
      })),
    };
  });

  const dayEvents = getEventsForDate(date, events);

  res.json({
    date,
    hours: result,
    events: dayEvents.map(e => ({
      name: e.name,
      locationName: e.locationName,
      summary: e.summary,
      detailedUrl: e.detailedUrl,
      lat: e.lat,
      lng: e.lng,
    })),
  });
});

// ===== API: 年月別比較 =====
app.get('/api/year-monthly', (req, res) => {
  const summary = buildDailySummary();
  const result = {};

  for (const [date, data] of Object.entries(summary)) {
    const year = date.substring(0, 4);
    const month = date.substring(5, 7);
    if (!result[year]) result[year] = {};
    if (!result[year][month]) result[year][month] = { total: 0, days: 0 };
    result[year][month].total += data.total;
    result[year][month].days++;
  }

  // 月別平均も計算
  const formatted = {};
  for (const [year, months] of Object.entries(result)) {
    formatted[year] = {};
    for (const [month, data] of Object.entries(months)) {
      formatted[year][month] = {
        total: Math.round(data.total),
        days: data.days,
        avg: Math.round(data.total / data.days),
      };
    }
  }

  res.json(formatted);
});

// ===== API: 人流上位日ランキング =====
app.get('/api/top-days', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const summary = buildDailySummary();
  const events = loadEvents();

  const sorted = Object.entries(summary)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, limit);

  const result = sorted.map(([date, data], idx) => {
    const dayEvents = getEventsForDate(date, events);
    return {
      rank: idx + 1,
      date,
      total: Math.round(data.total),
      holiday: data.holiday,
      events: dayEvents.map(e => ({
        name: e.name,
        locationName: e.locationName,
        summary: e.summary,
        detailedUrl: e.detailedUrl,
      })),
    };
  });

  res.json(result);
});

// ===== API: イベント効果分析 =====
app.get('/api/event-ranking', (req, res) => {
  const zoneFilter = req.query.zone;        // 'inner' = センサー圏内のみ
  const noConference = req.query.noconference === '1';
  const summary = buildDailySummary();
  const events = loadEvents();
  const sensors = loadSensors();

  const allDaysEntries = Object.entries(summary);
  const allDayCount = allDaysEntries.length;
  const overallAvg = allDaysEntries.reduce((s, [, d]) => s + d.total, 0) / allDayCount;

  // センサーごとの全期間日平均を事前計算（近接スコア計算用）
  const sensorDailyAvg = {};
  for (const s of sensors) {
    let total = 0;
    for (const [, data] of allDaysEntries) {
      total += (data.sensors[s.id] || 0);
    }
    sensorDailyAvg[s.id] = allDayCount > 0 ? total / allDayCount : 0;
  }

  const eventMap = {};
  for (const event of events) {
    const key = event.name;
    if (!eventMap[key]) {
      eventMap[key] = {
        name: event.name,
        locationName: event.locationName,
        summary: event.summary,
        detailedUrl: event.detailedUrl,
        dates: [],
        lat: event.lat,
        lng: event.lng,
      };
    }
    // 座標が未設定なら最初に見つかったものを使う
    if (!eventMap[key].lat && event.lat) { eventMap[key].lat = event.lat; eventMap[key].lng = event.lng; }
    let d = new Date(event.startDate);
    const end = new Date(event.endDate);
    while (d <= end) {
      const ds = d.toISOString().substring(0, 10);
      if (!eventMap[key].dates.includes(ds)) eventMap[key].dates.push(ds);
      d.setDate(d.getDate() + 1);
    }
  }

  // 日付ごとの同日イベント数マップ
  const dateEventCount = {};
  for (const [, ev] of Object.entries(eventMap)) {
    for (const date of ev.dates) {
      dateEventCount[date] = (dateEventCount[date] || 0) + 1;
    }
  }

  const results = [];
  for (const [name, ev] of Object.entries(eventMap)) {
    if (ev.dates.length === 0) continue;

    // カテゴリ判定
    const category = classifyEvent(ev.name, ev.locationName);

    // 学術系除外フィルタ
    if (noConference && category === 'conference') continue;

    // 距離計算 & 近接センサー特定
    let distance = null, nearestSensor = null, inZone = false;
    const nearbySensorIds = [];   // 1.5km以内のセンサー
    if (ev.lat && ev.lng) {
      const nearest = distanceToNearestSensor(ev.lat, ev.lng);
      distance = nearest.dist;
      nearestSensor = nearest.name;
      inZone = distance <= 2.0;

      for (const s of sensors) {
        const d = haversineKm(ev.lat, ev.lng, s.lat, s.lng);
        if (d <= 1.5) nearbySensorIds.push(s.id);
      }
    }

    // センサー圏内フィルタ
    if (zoneFilter === 'inner' && !inZone) continue;

    // 同日イベント数の集計（自イベントを除く）
    let totalCoOccurring = 0;
    for (const date of ev.dates) {
      totalCoOccurring += Math.max(0, (dateEventCount[date] || 1) - 1);
    }
    const avgCoOccurring = ev.dates.length > 0
      ? Math.round(totalCoOccurring / ev.dates.length * 10) / 10
      : 0;

    // ===== 効果スコア計算（近接センサー優先、なければ全体） =====
    const useProximity = nearbySensorIds.length >= 2;
    let eventTotal = 0, eventDays = 0, baselineAvg = 0;

    if (useProximity) {
      // 近接センサーのみで集計
      const proxBaseline = nearbySensorIds.reduce((s, id) => s + (sensorDailyAvg[id] || 0), 0);
      baselineAvg = proxBaseline;

      for (const date of ev.dates) {
        if (summary[date]) {
          let proxTotal = 0;
          for (const sid of nearbySensorIds) {
            proxTotal += (summary[date].sensors[sid] || 0);
          }
          eventTotal += proxTotal;
          eventDays++;
        }
      }
    } else {
      // 近接センサーが少ない場合は全体値にフォールバック
      baselineAvg = overallAvg;
      for (const date of ev.dates) {
        if (summary[date]) {
          eventTotal += summary[date].total;
          eventDays++;
        }
      }
    }

    if (eventDays === 0) continue;
    const eventAvg = eventTotal / eventDays;
    const effectScore = baselineAvg > 0
      ? ((eventAvg - baselineAvg) / baselineAvg * 100)
      : 0;

    // 同日競合ペナルティ（競合3件超から効いてくる）
    // 競合が多いほどそのイベント単独の寄与は不明瞭になるため調整
    const penalty = avgCoOccurring > 3
      ? 1 / (1 + Math.sqrt(avgCoOccurring - 3))
      : 1;
    const adjustedScore = Math.round(effectScore * penalty * 10) / 10;

    results.push({
      name: ev.name,
      locationName: ev.locationName,
      summary: ev.summary,
      detailedUrl: ev.detailedUrl,
      eventDays,
      eventAvg: Math.round(eventAvg),
      overallAvg: Math.round(baselineAvg),
      effectScore: Math.round(effectScore * 10) / 10,
      adjustedScore,
      nearestSensor,
      distance,
      inZone,
      category,
      lat: ev.lat,
      lng: ev.lng,
      avgCoOccurring,
      scoreMethod: useProximity ? 'proximity' : 'citywide',
      nearbySensorCount: nearbySensorIds.length,
    });
  }

  // 調整スコアでソート（同日競合の多いイベントは過大評価されにくい）
  results.sort((a, b) => b.adjustedScore - a.adjustedScore);
  res.json(results.slice(0, 100));
});

// ===== API: イベント別センサー分析（回遊パターン） =====
app.get('/api/event-sensor-analysis', (req, res) => {
  const { name } = req.query;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const summary = buildDailySummary();
  const events = loadEvents();
  const sensors = loadSensors();

  const targetEvents = events.filter(e => e.name === name);
  if (targetEvents.length === 0) return res.status(404).json({ error: 'Event not found' });

  // イベント開催日を収集
  const eventDates = new Set();
  for (const ev of targetEvents) {
    let d = new Date(ev.startDate);
    const end = new Date(ev.endDate);
    while (d <= end) {
      eventDates.add(d.toISOString().substring(0, 10));
      d.setDate(d.getDate() + 1);
    }
  }

  // センサー別集計（イベント日 vs 非イベント日）
  const sensorEvent = {};
  const sensorBase = {};
  let eventDayCount = 0;
  let baseDayCount = 0;

  for (const [date, data] of Object.entries(summary)) {
    if (eventDates.has(date)) {
      eventDayCount++;
      for (const [sId, count] of Object.entries(data.sensors)) {
        sensorEvent[sId] = (sensorEvent[sId] || 0) + count;
      }
    } else {
      baseDayCount++;
      for (const [sId, count] of Object.entries(data.sensors)) {
        sensorBase[sId] = (sensorBase[sId] || 0) + count;
      }
    }
  }

  const result = sensors.map(s => {
    const eventAvg = eventDayCount > 0 ? (sensorEvent[s.id] || 0) / eventDayCount : 0;
    const baseAvg = baseDayCount > 0 ? (sensorBase[s.id] || 0) / baseDayCount : 0;
    const changeRate = baseAvg > 0 ? ((eventAvg - baseAvg) / baseAvg * 100) : 0;
    return {
      id: s.id,
      name: s.name,
      area: s.area,
      areaColor: s.areaColor,
      lat: s.lat,
      lng: s.lng,
      eventAvg: Math.round(eventAvg),
      baseAvg: Math.round(baseAvg),
      changeRate: Math.round(changeRate * 10) / 10,
    };
  });

  const evInfo = targetEvents[0];
  res.json({
    name,
    summary: evInfo.summary,
    detailedUrl: evInfo.detailedUrl,
    locationName: evInfo.locationName,
    eventDayCount,
    eventDates: [...eventDates].sort(),
    sensors: result.sort((a, b) => b.changeRate - a.changeRate),
  });
});

// ===== API: エリア別集計（日次） =====
app.get('/api/area-daily', (req, res) => {
  const { year, month } = req.query;
  const summary = buildDailySummary();
  const sensors = loadSensors();
  const events = loadEvents();

  // エリアグループ
  const areaGroups = {};
  for (const s of sensors) {
    if (!areaGroups[s.area]) areaGroups[s.area] = [];
    areaGroups[s.area].push(s.id);
  }

  let dates = Object.keys(summary).sort();
  if (year) dates = dates.filter(d => d.startsWith(year));
  if (year && month) {
    const m = String(month).padStart(2, '0');
    dates = dates.filter(d => d.startsWith(`${year}-${m}`));
  }

  const result = dates.map(date => {
    const s = summary[date];
    const areaData = {};
    for (const [areaName, sensorIds] of Object.entries(areaGroups)) {
      areaData[areaName] = Math.round(sensorIds.reduce((sum, id) => sum + (s.sensors[id] || 0), 0));
    }
    const dayEvents = getEventsForDate(date, events);
    return {
      date,
      total: Math.round(s.total),
      holiday: s.holiday,
      areas: areaData,
      events: dayEvents.map(e => ({ name: e.name, locationName: e.locationName })),
    };
  });

  res.json(result);
});

// ===== API: 利用可能な年月リスト =====
app.get('/api/available-dates', (req, res) => {
  const summary = buildDailySummary();
  const dates = Object.keys(summary).sort();
  if (dates.length === 0) return res.json({ years: [], months: {} });

  const years = [...new Set(dates.map(d => d.substring(0, 4)))];
  const months = {};
  for (const y of years) {
    months[y] = [...new Set(dates.filter(d => d.startsWith(y)).map(d => d.substring(5, 7)))];
  }
  res.json({ years, months, dataStart: dates[0], dataEnd: dates[dates.length - 1] });
});

// ===== API: ダッシュボードKPI統計 =====
app.get('/api/stats', (req, res) => {
  const summary = buildDailySummary();
  const events = loadEvents();

  const allDays = Object.entries(summary);
  const totalFlow = allDays.reduce((s, [, d]) => s + d.total, 0);
  const avgDaily = totalFlow / allDays.length;

  // 最高人流日
  const maxEntry = allDays.reduce((a, b) => b[1].total > a[1].total ? b : a);

  // 月別集計でピーク月を算出
  const monthlyMap = {};
  for (const [date, d] of allDays) {
    const ym = date.substring(0, 7);
    if (!monthlyMap[ym]) monthlyMap[ym] = 0;
    monthlyMap[ym] += d.total;
  }
  const peakMonth = Object.entries(monthlyMap).reduce((a, b) => b[1] > a[1] ? b : a)[0];

  // ユニークイベント数
  const uniqueEventNames = new Set(events.map(e => e.name));

  res.json({
    totalDays: allDays.length,
    totalFlow: Math.round(totalFlow),
    avgDaily: Math.round(avgDaily),
    maxDay: { date: maxEntry[0], total: Math.round(maxEntry[1].total) },
    eventCount: uniqueEventNames.size,
    peakMonth,
  });
});

// ===== 起動 =====
console.log('Loading data...');
loadSensors();
loadEvents();
buildSummaries();

app.listen(PORT, () => {
  console.log(`\n仙台人流ダッシュボード起動完了`);
  console.log(`http://localhost:${PORT} にアクセスしてください`);
});
