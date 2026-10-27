const builderModel = (() => {
  const pad = n => String(n).padStart(2, '0');
  const minute = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const time = n => pad(Math.floor(n / 60)) + ':' + pad(n % 60);
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  function nextSaturday(day = today()) {
    const date = new Date(day + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + (6 - date.getUTCDay() + 7) % 7);
    return date.toISOString().slice(0, 10);
  }
  function validDate(day) {
    return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(day)) && new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) === day;
  }
  const periodForDate = (day, periods) => Object.entries(periods).find(([, p]) => p.startsOn <= day && day < p.endsBefore)?.[0] || null;
  const name = value => String(value).normalize('NFC').trim().replace(/\s+/g, ' ');
  function validateName(value) {
    const normalized = name(value);
    if (!normalized || normalized.length > 24 || /[\u0000-\u001f\u007f]/.test(normalized)) throw Error('이름은 1~24자로 입력해 주세요.');
    return normalized;
  }
  function guestId(day, guests) {
    for (let i = 1; i <= 99; i++) {
      const id = 'guest-' + day + '-' + pad(i);
      if (!Object.hasOwn(guests, id)) return id;
    }
    throw Error('게스트를 더 추가할 수 없습니다.');
  }
  function allocate(ids, available, rounds = 6) {
    const capacity = Math.min(2, Math.floor(ids.length / 4)) * 4 * rounds;
    const target = Math.min(ids.length === 4 ? 3 : 4, Math.floor(capacity / ids.length));
    if (target < 2) throw Error('모두 2경기 이상 치를 수 있도록 참석 인원을 줄여 주세요.');
    if (ids.some(id => (available[id] ?? rounds) < 2)) throw Error('모두 두 타임 이상 참석할 수 있도록 시간을 맞춰 주세요.');
    const quotas = Object.fromEntries(ids.map(id => [id, Math.min(target, available[id] ?? rounds)]));
    let slots = Object.values(quotas).reduce((a, b) => a + b, 0);
    for (const id of [...ids].reverse()) {
      if (slots % 4 === 0) break;
      if (quotas[id] > 2) { quotas[id]--; slots--; }
    }
    if (slots % 4) throw Error('전체 출전 횟수가 4의 배수가 되도록 개인 경기 수를 맞춰 주세요.');
    return quotas;
  }
  // Fill idle courts with one extra game; rotate by eligible historical opportunity.
  // Guest and manual quotas are never changed; ALL pairs move together.
  function fillCourts(input, options = {}) {
    const ids = input.players, original = { ...input.quotas };
    const slots = quotas => ids.reduce((sum, id) => sum + quotas[id], 0);
    const result = (quotas, bonusIds) => {
      const unfilledSlots = Math.max(0, 48 - slots(quotas));
      return { quotas, bonusIds, unfilledSlots, reason: unfilledSlots ? '성별 구성·게스트 경기 수·참석 시간·고정 페어·파트너 반복 조건을 유지하면 ' + Math.ceil(unfilledSlots / 4) + '개 코트를 채울 수 없습니다. 회원은 최대 5경기까지 배정합니다.' : '' };
    };
    if (ids.length >= 12) return result(original, []);
    const random = options.random || Math.random;
    const allowed = new Set(input.eligibleIds ?? ids);
    const eligible = ids.filter(id => input.fixedPlayerIds.includes(id) && input.profiles[id].memberType === 'fixed'
      && allowed.has(id) && original[id] === 4 && input.availability[id].to - input.availability[id].from >= 5);
    const preferred = new Set(input.preferredBonusIds || []);
    const H = typeof builderHistory !== 'undefined' ? builderHistory : require('./builder-history.js');
    const bonusHistory = H.analyze(input, input.history).bonus;
    const ranked = eligible;
    const capacity = Array.from({length:6},(_,r)=>{
      const present = ids.filter(id => input.availability[id].from <= r && r < input.availability[id].to).length;
      return Math.min(2, Math.floor(present / 4)) * 4;
    }).reduce((sum,value)=>sum+value,0);
    const genderCapacity = Object.fromEntries(['male','female'].map(gender=>[gender,
      Array.from({length:6},(_,r)=>Math.min(8,2*Math.floor(ids.filter(id=>input.profiles[id].gender===gender
        && input.availability[id].from<=r && r<input.availability[id].to).length/2))).reduce((sum,value)=>sum+value,0)]));
    let best = original, bonus = [], score = -1, historyScore = Infinity, ties = 0, bestSlots = slots(original);
    for (let mask = 1; mask < 2 ** ranked.length; mask++) {
      const selected = ranked.filter((id,index) => mask & (1 << index));
      const quotas = { ...original };
      selected.forEach(id => quotas[id] = 5);
      const count = slots(quotas);
      if (count > capacity || count % 4 || count < bestSlots) continue;
      if (['male','female'].some(gender=>ids.filter(id=>input.profiles[id].gender===gender).reduce((sum,id)=>sum+quotas[id],0)>genderCapacity[gender])) continue;
      if (!input.allowPartnerRepeats) {
        const limits=repeatLimits({...input,lockedPairs:input.lockedPairs || [],quotas});
        const pools=Object.fromEntries(['male','female'].map(gender=>[gender,ids.filter(id=>input.profiles[id].gender===gender).length]));
        if(ids.some(id=>{
          const gender=input.profiles[id].gender;
          const partners=ids.filter(other=>other!==id && (input.profiles[other].gender===gender ? pools[gender]>=4 : pools.male>=2 && pools.female>=2));
          return quotas[id]>partners.reduce((sum,other)=>sum+(limits.get(key([id,other])) || 1),0);
        })) continue;
      }
      // ALL partners also rest together. Their absence can leave an odd pool;
      // the game they play consumes one court of the corresponding doubles type.
      if ((input.lockedPairs || []).some(entry=>{
        if(entry.games!=='all')return false;
        const pair=entry.players,target=quotas[pair[0]],same=input.profiles[pair[0]].gender===input.profiles[pair[1]].gender;
        return ['male','female'].some(gender=>{
          const pool=ids.filter(id=>input.profiles[id].gender===gender),own=pair.filter(id=>input.profiles[id].gender===gender).length;
          const absent=Math.min(8,2*Math.floor((pool.length-own)/2));
          const present=same ? (own ? Math.min(8,2+2*Math.floor((pool.length-2)/2)) : Math.min(4,2*Math.floor(pool.length/2)))
            : Math.min(6,2+2*Math.floor((pool.length-2)/2));
          return pool.reduce((sum,id)=>sum+quotas[id],0)>target*present+(6-target)*absent;
        });
      })) continue;
      // ALL pairs must retain equal quotas and overlap for every game. A four-
      // player same-gender pool also requires both opponents for every such game.
      if ((input.lockedPairs || []).some(entry => {
        if (entry.games !== 'all') return false;
        const pair = entry.players, target = quotas[pair[0]];
        const pool = ids.filter(id => input.profiles[id].gender === input.profiles[pair[0]].gender);
        const group = input.profiles[pair[0]].gender === input.profiles[pair[1]].gender && pool.length === 4 ? pool : pair;
        return quotas[pair[1]] !== target || group.some(id => quotas[id] < target)
          || Math.min(...group.map(id => input.availability[id].to)) - Math.max(...group.map(id => input.availability[id].from)) < target;
      })) continue;
      try { validateInput({ ...input, quotas }); } catch { continue; }
      // Reservoir sampling is uniform among equally full, equally preferred
      // valid subsets. Previous bonus members stay stable while still eligible.
      const candidateScore = selected.filter(id => preferred.has(id)).length;
      const candidateHistory = selected.reduce((sum,id) => sum + (bonusHistory[id] || 0), 0);
      if (count > bestSlots || candidateScore > score || (candidateScore === score && candidateHistory < historyScore - 1e-9)) {
        best = quotas; bonus = selected; bestSlots = count; score = candidateScore; historyScore = candidateHistory; ties = 1;
      } else if (count === bestSlots && candidateScore === score && Math.abs(candidateHistory - historyScore) < 1e-9 && random() < 1 / ++ties) {
        best = quotas; bonus = selected;
      }
    }
    return result(best, bonus);
  }
  const key = pair => [...pair].sort().join('|');
  function type(a, b, profiles) {
    const kinds = [a, b].map(team => team.filter(id => profiles[id].gender === 'female').length);
    if (kinds[0] === 0 && kinds[1] === 0) return '남복';
    if (kinds[0] === 2 && kinds[1] === 2) return '여복';
    if (kinds[0] === 1 && kinds[1] === 1) return '혼복';
    return null;
  }
  const lockedTargets = input => new Map(input.lockedPairs.map(entry => [key(entry.players), entry.games === 'all' ? input.quotas[entry.players[0]] : entry.games]));
  function repeatLimits(input) {
    const limits = lockedTargets(input);
    for (const entry of input.lockedPairs) {
      const pair = entry.players, genders = pair.map(id => input.profiles[id].gender);
      let pool = input.players;
      if (genders[0] === genders[1]) pool = pool.filter(id => input.profiles[id].gender === genders[0]);
      if (pool.length === 4) {
        const other = pool.filter(id => !pair.includes(id));
        const k = key(other);
        if (!limits.has(k)) limits.set(k, limits.get(key(pair)));
      }
    }
    return limits;
  }
  function effectiveWindow(input, id) {
    const window = { ...input.availability[id] }, targets = lockedTargets(input);
    for (const entry of input.lockedPairs) {
      if (entry.players.includes(id) && targets.get(key(entry.players)) === input.quotas[id]) {
        const peer = entry.players.find(p => p !== id), other = input.availability[peer];
        window.from = Math.max(window.from, other.from); window.to = Math.min(window.to, other.to);
      }
    }
    return window;
  }
  function validateInput(input) {
    if (!validDate(input.date) || new Date(input.date + 'T00:00:00Z').getUTCDay() !== 6) throw Error('토요일 모임 날짜를 선택해 주세요.');
    if (!input.membershipPeriod) throw Error('해당 날짜의 회원 회차 명단을 먼저 등록해 주세요.');
    const ids = input.players;
    if (!Array.isArray(ids) || ids.length < 4 || ids.length > 16 || new Set(ids).size !== ids.length) throw Error('참석자 4~16명을 선택해 주세요.');
    const names = new Set();
    for (const id of ids) {
      const profile = input.profiles[id];
      if (!profile || !['male', 'female'].includes(profile.gender)) throw Error('모든 선수의 성별을 선택해 주세요.');
      const normalized = validateName(profile.name);
      if (normalized !== profile.name || names.has(normalized)) throw Error('같은 이름의 참석자가 있습니다. 이름을 구분해 주세요.');
      names.add(normalized);
      const window = input.availability[id];
      if (!window || !Number.isInteger(window.from) || !Number.isInteger(window.to) || window.from < 0 || window.to > 6 || window.from >= window.to) throw Error(profile.name + ' 참석 시간을 확인해 주세요.');
      const quota = input.quotas[id];
      if (quota === 5 && (ids.length >= 12 || !input.fixedPlayerIds.includes(id) || profile.memberType !== 'fixed')) throw Error('5경기는 참석자 12명 미만일 때 고정 회원에게만 배정할 수 있습니다.');
      if (!Number.isInteger(quota) || quota < 2 || quota > 5 || quota > window.to - window.from) throw Error(profile.name + ' 경기 수가 참석 가능 시간을 넘습니다.');
    }
    const slots = ids.reduce((sum, id) => sum + input.quotas[id], 0);
    if (slots % 4 || slots > Math.min(2, Math.floor(ids.length / 4)) * 24) throw Error('전체 출전 횟수를 4의 배수, 최대 48회로 맞춰 주세요.');
    const womenSlots = ids.filter(id => input.profiles[id].gender === 'female').reduce((sum, id) => sum + input.quotas[id], 0);
    if (womenSlots % 2) throw Error('여자 선수의 전체 출전 횟수는 짝수여야 남복·여복·혼복으로 배정할 수 있습니다. 개인 경기 수를 조정해 주세요.');
    if (!Array.isArray(input.lockedPairs) || input.lockedPairs.length > 8) throw Error('고정 페어는 최대 8조까지 등록할 수 있습니다.');
    const seen = new Set(), lockedCounts = {};
    for (const entry of input.lockedPairs) {
      const pair = entry.players;
      if (!Array.isArray(pair) || pair.length !== 2 || pair[0] === pair[1] || pair.some(id => !ids.includes(id)) || seen.has(key(pair))) throw Error('서로 다른 참석자 두 명을 선택해 주세요. 같은 페어는 한 번만 등록합니다.');
      seen.add(key(pair));
      if (entry.games === 'all' && input.quotas[pair[0]] !== input.quotas[pair[1]]) throw Error('전체 경기 고정 페어는 두 선수의 경기 수를 같게 맞춰 주세요.');
      const count = entry.games === 'all' ? input.quotas[pair[0]] : entry.games;
      if (!Number.isInteger(count) || count < 1 || count > Math.min(...pair.map(id => input.quotas[id])) || (entry.games !== 'all' && ![1, 2, 3].includes(entry.games))) throw Error('고정 페어 경기 수는 개인 경기 수 안에서 1·2·3경기 또는 전체를 선택해 주세요.');
      const overlap = Math.min(...pair.map(id => input.availability[id].to)) - Math.max(...pair.map(id => input.availability[id].from));
      if (overlap < count) throw Error('고정 페어 두 선수가 함께 참석하는 시간이 부족합니다.');
      const gender = input.profiles[pair[0]].gender, same = gender === input.profiles[pair[1]].gender;
      const pool = ids.filter(id => input.profiles[id].gender === gender);
      const other = ids.filter(id => input.profiles[id].gender !== gender);
      if ((same && pool.length < 4) || (!same && (pool.length < 2 || other.length < 2))) throw Error('고정 페어를 상대할 같은 종목의 선수가 부족합니다. 참석자 성별 구성을 확인해 주세요.');
      if (same && pool.length === 4 && pool.every(id => input.quotas[id] === count)) {
        const capacity = count * (other.length >= 4 ? 4 : 0) + (6 - count) * Math.min(2, Math.floor(other.length / 4)) * 4;
        if (other.reduce((sum, id) => sum + input.quotas[id], 0) > capacity) throw Error('현재 인원과 경기 수로 이 고정 페어를 배정하면 다른 선수의 경기가 부족해집니다. 고정 횟수나 개인 경기 수를 조정해 주세요.');
      }
      pair.forEach(id => lockedCounts[id] = (lockedCounts[id] || 0) + count);
    }
    if (ids.some(id => (lockedCounts[id] || 0) > input.quotas[id])) throw Error('한 선수에게 등록한 고정 페어 경기 수가 개인 경기 수를 넘습니다.');
    return input;
  }
  function documentOf(input, rounds) {
    const matches = {};
    rounds.forEach((teams, r) => {
      for (let floor = 0; floor < 2; floor++) {
        const a = [...teams[floor * 2]].sort(), b = [...teams[floor * 2 + 1]].sort();
        if (!a.length) continue;
        matches['r' + (r + 1) + '-f' + (floor + 1)] = { date: input.date, round: r + 1, floor: floor + 1, teamA: a, teamB: b,
          teamANames: a.map(id => input.profiles[id].name), teamBNames: b.map(id => input.profiles[id].name),
          fixedPlayerIds: [...a, ...b].filter(id => input.fixedPlayerIds.includes(id)) };
      }
    });
    return { schemaVersion: 1, date: input.date, membershipPeriod: input.membershipPeriod, theme: input.theme,
      startMinutes: 480, roundMinutes: 30, roundCount: 6, players: [...input.players], fixedPlayerIds: [...input.fixedPlayerIds],
      profiles: structuredClone(input.profiles), playerNames: input.players.map(id=>input.profiles[id].name), quotas: { ...input.quotas }, availability: structuredClone(input.availability),
      floorPlan: Object.fromEntries(input.players.map(id => [id, rounds.map((row,i) => Object.values(matches).find(m=>m.round===i+1 && [...m.teamA,...m.teamB].includes(id))?.floor || 0)])),
      genderPlayers: Object.fromEntries(['male','female'].map(gender=>[gender,input.players.filter(id=>input.profiles[id].gender===gender)])),
      lockedPairTargets: Object.fromEntries(lockedTargets(input)), lockedPairKeys: [...lockedTargets(input).keys()],
      teamKeys: Array.from({length:12},(_,i)=>matches['r'+(Math.floor(i/2)+1)+'-f'+(i%2+1)]).flatMap(m=>m?[key(m.teamA),key(m.teamB)]:['','']),
      roundParticipants: Object.fromEntries(rounds.map((row, i) => ['r' + (i + 1), Object.values(matches).filter(m => m.round === i + 1).flatMap(m => [...m.teamA, ...m.teamB])])),
      lockedPairs: input.lockedPairs.map(entry => ({players:[...entry.players].sort(),games:entry.games})), allowPartnerRepeats: !!input.allowPartnerRepeats,
      avoidConsecutiveRests: !!input.avoidConsecutiveRests, maxFloorChanges: 2, matches };
  }
  function validateDocument(doc, options = {}) {
    validateInput(doc);
    if (JSON.stringify(doc.playerNames)!==JSON.stringify(doc.players.map(id=>doc.profiles[id].name))) throw Error('참석자 이름 정보가 다릅니다.');
    const games = Object.fromEntries(doc.players.map(id => [id, 0]));
    const byRound = Array.from({ length: 6 }, () => []), pairs = new Map();
    const limits = repeatLimits(doc), targets = lockedTargets(doc);
    for (const [matchId, match] of Object.entries(doc.matches).sort(([,a],[,b])=>a.round-b.round || a.floor-b.floor)) {
      if (!/^r[1-6]-f[12]$/.test(matchId) || match.date !== doc.date || matchId !== 'r' + match.round + '-f' + match.floor
          || match.teamA.length !== 2 || match.teamB.length !== 2) throw Error('경기 정보를 확인해 주세요.');
      const ids = [...match.teamA, ...match.teamB];
      if (new Set(ids).size !== 4 || ids.some(id => !doc.players.includes(id))) throw Error('같은 경기의 선수가 중복됐습니다.');
      const kind = type(match.teamA, match.teamB, doc.profiles);
      if (!kind) throw Error('남복·여복·혼복 구성을 확인해 주세요.');
      for (const id of ids) {
        if (match.round <= doc.availability[id].from || match.round > doc.availability[id].to) throw Error('참석 시간 밖에 경기가 배정됐습니다.');
        games[id]++;
      }
      byRound[match.round - 1].push(...ids);
      for (const pair of [match.teamA, match.teamB]) {
        const k = key(pair), count = pairs.get(k) || 0;
        if (count && !doc.allowPartnerRepeats && !(limits.has(k) && count < limits.get(k))) throw Error('허용하지 않은 페어 반복입니다.');
        pairs.set(k, count + 1);
        if (targets.has(k) && count + 1 > targets.get(k)) throw Error('고정 페어 경기 수를 넘었습니다.');
      }
      for (const side of ['A', 'B']) if (JSON.stringify(match['team' + side + 'Names']) !== JSON.stringify(match['team' + side].map(id => doc.profiles[id].name))) throw Error('선수 이름을 확인해 주세요.');
      if (new Set(match.fixedPlayerIds).size !== match.fixedPlayerIds.length || key(match.fixedPlayerIds) !== key(ids.filter(id => doc.fixedPlayerIds.includes(id)))) throw Error('경기 당시 회원 명단이 다릅니다.');
    }
    if (byRound.some(row => row.length !== new Set(row).size)) throw Error('같은 타임에 중복 출전했습니다.');
    if (doc.players.some(id => games[id] !== doc.quotas[id])) throw Error('개인 경기 수가 설정과 다릅니다.');
    if ([...targets].some(([pair, count]) => (pairs.get(pair) || 0) !== count)) throw Error('고정 페어 경기 수가 설정과 다릅니다.');
    for (const id of doc.players) {
      const plan = Array.from({length:6},(_,r)=>Object.values(doc.matches).find(m=>m.round===r+1 && [...m.teamA,...m.teamB].includes(id))?.floor || 0);
      if (JSON.stringify(doc.floorPlan[id]) !== JSON.stringify(plan)) throw Error('선수별 층 정보가 다릅니다.');
    }
    if (['male','female'].some(g=>new Set(doc.genderPlayers[g]).size !== doc.genderPlayers[g].length || key(doc.genderPlayers[g]) !== key(doc.players.filter(id=>doc.profiles[id].gender===g)))
      || Object.keys(doc.lockedPairTargets).length !== targets.size || [...targets].some(([k,count])=>doc.lockedPairTargets[k] !== count)) throw Error('페어 검증 정보가 다릅니다.');
    if (JSON.stringify(doc.lockedPairKeys)!==JSON.stringify([...targets.keys()]) || JSON.stringify(doc.teamKeys)!==JSON.stringify(Array.from({length:12},(_,i)=>doc.matches['r'+(Math.floor(i/2)+1)+'-f'+(i%2+1)]).flatMap(m=>m?[key(m.teamA),key(m.teamB)]:['','']))) throw Error('팀 검증 정보가 다릅니다.');
    if (byRound.some((row,i)=>JSON.stringify(doc.roundParticipants['r'+(i+1)]) !== JSON.stringify(row))) throw Error('타임별 참석 명단이 다릅니다.');
    if (Object.values(summary(doc).rows).some(row => row.floorChanges > 2)) throw Error('층 이동이 두 번을 넘습니다.');
    if (options.preferences !== false) for (const id of doc.players) {
      const window = effectiveWindow(doc, id), active = Array.from({length:6},(_,r)=>byRound[r].includes(id));
      if (doc.avoidConsecutiveRests && [0,1,2,3,4].some(r=>r>=window.from && r+1<window.to && !active[r] && !active[r+1])) throw Error('연속 휴식 조건을 지키지 않았습니다.');
      if (doc.quotas[id] < 5 && window.to-window.from !== doc.quotas[id] && [0,1,2].some(r=>active.slice(r,r+4).every(Boolean))) throw Error('4경기 연속 출전 조건을 확인해 주세요.');
    }
    return doc;
  }
  function summary(doc) {
    const rows = Object.fromEntries(doc.players.map(id => [id, { id, games: 0, men: 0, women: 0, mixed: 0, floors: [], rests: [] }]));
    const pairs = new Map(), types = { '남복': 0, '여복': 0, '혼복': 0 };
    for (const match of Object.values(doc.matches).sort((a,b)=>a.round-b.round || a.floor-b.floor)) {
      const kind = type(match.teamA, match.teamB, doc.profiles); types[kind]++;
      for (const pair of [match.teamA, match.teamB]) {
        pairs.set(key(pair), (pairs.get(key(pair)) || 0) + 1);
        for (const id of pair) { rows[id].games++; rows[id][{ '남복': 'men', '여복': 'women', '혼복': 'mixed' }[kind]]++; rows[id].floors.push(match.floor); }
      }
    }
    for (const row of Object.values(rows)) {
      row.floorChanges = row.floors.reduce((n, floor, i, arr) => n + (i && arr[i - 1] !== floor ? 1 : 0), 0);
      for (let r = doc.availability[row.id].from; r < doc.availability[row.id].to; r++) {
        if (!Object.values(doc.matches).some(m => m.round === r + 1 && [...m.teamA, ...m.teamB].includes(row.id))) row.rests.push(r + 1);
      }
    }
    return { rows, types, partnerRepeats: [...pairs.values()].reduce((n, value) => n + Math.max(0, value - 1), 0) };
  }
  return { time, minute, today, nextSaturday, validDate, periodForDate, name, validateName, guestId, allocate, fillCourts, key, type, lockedTargets, repeatLimits, effectiveWindow, validateInput, validateDocument, documentOf, summary };
})();
if (typeof module !== 'undefined') module.exports = builderModel;
