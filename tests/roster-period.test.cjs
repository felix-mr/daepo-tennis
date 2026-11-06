const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const builder = require('../src/builder-model.js');
const players = require('../data/players.json');
const periods = require('../data/memberships.json');
const manifest = require('../firebase/schedules.json');
const membership = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/membership.js'), 'utf8') + '\nmembershipModel;');
const periodId = 'nov-2026-jan-2027';
const ids = ['p001', 'p002', 'p005', 'p003', 'p004', 'p011', 'p008', 'p009', 'p006', 'p007'];

test('November through January roster preserves exact identity, order and gender', () => {
  assert.deepEqual(periods[periodId], {
    label: '2026년 11월~2027년 1월', startsOn: '2026-11-01', endsBefore: '2027-02-01', memberIds: ids,
  });
  assert.deepEqual(ids.map(id => players[id].name), ['서명렬', '김영진', '이재원', '나창은', '박세준', '위형종', '박정민', '정가영', '조아라', '성주은']);
  assert.deepEqual(ids.map(id => players[id].gender), [...Array(6).fill('male'), ...Array(4).fill('female')]);
  assert.equal(new Set(ids).size, 10);
});

test('both membership models apply inclusive start and exclusive end across year boundary', () => {
  for (const model of [builder, membership]) {
    for (const day of ['2026-11-01', '2026-11-07', '2026-12-31', '2027-01-01', '2027-01-30', '2027-01-31']) {
      assert.equal(model.periodForDate(day, periods), periodId, day);
    }
    assert.equal(model.periodForDate('2026-10-31', periods), 'current-members');
    assert.equal(model.periodForDate('2027-02-01', periods), null);
    assert.equal(model.periodForDate('2027-02-06', periods), null);
  }
});

test('previous period and p010 identity remain available for historical results', () => {
  assert.deepEqual(periods['current-members'], {
    label: '8~10월(임시)', startsOn: '2026-08-01', endsBefore: '2026-11-01',
    memberIds: ['p001', 'p002', 'p003', 'p004', 'p005', 'p006', 'p007', 'p008', 'p009', 'p010', 'p011'],
  });
  assert.equal(Object.keys(players).length, 11);
  assert.deepEqual(players.p010, {name: '김규석', gender: 'male', memberType: 'fixed'});
  assert.equal(periods[periodId].memberIds.includes('p010'), false);
  const historical = Object.entries(manifest).flatMap(([date, matches]) => Object.values(matches).map(match => ({date, ...match})));
  assert.ok(historical.length > 0);
  for (const match of historical) {
    const expected = [...match.teamA, ...match.teamB].filter(id => periods['current-members'].memberIds.includes(id));
    assert.deepEqual(match.fixedPlayerIds, expected);
    assert.deepEqual(Array.from(membership.normalize(match, periods).fixedPlayerIds), expected);
  }
  const legacy = {date: '2026-10-31', teamA: ['p010', 'p001'], teamB: ['p002', 'p003']};
  assert.ok(membership.normalize(legacy, periods).fixedPlayerIds.includes('p010'));
  assert.ok(membership.normalize({...legacy, fixedPlayerIds: ['p010']}, periods).fixedPlayerIds.includes('p010'));
  assert.equal(membership.normalize({...legacy, date: '2026-11-07'}, periods).fixedPlayerIds.includes('p010'), false);
});
