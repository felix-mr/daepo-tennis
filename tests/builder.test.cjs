const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/builder-model.js');
const S = require('../src/builder-scheduler.js');
const registry = require('../data/players.json');
const periods = require('../data/memberships.json');
function seed(value) { let n = value; return () => ((n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296); }
function input(extra = false) {
  const profiles = structuredClone(registry), players = Object.keys(profiles);
  if (extra) { players.push('guest-2026-10-17-01'); profiles[players.at(-1)] = { name: '테스트 게스트', gender: 'male', memberType: 'guest' }; }
  return { date: '2026-10-17', membershipPeriod: 'current-members', theme: 'geto', players, fixedPlayerIds: Object.keys(registry), profiles,
    quotas: Object.fromEntries(players.map(id => [id, 4])), availability: Object.fromEntries(players.map(id => [id, { from: 0, to: 6 }])),
    lockedPairs: [], avoidConsecutiveRests: true, allowPartnerRepeats: false };
}
function generate(data, n = 7) { return S.generate(data, { random: seed(n), budgetMs: 5000 }); }
function pairGames(doc, pair) { return Object.values(doc.matches).filter(m => [m.teamA, m.teamB].some(team => M.key(team) === M.key(pair))).length; }
function verify(doc) {
  assert.equal(doc.roundCount, 6);
  const counts = Object.fromEntries(doc.players.map(id => [id, 0]));
  for (let r = 1; r <= 6; r++) {
    const matches = Object.values(doc.matches).filter(m => m.round === r), ids = matches.flatMap(m => [...m.teamA, ...m.teamB]);
    assert.ok(matches.length <= 2); assert.equal(ids.length, new Set(ids).size);
    for (const match of matches) {
      assert.ok(M.type(match.teamA, match.teamB, doc.profiles));
      for (const id of [...match.teamA, ...match.teamB]) { counts[id]++; assert.ok(r > doc.availability[id].from && r <= doc.availability[id].to); }
      assert.deepEqual(match.fixedPlayerIds, [...match.teamA, ...match.teamB].filter(id => doc.fixedPlayerIds.includes(id)));
    }
  }
  assert.deepEqual(counts, doc.quotas);
  assert.ok(Object.values(M.summary(doc).rows).every(row => row.floorChanges <= 2));
  M.validateDocument(doc);
}
test('default eleven members get four games each with one idle court', () => {
  const doc = generate(input()); verify(doc); assert.equal(Object.keys(doc.matches).length, 11);
  assert.equal(Object.values(doc.roundParticipants).filter(row => row.length === 4).length, 1);
});
for (const [kind, pair] of [['men', ['p001', 'p003']], ['women', ['p007', 'p006']], ['mixed', ['p001', 'p007']]]) {
  for (const games of [1, 2, 3, 'all']) test(kind + ' fixed pair is exact ' + games + ' games', () => {
    const data = input(true); data.lockedPairs = [{ players: pair, games }];
    const doc = generate(data, 10); verify(doc); assert.equal(pairGames(doc, pair), games === 'all' ? 4 : games);
  });
}
test('one player can have two different fixed partners without exceeding quota', () => {
  const data = input(true); data.lockedPairs = [{ players: ['p001', 'p007'], games: 2 }, { players: ['p001', 'p003'], games: 1 }];
  const doc = generate(data, 21); verify(doc); assert.equal(pairGames(doc, ['p001', 'p007']), 2); assert.equal(pairGames(doc, ['p001', 'p003']), 1);
});
test('early departure and all fixed partner share available rounds', () => {
  const data = input(true); data.availability.p001.to = 4; data.lockedPairs = [{ players: ['p001', 'p007'], games: 'all' }];
  const doc = generate(data, 15); verify(doc);
  assert.equal(pairGames(doc, ['p001', 'p007']), 4);
  assert.ok(Object.values(doc.matches).filter(m => [...m.teamA, ...m.teamB].includes('p001')).every(m => m.round <= 4));
});
test('infeasible pair counts, mismatched all quotas and availability explain failure', () => {
  let data = input(); data.lockedPairs = [{ players: ['p007', 'p006'], games: 'all' }]; assert.throws(() => M.validateInput(data), /다른 선수의 경기/);
  data = input(true); data.lockedPairs = [{ players: ['p001', 'p007'], games: 3 }, { players: ['p001', 'p003'], games: 2 }]; assert.throws(() => M.validateInput(data), /개인 경기 수를 넘/);
  data = input(true); data.quotas.p001 = 3; data.quotas.p003 = 3; data.quotas.p004 = 3; data.quotas.p005 = 3; data.lockedPairs = [{ players: ['p001', 'p007'], games: 'all' }]; assert.throws(() => M.validateInput(data), /경기 수를 같게/);
  data = input(true); data.availability.p001 = { from: 0, to: 4 }; data.availability.p007 = { from: 3, to: 6 }; data.quotas.p007 = 3; data.quotas.p006 = 3; data.quotas.p003 = 3; data.quotas.p004 = 3; data.lockedPairs = [{ players: ['p001', 'p007'], games: 2 }]; assert.throws(() => M.validateInput(data), /함께 참석하는 시간/);
});
test('guest identities are weekly; missing club cycles and bad dates never borrow current roster', () => {
  assert.equal(M.guestId('2026-10-17', {}), 'guest-2026-10-17-01'); assert.equal(M.guestId('2026-10-24', {}), 'guest-2026-10-24-01');
  assert.equal(M.periodForDate('2026-11-07', periods), null); assert.equal(M.periodForDate('2026-10-17', periods), 'current-members');
  assert.equal(M.validDate('2026-02-31'), false); assert.equal(M.nextSaturday('2026-10-12'), '2026-10-17');
});
test('four guest-only players generate without member score eligibility', () => {
  const data = input(); data.players = [1,2,3,4].map(n => 'guest-2026-10-17-0' + n); data.fixedPlayerIds = [];
  data.profiles = Object.fromEntries(data.players.map((id,i)=>[id,{name:'게스트'+i,gender:'male',memberType:'guest'}]));
  data.availability = Object.fromEntries(data.players.map(id=>[id,{from:0,to:6}]));data.quotas=Object.fromEntries(data.players.map(id=>[id,3]));
  const doc=generate(data);verify(doc);assert.ok(Object.values(doc.matches).every(m=>m.fixedPlayerIds.length===0));
});
test('empty court rounds still count as consecutive rests', () => {
  const data=input();data.players=['p001','p002','p003','p004'];data.fixedPlayerIds=[...data.players];
  data.profiles=Object.fromEntries(data.players.map(id=>[id,data.profiles[id]]));
  data.quotas=Object.fromEntries(data.players.map(id=>[id,3]));
  data.availability=Object.fromEntries(data.players.map(id=>[id,{from:0,to:6}]));
  verify(generate(data,1));
  const [a,b,c,d]=data.players, empty=()=>[[],[],[],[]];
  const forged=M.documentOf(data,[[[a,b],[c,d],[],[]],[[a,c],[b,d],[],[]],empty(),empty(),[[a,d],[b,c],[],[]],empty()]);
  assert.throws(()=>M.validateDocument(forged),/연속 휴식/);
});
test('Firestore sorted map keys and match order preserve schedule validity', () => {
  const doc=generate(input(true));
  const sort=value=>Array.isArray(value)?value.map(sort):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,sort(value[k])])):value;
  verify(sort(doc));
  doc.matches=Object.fromEntries(Object.entries(doc.matches).reverse());verify(doc);
});
