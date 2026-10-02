const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const load = name => vm.runInNewContext(fs.readFileSync(path.join(__dirname, `../src/${name}.js`), 'utf8') + `\n${name === 'membership' ? 'membershipModel' : 'resultModel'};`);
const membership = load('membership'), results = load('results');
const periods = {
  first: { startsOn: '2026-09-15', endsBefore: '2026-12-15', memberIds: ['a'] },
  second: { startsOn: '2026-12-15', endsBefore: '2027-03-15', memberIds: ['b'] },
  third: { startsOn: '2027-03-15', endsBefore: '2027-06-15', memberIds: ['a', 'b'] },
};
const fixture = (date, fixedPlayerIds) => ({ date, fixedPlayerIds, round: 1, floor: 1,
  teamA: ['a', 'b'], teamB: ['g1', 'g2'], teamANames: ['가', '나'], teamBNames: ['게1', '게2'],
  scoreA: 6, scoreB: 4, outcome: 'teamA' });

test('club cycle boundaries follow actual dates across calendar quarters and years', () => {
  assert.equal(membership.periodForDate('2026-10-01', periods), 'first');
  assert.equal(membership.periodForDate('2026-12-14', periods), 'first');
  assert.equal(membership.periodForDate('2026-12-15', periods), 'second');
  assert.equal(membership.periodForDate('2027-01-01', periods), 'second');
  assert.equal(membership.periodForDate('2027-03-15', periods), 'third');
  assert.equal(membership.periodForDate('2026-09-14', periods), null);
});

test('joining later never turns an earlier guest game into member points', () => {
  const games = [fixture('2026-10-03', ['a']), fixture('2027-01-02', ['b'])];
  const totals = results.aggregate(games, { a: { name: '가' }, b: { name: '나' } }, { fixedOnly: true });
  assert.equal(totals.get('a').games, 1); assert.equal(totals.get('a').points, 3);
  assert.equal(totals.get('b').games, 1); assert.equal(totals.get('b').points, 3);
});

test('retirement keeps past results; rejoining reuses ID and joins only member results', () => {
  const games = [fixture('2026-10-03', ['a']), fixture('2027-01-02', ['b']), fixture('2027-04-03', ['a', 'b'])];
  const totals = results.aggregate(games, {}, { fixedOnly: true });
  assert.equal(totals.get('a').games, 2); assert.equal(totals.get('a').points, 6);
  assert.equal(totals.get('b').games, 2); assert.equal(totals.get('b').points, 6);
  assert.equal(totals.has('g1'), false);
});

test('stored member snapshot survives later roster edits; legacy records use membership dates', () => {
  const old = membership.normalize(fixture('2026-10-03', ['a']), { first: { ...periods.first, memberIds: ['b'] } });
  assert.equal(old.fixedPlayerIds.join(','), 'a');
  const legacy = membership.normalize(fixture('2027-01-02', undefined), periods);
  assert.equal(legacy.fixedPlayerIds.join(','), 'b');
  const unknown = membership.normalize(fixture('2025-01-04', undefined), periods);
  assert.equal(unknown.fixedPlayerIds.length, 0);
});

test('invalid member snapshot cannot include another person or duplicated IDs', () => {
  assert.equal(results.valid(fixture('2026-10-03', ['outsider'])), false);
  assert.equal(results.valid(fixture('2026-10-03', ['a', 'a'])), false);
  assert.equal(results.valid(fixture('2026-10-03', [])), true);
});
