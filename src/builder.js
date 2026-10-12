const builderData = __BUILDER_DATA__;
const workerSource = __WORKER_SOURCE__;
const $ = id => document.getElementById(id);
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const storageKey = 'daepo-builder-draft-v1';
let state, draft = null, worker = null, connected = false, saving = false, unsubscribe = null;
let confirmed = new Map(), connectionAttempt = 0, storageAvailable = true, fillCache = null;
const fresh = () => ({ date: builderModel.nextSaturday(), theme: '', selected: [], guests: {}, availability: {}, quotas: {}, pairs: [], avoidRests: true, repeats: false, fillCourts: true, bonusIds: [] });
function roster() {
  const period = builderModel.periodForDate(state.date, builderData.memberships);
  return period ? builderData.memberships[period].memberIds.filter(id => builderData.players[id]) : [];
}
function profile(id) { return state.guests[id] || builderData.players[id]; }
function selected() { return state.selected.filter(id => profile(id) && (state.guests[id] || roster().includes(id))); }
function message(text) { $('error').hidden = !text; $('error').textContent = text || ''; }
function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify(state)); }
  catch { storageAvailable = false; $('connection').textContent = '이 브라우저에 초안을 보관할 수 없습니다. 초안 파일 저장을 이용해 주세요.'; }
}
function invalidate() {
  if (worker) { worker.terminate(); worker = null; }
  draft = null; $('preview').hidden = true; $('generate').textContent = '대진 만들기'; $('editor').hidden = false;
  $('saved-link').hidden = true; $('save-status').textContent = ''; message(''); updateButtons(); persist();
}
function available(id) { return state.availability[id] || { from: 0, to: 6 }; }
function quotas() {
  const ids = selected(), windows = Object.fromEntries(ids.map(id => [id, available(id).to - available(id).from]));
  let defaultQuotas;
  try { defaultQuotas = builderModel.allocate(ids, windows); } catch { defaultQuotas = Object.fromEntries(ids.map(id => [id, 4])); }
  const base = Object.fromEntries(ids.map(id => [id, Object.hasOwn(state.quotas, id) ? state.quotas[id] : defaultQuotas[id]]));
  const members=roster();
  const input = {date:state.date,membershipPeriod:builderModel.periodForDate(state.date,builderData.memberships),players:ids, fixedPlayerIds:ids.filter(id=>members.includes(id)), profiles:Object.fromEntries(ids.map(id=>[id,{...profile(id),memberType:members.includes(id)?'fixed':'guest'}])), quotas:base, availability:Object.fromEntries(ids.map(id=>[id,available(id)])), lockedPairs:state.pairs,eligibleIds:ids.filter(id=>!Object.hasOwn(state.quotas,id))};
  input.allowPartnerRepeats=state.repeats;input.avoidConsecutiveRests=state.avoidRests;
  const signature = JSON.stringify([input,state.fillCourts]);
  if (fillCache?.signature === signature) {state.bonusIds=fillCache.result.bonusIds;return fillCache.result.quotas;}
  const result = state.fillCourts && ids.length >= 4 && ids.length < 12
    ? builderModel.fillCourts({...input,preferredBonusIds:state.bonusIds})
    : {quotas:base,bonusIds:[],unfilledSlots:Math.max(0,48-Object.values(base).reduce((a,b)=>a+b,0)),reason:''};
  state.bonusIds = result.bonusIds;
  fillCache = {signature,result};
  return result.quotas;
}
function fillText() {
  quotas();
  if (!state.fillCourts || selected().length >= 12) return selected().length >= 12 ? '12명 이상은 추가 경기 없이 배정합니다.' : '추가 경기 없이 배정합니다.';
  const {bonusIds,unfilledSlots,reason} = fillCache.result;
  return (bonusIds.length ? '5경기 · ' + bonusIds.map(id=>profile(id).name).join(' · ') + '. ' : '추가 경기 배정 없음. ') +
    (unfilledSlots ? '빈 코트 ' + Math.ceil(unfilledSlots/4) + '타임 예상. ' + (reason || '고정 멤버의 경기 수·참석 시간·고정 페어 조건을 확인해 주세요.') : '총 12경기 · 두 코트 모두 사용.');
}
function conceptCard(id) {
  const t=builderData.themes[id] || builderData.themes.club;
  const image=t.heroImage ? '<img src="../'+esc(t.heroImage)+'" alt="'+esc(t.heroAlt)+'">' : '<span class="theme-ball" aria-hidden="true">◉</span>';
  return '<div class="concept-art" style="background:'+esc(t.palette?.primary || '#14644a')+'">'+image+'</div><div><small>'+esc(t.seriesName || '대포클럽')+'</small><strong>'+esc(t.name)+'</strong><p>'+esc(t.tagline || '함께 뛰는 토요일, 대포클럽 테니스.')+'</p></div>';
}
function renderThemes() {
  const id=state.theme || builderData.themePlans[state.date] || 'club', theme=builderData.themes[id] || builderData.themes.club;
  const series=theme.seriesId || 'club';
  const groups=new Map([['club','클럽 기본']]);
  for (const t of Object.values(builderData.themes)) if(t.seriesId) groups.set(t.seriesId,t.seriesName);
  $('theme-series').innerHTML=[...groups].map(([key,name])=>'<option value="'+esc(key)+'">'+esc(name)+'</option>').join('');
  $('theme-series').value=series;
  $('theme').innerHTML=Object.entries(builderData.themes).filter(([,t])=>(t.seriesId || 'club')===series).map(([key,t])=>'<option value="'+esc(key)+'">'+esc(t.name)+'</option>').join('');
  $('theme').value=id;
  $('theme-preview').innerHTML=conceptCard(id);
}
function updateButtons() {
  const period = builderModel.periodForDate(state.date, builderData.memberships);
  const exists = builderData.legacyDates.includes(state.date) || confirmed.has(state.date);
  $('generate').disabled = !!worker || saving || !period || exists || selected().length < 4 || selected().length > 16;
  $('confirm').disabled = !draft || !connected || saving || !navigator.onLine || exists;
  $('regenerate').disabled = !!worker || saving || exists;
  $('edit').disabled = saving; $('download').disabled = !draft || saving;
  $('existing').hidden = !exists;
  if (exists) {
    const href = builderData.legacyDates.includes(state.date) ? '../' + state.date + '/' : '../schedule/?date=' + encodeURIComponent(state.date);
    $('existing').innerHTML = '이미 확정된 날짜입니다. 기존 팀 구성과 점수는 유지됩니다. <a href="' + href + '">대진표 보기 →</a>';
  }
}
function renderOptions() {
  const ids = selected(), q = quotas();
  $('player-options').innerHTML = ids.map(id => {
    const window = available(id);
    const start = Array.from({ length: 6 }, (_, i) => '<option value="' + i + '"' + (window.from === i ? ' selected' : '') + '>' + builderModel.time(480 + i * 30) + '</option>').join('');
    const end = Array.from({ length: 6 }, (_, i) => '<option value="' + (i + 1) + '"' + (window.to === i + 1 ? ' selected' : '') + '>' + builderModel.time(510 + i * 30) + '</option>').join('');
    const choices=roster().includes(id) && ids.length<12 ? [2,3,4,5] : [2,3,4];
    return '<div class="player-option"><strong>' + esc(profile(id).name) + (state.bonusIds.includes(id) ? '<small class="bonus-label">추가 경기</small>' : '') + '</strong><label>경기 수<select data-quota="' + esc(id) + '" aria-label="' + esc(profile(id).name) + ' 경기 수">' + choices.map(n => '<option' + (q[id] === n ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label><label>시작 가능<select data-from="' + esc(id) + '" aria-label="' + esc(profile(id).name) + ' 시작 가능">' + start + '</select></label><label>종료 시간<select data-to="' + esc(id) + '" aria-label="' + esc(profile(id).name) + ' 종료 시간">' + end + '</select></label></div>';
  }).join('');
  const pairCandidates = ids;
  const option = '<option value="">선수 선택</option>' + pairCandidates.map(id => '<option value="' + esc(id) + '">' + esc(profile(id).name) + '</option>').join('');
  $('pair-a').innerHTML = option; $('pair-b').innerHTML = option;
  $('add-pair').disabled = ids.length < 4;
  $('pairs').innerHTML = state.pairs.map((entry, i) => '<div class="pair-chip"><span>' + entry.players.map(id => esc(profile(id).name)).join(' · ') + ' · ' + (profile(entry.players[0]).gender === profile(entry.players[1]).gender ? (profile(entry.players[0]).gender === 'male' ? '남복' : '여복') : '혼복') + ' · ' + (entry.games === 'all' ? '전체 경기' : entry.games + '경기') + '</span><button type="button" class="remove-button" data-remove-pair="' + i + '" aria-label="' + entry.players.map(id => esc(profile(id).name)).join(' · ') + ' 페어 삭제">×</button></div>').join('');
}
function tidy() {
  state.selected = selected();
  const ids = new Set(state.selected);
  for (const map of [state.availability, state.quotas]) for (const id of Object.keys(map)) if (!ids.has(id)) delete map[id];
  if (state.selected.length>=12) for (const id of Object.keys(state.quotas)) if (state.quotas[id]===5) state.quotas[id]=4;
  state.pairs = state.pairs.filter(entry => entry.players.every(id => ids.has(id)));
}
function card(id, fixed) {
  const p = profile(id), checked = state.selected.includes(id);
  return '<label class="member-card"><input type="checkbox" data-attendee="' + esc(id) + '"' + (checked ? ' checked' : '') + '><span><strong>' + esc(p.name) + '</strong><small>' + (p.gender === 'male' ? '남자' : '여자') + (fixed ? '' : ' · 게스트') + '</small></span></label>';
}
function render() {
  tidy(); const period = builderModel.periodForDate(state.date, builderData.memberships), members = roster();
  $('date').value = state.date;
  renderThemes();
  $('membership-note').textContent = period ? builderData.memberships[period].label + ' · 고정 멤버 ' + members.length + '명 중 참석자를 선택하세요.' : '해당 날짜의 회원 회차 명단이 없습니다. 회차 명단을 먼저 등록한 뒤 대진을 만들어 주세요.';
  $('members').innerHTML = members.map(id => card(id, true)).join('');
  $('member-count').textContent = state.selected.filter(id => members.includes(id)).length + '명';
  $('toggle-members').textContent = members.every(id => state.selected.includes(id)) ? '전체 해제' : '전체 선택';
  $('guests').innerHTML = Object.keys(state.guests).map(id => '<div class="guest-entry">' + card(id, false) + '<button type="button" class="remove-button" data-remove-guest="' + esc(id) + '" aria-label="' + esc(profile(id).name) + ' 게스트 삭제">×</button></div>').join('');
  $('guest-count').textContent = Object.keys(state.guests).length + '명';
  const ids = selected(), males = ids.filter(id => profile(id).gender === 'male').length;
  $('selection-summary').textContent = '참석 ' + ids.length + '명 · 남자 ' + males + ' · 여자 ' + (ids.length - males) + (ids.length < 4 ? ' · 4명 이상 선택해 주세요.' : ids.length > 16 ? ' · 16명 이내로 선택해 주세요.' : '');
  $('avoid-rests').checked = state.avoidRests; $('allow-repeats').checked = state.repeats;
  renderOptions(); $('fill-courts').checked=state.fillCourts;
  $('fill-summary').textContent=ids.length>=4 ? fillText() : '4명 이상 선택하면 추가 경기 대상을 추첨합니다.';
  $('redraw-bonus').hidden=!state.fillCourts || ids.length>=12 || !state.bonusIds.length;
  updateButtons(); persist();
}
function inputOf() {
  const ids = selected(), members = roster();
  return builderModel.validateInput({ date: state.date, membershipPeriod: builderModel.periodForDate(state.date, builderData.memberships),
    theme: $('theme').value, players: ids, fixedPlayerIds: ids.filter(id => members.includes(id)),
    profiles: Object.fromEntries(ids.map(id => [id, { name: profile(id).name, gender: profile(id).gender, memberType: members.includes(id) ? 'fixed' : 'guest' }])),
    quotas: quotas(), availability: Object.fromEntries(ids.map(id => [id, available(id)])), lockedPairs: state.pairs,
    avoidConsecutiveRests: state.avoidRests, allowPartnerRepeats: state.repeats });
}
function preview(doc) {
  const stats = builderModel.summary(doc), matches = Object.values(doc.matches);
  $('preview-summary').textContent = doc.date + ' · ' + builderData.themes[doc.theme].name + ' · ' + doc.players.length + '명 · ' + matches.length + '경기 · 남복 ' + stats.types['남복'] + ' / 혼복 ' + stats.types['혼복'] + ' / 여복 ' + stats.types['여복'];
  $('preview-concept').innerHTML=conceptCard(doc.theme);
  const extra=doc.players.filter(id=>doc.quotas[id]===5);
  $('preview-fill').textContent=(extra.length ? '5경기 · '+extra.map(id=>doc.profiles[id].name).join(' · ')+'. ' : '')+(matches.length===12 ? '두 코트 모두 사용.' : '빈 코트 '+(12-matches.length)+'타임. 경기 수·성별·참석 시간·고정 페어 조건 적용.');
  const forced = doc.players.filter(id => [1,2,3].some(r => [r,r+1,r+2,r+3].every(round => matches.some(m => m.round===round && [...m.teamA,...m.teamB].includes(id)))));
  $('preview-locks').textContent = doc.lockedPairs.map(entry => entry.players.map(id=>doc.profiles[id].name).join(' · ') + ' ' + (doc.profiles[entry.players[0]].gender===doc.profiles[entry.players[1]].gender ? (doc.profiles[entry.players[0]].gender==='male' ? '남복' : '여복') : '혼복') + ' ' + (entry.games==='all' ? '전체 '+doc.quotas[entry.players[0]] : entry.games) + '경기 고정').join(' / ');
  $('preview-locks').hidden = !doc.lockedPairs.length;
  $('preview-warning').textContent = (stats.partnerRepeats ? '같은 페어 반복 ' + stats.partnerRepeats + '회. ' : '파트너 중복 없음. ') + (forced.length ? forced.map(id => doc.profiles[id].name).join(' · ') + ' 추가 경기·시간·전체 페어 조건으로 연속 출전 예외 적용. ' : '') + (doc.avoidConsecutiveRests ? '연속 휴식 피하기 적용. ' : '') + '층 이동 개인 최대 2회.';
  $('preview-rounds').innerHTML = Array.from({ length: 6 }, (_, r) => {
    const row = matches.filter(m => m.round === r + 1), active = new Set(row.flatMap(m => [...m.teamA, ...m.teamB]));
    const rest = doc.players.filter(id => !active.has(id) && r >= doc.availability[id].from && r < doc.availability[id].to);
    const ended = doc.players.filter(id => doc.availability[id].to <= r);
    const cards = [1, 2].map(floor => {
      const m = row.find(match => match.floor === floor);
      return '<div class="preview-match"><small>' + floor + '층 · ' + (m ? builderModel.type(m.teamA, m.teamB, doc.profiles) : '빈 코트') + '</small>' + (m ? '<strong>' + m.teamANames.map(esc).join(' · ') + '</strong><div class="preview-vs">VS</div><strong>' + m.teamBNames.map(esc).join(' · ') + '</strong>' : '<p class="hint">이 타임은 배정 없음</p>') + '</div>';
    }).join('');
    return '<article class="preview-round"><div class="preview-time">' + builderModel.time(480 + r * 30) + ' — ' + builderModel.time(510 + r * 30) + '</div><div class="preview-matches">' + cards + '</div><div class="preview-rests">' + (rest.length ? '휴식 · ' + rest.map(id => esc(doc.profiles[id].name)).join(' · ') : '참석 선수 모두 출전') + (ended.length ? ' / 종료 · ' + ended.map(id => esc(doc.profiles[id].name)).join(' · ') : '') + '</div></article>';
  }).join('');
  $('preview-players').innerHTML = doc.players.map(id => {
    const row = stats.rows[id], window = doc.availability[id];
    return '<article class="allocation-card"><strong>' + esc(doc.profiles[id].name) + '</strong><p>' + row.games + '경기 · 남복 ' + row.men + ' / 혼복 ' + row.mixed + ' / 여복 ' + row.women + '</p><p>휴식 ' + row.rests.length + '회 · 층 이동 ' + row.floorChanges + '회</p><p>' + builderModel.time(480 + window.from * 30) + '–' + builderModel.time(480 + window.to * 30) + '</p></article>';
  }).join('');
  $('preview').hidden = false; $('editor').hidden = true; updateButtons(); $('preview').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function generate() {
  try {
    message(''); const input = inputOf();
    if (builderData.legacyDates.includes(input.date) || confirmed.has(input.date)) throw Error('이미 확정된 날짜의 대진은 바꾸지 않습니다.');
    if (worker) worker.terminate();
    draft = null; $('preview-warning').textContent = '새 대진을 찾는 중…'; const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
    worker = new Worker(url); const activeWorker = worker; URL.revokeObjectURL(url); $('generate').textContent = '대진을 찾는 중…'; $('save-status').textContent = ''; updateButtons();
    worker.onmessage = event => {
      if (worker !== activeWorker) return;
      worker.terminate(); worker = null; $('generate').textContent = '대진 만들기';
      if (event.data.error) { $('editor').hidden = false; message(event.data.error); updateButtons(); return; }
      draft = event.data.document; preview(draft);
    };
    worker.onerror = () => { if (worker !== activeWorker) return; worker.terminate(); worker = null; $('editor').hidden = false; message('대진 생성에 실패했어요. 입력은 유지됩니다. 다시 만들어 주세요.'); updateButtons(); };
    worker.postMessage(input);
  } catch (error) { message(error.message); }
}
async function connect() {
  const attempt = ++connectionAttempt;
  connected = false; updateButtons(); $('connection').textContent = '공유 대진 연결 중…';
  unsubscribe?.();
  try {
    const stop = await builderStore.listen(builderData.firebaseConfig, documents => {
      if (attempt !== connectionAttempt) return;
      confirmed = new Map(documents.map(doc => [doc.date, doc])); connected = true;
      $('connection').textContent = storageAvailable ? '초안은 이 브라우저에 보관 · 확정 후 공유 가능' : '초안 파일을 저장해 보관해 주세요.';
      updateButtons();
    }, () => { connected = false; $('connection').innerHTML = '공유 대진 연결 실패. 초안 만들기는 가능합니다. <button type="button" class="text-button" data-retry>다시 연결</button>'; updateButtons(); });
    if (attempt === connectionAttempt) unsubscribe = stop; else stop();
  } catch { if (attempt === connectionAttempt) { $('connection').innerHTML = '공유 대진 연결 실패. 초안 만들기는 가능합니다. <button type="button" class="text-button" data-retry>다시 연결</button>'; updateButtons(); } }
}
async function confirm() {
  if (!draft || saving || !connected || !navigator.onLine) return;
  const target = structuredClone(draft); saving = true; updateButtons(); $('save-status').textContent = '확정 중…';
  try {
    const date = await builderStore.save(builderData.firebaseConfig, target);
    $('save-status').textContent = '대진 확정 완료. 점수는 확정된 대진표에서 입력하세요.';
    $('saved-link').href = '../schedule/?date=' + encodeURIComponent(date); $('saved-link').hidden = false;
    confirmed.set(date, target);
  } catch (error) {
    $('save-status').textContent = error.code === 'permission-denied' ? '저장 권한을 확인해 주세요. 초안은 유지됩니다.' : error.message;
  } finally { saving = false; updateButtons(); }
}
document.addEventListener('change', event => {
  if (saving) return;
  const field = event.target;
  if (field.id === 'date') {
    const date = field.value;
    if (!builderModel.validDate(date)) { message('날짜를 선택해 주세요.'); return; }
    const oldGuests = Object.entries(state.guests); state.date = date; state.guests = {};
    for (const [id, p] of oldGuests) { if (!roster().includes(id)) state.guests[builderData.players[id] ? id : builderModel.guestId(date, state.guests)] = p; }
    state.selected = [...roster(), ...Object.keys(state.guests)]; state.availability = {}; state.quotas = {}; state.pairs = []; state.theme = ''; state.bonusIds=[];fillCache=null;
  } else if (field.dataset.attendee) {
    const id = field.dataset.attendee; state.selected = field.checked ? [...new Set([...state.selected, id])] : state.selected.filter(p => p !== id);
  } else if (field.dataset.quota) state.quotas[field.dataset.quota] = Number(field.value);
  else if (field.dataset.from || field.dataset.to) {
    const id = field.dataset.from || field.dataset.to; state.availability[id] = { ...available(id), [field.dataset.from ? 'from' : 'to']: Number(field.value) };
  } else if (field.id === 'theme') state.theme = field.value;
  else if (field.id === 'theme-series') state.theme=Object.entries(builderData.themes).find(([,t])=>(t.seriesId || 'club')===field.value)?.[0] || 'club';
  else if (field.id === 'fill-courts') state.fillCourts=field.checked;
  else if (field.id === 'avoid-rests') state.avoidRests = field.checked;
  else if (field.id === 'allow-repeats') state.repeats = field.checked;
  else return;
  invalidate(); render();
});
document.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button || saving) return;
  if (button.id === 'redraw-bonus') {state.bonusIds=[];fillCache=null;invalidate();render();return;}
  if (button.id === 'toggle-members') { const ids = roster(), all = ids.every(id => state.selected.includes(id)); state.selected = all ? state.selected.filter(id => !ids.includes(id)) : [...new Set([...state.selected, ...ids])]; invalidate(); render(); }
  else if (button.id === 'open-guest') { $('guest-form').hidden = false; button.setAttribute('aria-expanded', 'true'); $('guest-name').focus(); }
  else if (button.id === 'cancel-guest') { $('guest-form').hidden = true; $('open-guest').setAttribute('aria-expanded', 'false'); $('open-guest').focus(); }
  else if (button.dataset.removeGuest) { delete state.guests[button.dataset.removeGuest]; state.selected = state.selected.filter(id => id !== button.dataset.removeGuest); invalidate(); render(); }
  else if (button.dataset.removePair !== undefined) { state.pairs.splice(Number(button.dataset.removePair), 1); invalidate(); render(); }
  else if (button.id === 'add-pair') {
    const pair = [$('pair-a').value, $('pair-b').value];
    if (!pair[0] || !pair[1] || pair[0] === pair[1] || state.pairs.some(entry => builderModel.key(entry.players) === builderModel.key(pair))) { message('서로 다른 선수 두 명을 선택해 주세요. 같은 페어는 한 번만 등록합니다.'); return; }
    state.pairs.push({players:pair,games:$('pair-games').value==='all'?'all':Number($('pair-games').value)}); invalidate(); render();
  } else if (button.id === 'generate' || button.id === 'regenerate') generate();
  else if (button.id === 'edit') { invalidate(); render(); $('editor').scrollIntoView({ block: 'start' }); }
  else if (button.id === 'confirm') confirm();
  else if (button.id === 'clear-draft') { state = fresh();state.selected = roster();fillCache=null;invalidate();render(); }
  else if (button.id === 'download' && draft) { const payload = { ...draft }; delete payload.searchNodes; const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'daepo-' + draft.date + '-draft.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  else if (button.hasAttribute('data-retry')) connect();
});
$('guest-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const value = builderModel.validateName($('guest-name').value), gender = $('guest-gender').value;
    const existing = Object.entries(builderData.players).find(([, p]) => p.name === value);
    if (existing && roster().includes(existing[0])) throw Error('고정 멤버 명단에 있는 이름입니다. 참석 멤버에서 선택해 주세요.');
    if (Object.values(state.guests).some(p => p.name === value)) throw Error('같은 게스트 이름이 이미 있습니다.');
    if (Object.keys(state.guests).length >= 8) throw Error('게스트는 모임당 최대 8명까지 추가할 수 있습니다.');
    if (existing && existing[1].gender !== gender) throw Error('기존 회원 프로필의 성별과 다릅니다. 등록된 성별을 선택해 주세요.');
    const id = existing ? existing[0] : builderModel.guestId(state.date, state.guests);
    state.guests[id] = { name: value, gender }; state.selected.push(id); $('guest-name').value = ''; $('guest-form').hidden = true; $('open-guest').setAttribute('aria-expanded', 'false');
    invalidate(); render(); $('open-guest').focus();
  } catch (error) { message(error.message); $('guest-name').focus(); }
});
window.addEventListener('offline', () => { $('connection').textContent = '인터넷 연결 끊김 · 초안은 유지됩니다.'; updateButtons(); });
window.addEventListener('online', connect);
state = fresh();
let storedDraft = false;
try { const saved = JSON.parse(localStorage.getItem(storageKey)); storedDraft = !!saved; if (saved && builderModel.validDate(saved.date) && Array.isArray(saved.selected) && saved.guests && typeof saved.guests === 'object' && Array.isArray(saved.pairs) && saved.pairs.every(entry=>entry && Array.isArray(entry.players))) state = { ...state, ...saved }; } catch {}
if (!storedDraft) state.selected = roster();
render(); connect();
