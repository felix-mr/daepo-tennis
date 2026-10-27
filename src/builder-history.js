/* History is a soft preference, never an additional scheduling constraint.
 * IDs, not display names, identify people. Ordinary guest IDs remain date-local.
 */
const builderHistory = (() => {
  const key = pair => [...pair].sort().join('|');
  const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  function normalizeRecord(raw, profiles = {}) {
    if (!raw || !day(raw.date) || !Array.isArray(raw.players) || new Set(raw.players).size !== raw.players.length) return null;
    const people = { ...profiles, ...raw.guests, ...raw.profiles }, ids = raw.players;
    if (ids.some(id => typeof id !== 'string' || !['male', 'female'].includes(people[id]?.gender))) return null;
    const conditions = raw.conditions || {}, start = raw.startMinutes ?? conditions.startMinutes ?? 480;
    const duration = raw.roundMinutes ?? conditions.roundMinutes ?? 30;
    const availability = Object.fromEntries(ids.map(id => [id, raw.availability?.[id] || {
      from: ((conditions.lateArrival?.[id] ?? start) - start) / duration,
      to: ((conditions.earlyDeparture?.[id] ?? start + 6 * duration) - start) / duration
    }]));
    if (ids.some(id => !Number.isInteger(availability[id].from) || !Number.isInteger(availability[id].to)
      || availability[id].from < 0 || availability[id].to > 6 || availability[id].from >= availability[id].to)) return null;
    if (raw.rounds !== undefined && (!Array.isArray(raw.rounds) || raw.rounds.some(row => !Array.isArray(row)))) return null;
    if (raw.matches !== undefined && (!raw.matches || typeof raw.matches !== 'object')) return null;
    const fixed = raw.fixedPlayerIds || raw.fixedPlayers || [];
    if (!Array.isArray(fixed) || fixed.some(id => typeof id !== 'string') || new Set(fixed).size !== fixed.length) return null;
    const matches = raw.matches ? Object.values(raw.matches) : (raw.rounds || []).flatMap((row, r) =>
      [0, 1].flatMap(f => row[f * 2]?.length ? [{round:r + 1, floor:f + 1, teamA:row[f * 2], teamB:row[f * 2 + 1]}] : []));
    if (!matches.length) return null;
    const active = Array.from({length:6}, () => new Set()), courts = new Set();
    for (const m of matches) {
      if (!Array.isArray(m.teamA) || !Array.isArray(m.teamB) || m.teamA.length !== 2 || m.teamB.length !== 2
        || !Number.isInteger(m.round) || m.round < 1 || m.round > 6 || ![1, 2].includes(m.floor)) return null;
      const players = [...m.teamA, ...m.teamB], court = m.round + ':' + m.floor;
      if (new Set(players).size !== 4 || courts.has(court) || players.some(id => !ids.includes(id) || active[m.round - 1].has(id)
        || m.round <= availability[id].from || m.round > availability[id].to)) return null;
      const a = m.teamA.filter(id => people[id].gender === 'female').length;
      const b = m.teamB.filter(id => people[id].gender === 'female').length;
      if (a !== b) return null;
      players.forEach(id => active[m.round - 1].add(id)); courts.add(court);
    }
    const quotas = Object.fromEntries(ids.map(id => [id, matches.filter(m => [...m.teamA, ...m.teamB].includes(id)).length]));
    return {date:raw.date, players:[...ids], profiles:Object.fromEntries(ids.map(id => [id, {...people[id]}])),
      fixedPlayerIds:[...fixed], availability, quotas,
      matches:matches.map(m => ({round:m.round, floor:m.floor, teamA:[...m.teamA], teamB:[...m.teamB]}))};
  }
  function normalize(raw, profiles) {
    try { return normalizeRecord(raw, profiles); } catch { return null; }
  }
  function combine(staticSchedules = [], liveSchedules = [], options = {}) {
    const dates = new Map(), ignored = [], weeks = options.weeks ?? 12;
    const target = day(options.targetDate) ? options.targetDate : null;
    const cutoff = target ? Date.parse(target) - weeks * 7 * 86400000 : -Infinity;
    for (const [source, schedules] of [['static', staticSchedules], ['live', liveSchedules]]) {
      for (const raw of schedules || []) {
        if (!raw || !day(raw.date) || (target && (raw.date >= target || Date.parse(raw.date) < cutoff))) continue;
        let normalized;
        try { normalized = normalize(raw, options.profiles); } catch { normalized = null; }
        if (!normalized) { ignored.push(raw.date); continue; }
        dates.set(raw.date, { ...normalized, historySource:source === 'live' ? 'live' : raw.historySource || 'static' });
      }
    }
    const schedules = [...dates.values()].sort((a, b) => a.date.localeCompare(b.date));
    return {schedules, coverage:{dates:schedules.map(s => s.date), count:schedules.length, weeks,
      staticCount:schedules.filter(s => s.historySource === 'static').length,
      liveCount:schedules.filter(s => s.historySource === 'live').length,
      liveStatus:options.liveStatus || 'unavailable', ignoredDates:[...new Set(ignored)]}};
  }
  // Enumerate legal four-player courts within attendance windows, not actual
  // historical court assignment. A missed pairing counts only if it was possible.
  // Alternatives are conditioned on the other person's gender: two women who
  // must oppose one another in mixed doubles are not an avoidable repeat.
  function opportunities(input) {
    const partner = {}, opponent = {}, alternatives = {partner:{}, opponent:{}}, mixed = {};
    for (let r = 0; r < 6; r++) {
      const ids = input.players.filter(id => input.availability[id].from <= r && r < input.availability[id].to);
      const seen = {partner:new Set(), opponent:new Set()}, mixedSeen = new Set();
      function relation(kind, a, b) {
        seen[kind].add(key([a, b]));
        for (const [p, q] of [[a, b], [b, a]]) {
          const k = p + ':' + input.profiles[q].gender;
          (alternatives[kind][k] ||= new Set()).add(q);
        }
      }
      for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++)
        for (let c = b + 1; c < ids.length; c++) for (let d = c + 1; d < ids.length; d++) {
          const four = [ids[a], ids[b], ids[c], ids[d]];
          for (const order of [[0,1,2,3], [0,2,1,3], [0,3,1,2]]) {
            const [p,q,s,t] = order.map(i => four[i]);
            const females = pair => pair.filter(id => input.profiles[id].gender === 'female').length;
            const n = females([p,q]);
            if (n !== females([s,t])) continue;
            relation('partner',p,q); relation('partner',s,t);
            for (const x of [p,q]) for (const y of [s,t]) relation('opponent',x,y);
            if (n === 1) four.forEach(id => mixedSeen.add(id));
          }
        }
      for (const [kind, counts] of [['partner',partner], ['opponent',opponent]]) for (const k of seen[kind]) counts[k] = (counts[k] || 0) + 1;
      for (const id of mixedSeen) mixed[id] = (mixed[id] || 0) + 1;
    }
    return {partner, opponent, alternatives, mixed};
  }
  // A four-week half-life fades old encounters. The +1 prior keeps one old
  // observation from having the same strength as one recent observation.
  // Divide by feasible coattendance rounds (not calendar weeks or absences).
  function costs(input, history = input.history || []) {
    const data = Array.isArray(history) ? {schedules:history} : history || {};
    // Refilter at use time: a serialized preview must not leak its current/future
    // date into another target. Twelve weeks is the default recent-history window.
    const normalized = combine(data.schedules || [], [], {profiles:input.profiles, targetDate:input.date,
      weeks:data.coverage?.weeks ?? 12, liveStatus:data.coverage?.liveStatus});
    const coverage = {...data.coverage, ...normalized.coverage};
    coverage.ignoredDates = [...new Set([...(data.coverage?.ignoredDates || []), ...normalized.coverage.ignoredDates])];
    const now = opportunities(input), sums = {partner:{}, opponent:{}, mixed:{}, bonus:{}}, denominators = {partner:{}, opponent:{}, mixed:{}, bonus:{}};
    const add = (object, k, n) => object[k] = (object[k] || 0) + n;
    for (const past of normalized.schedules) {
      const ageWeeks = (Date.parse(input.date) - Date.parse(past.date)) / (7 * 86400000);
      const weight = 2 ** (-ageWeeks / 4), possible = opportunities(past);
      for (const kind of ['partner','opponent']) for (const [k, n] of Object.entries(possible[kind])) add(denominators[kind],k,n * weight);
      for (const [id, n] of Object.entries(possible.mixed)) add(denominators.mixed,id,n * weight);
      for (const m of past.matches) {
        for (const pair of [m.teamA,m.teamB]) add(sums.partner,key(pair),weight);
        for (const a of m.teamA) for (const b of m.teamB) add(sums.opponent,key([a,b]),weight);
        if (past.profiles[m.teamA[0]].gender !== past.profiles[m.teamA[1]].gender)
          for (const id of [...m.teamA,...m.teamB]) add(sums.mixed,id,weight);
      }
      if (past.players.length < 12) for (const id of past.fixedPlayerIds) {
        // Old documents do not record automatic/manual quota origin; restrict
        // the proxy eligibility pool to members with 4/5 games and a 5-slot window.
        if (!past.players.includes(id) || ![4,5].includes(past.quotas[id]) || past.availability[id].to - past.availability[id].from < 5) continue;
        add(denominators.bonus,id,weight);
        if (past.quotas[id] === 5) add(sums.bonus,id,weight);
      }
    }
    const result = {partnerCosts:{}, opponentCosts:{}, mixedCosts:{}, bonusCosts:{}, coverage};
    for (const kind of ['partner','opponent']) for (const k of Object.keys(now[kind])) {
      const [a,b] = k.split('|');
      const choicesA = now.alternatives[kind][a + ':' + input.profiles[b].gender]?.size || 1;
      const choicesB = now.alternatives[kind][b + ':' + input.profiles[a].gender]?.size || 1;
      const avoidability = 1 - 1 / Math.min(choicesA,choicesB);
      result[kind + 'Costs'][k] = avoidability * (sums[kind][k] || 0) / (1 + (denominators[kind][k] || 0));
    }
    for (const id of input.players) {
      result.mixedCosts[id] = now.mixed[id] ? (sums.mixed[id] || 0) / (1 + (denominators.mixed[id] || 0)) : 0;
      result.bonusCosts[id] = (sums.bonus[id] || 0) / (1 + (denominators.bonus[id] || 0));
    }
    return result;
  }
  function analyze(input, history) {
    const value = costs(input, history);
    return {partner:value.partnerCosts, opponent:value.opponentCosts, mixed:value.mixedCosts, bonus:value.bonusCosts, coverage:value.coverage};
  }
  function prepare(first, second, options) {
    return Array.isArray(first) ? combine(first, second, options) : costs(first, second);
  }
  return {normalize, combine, prepare, analyze};
})();
if (typeof module !== 'undefined') module.exports = builderHistory;
