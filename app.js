'use strict';

const $ = (id) => document.getElementById(id);
const SAMPLE = { channel: 'ftv', minute: 38, segment: 'ftv-2302' };
const PAGE_SIZE = 6;
const state = {
  view: 'monitor', version: 'original', channel: SAMPLE.channel, minute: SAMPLE.minute,
  segment: SAMPLE.segment, frameMode: 'segment', filter: 'all', page: 6, review: null, adChannel: 'all', topic: null,
};
const statusLabels = {
  news: '新聞', ad: '廣告', pending: '待確認', gap: '缺訊', continuation: '延續',
};
const icon = (name) => `<svg aria-hidden="true"><use href="#${name}"/></svg>`;
const elapsed = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
const stamp = (seconds) => {
  const h = 12 + Math.floor(seconds / 3600);
  return `${h}:${elapsed(seconds % 3600)}`;
};
const minuteTime = (minute) => stamp(minute * 60).slice(0, 5);
const length = (segment) => segment.end - segment.start;
const source = () => DEMO.versions[state.version];
const channelInfo = (id) => DEMO.channels.find((channel) => channel.id === id);
const percent = (n, d) => d ? `${(100 * n / d).toFixed(1)}%` : '不適用';
const cellCode = (minute, id) => `${channelInfo(id).column}${minute + 5}`;
const cellChanged = (minute, id) =>
  DEMO.versions.original.rows[minute][id].value !== DEMO.versions.reviewed.rows[minute][id].value;
const isUncertain = (cell) => cell.status === 'pending' || cell.status === 'gap';
const minuteFrame = (channel, minute) => `assets/frames/${channel}/${String(minute).padStart(2,'0')}.jpg`;
const segmentFrame = (channel, start) => `assets/segments/${channel}/${start}.jpg`;
// Each entry describes the original recording at MM:15, independently of the synthetic Excel tracks.
const recordingAds = {
  tvbs: {38:'冷氣廣告',39:'機車廣告',47:'家電促銷',49:'家具促銷'},
  ebc: {35:'家電廣告',38:'除臭產品廣告',45:'杏仁飲品廣告',47:'保健食品廣告'},
  ftv: {38:'金融商品包框廣告',55:'機車廣告',58:'汽車包框廣告'},
  cts: {35:'電器展廣告',42:'汽車廣告',49:'保健食品廣告',57:'汽車廣告'},
};
function commercialExample(channel,segment) {
  const minutes=Object.keys(recordingAds[channel]).map(Number);
  const minute=minutes.reduce((a,b)=>Math.abs(b*60+15-segment.start)<Math.abs(a*60+15-segment.start)?b:a);
  return {offset:minute*60+15,image:minuteFrame(channel,minute),label:recordingAds[channel][minute]};
}

// Synthetic minute series. Preserve the published comparison cases and their baselines.
const demoRatings = Object.fromEntries(DEMO.channels.map(({id}, i) => [id,
  Array.from({length:60}, (_, m) => Number((0.54 + i * 0.02 + 0.06 * Math.sin(m / 6 + i) + 0.025 * Math.cos(m / 3)).toFixed(2)))
]));
for (const story of Object.values(TOPIC_DEMO.cases)) {
  story.ratings.forEach((v,i) => { demoRatings[story.channel][story.startMinute+i] = v; });
  for (const [name,,before,current] of story.competitors) {
    const channel = DEMO.channels.find(c => c.name === name).id;
    const m = story.startMinute + story.breakIndex;
    demoRatings[channel][m-1] = before;
    demoRatings[channel][m] = current;
  }
}
for (const airing of TOPIC_DEMO.airings) {
  const entry = DEMO.versions.original.tracks[airing.channel].find(s => s.id === airing.segment);
  demoRatings[airing.channel][Math.floor(entry.start / 60)] = airing.rating == null ? null : airing.rating * 100;
}

function renderWall() {
  const m = state.minute;
  $('wall-minute').value = m;
  $('wall-time').textContent = minuteTime(m);
  $('wall-minute').setAttribute('aria-valuetext', minuteTime(m));
  $('wall-prev').disabled = m === 0;
  $('wall-next').disabled = m === 59;
  $('wall-grid').innerHTML = DEMO.channels.map(({id,name}) => {
    const cell = source().rows[m][id];
    const events = source().tracks[id].filter(s => cell.segments.includes(s.id));
    const current = demoRatings[id][m];
    const before = demoRatings[id][m-1];
    return `<article class="wall-card"><header><h3>${name}</h3><span>${recordingAds[id][m] || '原片取樣'}</span></header>
      <img width="640" height="360" src="${minuteFrame(id,m)}" alt="${name}側錄位移 ${elapsed(m*60+15)} 的畫面">
      <div class="wall-detail"><strong>示範填表 · ${events.map(s => s.label || statusLabels[s.type]).join('／')}</strong>
      <p>示範收視 <b>${current == null ? '未取得' : ratingText(current)}</b> · 較前分鐘 ${current == null || before == null ? '—' : deltaText(current-before)+' 個百分點'}</p>
      <button class="business-link" data-channel="${id}" data-minute="${m}">回查 ${cellCode(m,id)} 分鐘格</button></div></article>`;
  }).join('');
}

function scopeStats(id) {
  const track = source().tracks[id];
  const ads = track.filter((entry) => entry.type === 'ad');
  const uncertain = track.filter((entry) => entry.type === 'pending' || entry.type === 'gap');
  return {
    ads,
    adSeconds: ads.reduce((sum, entry) => sum + length(entry), 0),
    readable: 3600 - uncertain.reduce((sum, entry) => sum + length(entry), 0),
    pending: source().rows.filter((row) => row[id].status === 'pending').length,
    gap: source().rows.filter((row) => row[id].status === 'gap').length,
  };
}

function renderMetrics() {
  const stats = DEMO.channels.map(({ id }) => scopeStats(id));
  const totals = stats.reduce((sum, item) => ({
    pending: sum.pending + item.pending,
    gap: sum.gap + item.gap,
    readable: sum.readable + item.readable,
    breaks: sum.breaks + item.ads.length,
  }), { pending: 0, gap: 0, readable: 0, breaks: 0 });
  const metrics = [
    ['監看範圍', '04 / 04', '12:00–13:00'],
    ['待確認與缺訊', `${totals.pending + totals.gap} <small>格</small>`, `待確認 ${totals.pending} 格 · 缺訊 ${totals.gap} 格`],
    ['已辨識廣告區段', `${totals.breaks} <small>段</small>`, '四台合計'],
    ['有效可判讀覆蓋率', percent(totals.readable, 14400), `${totals.readable.toLocaleString('zh-TW')} / 14,400 秒`],
  ];
  $('metrics').innerHTML = metrics.map(([name, value, note]) =>
    `<div class="metric"><p>${name}</p><strong>${value}</strong><p>${note}</p></div>`).join('');
}

function renderTimeline() {
  const axis = ['12:00', '12:15', '12:30', '12:45', '13:00'];
  const recording=$('timeline-mode').value==='recording';
  $('timeline-note').textContent=recording ? '選取時間或「廣告」，在證據回查看該台原片。各檔自 12:00 起算，廣告取樣點已人工核對。' : '點選區段回查看原片。標題與區段為填表示範；廣告顯示同台實例及原片位移。';
  $('timeline-mode').closest('.panel-head').querySelector('.legend').hidden=recording;
  const lanes = DEMO.channels.map(({ id, name }) =>
    `<div class="timeline-row"><span class="lane-label">${name}</span><div class="track" role="group" aria-label="${name}播出區段">
      ${recording ? recordingLane(id,name) : source().tracks[id].map((segment) => {
        const selected = state.channel === id && state.segment === segment.id;
        const label = segment.type === 'news' ? segment.label : statusLabels[segment.type];
        const example=segment.type==='ad' ? commercialExample(id,segment) : null;
        const summary = `${name} ${stamp(segment.start)} 至 ${stamp(segment.end)}，示範標記：${label}，原片位移 +${elapsed(example?.offset ?? segment.start)}`;
        return `<button class="segment ${segment.type === 'ad' ? 'commercial' : segment.type}"
          style="--duration:${length(segment)}" data-channel="${id}" data-segment="${segment.id}"
          aria-label="${summary}" title="${summary}" aria-pressed="${selected}"><span>${length(segment) >= 180 || example ? label : ''}</span></button>`;
      }).join('')}
    </div></div>`).join('');
  $('timeline').innerHTML = `<div class="timeline-row" aria-hidden="true"><span></span><div class="ticks">${axis.map((time) => `<span>${time}</span>`).join('')}</div></div>${lanes}`;
}

function recordingLane(id,name) {
  const points=[...new Set([...Array.from({length:12},(_,i)=>i*5),...Object.keys(recordingAds[id]).map(Number)])].sort((a,b)=>a-b);
  return '<span style="flex:15 1 0"></span>'+points.map((m,i)=>{
    const ad=recordingAds[id][m];
    const offset=m*60+15;
    const description=`${name} 原片 +${elapsed(offset)} · ${ad || '取樣影格'}`;
    return `<button class="segment ${ad?'commercial':'news'}" style="--duration:${(i+1<points.length?points[i+1]*60+15:3600)-offset}" data-recording-minute="${m}" data-channel="${id}" title="${description}" aria-label="${description}" aria-pressed="${id===state.channel && m===state.minute && state.frameMode==='minute'}"><span>${ad?'廣告':elapsed(offset)}</span></button>`;
  }).join('');
}

function filteredMinutes() {
  return source().rows.flatMap((row, i) => {
    const show = state.filter === 'all'
      || (state.filter === 'pending' && Object.values(row).some(isUncertain))
      || (state.filter === 'changed' && state.version === 'reviewed'
          && DEMO.channels.some(({ id }) => cellChanged(i, id)));
    return show ? [i] : [];
  });
}

function renderSheet() {
  const matches = filteredMinutes();
  state.page = Math.max(0, Math.min(state.page, Math.ceil(matches.length / PAGE_SIZE) - 1));
  const visible = matches.slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE);
  $('sheet-head').innerHTML = `<tr><th scope="col">時間</th>${DEMO.channels.map(({ name, column }) =>
    `<th scope="col">${name}<span class="col-code">${column}</span></th>`).join('')}</tr>`;
  $('sheet-body').innerHTML = visible.length ? visible.map((minute) => `
    <tr><th scope="row">${minuteTime(minute)}</th>${DEMO.channels.map(({ id, name }) => {
      const cell = source().rows[minute][id];
      const changed = state.version === 'reviewed' && cellChanged(minute, id);
      const selected = state.channel === id && state.minute === minute;
      const display = cell.value || '—';
      const summary = `${minuteTime(minute)} ${name} ${cellCode(minute, id)} ${cell.value || '延續留白'}${changed ? '，已異動' : ''}`;
      return `<td><button class="cell ${cell.status}${changed ? ' changed' : ''}" data-channel="${id}"
        data-minute="${minute}" aria-label="${summary}" title="${summary}" aria-pressed="${selected}">${display}</button></td>`;
    }).join('')}</tr>`).join('') :
    '<tr><td class="empty" colspan="5">此版本沒有符合條件的格位。</td></tr>';
  $('range-label').textContent = visible.length
    ? `${minuteTime(visible[0])}–${minuteTime(visible.at(-1))} · 共 ${matches.length} 列`
    : '共 0 列';
  $('prev').disabled = state.page === 0;
  $('next').disabled = (state.page + 1) * PAGE_SIZE >= matches.length;
}

function renderInspector() {
  const { channel, minute } = state;
  const name = channelInfo(channel).name;
  const cell = source().rows[minute][channel];
  const lane = source().tracks[channel];
  const selected = lane.find((entry) => entry.id === state.segment && cell.segments.includes(entry.id))
    ?? lane.find((entry) => cell.segments.includes(entry.id) && isUncertain({ status: entry.type }))
    ?? lane.find((entry) => cell.segments.includes(entry.id));
  state.segment = selected.id;
  const segmentStill = state.frameMode === 'segment';
  const example=segmentStill && selected.type==='ad' ? commercialExample(channel,selected) : null;
  const offset = example?.offset ?? (segmentStill ? selected.start : minute*60+15);
  const still = example?.image ?? (segmentStill ? segmentFrame(channel,selected.start) : minuteFrame(channel,minute));
  const verifiedAd = !segmentStill && recordingAds[channel][minute];
  const sourceLabel = example ? '同台廣告實例 · '+example.label : verifiedAd ? '已核對廣告 · '+verifiedAd : segmentStill ? '區段起點影格' : '分鐘取樣影格';
  const demoCase = channel === SAMPLE.channel && minute === SAMPLE.minute;
  const isDiff = state.version === 'reviewed' && cellChanged(minute, channel);
  const clip = demoCase;
  const headline = demoCase ? '捷運尖峰擬增開班次' : (selected.type === 'news' ? selected.label : '—');
  const transcript = demoCase
    ? '12:38:22 促銷口播開始，新聞敘事暫停。12:38:45 恢復播報。'
    : (selected.type === 'ad' ? '主要內容轉為促銷，標記廣告區段。' :
      selected.type === 'gap' ? '來源缺訊，保留受影響分鐘。' :
      selected.type === 'pending' ? '畫面與音訊證據不足，保留待確認。' : '新聞敘事持續，來源分類為新聞。');
  $('inspector').innerHTML = `
    <div class="panel-head">
      <div><h2 id="inspector-title" tabindex="-1">證據回查</h2><p class="mono">${name} · ${minuteTime(minute)} · ${cellCode(minute, channel)}</p></div>
      <span class="pill ${isDiff ? 'news' : cell.status}">示範格位 · ${isDiff ? '已修訂' : statusLabels[cell.status]}</span>
    </div>
    <div class="inspector-body">
      <div class="inspect-context"><strong>${cell.value || '延續留白'}</strong>
        <span class="subtle mono">區段 ${stamp(selected.start)}–${stamp(selected.end)}（示意）</span>
      </div>
      <figure class="sample-source">
        <div class="media" id="media">
          <img src="${still}" alt="${name} 11/06 側錄檔案位移 ${elapsed(offset)}" width="640" height="360">
          <span class="media-badge">11/06 原片參考</span>
        </div>
        <figcaption class="subtle">${sourceLabel} · 原片位移 <span class="mono">+${elapsed(offset)}</span> · 以下文字為合成示例。</figcaption>
        ${clip ? `<button type="button" class="clip-button" data-action="clip">${icon('play')}播放原片節錄</button>` : ''}
      </figure>
      <dl class="evidence">
        <div><dt>OCR 文字（合成）</dt><dd>${headline}</dd></div>
        <div><dt>影音證據（合成）</dt><dd>${transcript}</dd></div>
      </dl>
      ${demoCase && state.version === 'original' && !state.review
        ? `<button type="button" class="button primary" data-action="review">${icon('file')}預覽覆核差異</button>` : ''}
      ${isDiff ? `<p class="changes">已套用示範修訂 · ${state.review.reason}。修訂後可從上方下載 Excel。</p>` : ''}
      ${demoCase && state.review ? '<button type="button" class="button neutral" data-action="reset">重設示範修訂</button>' : ''}
    </div>`;
}

function renderAnalysis() {
  const channels = DEMO.channels.filter(({ id }) => state.adChannel === 'all' || state.adChannel === id);
  $('break-summary').innerHTML = channels.map(({ id, name }) => {
    const stats = scopeStats(id);
    return `<div class="break-card"><h3>${name}</h3><strong>${percent(stats.adSeconds, stats.readable)}</strong>
      <p>有效區間廣告占比 · ${stats.ads.length} 段</p><p>廣告 ${stats.adSeconds.toLocaleString('zh-TW')} / ${stats.readable.toLocaleString('zh-TW')} 秒</p><p>覆蓋率 ${percent(stats.readable, 3600)}</p></div>`;
  }).join('');
  $('break-rows').innerHTML = channels.flatMap(({ id, name }) =>
    scopeStats(id).ads.map((segment) => {
      const partial = segment.start === 0 || segment.end === 3600;
      return `<tr><th scope="row">${name}</th><td class="mono" data-label="起點">${stamp(segment.start)}</td>
        <td class="mono" data-label="終點">${stamp(segment.end)}</td><td class="mono" data-label="時長">${elapsed(length(segment))}</td>
        <td data-label="觀測狀態"><span class="pill ${partial ? 'gap' : 'news'}">${partial ? '部分觀測' : '完整觀測'}</span></td>
        <td><button class="button neutral" data-channel="${id}" data-segment="${segment.id}">查看</button></td></tr>`;
    })).join('') || '<tr><td class="empty" colspan="6">目前沒有可列入的廣告區段。</td></tr>';
}

const ratingText = (value) => value.toFixed(2) + '%';
const deltaText = (value) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}`;

function topicDetail(topic, page) {
  const story = TOPIC_DEMO.cases[topic.id];
  const { ratings, breakIndex, startMinute, channel, segment } = story;
  const station = channelInfo(channel).name;
  const peak = ratings.indexOf(Math.max(...ratings));
  const dip = ratings.slice(1).reduce((best, current, index) =>
    current - ratings[index] < ratings[best] - ratings[best - 1] ? index + 1 : best, 1);
  const minutes = ratings.map((_, index) => minuteTime(startMinute + index));
  const y = (value) => Math.round(90 - (value - 0.35) * 170);
  const x = (index) => 30 + index * 75;
  const points = ratings.map((value, i) => `${x(i)},${y(value)}`).join(' ');
  const desc = ratings.map((value, i) => `${minutes[i]} ${ratingText(value)}`).join('、');
  const jump = `<button class="business-link" data-channel="${channel}" data-segment="${segment}">回查區段</button>`;
  if (page === 'categories') {
    return `<p>${station} · ${minutes[0]} 至 ${minutes.at(-1)} · 收視率 ${ratingText(ratings[0])} → ${ratingText(ratings.at(-1))}</p>`;
  }
  if (page === 'minutes') return `
      <p class="subtle">${station} · 高點 ${minutes[peak]} · 最大下滑 ${minutes[dip]}</p>
      <svg class="rating-curve" viewBox="0 0 360 116" role="img" aria-label="${desc}">
        <rect x="${x(breakIndex) - 18}" y="9" width="36" height="88" rx="6"/>
        <path d="M30 96H330"/><polyline points="${points}"/>
        ${ratings.map((value, i) => `<circle cx="${x(i)}" cy="${y(value)}" r="4"/><text x="${x(i)}" y="110">${minutes[i]}</text>`).join('')}
      </svg><p class="subtle">紫帶為破口所在分鐘。點位待跨日驗證。</p>`;
  if (page === 'break') return `<p class="subtle">${station} · 破口所在分鐘 ${minutes[breakIndex]}${story.mixed ? '（混合）' : ''}</p>
      <dl class="break-stats">${['前一分鐘','所在分鐘','後一分鐘'].map((label, index) =>
        `<div><dt>${label}</dt><dd class="mono">${ratingText(ratings[breakIndex + index - 1])}</dd></div>`).join('')}</dl>
      <p class="subtle">進廣告前後淨變動 ${deltaText(ratings[breakIndex] - ratings[breakIndex - 1])} 個百分點</p>${jump}`;
  if (page === 'competition') return `<p class="subtle">${minutes[breakIndex]} · 台別收視淨變動（百分點）</p>
      <ul class="competition-stats">${story.competitors.map(([name, title, before, current]) =>
        `<li><b>${name}</b><span>${title}</span><strong class="mono">${deltaText(current - before)}</strong></li>`).join('')}</ul>
      <button class="business-link" data-wall-minute="${startMinute+breakIndex}">查看 ${minutes[breakIndex]} 四台畫面</button>
      <p class="subtle">換台方向需另接授權資料。</p>`;
  if (page === 'platforms') return `<p class="subtle">${topic.name} · 發布後 24 小時瀏覽</p>
      <dl class="platform-stats">${TOPIC_DEMO.platforms.map((name, i) =>
        `<div><dt>${name}</dt><dd class="mono">${topic.views[i]?.toLocaleString('zh-TW') ?? '—'}</dd></div>`).join('')}</dl>
      <p class="subtle">各平台分列，供二剪候選比較。</p>`;
}

function renderTopics() {
  const topics = TOPIC_DEMO.topics.filter(topic => !state.topic || topic.id === state.topic);
  const selector = $('analysis-page');
  const page = selector.value;
  $('business-topic').value = state.topic || '';
  const categorySummary = page === 'categories' && !state.topic
    ? `<p class="subtle">各類別對同台同時段基準 · 百分點</p><ul class="category-stats">${TOPIC_DEMO.categories.map(([name, delta, n]) =>
        `<li><span>${name}</span><b>${deltaText(delta)}</b><span>${n} 則</span></li>`).join('')}</ul>` : '';
  const detailPage = !['matrix', 'timeline'].includes(page);
  $('business-cards').hidden = !detailPage;
  $('business-cards').innerHTML = detailPage ? `<article class="panel business-card"><h3>${selector.selectedOptions[0].text}</h3>${categorySummary}${topics.map(topic =>
      `<section class="topic-detail"><h4>${topic.name}</h4>${topicDetail(topic,page)}</section>`).join('')}</article>` : '';

  const topicName = (id) => topics.find((topic) => topic.id === id).name;
  const airings = TOPIC_DEMO.airings.filter(({ topic }) => !state.topic || topic === state.topic);
  $('clear-topic').hidden = !state.topic;
  $('topic-airings').innerHTML = airings.map(({ topic, channel, segment, rating }) => {
    const entry = DEMO.versions.original.tracks[channel].find((item) => item.id === segment);
    const { name } = channelInfo(channel);
    const interval = `${stamp(entry.start)}–${stamp(entry.end)}`;
    return `<tr><th scope="row">${topicName(topic)}</th><td>${name}</td>
      <td class="mono topic-interval">${interval}</td><td class="mono topic-number">${rating == null ? '<span aria-label="未取得">—</span>' : (rating * 100).toFixed(2) + '%'}</td>
      <td><button class="button neutral" data-channel="${channel}" data-segment="${segment}"
        aria-label="回查 ${topicName(topic)} ${name} ${stamp(entry.start)}">回查</button></td></tr>`;
  }).join('');
  $('topic-view-head').innerHTML = `<tr><th scope="col">議題</th>${TOPIC_DEMO.platforms.map(
    (name) => `<th scope="col">${name}</th>`).join('')}</tr>`;
  $('topic-views').innerHTML = topics.map(({ id, name, views }) => `
    <tr class="${state.topic === id ? 'active-topic' : ''}">
      <th scope="row"><button class="topic-choice" aria-pressed="${state.topic === id}" data-topic="${id}">${name}</button></th>
      ${views.map((value) => `<td class="mono topic-number">${value == null ? '<span aria-label="未取得">—</span>' : value.toLocaleString('zh-TW')}</td>`).join('')}
    </tr>`).join('');
  $('topics-view').hidden = !['matrix','timeline'].includes(page);
  $('topic-timeline-title').closest('section').hidden = page !== 'timeline';
  $('topic-views-title').closest('section').hidden = page !== 'matrix';
}

$('analysis-page').addEventListener('change', renderTopics);

function render() {
  const isMonitor = state.view === 'monitor';
  const isTopics = state.view === 'topics';
  $('monitor-view').hidden = !isMonitor;
  $('wall-view').hidden = state.view !== 'wall';
  $('analysis-view').hidden = state.view !== 'analysis';
  $('topics-view').hidden = !isTopics;
  $('business-view').hidden = !isTopics;
  $('metrics').hidden = isTopics || state.view === 'wall';
  $('page-title').textContent = { monitor: '監看與覆核', wall:'四台畫面', analysis: '廣告分析', topics: '議題分析' }[state.view];
  $('page-description').textContent = {
    monitor: '核對時間、回看證據，從同一條時間軸預覽 Excel。',
    wall: '切換分鐘，比對四台側錄影格、播出區段與示範收視。',
    analysis: '依播出區段比較競台廣告破口與資料覆蓋率。',
    topics: '以同一議題比對各台播出、對應收視與平台瀏覽數。',
  }[state.view];
  document.querySelectorAll('[data-view]').forEach((button) => {
    if (button.dataset.view === state.view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  $('version').querySelector('[value=reviewed]').disabled = !state.review;
  $('version').value = state.version;
  $('version').closest('.version-control').hidden = isTopics;
  $('download').href = isTopics ? 'assets/示範_議題分析.xlsx' : source().excel;
  $('download').innerHTML = `${icon('arrow-down')}${isTopics ? '下載議題分析 Excel' : '下載 Excel'}`;
  $('filter').value = state.filter;
  renderMetrics();
  if (isMonitor) {
    renderInspector();
    renderTimeline();
    renderSheet();
  } else if (state.view === 'wall') {
    renderWall();
  } else if (isTopics) {
    renderTopics();
  } else {
    renderAnalysis();
  }
}

function choose(channel, minute, segment = null, fromAnalysis = false) {
  state.channel = channel;
  state.minute = minute;
  state.segment = segment;
  state.frameMode = segment ? 'segment' : 'minute';
  state.view = 'monitor';
  if (segment || fromAnalysis) {
    state.filter = 'all';
    state.page = Math.floor(minute / PAGE_SIZE);
  }
  render();
  if (fromAnalysis || window.matchMedia('(max-width: 969px)').matches) {
    $('inspector-title').focus();
  } else if (segment) {
    $('timeline').querySelector(`[data-segment="${segment}"]`)?.focus();
  } else {
    $('sheet-body').querySelector(`[data-channel="${channel}"][data-minute="${minute}"]`)?.focus();
  }
}

function selectSegment(target, fromAnalysis = false) {
  const button = target.closest('[data-segment]');
  if (!button) return;
  const { channel, segment } = button.dataset;
  const entry = source().tracks[channel].find((item) => item.id === segment);
  choose(channel, Math.floor(entry.start / 60), segment, fromAnalysis);
}

function announce(message) {
  $('notice').hidden = !message;
  $('notice').textContent = message;
}

function openReview() {
  const { channel, minute } = SAMPLE;
  $('diff-original').textContent = DEMO.versions.original.rows[minute][channel].value;
  $('diff-reviewed').textContent = DEMO.versions.reviewed.rows[minute][channel].value;
  $('extra-diff').textContent = '其他異動｜N44 的待確認標記移除，保留下一則新聞。';
  $('review-dialog').showModal();
  $('reason').focus();
}

document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => {
  announce('');
  state.view = button.dataset.view;
  render();
}));
$('timeline-mode').addEventListener('change',renderTimeline);
$('timeline').addEventListener('click', event => {
  const frame=event.target.closest('[data-recording-minute]');
  if(frame) choose(frame.dataset.channel,Number(frame.dataset.recordingMinute),null,true);
  else selectSegment(event.target);
});
$('break-rows').addEventListener('click', (event) => selectSegment(event.target, true));
$('topic-airings').addEventListener('click', (event) => selectSegment(event.target, true));
$('business-cards').addEventListener('click', (event) => {
  const link = event.target.closest('[data-wall-minute]');
  if (!link) return selectSegment(event.target, true);
  state.filter='all';
  changeWallMinute(Number(link.dataset.wallMinute));
  state.view='wall';
  render();
  $('wall-minute').focus();
});
function changeWallMinute(minute) {
  state.minute=minute;
  state.page=Math.floor(minute/PAGE_SIZE);
  state.segment=null;
  state.frameMode='minute';
  renderWall();
}
$('wall-prev').addEventListener('click', () => changeWallMinute(state.minute-1));
$('wall-next').addEventListener('click', () => changeWallMinute(state.minute+1));
$('wall-minute').addEventListener('input', e => changeWallMinute(Number(e.target.value)));
$('wall-grid').addEventListener('click', e => {
  const b=e.target.closest('[data-channel]');
  if (b) choose(b.dataset.channel,Number(b.dataset.minute),null,true);
});
$('business-topic').innerHTML = '<option value="">全部議題</option>' + TOPIC_DEMO.topics.map(({ id, name }) => `<option value="${id}">${name}</option>`).join('');
$('business-topic').addEventListener('change', (event) => {
  state.topic = event.target.value || null;
  renderTopics();
});
$('topic-views').addEventListener('click', (event) => {
  const button = event.target.closest('[data-topic]');
  if (!button) return;
  const id = button.dataset.topic;
  state.topic = id;
  $('analysis-page').value = 'timeline';
  renderTopics();
  $('clear-topic').focus();
});
$('clear-topic').addEventListener('click', () => {
  state.topic = null;
  renderTopics();
  $('analysis-page').focus();
});
$('sheet-body').addEventListener('click', (event) => {
  const button = event.target.closest('[data-minute]');
  if (button) choose(button.dataset.channel, Number(button.dataset.minute));
});
$('filter').addEventListener('change', (event) => {
  state.filter = event.target.value;
  state.page = 0;
  renderSheet();
});
$('prev').addEventListener('click', () => { state.page -= 1; renderSheet(); });
$('next').addEventListener('click', () => { state.page += 1; renderSheet(); });
$('channel-filter').insertAdjacentHTML('beforeend', DEMO.channels.map(({ id, name }) =>
  `<option value="${id}">${name}</option>`).join(''));
$('channel-filter').addEventListener('change', (event) => {
  state.adChannel = event.target.value;
  renderAnalysis();
});
$('version').addEventListener('change', (event) => {
  state.version = event.target.value;
  if (state.version === 'original' && state.filter === 'changed') state.filter = 'all';
  render();
});
$('inspector').addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'review') openReview();
  if (action === 'clip') {
    $('media').innerHTML = '<video controls preload="metadata" aria-label="民視原片參考節錄，自檔案位移加 37 分 58 秒起" src="assets/ftv-ad.mp4"></video><span class="media-badge">11/06 原片參考 · +37:58</span>';
    const video = $('media').querySelector('video');
    video.focus();
    video.play().catch(() => { /* Native controls remain available. */ });
    event.target.closest('[data-action]').remove();
  }
  if (action === 'reset') {
    state.review = null;
    state.version = 'original';
    state.filter = 'all';
    state.page = Math.floor(SAMPLE.minute / PAGE_SIZE);
    state.segment = SAMPLE.segment;
    state.frameMode = 'segment';
    announce('已回到自動原始版。');
    render();
    $('inspector-title').focus();
  }
});
['dialog-close', 'dialog-cancel'].forEach((id) => $(id).addEventListener('click', () => $('review-dialog').close()));
$('review-form').addEventListener('submit', (event) => {
  event.preventDefault();
  state.review = { reason: $('reason').value };
  state.version = 'reviewed';
  state.filter = 'changed';
  state.page = 0;
  $('review-dialog').close();
  announce('已產生覆核修訂版。預覽顯示異動格位，可下載對應 Excel。');
  render();
  $('inspector-title').focus();
});

render();
