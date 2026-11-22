'use strict';

const $ = (id) => document.getElementById(id);
const SAMPLE = { channel: 'ftv', minute: 38, segment: 'ftv-2302' };
const PAGE_SIZE = 6;
const state = {
  view: 'monitor', version: 'recording', channel: 'tvbs', minute: 0,
  segment: null, frameMode: 'segment', filter: 'all', page: 0, review: null, adChannel: 'all', topic: null,
};
const statusLabels = {
  news: '新聞', ad: '廣告', pending: '待確認', gap: '缺訊', continuation: '延續', unknown:'前段未載',
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

const official = () => state.version === 'official';
const captured = () => state.version === 'recording';
const realBatch = () => official() || captured();
function representative(channel,segment) {
  if(captured()) return segment;
  if (segment.type==='unknown') return null;
  if (segment.type==='ad') return commercialExample(channel,segment);
  const m=Math.floor(segment.start/60);
  return official() ? {image:minuteFrame(channel,m),offset:m*60+15} : {image:segmentFrame(channel,segment.start),offset:segment.start};
}
function minuteSelection(channel,minute,preferred) {
  const ids=source().rows[minute][channel].segments;
  const events=source().tracks[channel].filter(s=>ids.includes(s.id));
  return events.find(s=>s.id===preferred) || events.find(s=>isUncertain({status:s.type})) || events.at(-1);
}
const officialRange=s=>minuteTime(s.start/60)+'–'+minuteTime(s.end/60-1);
const capturedRange=s=>minuteTime(Math.floor(s.start/60))+'–'+minuteTime(Math.floor((s.end-1)/60));
function displayTitle(segment,minute) {
  return official() && minute>segment.start/60 ? segment.label.split('/').at(-1) : segment.label;
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
    const segment=minuteSelection(id,m);
    const frame=representative(id,segment);
    const series = captured() ? NOV_RATINGS.ratings[id] : demoRatings[id];
    const current = series[m];
    const before = series[m-1];
    return `<article class="wall-card"><header><h3>${name}</h3><span>${captured()?'11/06 側錄':frame?'11/06 影像示意':'前段未載'}</span></header>
      ${frame?`<img width="640" height="360" src="${frame.image}" alt="${name}區段示意影格">`:''}
      <div class="wall-detail"><strong>${displayTitle(segment,m)}</strong>
      ${captured()?`<p>${capturedRange(segment)} · 原片 +${elapsed(segment.offset)}</p><p>模擬分鐘收視 <b>${ratingText(current)}</b></p>`:official()?`<p>10/26 登錄區間 · ${officialRange(segment)}</p>`:`<p>示範收視 <b>${current == null ? '未取得' : ratingText(current)}</b> · 較前分鐘 ${current == null || before == null ? '—' : deltaText(current-before)+' 個百分點'}</p>`}
      <button class="business-link" data-channel="${id}" data-minute="${m}">回查 ${cellCode(m,id)} 分鐘格</button></div></article>`;
  }).join('');
}

function scopeStats(id) {
  const track = source().tracks[id];
  const ads = track.filter((entry) => entry.type === 'ad');
  const uncertain = track.filter((entry) => ['pending','gap','unknown'].includes(entry.type));
  return {
    ads,
    adSeconds: ads.reduce((sum, entry) => sum + length(entry), 0),
    readable: track.reduce((sum,entry)=>sum+length(entry),0) - uncertain.reduce((sum, entry) => sum + length(entry), 0),
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
  const metrics = realBatch() ? [
    ['監看範圍','4 台',(captured()?'11/06':'10/26')+' · 12:00–12:59'],
    ['分鐘格','240','每台 60 格'],
    ['有登錄的分鐘格',source().rows.flatMap(Object.values).filter(c=>c.value).length,'依四台標題欄統計'],
    ['廣告起點',totals.breaks+' 段',captured()?'依側錄畫面判讀':'依原表「廣告」登錄'],
  ] : [
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
  const recording=!realBatch() && $('timeline-mode').value==='recording';
  $('timeline-note').textContent=recording ? '選取時間或「廣告」，在證據回查看該台原片。各檔自 12:00 起算，廣告取樣點已人工核對。' : '點選區段回查看原片。標題與區段為填表示範；廣告顯示同台實例及原片位移。';
  $('timeline-mode').closest('.panel-head').querySelector('.legend').hidden=recording;
  $('timeline-mode').parentElement.hidden=realBatch();
  if(captured()) $('timeline-note').textContent='11/06 側錄依畫面時鐘對齊。點選區段可查畫面標題與原片；同台續報沿用同一張圖。';
  if(official()) $('timeline-note').textContent='10/26 官方 Excel：每個色塊代表一次登錄。空白分鐘延續上一則，直到該台換題。';
  const lanes = DEMO.channels.map(({ id, name }) =>
    `<div class="timeline-row"><span class="lane-label">${name}</span><div class="track" role="group" aria-label="${name}播出區段">
      ${recording ? recordingLane(id,name) : source().tracks[id].map((segment) => {
        const selected = state.channel === id && state.segment === segment.id;
        const label = segment.type === 'news' ? segment.label : statusLabels[segment.type];
        const example=segment.type==='ad' ? representative(id,segment) : null;
        const summary = captured() ? `${name} ${capturedRange(segment)} · ${segment.label} · 原片 +${elapsed(segment.offset)}` : official() ? `${name} ${officialRange(segment)} · ${segment.label}` : `${name} ${stamp(segment.start)} 至 ${stamp(segment.end)}，示範標記：${label}，原片位移 +${elapsed(example?.offset ?? segment.start)}`;
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
  const selected=minuteSelection(channel,minute,state.segment);
  state.segment = selected.id;
  if(captured()){
    const siblings=cell.segments.map(id=>source().tracks[channel].find(s=>s.id===id));
    $('inspector').innerHTML=`<div class="panel-head"><div><h2 id="inspector-title" tabindex="-1">區段回查</h2><p class="mono">${name} · ${minuteTime(minute)} · ${cellCode(minute,channel)}</p></div></div>
      <div class="inspector-body"><div class="inspect-context"><strong>${selected.label}</strong><span>11/06 · 播出分鐘 ${capturedRange(selected)}</span></div>
      <figure class="sample-source"><div class="media"><img src="${selected.image}" width="960" height="540" alt="${name} ${selected.label}側錄影格"></div>
      <figcaption>11/06 原片 +${elapsed(selected.offset)} · 區段代表影格</figcaption></figure>
      <dl class="evidence"><div><dt>畫面主標／內容摘錄</dt><dd>${selected.headline}</dd></div><div><dt>分鐘格值</dt><dd>${cell.value || '空白，延續前一則'}</dd></div></dl>
      ${siblings.length>1?`<div>本分鐘內的區段 ${siblings.map(s=>`<button class="business-link" data-inspect-segment="${s.id}" aria-pressed="${s.id===selected.id}">${s.label}</button>`).join(' ')}</div>`:''}</div>`;
    return;
  }
  if(official()){
    const frame=representative(channel,selected);
    $('inspector').innerHTML=`<div class="panel-head"><div><h2 id="inspector-title" tabindex="-1">區段回查</h2><p class="mono">${name} · ${minuteTime(minute)} · ${cellCode(minute,channel)}</p></div></div>
      <div class="inspector-body"><div class="inspect-context"><strong>${displayTitle(selected,minute)}</strong><span>10/26 · ${officialRange(selected)}</span></div>
      ${frame?`<figure class="sample-source"><div class="media"><img src="${frame.image}" width="640" height="360" alt="${name} 11/06 區段示意影格"><span class="media-badge">11/06 影像示意</span></div><figcaption>原片位移 +${elapsed(frame.offset)} · 同一登錄區段共用此圖。</figcaption></figure>`:'<p>首格空白，前一則標題未載於範例。</p>'}
      <dl class="evidence"><div><dt>10/26 原表格值</dt><dd>${cell.value || (frame?'空白，沿用前一則':'空白')}</dd></div>${selected.label.includes('/')?'<div><dt>同分鐘多則</dt><dd>依原表保留登錄順序；下一分鐘留白時沿用末則。</dd></div>':''}</dl></div>`;
    return;
  }
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
  const history=official();
  document.querySelector('#analysis-view .analysis-note').textContent=history?'廣告占比＝標記為廣告的分鐘格數 ÷ 可歸屬的分鐘格數。首筆登錄前的空白不計入分母。':'廣告占比＝已確認的廣告秒數 ÷ 有效可判讀秒數。覆蓋率＝有效可判讀秒數 ÷ 監看視窗秒數。';
  if(captured()) document.querySelector('#analysis-view .analysis-note').textContent='起訖取自最早觀測到廣告及返回節目的取樣點。廣告秒數與占比為取樣估計，分母為當台可判讀的側錄秒數。';
  const channels = DEMO.channels.filter(({ id }) => state.adChannel === 'all' || state.adChannel === id);
  $('break-summary').innerHTML = channels.map(({ id, name }) => {
    const stats = scopeStats(id);
    return `<div class="break-card"><h3>${name}</h3><strong>${percent(stats.adSeconds, stats.readable)}</strong>
      <p>有效區間廣告占比 · ${stats.ads.length} 段</p><p>廣告 ${history?(stats.adSeconds/60)+' / '+(stats.readable/60)+' 分鐘':stats.adSeconds.toLocaleString('zh-TW')+' / '+stats.readable.toLocaleString('zh-TW')+' 秒'}</p><p>覆蓋率 ${percent(stats.readable, 3600)}</p></div>`;
  }).join('');
  $('break-rows').innerHTML = channels.flatMap(({ id, name }) =>
    scopeStats(id).ads.map((segment) => {
      const partial = segment.start === 0 || segment.end === 3600;
      return `<tr><th scope="row">${name}</th><td class="mono" data-label="起點">${stamp(segment.start)}</td>
        <td class="mono" data-label="終點">${stamp(segment.end)}</td><td class="mono" data-label="時長">${elapsed(length(segment))}</td>
        <td data-label="觀測狀態"><span class="pill ${partial ? 'gap' : 'news'}">${captured()?'側錄取樣估計':history?'原表分鐘':partial ? '部分觀測' : '完整觀測'}</span></td>
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

function renderRecordingRatings() {
  const {topics,ratings,breaks}=NOV_RATINGS;
  const names=DEMO.channels;
  const filter=$('nov-topic').value;
  const report=$('nov-report').value;
  const link=(ch,id,text,minute=null)=>`<button class="business-link" data-channel="${ch}" data-segment="${id}" ${minute==null?'':`data-minute="${minute}"`}>${text}</button>`;
  const row=(first,cells)=>`<tr><th scope="row">${first}</th>${cells.map(v=>`<td>${v}</td>`).join('')}</tr>`;
  const rate=v=>v==null?'—':ratingText(v);
  let columns, note, rows;
  $('nov-peaks').innerHTML='';
  if(report==='topics'){
    columns=['議題','最早播出','平均收視最高',...names.map(s=>s.name)];
    note='點選分鐘可回查原片。同台重播分次列出，平均收視按各播出區段實際涵蓋的秒數加權；同分鐘首播並列。';
    rows=Object.entries(topics).filter(([label])=>!filter||label===filter).map(([label,stations])=>{
      const aired=names.filter(s=>stations[s.id]);
      const earliest=Math.min(...aired.map(s=>stations[s.id].airings[0].m));
      const highest=Math.max(...aired.map(s=>stations[s.id].avg));
      const first=aired.filter(s=>stations[s.id].airings[0].m===earliest).map(s=>s.name).join('／');
      const leaders=aired.filter(s=>stations[s.id].avg===highest).map(s=>s.name).join('／');
      return row(label,[first,aired.length>1?leaders+' '+rate(highest):'單台播出',...names.map(({id})=>{
        const a=stations[id];return a?rate(a.avg)+'<br>'+a.airings.map(s=>link(id,s.id,minuteTime(s.m))).join(' '):'—';
      })]);
    });
  }else if(report==='minutes'){
    columns=['播出分鐘',...names.map(s=>s.name)];
    note='每格顯示該台的模擬分鐘收視及當時播出內容。選擇議題後，保留任一台播出該議題的分鐘，供同期比較。';
    const batch=source();
    const events=(id,m)=>batch.tracks[id].filter(s=>batch.rows[m][id].segments.includes(s.id));
    const minutes=Array.from({length:60},(_,m)=>m).filter(m=>!filter||names.some(({id})=>events(id,m).some(s=>s.label===filter)));
    $('nov-peaks').innerHTML='<div class="break-summary">'+names.map(({id,name})=>{
      const peak=minutes.reduce((best,m)=>ratings[id][m]>ratings[id][best]?m:best,minutes[0]);
      return `<div class="break-card"><h3>${name}</h3><strong>${rate(ratings[id][peak])}</strong><p>所選分鐘高點 · ${minuteTime(peak)}</p></div>`;
    }).join('')+'</div>';
    rows=minutes.map(m=>row(minuteTime(m),names.map(({id})=>{
      const delta=m?deltaText(ratings[id][m]-ratings[id][m-1])+' 個百分點':'—';
      return rate(ratings[id][m])+` <small>${delta}</small><br>`+events(id,m).map(s=>link(id,s.id,s.label,m)).join('／');
    })));
  }else{
    columns=['頻道','破口前議題','廣告分鐘（含首尾）','前一分鐘','廣告平均','後一分鐘','前後差（百分點）'];
    note='比較進廣告前一分鐘與離開廣告後一分鐘。廣告平均按破口在各分鐘所占秒數加權，篩選依破口前的議題。';
    rows=breaks.filter(b=>!filter||b.previous===filter).sort((a,b)=>a.start-b.start).map(b=>row(channelInfo(b.ch).name,[
      b.previous,link(b.ch,b.id,minuteTime(b.start)+'–'+minuteTime(b.last)),rate(b.before),rate(b.during),rate(b.after),
      b.before==null||b.after==null?'—':deltaText(b.after-b.before)
    ]));
  }
  $('nov-columns').innerHTML='<tr>'+columns.map(s=>`<th scope="col">${s}</th>`).join('')+'</tr>';
  $('nov-explanation').textContent=note;
  $('recording-topic-rows').innerHTML=rows.join('')||`<tr><td colspan="${columns.length}">所選議題後未觀測到廣告破口。</td></tr>`;
}
$('nov-topic').append(...Object.keys(NOV_RATINGS.topics).map(label=>new Option(label,label)));
for(const id of ['nov-report','nov-topic']) $(id).addEventListener('change',renderRecordingRatings);

function render() {
  const isMonitor = state.view === 'monitor';
  const isTopics = state.view === 'topics';
  const history=official() && !isTopics;
  document.querySelector('.eyebrow').innerHTML=history?'<span></span>10/26 官方 Excel · 四台午間監看':'<span></span>四台一小時 · 合成監看批次';
  document.querySelector('#wall-title + p').textContent=history?'10/26 官方標題與換題分鐘。11/06 影像僅作區段示意，空白分鐘沿用上一張。':'各台依播出區段共用代表影格；收視與區段標記為示範資料。';
  document.querySelector('#break-list-title + p').textContent=history?'10/26 官方 Excel · 以登錄分鐘估算，終點為下一筆登錄的分鐘。':'以區段起訖統計 · 合成示意';
  document.querySelector('footer').textContent=history?'標題與分鐘取自 10/26 官方監看表 · 影像取自 11/06 側錄，僅供示意':'合成資料僅供操作展示 · 11/06 影像另標原片參考';
  if(captured()){
    document.querySelector('.eyebrow').innerHTML='<span></span>11/06 側錄監看 · 四台午間新聞';
    document.querySelector('#wall-title + p').textContent='按分鐘對照各台當時報導；延續同一區段時使用同一張原片。';
    document.querySelector('#break-list-title + p').textContent='依各台實際廣告畫面及返回新聞的取樣點估算。';
    document.querySelector('footer').textContent='11/06 側錄人工判讀 · 每 15 秒取樣，部分換題另查相鄰影格。時間依畫面時鐘校準，取樣間的短暫轉場可能未被記錄。片尾僅統計至側錄結束。';
  }
  $('monitor-view').hidden = !isMonitor;
  $('wall-view').hidden = state.view !== 'wall';
  $('analysis-view').hidden = state.view !== 'analysis';
  $('topics-view').hidden = !isTopics;
  $('business-view').hidden = !isTopics;
  $('recording-topics').hidden=!(isTopics && captured());
  if(isTopics && captured()){
    $('business-view').hidden=true;
    $('topics-view').hidden=true;
  }
  $('metrics').hidden = isTopics || state.view === 'wall';
  $('page-title').textContent = { monitor: '監看與覆核', wall:'四台畫面', analysis: '廣告分析', topics: '議題分析' }[state.view];
  $('page-description').textContent = {
    monitor: '核對時間、回看證據，從同一條時間軸預覽 Excel。',
    wall: realBatch()?'逐分鐘比較各台議題；換題時更新該台的代表影格。':'切換分鐘，比對四台區段與示範收視。',
    analysis: '依播出區段比較競台廣告破口與資料覆蓋率。',
    topics: captured()?'依本次四台錄影比較議題的播出先後與重播分鐘。':'以同一議題比對各台播出、對應收視與平台瀏覽數。',
  }[state.view];
  document.querySelectorAll('[data-view]').forEach((button) => {
    if (button.dataset.view === state.view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  $('version').querySelector('[value=reviewed]').disabled = !state.review;
  $('version').value = state.version;
  $('version').closest('.version-control').hidden = false;
  $('download').href = captured() ? 'assets/1106監看與模擬收視.xlsx' : isTopics ? 'assets/示範_議題分析.xlsx' : source().excel;
  $('download').innerHTML = `${icon('arrow-down')}${captured() ? '下載監看與模擬收視 Excel' : isTopics ? '下載議題分析 Excel' : '下載 Excel'}`;
  $('filter').value = state.filter;
  renderMetrics();
  if (isMonitor) {
    renderInspector();
    renderTimeline();
    renderSheet();
  } else if (state.view === 'wall') {
    renderWall();
  } else if (isTopics && captured()) {
    renderRecordingRatings();
  } else if (isTopics) {
    renderTopics();
  } else {
    renderAnalysis();
  }
}

function choose(channel, minute, segment = null, fromAnalysis = false, frameMode='segment') {
  state.channel = channel;
  state.minute = minute;
  state.segment = segment;
  state.frameMode = frameMode;
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
  if(state.view==='topics' && !segment.startsWith('nov-')) state.version='original';
  const entry = source().tracks[channel].find((item) => item.id === segment);
  choose(channel, button.hasAttribute('data-minute') ? Number(button.dataset.minute) : Math.floor(entry.start / 60), segment, fromAnalysis);
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
  if(frame) choose(frame.dataset.channel,Number(frame.dataset.recordingMinute),null,true,'minute');
  else selectSegment(event.target);
});
$('break-rows').addEventListener('click', (event) => selectSegment(event.target, true));
$('topic-airings').addEventListener('click', (event) => selectSegment(event.target, true));
$('recording-topic-rows').addEventListener('click',event=>selectSegment(event.target,true));
$('business-cards').addEventListener('click', (event) => {
  const link = event.target.closest('[data-wall-minute]');
  if (!link) return selectSegment(event.target, true);
  state.version='original';
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
  state.filter='all';
  state.channel=realBatch()?'tvbs':SAMPLE.channel;
  state.minute=realBatch()?0:SAMPLE.minute;
  state.segment=realBatch()?null:SAMPLE.segment;
  state.frameMode='segment';
  state.page=Math.floor(state.minute/PAGE_SIZE);
  render();
});
$('inspector').addEventListener('click', (event) => {
  const segmentButton=event.target.closest('[data-inspect-segment]');
  if(segmentButton){choose(state.channel,state.minute,segmentButton.dataset.inspectSegment,null);return;}
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
