const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const model = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/results.js'), 'utf8') + '\nresultModel;');
const fixture = (scoreA, scoreB, overrides = {}) => ({
  date: '2026-10-03', round: 1, floor: 1,
  teamA: ['a', 'b'], teamB: ['c', 'd'], teamANames: ['가', '나'], teamBNames: ['다', '라'],
  fixedPlayerIds: ['a', 'b', 'c', 'd'], scoreA, scoreB, outcome: model.outcome(scoreA, scoreB), ...overrides,
});

test('a partner win, draw and loss count 3 games, 4 personal points and 33.3% wins', () => {
  const rows = model.partners([fixture(6, 4), fixture(3, 3), fixture(2, 6)], 'a');
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.id, 'b'); assert.equal(row.games, 3);
  assert.equal(row.wins, 1); assert.equal(row.draws, 1); assert.equal(row.losses, 1);
  assert.equal(row.points, 4); assert.equal(model.rate(row), '33.3%');
});

test('team B viewpoint and swapped sides use teammates, never opponents', () => {
  const rows = model.partners([fixture(6, 4), fixture(2, 6), fixture(3, 3)], 'd');
  assert.equal(rows.length, 1); assert.equal(rows[0].id, 'c');
  assert.equal(rows[0].wins, 1); assert.equal(rows[0].losses, 1); assert.equal(rows[0].draws, 1);
  const swapped = fixture(6, 4, {teamA:['c','d'],teamB:['b','a'],teamANames:['다','라'],teamBNames:['나','가']});
  const same = model.partners([fixture(6, 4), swapped], 'a');
  assert.equal(same.length, 1); assert.equal(same[0].id, 'b'); assert.equal(same[0].games, 2);
  assert.equal(same[0].wins, 1); assert.equal(same[0].losses, 1);
});

test('partner identity survives dates and name changes with current profile name', () => {
  const newer = fixture(6, 4, {date:'2026-10-10',teamANames:['가','별명']});
  const row = model.partners([fixture(6, 4), newer], 'a', {b:{name:'현재 이름'}})[0];
  assert.equal(row.games, 2); assert.equal(row.name, '현재 이름');
});

test('guest teammates count; equal guest names from different visits stay separate', () => {
  const guest = date => fixture(6, 4, {date, teamA:['a',`guest-${date}-01`], teamANames:['가','방문자'],fixedPlayerIds:['a']});
  const rows = model.partners([guest('2026-10-03'), guest('2026-10-10')], 'a');
  assert.equal(rows.length, 2); assert.equal(rows[0].games, 1); assert.equal(rows[1].games, 1);
  assert.equal(rows[0].memberGames, 0); assert.equal(rows[1].memberGames, 0);
  assert.equal(new Set(rows.map(row=>row.guestDate)).size, 2);
});

test('retired player guest appearances are excluded, while partner guest roles remain included', () => {
  const normal = fixture(6, 4);
  const retired = fixture(6, 4, {date:'2026-11-07',fixedPlayerIds:['b','c','d']});
  const totals = model.partners([normal, retired], 'a');
  assert.equal(totals[0].games, 1); assert.equal(totals[0].points, 3);
  const other = model.partners([normal, retired], 'b');
  assert.equal(other[0].games, 2); assert.equal(other[0].memberGames, 1);
});

test('edited results replace counts; invalid, unfinished and unrelated matches are ignored', () => {
  const wrong = fixture(6, 4, {outcome:'draw'});
  const unfinished = fixture(6, 4, {scoreB:null});
  const rows = model.partners([fixture(4, 4), wrong, unfinished], 'a');
  assert.equal(rows[0].games, 1); assert.equal(rows[0].draws, 1); assert.equal(rows[0].points, 1);
  assert.equal(model.partners([fixture(6, 4)], 'absent').length, 0);
});
