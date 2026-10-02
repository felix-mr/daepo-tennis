const firebaseConfig = __FIREBASE_CONFIG__;
const players = __PLAYERS__;
const memberships = __MEMBERSHIPS__;
const dateFilter = document.getElementById('date-filter');
const playerFilter = document.getElementById('player-filter');
const genderOptions = [...document.querySelectorAll('input[name="gender"]')];
const status = document.getElementById('records-status');
const retry = document.getElementById('records-retry');
const parameters = new URL(location.href).searchParams;
let records = [], unsubscribe, timer, generation = 0, modulesPromise, db;
let hasSnapshot = false, connectionState = 'loading';
let gender = ['male', 'female'].includes(parameters.get('gender')) ? parameters.get('gender') : '';
const genderLabels = { male: '남자', female: '여자' };
let periodRoster = new Set();
const belongsToGender = id => periodRoster.has(id) && players[id] && (!gender || players[id].gender === gender);
const isDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '');
const isMembershipSelection = period => period && (Object.hasOwn(memberships, period) || !isDate(period));
const membershipForSelection = period => isMembershipSelection(period) ? period : membershipModel.periodForDate(period, memberships);
const hasMembershipDates = period => period && isDate(period.startsOn) && isDate(period.endsBefore) && period.startsOn < period.endsBefore;
function inclusiveEndDate(endsBefore) {
  const date = new Date(`${endsBefore}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
const koreaParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
}).formatToParts(new Date());
const koreaDate = ['year', 'month', 'day'].map(type => koreaParts.find(part => part.type === type).value).join('-');
const currentMembership = membershipModel.periodForDate(koreaDate, memberships);
const requestedDate = parameters.get('date');
const requestedMembership = parameters.get('membership');
const initialPeriod = isDate(requestedDate) ? requestedDate
  : requestedMembership || (parameters.get('period') === 'all' ? '' : currentMembership || '');

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function populatePlayers(selected = '') {
  const period = dateFilter.value;
  periodRoster = new Set(period
    ? membershipModel.memberIds(membershipForSelection(period), memberships)
    : Object.keys(memberships).flatMap(id => membershipModel.memberIds(id, memberships)));
  playerFilter.replaceChildren(new Option(gender ? `${genderLabels[gender]} 전체 선수` : '전체 선수', ''));
  Object.entries(players).filter(([id]) => belongsToGender(id))
    .sort((a, b) => a[1].name.localeCompare(b[1].name, 'ko'))
    .forEach(([id, profile]) => playerFilter.add(new Option(profile.name, id)));
  playerFilter.value = belongsToGender(selected) ? selected : '';
}
function populatePeriods(selected) {
  dateFilter.replaceChildren(new Option('전체 누적', ''));
  const periods = new Set(Object.keys(memberships));
  if (isMembershipSelection(selected)) periods.add(selected);
  const membershipGroup = element('optgroup'); membershipGroup.label = '회차별 기록';
  [...periods].sort((a, b) => (memberships[b]?.startsOn || '').localeCompare(memberships[a]?.startsOn || '') || a.localeCompare(b))
    .forEach(id => {
    membershipGroup.append(new Option(memberships[id]?.label || '등록되지 않은 회차', id));
  });
  if (periods.size) dateFilter.append(membershipGroup);
  const dates = new Set(records.map(record => record.date));
  if (isDate(selected) && !isMembershipSelection(selected)) dates.add(selected);
  const dateGroup = element('optgroup'); dateGroup.label = '날짜별 기록';
  [...dates].sort().reverse().forEach(date => dateGroup.append(new Option(date, date)));
  if (dates.size) dateFilter.append(dateGroup);
  dateFilter.value = selected;
}
populatePeriods(initialPeriod);
populatePlayers(parameters.get('player'));
genderOptions.find(option => option.value === gender).checked = true;

function render() {
  const tbody = document.getElementById('rankings');
  const historyList = document.getElementById('match-history');
  tbody.replaceChildren(); historyList.replaceChildren();
  document.getElementById('ranking-title').textContent = gender ? `${genderLabels[gender]} 고정 멤버 순위` : '고정 멤버 순위';
  const period = dateFilter.value;
  const membershipId = period && membershipForSelection(period);
  const membership = Object.hasOwn(memberships, membershipId) ? memberships[membershipId] : undefined;
  const periodPending = isMembershipSelection(period) && membership && !hasMembershipDates(membership);
  document.getElementById('membership-hint').textContent = period
    ? membership
      ? hasMembershipDates(membership)
        ? `${membership.label} · ${membership.startsOn} ~ ${inclusiveEndDate(membership.endsBefore)} · 회원 ${periodRoster.size}명 기준. 당시 고정 회원으로 참가한 경기만 집계합니다.`
        : `${membership.label} · 회원 ${periodRoster.size}명. 회차 시작일·종료일 설정이 필요합니다. 기간 설정 전에는 이 회차 기록을 집계하지 않습니다.`
      : '이 기간에 해당하는 회차가 등록되지 않았습니다. 회차 날짜와 회원 명단을 확인해 주세요.'
    : `역대 회원 ${periodRoster.size}명 기준. 탈퇴 전 기록은 유지하고, 게스트로 참가한 경기는 개인 성적에서 제외합니다.${Object.values(memberships).some(item => !hasMembershipDates(item)) ? ' 기간이 정해지지 않은 회차가 있습니다.' : ''}`;
  document.getElementById('history-title').textContent = playerFilter.value
    ? `${players[playerFilter.value].name} 경기 기록` : '경기 기록';
  document.getElementById('history-hint').textContent = gender && !playerFilter.value
    ? `${genderLabels[gender]} 고정 멤버가 참가한 경기 표시. 혼합 경기도 포함. 경기 당시 회원 자격을 기준으로 집계합니다.`
    : '저장 완료된 경기 기준. 경기 당시 회원 자격을 적용하며, 점수 수정 시 결과와 순위도 다시 계산됩니다.';
  if (!hasSnapshot) {
    const message = connectionState === 'error'
      ? '기록을 불러오지 못했습니다. 연결 후 다시 시도해 주세요.' : '경기 기록을 불러오는 중…';
    const tr = element('tr');
    const td = element('td', message, 'empty'); td.colSpan = 8; tr.append(td); tbody.append(tr);
    document.getElementById('records-summary').textContent = message;
    historyList.append(element('p', message, 'empty'));
    return;
  }
  const filtered = records.filter(record => !period || (isMembershipSelection(period)
    ? hasMembershipDates(membership) && membershipModel.periodForDate(record.date, memberships) === period
    : record.date === period));
  const scopedPlayers = Object.fromEntries(Object.entries(players).filter(([id]) => belongsToGender(id)));
  const ranked = resultModel.rank(filtered, scopedPlayers).filter(row => belongsToGender(row.id));
  const selected = playerFilter.value;
  const row = ranked.find(item => item.id === selected);
  const games = filtered.filter(record => selected
    ? record.fixedPlayerIds.includes(selected)
    : record.fixedPlayerIds.some(belongsToGender))
    .sort((a, b) => b.date.localeCompare(a.date) || a.round - b.round || a.floor - b.floor);
  document.getElementById('records-summary').textContent = periodPending
    ? `${selected ? `${players[selected].name} · ` : ''}${membership.label} · 기간 설정 대기 · 회원 ${periodRoster.size}명`
    : selected
    ? `${players[selected].name} · ${resultModel.summary(row)}`
    : `${gender ? `${genderLabels[gender]} 멤버 참가 · ` : ''}${games.length}경기 기록 · 승부 ${games.filter(record => record.outcome !== 'draw').length}경기 · 무승부 ${games.filter(record => record.outcome === 'draw').length}경기`;
  ranked.forEach((row, index) => {
    const tr = element('tr', undefined, row.id === selected ? 'selected' : '');
    tr.dataset.playerStats = row.id;
    tr.append(element('td', row.games ? index + 1 : '—'));
    const name = element('td');
    const button = element('button', row.name, 'name-button');
    button.type = 'button';
    button.setAttribute('aria-label', `${row.name} 개인 기록 보기`);
    button.setAttribute('aria-pressed', String(row.id === selected));
    button.addEventListener('click', () => { playerFilter.value = row.id; update(); });
    name.append(button); tr.append(name);
    for (const field of ['points', 'winRate', 'games', 'wins', 'draws', 'losses']) {
      const cell = element('td', periodPending ? '—' : field === 'winRate' ? resultModel.rate(row) : row[field], field === 'points' ? 'points' : '');
      cell.dataset.statField = field; tr.append(cell);
    }
    tbody.append(tr);
  });
  if (!ranked.length) {
    const tr = element('tr'); const td = element('td', periodRoster.size
      ? '선택한 구분에 등록된 회원이 없습니다.' : '이 기간의 회원 명단이 등록되지 않았습니다.', 'empty');
    td.colSpan = 8; tr.append(td); tbody.append(tr);
  }
  if (!games.length) {
    const message = periodPending ? '회차 기간이 정해지면 기록을 집계합니다.'
      : !periodRoster.size ? '회원 명단 등록 후 이 기간의 기록을 확인할 수 있습니다.'
      : selected ? `${players[selected].name}의 저장된 경기 기록이 없습니다.`
      : gender ? `${genderLabels[gender]} 멤버가 참가한 저장 기록이 없습니다.` : '저장된 경기 기록이 없습니다.';
    const empty = element('div', undefined, 'empty');
    empty.append(element('p', message), element('p', periodPending ? '회차 시작일·종료일 설정이 필요합니다.'
      : periodRoster.size ? '대진표에서 점수를 저장하면 여기에 반영됩니다.' : '다른 회차 또는 전체 누적을 선택해 주세요.', 'hint'));
    historyList.append(empty);
  }
  for (const record of games) {
    const card = element('article', undefined, 'history-card');
    const top = element('div', undefined, 'history-top');
    top.append(element('span', `${record.date} · ${record.round}타임 · ${record.floor}층`));
    const link = element('a', '대진표 →');
    link.href = `../${record.date}/`; top.append(link);
    const teams = element('div', undefined, 'history-teams');
    teams.append(element('span', record.teamANames.join(' · ')),
      element('strong', `${record.scoreA} : ${record.scoreB}`), element('span', record.teamBNames.join(' · ')));
    const side = selected && (record.teamA.includes(selected) ? 'teamA' : 'teamB');
    const label = selected
      ? record.outcome === 'draw' ? `${players[selected].name} 무승부 · +1점`
        : record.outcome === side ? `${players[selected].name} 승리 · +3점` : `${players[selected].name} 패배 · +0점`
      : record.outcome === 'draw' ? '무승부 · 당시 회원 각 +1점'
        : `${record[`${record.outcome}Names`].join(' · ')} 승 · ${record[record.outcome].some(id => record.fixedPlayerIds.includes(id)) ? '당시 회원 각 +3점' : '회원 승점 +0점'}`;
    card.append(top, teams, element('div', label, 'history-outcome'));
    historyList.append(card);
  }
}

function update() {
  const url = new URL(location.href);
  const period = dateFilter.value;
  for (const key of ['date', 'membership', 'quarter', 'period']) url.searchParams.delete(key);
  if (!period) url.searchParams.set('period', 'all');
  else url.searchParams.set(isMembershipSelection(period) ? 'membership' : 'date', period);
  for (const [key, value] of [['player', playerFilter.value], ['gender', gender]]) {
    if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
  }
  history.replaceState(null, '', url);
  render();
}
dateFilter.addEventListener('change', () => {
  const selected = playerFilter.value;
  populatePlayers(selected);
  document.getElementById('filter-announcement').textContent = selected && !playerFilter.value
    ? '기간 변경. 이 기간에 포함되지 않는 선수 선택을 해제했습니다.'
    : '선택한 기간의 회원 명단과 기록을 표시합니다.';
  update();
});
playerFilter.addEventListener('change', update);
genderOptions.forEach(option => option.addEventListener('change', () => {
  const selected = playerFilter.value;
  gender = option.value;
  populatePlayers(selected);
  document.getElementById('filter-announcement').textContent = selected && !playerFilter.value
    ? `${genderLabels[gender]} 순위로 변경. 선수 선택을 전체 선수로 변경했습니다.` : `${genderLabels[gender] || '전체'} 순위로 변경했습니다.`;
  update();
}));
update();

async function connect() {
  const attempt = ++generation;
  unsubscribe?.(); clearTimeout(timer);
  connectionState = 'loading';
  retry.hidden = true;
  status.textContent = hasSnapshot ? '기록 다시 연결 중 · 마지막 조회 기록 표시' : '기록 연결 중…';
  render();
  timer = setTimeout(() => {
    if (attempt !== generation) return;
    status.textContent = '기록 연결이 지연되고 있어요. 다시 연결해 주세요.';
    connectionState = 'error'; retry.hidden = false; render();
  }, 12000);
  try {
    modulesPromise ??= Promise.all([
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js'),
    ]).catch(error => { modulesPromise = undefined; throw error; });
    const [app, firestore] = await modulesPromise;
    if (attempt !== generation) return;
    db ??= firestore.getFirestore(app.initializeApp(firebaseConfig));
    unsubscribe = firestore.onSnapshot(firestore.collectionGroup(db, 'matchResults'),
      { includeMetadataChanges: true }, snapshot => {
        if (attempt !== generation || snapshot.metadata.hasPendingWrites) return;
        // An empty local cache is not evidence that the server has no records.
        if (snapshot.metadata.fromCache && snapshot.empty && !hasSnapshot) return;
        hasSnapshot = true;
        records = snapshot.docs.map(document => document.data()).filter(resultModel.valid)
          .map(record => membershipModel.normalize(record, memberships)).filter(record => record.fixedPlayerIds.length);
        const selectedDate = dateFilter.value;
        populatePeriods(selectedDate);
        if (!snapshot.metadata.fromCache) { clearTimeout(timer); connectionState = 'ready'; }
        status.textContent = snapshot.metadata.fromCache ? '마지막 조회 기록 표시 · 서버 연결 확인 중' : '최신 기록 반영 중';
        retry.hidden = !snapshot.metadata.fromCache;
        render();
      }, error => {
        if (attempt !== generation) return;
        clearTimeout(timer); connectionState = 'error';
        status.textContent = error.code === 'permission-denied'
          ? '기록 접근 권한을 확인해 주세요.' : '기록 연결 실패. 다시 연결해 주세요.';
        if (hasSnapshot) status.textContent += ' · 마지막 조회 기록 표시';
        retry.hidden = false; render();
      });
  } catch {
    if (attempt !== generation) return;
    clearTimeout(timer); connectionState = 'error';
    status.textContent = '기록 연결 실패. 다시 연결해 주세요.';
    if (hasSnapshot) status.textContent += ' · 마지막 조회 기록 표시';
    retry.hidden = false; render();
  }
}
retry.addEventListener('click', connect);
window.addEventListener('online', connect);
window.addEventListener('offline', () => {
  ++generation; unsubscribe?.(); clearTimeout(timer); connectionState = 'error';
  status.textContent = hasSnapshot ? '인터넷 연결 끊김 · 마지막 조회 기록 표시 중' : '인터넷 연결 끊김 · 연결 후 다시 시도해 주세요.';
  retry.hidden = false; render();
});
connect();
