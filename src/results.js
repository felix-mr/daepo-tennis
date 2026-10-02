const resultModel = (() => {
  function outcome(scoreA, scoreB) {
    return scoreA > scoreB ? 'teamA' : scoreA < scoreB ? 'teamB' : 'draw';
  }

  function valid(record) {
    return record && /^\d{4}-\d{2}-\d{2}$/.test(record.date)
      && [record.scoreA, record.scoreB].every(score => Number.isInteger(score) && score >= 0 && score <= 99)
      && record.outcome === outcome(record.scoreA, record.scoreB)
      && Array.isArray(record.teamA) && Array.isArray(record.teamB)
      && record.teamA.length === 2 && record.teamB.length === 2
      && new Set([...record.teamA, ...record.teamB]).size === 4
      && [...record.teamA, ...record.teamB].every(id => typeof id === 'string')
      && (record.fixedPlayerIds === undefined || (Array.isArray(record.fixedPlayerIds)
        && new Set(record.fixedPlayerIds).size === record.fixedPlayerIds.length
        && record.fixedPlayerIds.every(id => [...record.teamA, ...record.teamB].includes(id))))
      && ['teamANames', 'teamBNames'].every(field => Array.isArray(record[field])
        && record[field].length === 2 && record[field].every(name => typeof name === 'string'))
      && Number.isInteger(record.round) && record.round >= 1 && record.round <= 6
      && [1, 2].includes(record.floor);
  }

  function aggregate(records, players = {}, { fixedOnly = false } = {}) {
    const stats = new Map(Object.entries(players).map(([id, profile]) =>
      [id, { id, name: profile.name, games: 0, wins: 0, draws: 0, losses: 0, points: 0, winRate: null }]));
    for (const record of records.filter(valid)) {
      for (const side of ['teamA', 'teamB']) {
        record[side].forEach((id, index) => {
          if (fixedOnly && Array.isArray(record.fixedPlayerIds) && !record.fixedPlayerIds.includes(id)) return;
          if (!stats.has(id)) stats.set(id, {
            id, name: record[`${side}Names`]?.[index] || id,
            games: 0, wins: 0, draws: 0, losses: 0, points: 0, winRate: null,
          });
          const row = stats.get(id);
          row.games += 1;
          if (record.outcome === 'draw') { row.draws += 1; row.points += 1; }
          else if (record.outcome === side) { row.wins += 1; row.points += 3; }
          else row.losses += 1;
          row.winRate = row.wins / row.games;
        });
      }
    }
    return stats;
  }

  function rank(records, players = {}) {
    return [...aggregate(records, players, { fixedOnly: true }).values()].sort((a, b) =>
      b.points - a.points || (b.winRate ?? -1) - (a.winRate ?? -1)
      || b.wins - a.wins || a.name.localeCompare(b.name, 'ko'));
  }

  function partners(records, playerId, players = {}) {
    const stats = new Map();
    for (const record of records.filter(valid)) {
      if (Array.isArray(record.fixedPlayerIds) && !record.fixedPlayerIds.includes(playerId)) continue;
      const side = record.teamA.includes(playerId) ? 'teamA' : record.teamB.includes(playerId) ? 'teamB' : null;
      if (!side) continue;
      const index = record[side].findIndex(id => id !== playerId);
      const id = record[side][index];
      if (!stats.has(id)) stats.set(id, {
        id, name: players[id]?.name || record[`${side}Names`][index],
        games: 0, wins: 0, draws: 0, losses: 0, points: 0, winRate: null, memberGames: 0,
        guestDate: /^guest-(\d{4}-\d{2}-\d{2})-/.exec(id)?.[1] || null,
      });
      const row = stats.get(id);
      row.games += 1;
      if (record.outcome === 'draw') { row.draws += 1; row.points += 1; }
      else if (record.outcome === side) { row.wins += 1; row.points += 3; }
      else row.losses += 1;
      if (record.fixedPlayerIds?.includes(id)) row.memberGames += 1;
      row.winRate = row.wins / row.games;
    }
    return [...stats.values()].sort((a, b) => b.games - a.games || b.winRate - a.winRate
      || a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id));
  }

  const rate = row => row?.games ? `${(row.winRate * 100).toFixed(1)}%` : '—';
  const summary = row => row
    ? `${row.games}경기 · ${row.wins}승 ${row.draws}무 ${row.losses}패 · 승률 ${rate(row)} · 승점 ${row.points}점`
    : '0경기 · 0승 0무 0패 · 승률 — · 승점 0점';
  return { outcome, valid, aggregate, rank, partners, rate, summary };
})();
