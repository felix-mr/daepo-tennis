const builderScheduler = (() => {
  const M = typeof builderModel !== 'undefined' ? builderModel : require('./builder-model.js');
  function shuffle(list, random) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }
  function pairings(ids) {
    if (!ids.length) return [[]];
    const first = ids[0], out = [];
    for (let i = 1; i < ids.length; i++) {
      for (const tail of pairings(ids.slice(1).filter((_, j) => j !== i - 1))) out.push([[first, ids[i]], ...tail]);
    }
    return out;
  }
  function covers(ids, input, forcedPairs) {
    const out = [], seen = new Set();
    function legal(a, b) {
      const kind = M.type(a, b, input.profiles);
      if (!kind) return false;
      return true;
    }
    const forcedIds = new Set(forcedPairs.flat());
    for (const tail of pairings(ids.filter(id => !forcedIds.has(id)))) {
      const pairs = [...forcedPairs, ...tail];
      const groups = ids.length === 4 ? [[[0, 1]]] : [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
      for (const groupsOfMatches of groups) {
        if (!groupsOfMatches.every(([a, b]) => legal(pairs[a], pairs[b]))) continue;
        const teams = groupsOfMatches.flatMap(([a, b]) => [pairs[a], pairs[b]]);
        const signature = teams.map(M.key).join('/');
        if (seen.has(signature)) continue;
        seen.add(signature);
        if (ids.length === 4) { out.push([...teams, [], []], [[], [], ...teams]); }
        else { out.push(teams, [...teams.slice(2), ...teams.slice(0, 2)]); }
      }
    }
    return out;
  }
  function capacityVectors(total, courts, random) {
    const out = [];
    function visit(row, remaining) {
      if (row.length === 6) { if (remaining === 0) out.push(row); return; }
      for (let n = 0; n <= courts; n++) {
        if (n <= remaining && remaining - n <= (5 - row.length) * courts) visit([...row, n], remaining - n);
      }
    }
    visit([], total);
    return shuffle(out, random);
  }
  function generate(raw, options = {}) {
    const input = M.validateInput(structuredClone(raw));
    const random = options.random || Math.random, budget = options.budgetMs || 3500;
    const clock = options.clock || (() => Date.now()), deadline = clock() + budget;
    const ids = input.players, slots = ids.reduce((n, id) => n + input.quotas[id], 0);
    const targets = M.lockedTargets(input), limits = M.repeatLimits(input);
    const saturatedPairs = input.lockedPairs.filter(entry => entry.players.some(id => input.quotas[id] === targets.get(M.key(entry.players))));
    const coupledGroups = input.lockedPairs.map(entry => {
      const gender = input.profiles[entry.players[0]].gender;
      const pool = input.players.filter(id => input.profiles[id].gender === gender);
      return { ids: input.profiles[entry.players[1]].gender === gender && pool.length === 4 ? pool : entry.players, count: targets.get(M.key(entry.players)) };
    });
    const vectors = capacityVectors(slots / 4, Math.min(2, Math.floor(ids.length / 4)), random);
    let nodes = 0, timedOut = false;
    const coverCache = new Map();
    const getCovers = active => {
      const key = [...active].sort().join('/');
      if (!coverCache.has(key)) {
        const required = saturatedPairs.filter(entry => entry.players.some(id => input.quotas[id] === targets.get(M.key(entry.players)) && active.includes(id)));
        coverCache.set(key, required.some(entry => entry.players.some(id => !active.includes(id))) ? [] : covers([...active].sort(), input, required.map(entry => entry.players)));
      }
      return coverCache.get(key);
    };
    function arrange(activeRows) {
      const partnerCounts = new Map(), lastFloor = {}, moves = {}, mixed = {}, opponents = new Map();
      const output = []; let arrangementNodes = 0;
      function round(r) {
        if (clock() >= deadline) { timedOut = true; return null; }
        if (++arrangementNodes > 250) return null;
        if (r === 6) {
          if ([...targets].some(([pair, count]) => (partnerCounts.get(pair) || 0) !== count)) return null;
          return output.map(row => row.map(pair => [...pair]));
        }
        if (!activeRows[r].length) { output.push([[], [], [], []]); const found = round(r + 1); output.pop(); return found; }
        const candidates = [];
        for (const teams of getCovers(activeRows[r])) {
          let cost = random() * 6, valid = true;
          for (let floor = 0; floor < 2 && valid; floor++) {
            const a = teams[floor * 2], b = teams[floor * 2 + 1];
            if (!a.length) continue;
            const kind = M.type(a, b, input.profiles);
            for (const pair of [a, b]) {
              const previous = partnerCounts.get(M.key(pair)) || 0;
              if (previous && !input.allowPartnerRepeats && !(limits.has(M.key(pair)) && previous < limits.get(M.key(pair)))) { valid = false; break; }
              const wanted = targets.get(M.key(pair));
              if (wanted !== undefined && previous >= wanted) { valid = false; break; }
              cost += wanted !== undefined ? -40 : previous * 90;
            }
            for (const id of [...a, ...b]) {
              const change = Object.hasOwn(lastFloor, id) && lastFloor[id] !== floor ? 1 : 0;
              if ((moves[id] || 0) + change > 2) { valid = false; break; }
              cost += change * 12;
              if (kind === '혼복') cost += (mixed[id] || 0) * 9;
            }
            for (const p of a) for (const q of b) cost += (opponents.get(M.key([p, q])) || 0) * 2;
          }
          if (valid && input.lockedPairs.some(entry => {
            const k = M.key(entry.players), used = partnerCounts.get(k) || 0;
            const playsNow = teams.some(pair => pair.length && M.key(pair) === k) ? 1 : 0;
            const possibleLater = activeRows.slice(r + 1).filter(row => entry.players.every(id => row.includes(id))).length;
            return used + playsNow > targets.get(k) || used + playsNow + possibleLater < targets.get(k);
          })) valid = false;
          if (valid) candidates.push({ teams, cost });
        }
        candidates.sort((a, b) => a.cost - b.cost);
        for (const { teams } of candidates.slice(0, 18)) {
          nodes++;
          const before = { floor: { ...lastFloor }, moves: { ...moves }, mixed: { ...mixed } };
          const changedPairs = [], changedOpponents = [];
          for (let floor = 0; floor < 2; floor++) {
            const a = teams[floor * 2], b = teams[floor * 2 + 1];
            if (!a.length) continue;
            const kind = M.type(a, b, input.profiles);
            for (const pair of [a, b]) { const k = M.key(pair); partnerCounts.set(k, (partnerCounts.get(k) || 0) + 1); changedPairs.push(k); }
            for (const id of [...a, ...b]) {
              moves[id] = (moves[id] || 0) + (Object.hasOwn(lastFloor, id) && lastFloor[id] !== floor ? 1 : 0);
              lastFloor[id] = floor;
              if (kind === '혼복') mixed[id] = (mixed[id] || 0) + 1;
            }
            for (const p of a) for (const q of b) { const k = M.key([p, q]); opponents.set(k, (opponents.get(k) || 0) + 1); changedOpponents.push(k); }
          }
          output.push(teams);
          const found = round(r + 1);
          output.pop();
          if (found) return found;
          for (const object of [lastFloor, moves, mixed]) for (const k of Object.keys(object)) delete object[k];
          Object.assign(lastFloor, before.floor); Object.assign(moves, before.moves); Object.assign(mixed, before.mixed);
          for (const k of changedPairs) partnerCounts.set(k, partnerCounts.get(k) - 1);
          for (const k of changedOpponents) opponents.set(k, opponents.get(k) - 1);
          if (timedOut) return null;
        }
        return null;
      }
      return round(0);
    }
    const run = () => {
      for (const vector of shuffle(vectors, random)) {
        if (clock() >= deadline) { timedOut = true; break; }
        const capacities = vector.map(n => n * 4), patterns = {};
        for (const id of ids) {
          const window = M.effectiveWindow(input, id);
          const forced = window.to - window.from === input.quotas[id] || input.lockedPairs.some(entry => {
            if (!entry.players.includes(id) || targets.get(M.key(entry.players)) !== input.quotas[id]) return false;
            const peer = entry.players.find(p => p !== id), other = input.availability[peer];
            return Math.min(window.to, other.to) - Math.max(window.from, other.from) === input.quotas[id];
          });
          patterns[id] = [];
          for (let mask = 0; mask < 64; mask++) {
            const bits = Array.from({ length: 6 }, (_, r) => Number(!!(mask & (1 << r))));
            if (bits.reduce((a, b) => a + b, 0) !== input.quotas[id] || bits.some((value, r) => value && (r < window.from || r >= window.to || !capacities[r]))) continue;
            if (input.quotas[id] < 5 && !forced && [0, 1, 2].some(r => bits.slice(r, r + 4).every(Boolean))) continue;
            if (input.avoidConsecutiveRests && Array.from({ length: 5 }, (_, r) => r).some(r => r >= window.from && r + 1 < window.to && !bits[r] && !bits[r + 1])) continue;
            patterns[id].push(bits);
          }
        }
        if (ids.some(id => !patterns[id].length)) continue;
        const weight = id => coupledGroups.reduce((n, group) => n + (group.ids.includes(id) ? group.count : 0), 0);
        const ordered = shuffle(ids, random).sort((a, b) => patterns[a].length - patterns[b].length || weight(b) - weight(a));
        const active = Array.from({ length: 6 }, () => []), femaleCounts = Array(6).fill(0);
        let assignmentNodes = 0;
        function assign(index) {
          if (clock() >= deadline) { timedOut = true; return null; }
          if (++assignmentNodes > 12000) return null;
          if (index === ids.length) {
            if (active.some((row, r) => row.length !== capacities[r] || femaleCounts[r] % 2)) return null;
            return arrange(active);
          }
          const id = ordered[index], female = input.profiles[id].gender === 'female';
          for (const pattern of shuffle(patterns[id], random)) {
            if (pattern.some((value, r) => active[r].length + value > capacities[r])) continue;
            for (let r = 0; r < 6; r++) if (pattern[r]) { active[r].push(id); femaleCounts[r] += Number(female); }
            const remaining = ordered.slice(index + 1);
            const pairPossible = coupledGroups.every(group => {
              if (!group.ids.every(p => ordered.slice(0, index + 1).includes(p))) return true;
              return active.filter(row => group.ids.every(p => row.includes(p))).length >= group.count;
            });
            const possible = pairPossible && active.every((row, r) => row.length + remaining.filter(p => patterns[p].some(bits => bits[r])).length >= capacities[r]);
            const found = possible ? assign(index + 1) : null;
            for (let r = 0; r < 6; r++) if (pattern[r]) { active[r].pop(); femaleCounts[r] -= Number(female); }
            if (found) return found;
            if (timedOut) return null;
          }
          return null;
        }
        const rounds = assign(0);
        if (rounds) return M.documentOf(input, rounds);
      }
      return null;
    };
    let result = null;
    while (!result && clock() < deadline) { result = run(); if (!vectors.length) break; }
    if (!result) throw Error(timedOut ? '시간 안에 조건에 맞는 대진을 찾지 못했어요. 다시 만들거나 경기 수·휴식 조건을 조정해 주세요.' : '참석 시간·경기 수·성별 구성을 확인해 주세요. 이 조건으로 대진을 찾지 못했습니다.');
    result.searchNodes = nodes;
    return result;
  }
  return { generate };
})();
if (typeof module !== 'undefined') module.exports = builderScheduler;
