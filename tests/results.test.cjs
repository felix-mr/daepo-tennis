const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const model = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/results.js'), 'utf8') + '\nresultModel;');
const fixture = (scoreA, scoreB, date = '2026-10-03') => ({
  date, round: 1, floor: 1, teamA: ['a', 'b'], teamB: ['c', 'd'],
  teamANames: ['가', '나'], teamBNames: ['다', '라'],
  scoreA, scoreB, outcome: model.outcome(scoreA, scoreB),
});

test('a win, draw and loss produce 4 points and 1/3 win rate for each teammate', () => {
  const row = model.aggregate([fixture(6, 4), fixture(3, 3), fixture(2, 6)]).get('a');
  assert.equal(row.games, 3); assert.equal(row.wins, 1);
  assert.equal(row.draws, 1); assert.equal(row.losses, 1);
  assert.equal(row.points, 4); assert.equal(model.rate(row), '33.3%');
  assert.equal(model.aggregate([fixture(6, 4)]).get('b').points, 3);
  assert.equal(model.aggregate([fixture(6, 4)]).get('c').points, 0);
});

test('an edited result replaces prior outcome without counting another game', () => {
  const before = model.aggregate([fixture(6, 4)]).get('a');
  const after = model.aggregate([fixture(4, 4)]).get('a');
  assert.equal(before.points, 3); assert.equal(after.points, 1);
  assert.equal(after.games, 1); assert.equal(after.wins, 0); assert.equal(after.draws, 1);
});

test('stable player IDs aggregate across dates and name changes', () => {
  const rows = [fixture(6, 0), fixture(6, 0, '2026-10-10')];
  rows[1].teamANames[0] = '새 이름';
  const totals = model.aggregate(rows, { a: { name: '현재 이름' } });
  assert.equal(totals.get('a').games, 2); assert.equal(totals.get('a').points, 6);
  assert.equal(totals.get('a').name, '현재 이름');
});

test('no games have no win percentage; incomplete or inconsistent records are excluded', () => {
  const bad = fixture(6, 4); bad.outcome = 'draw';
  const empty = model.aggregate([bad, { ...fixture(6, 4), scoreB: null }], { a: { name: '가' } }).get('a');
  assert.equal(empty.games, 0); assert.equal(model.rate(empty), '—');
  assert.equal(model.valid({ ...fixture(6, 4), teamANames: null }), false);
});

test('points rank first, then win rate and wins', () => {
  const ranked = model.rank([fixture(6, 4), fixture(4, 4)]);
  assert.equal(ranked[0].points, 4); assert.equal(ranked[0].winRate, 0.5);
  assert.equal(ranked[2].points, 1);
});
