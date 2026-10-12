const liveData = __LIVE_DATA__;
const escapeLive = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const day = new URL(location.href).searchParams.get('date');
let documentSchedule;
function scoreForm(match, ownId = '') {
  if (!match.fixedPlayerIds.length) return '';
  const id = 'r' + match.round + '-f' + match.floor;
  const reverse = ownId && match.teamB.includes(ownId), sides = reverse ? ['B', 'A'] : ['A', 'B'];
  const labels = sides.map(side => '<label><span>' + match['team' + side + 'Names'].map(escapeLive).join(' · ') + '</span><input name="score' + side + '" type="number" min="0" max="99" step="1" required inputmode="numeric" aria-label="' + match['team' + side + 'Names'].map(escapeLive).join(' · ') + ' 점수" placeholder="점수"></label>').join('');
  return '<form class="score-form" data-score-form data-match="' + id + '" data-reverse="' + Boolean(reverse) + '" data-personal-score="' + Boolean(ownId) + '"><output class="score-result" data-score-result>저장된 점수 · 미입력</output><span class="score-outcome" data-score-outcome></span><div class="score-fields">' + labels + '</div><div class="score-actions"><button type="submit" disabled>점수 저장</button><button type="button" data-reset-score hidden>취소</button></div><span class="score-message" data-score-message role="status" aria-live="polite"></span></form>';
}
function matchCard(match, ownId = '') {
  const type = builderModel.type(match.teamA, match.teamB, documentSchedule.profiles), reverse = ownId && match.teamB.includes(ownId);
  const names = reverse ? [match.teamBNames, match.teamANames] : [match.teamANames, match.teamBNames];
  return '<article class="match floor-' + match.floor + '"><div class="match-head"><div class="floor"><span class="floor-dot"></span>' + match.floor + '층 코트</div><span class="tag tag-' + { '남복': 'men', '여복': 'women', '혼복': 'mixed' }[type] + '">' + type + '</span></div><div class="team-name">' + names[0].map(escapeLive).join(' · ') + '</div><div class="versus">VS</div><div class="team-name">' + names[1].map(escapeLive).join(' · ') + '</div>' + scoreForm(match, ownId) + '</article>';
}
function personal(id) {
  const doc = documentSchedule, profile = doc.profiles[id], window = doc.availability[id], row = builderModel.summary(doc).rows[id];
  let rounds = '';
  for (let r = window.from; r < window.to; r++) {
    const match = Object.values(doc.matches).find(m => m.round === r + 1 && [...m.teamA, ...m.teamB].includes(id));
    rounds += '<div class="personal-round"><div class="personal-time"><strong>' + builderModel.time(480 + r * 30) + '</strong><span>— ' + builderModel.time(510 + r * 30) + '</span></div>' + (match ? matchCard(match, id) : '<div class="personal-card rest-card"><strong>휴식</strong><span>다음 경기를 준비하세요</span></div>') + '</div>';
  }
  const fixed = doc.fixedPlayerIds.includes(id);
  return '<section class="personal-schedule" data-personal="' + escapeLive(profile.name) + '" data-personal-id="' + escapeLive(id) + '" hidden><div class="personal-head"><div><h2>' + escapeLive(profile.name) + ' 대진표</h2><p>' + builderModel.time(480 + window.from * 30) + '–' + builderModel.time(480 + window.to * 30) + ' · 경기 ' + row.games + '회 / 휴식 ' + row.rests.length + '회</p></div><button type="button" class="all-button" data-show-all>전체 대진표 보기</button></div><div class="personal-meta"><span>' + (fixed ? '고정멤버' : '게스트') + '</span><span>층 이동 ' + row.floorChanges + '회</span></div><p class="player-summary" data-player-summary="' + escapeLive(id) + '" data-member-status="' + (fixed ? 'fixed' : 'guest') + '">기록 연결 중…</p><a class="archive-back" href="../records/' + (fixed ? '?player=' + encodeURIComponent(id) + '&period=all' : '') + '">기록 · 순위 →</a>' + rounds + '</section>';
}
function mount(doc) {
  documentSchedule = doc;
  const theme = liveData.themes[doc.theme] || liveData.themes.club;
  const stats = builderModel.summary(doc), matches = Object.values(doc.matches);
  const image = theme.heroImage ? '<img class="hero-art" src="../' + escapeLive(theme.heroImage) + '" alt="' + escapeLive(theme.heroAlt) + '">' : '';
  let rounds = '';
  for (let r = 1; r <= 6; r++) {
    const row = matches.filter(m => m.round === r), active = new Set(row.flatMap(m => [...m.teamA, ...m.teamB]));
    const rest = doc.players.filter(id => !active.has(id) && r > doc.availability[id].from && r <= doc.availability[id].to);
    const ended = doc.players.filter(id => r > doc.availability[id].to);
    rounds += '<section class="round"><div class="round-time"><div class="round-num">ROUND ' + r + '</div><div class="clock">' + builderModel.time(450 + r * 30) + '</div><div class="clock-end">— ' + builderModel.time(480 + r * 30) + '</div></div>' + [1, 2].map(floor => { const match = row.find(m => m.floor === floor); return match ? matchCard(match) : '<article class="match"><div class="floor">' + floor + '층 코트</div><p>이 타임은 배정 없음</p></article>'; }).join('') + '<div class="round-rest">' + (rest.length ? '휴식 · ' + rest.map(id => escapeLive(doc.profiles[id].name)).join(' · ') : '참석 선수 모두 출전') + (ended.length ? ' / 종료 · ' + ended.map(id => escapeLive(doc.profiles[id].name)).join(' · ') : '') + '</div></section>';
  }
  document.getElementById('live-content').innerHTML = '<section class="lookup"><div class="lookup-head"><div><h2>대포클럽 · 내 대진 찾기</h2><p>' + escapeLive(doc.date) + ' · 선수 이름을 선택하세요.</p></div><button type="button" class="all-button" data-show-all>전체 대진표</button></div><label>선수<select id="live-player"><option value="">전체 대진</option>' + doc.players.map(id => '<option value="' + escapeLive(id) + '">' + escapeLive(doc.profiles[id].name) + '</option>').join('') + '</select></label></section><section class="score-connection"><p id="score-connection-status" role="status" aria-live="polite">점수 연결 중…</p><button id="score-retry" type="button" hidden>다시 연결</button></section><header class="hero"><div class="topline"><div class="eyebrow">' + escapeLive(theme.eyebrow) + '</div><button type="button" class="print" id="live-print">인쇄 / PDF 저장</button></div><h1>' + escapeLive(theme.title) + '<br><span class="accent">' + escapeLive(theme.accent) + '</span></h1><p class="subtitle">' + escapeLive(doc.date) + ' · 08:00–11:00 · 1층 / 2층 코트</p><div class="hero-bottom"><div class="hero-notes">' + doc.lockedPairs.map(entry => '<span class="hero-note">고정 페어 · ' + entry.players.map(id => escapeLive(doc.profiles[id].name)).join(' · ') + ' · ' + (entry.games === 'all' ? '전체 경기' : entry.games + '경기') + '</span>').join('') + '</div><div class="metrics"><div class="metric"><strong>' + doc.players.length + '</strong><span>참가 인원</span></div><div class="metric"><strong>6</strong><span>타임</span></div><div class="metric"><strong>' + matches.length + '</strong><span>경기</span></div></div></div>' + image + '</header><div id="full-schedule"><div class="section-head"><h2>경기 일정</h2><p>남복 ' + stats.types['남복'] + ' · 혼복 ' + stats.types['혼복'] + ' · 여복 ' + stats.types['여복'] + '</p></div>' + rounds + '</div><div id="personal-schedules" hidden>' + doc.players.map(personal).join('') + '</div>';
  const choose = id => {
    document.querySelector('.hero').hidden = !!id; document.getElementById('full-schedule').hidden = !!id; document.getElementById('personal-schedules').hidden = !id;
    document.querySelectorAll('[data-personal-id]').forEach(section => section.hidden = section.dataset.personalId !== id);
    document.getElementById('live-player').value = id;
    const url = new URL(location.href); if (id) url.searchParams.set('player', id); else url.searchParams.delete('player'); history.replaceState(null, '', url);
  };
  document.getElementById('live-player').addEventListener('change', e => choose(e.target.value));
  document.querySelectorAll('[data-show-all]').forEach(button => button.addEventListener('click', () => choose('')));
  document.getElementById('live-print').addEventListener('click', () => print());
  const wanted = new URL(location.href).searchParams.get('player'); if (doc.players.includes(wanted)) choose(wanted);
  document.getElementById('live-status').hidden = true; document.getElementById('live-content').hidden = false;
  const scoreMatches = Object.fromEntries(Object.entries(doc.matches).filter(([, match]) => match.fixedPlayerIds.length));
  startScores(liveData.firebaseConfig, doc.date, scoreMatches);
}
async function load() {
  try {
    if (!builderModel.validDate(day)) throw Error('대진표 날짜를 확인해 주세요.');
    if (liveData.legacyDates.includes(day)) { location.replace('../' + day + '/'); return; }
    const doc = await builderStore.read(liveData.firebaseConfig, day);
    if (!doc) throw Error('아직 확정된 대진표가 없습니다. 대진표 만들기에서 확인해 주세요.');
    builderModel.validateDocument(doc, {preferences:false});
    const theme = liveData.themes[doc.theme] || liveData.themes.club;
    await new Promise((resolve, reject) => { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '../' + theme.stylesheet; link.onload = resolve; link.onerror = () => reject(Error('컨셉 화면을 불러오지 못했어요. 새로고침해 주세요.')); document.head.append(link); });
    mount(doc);
  } catch (error) { document.getElementById('live-status').textContent = error.code === 'permission-denied' ? '대진표 접근 권한을 확인해 주세요.' : error.message; }
}
load();
