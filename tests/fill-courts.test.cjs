const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/builder-model.js');
const S = require('../src/builder-scheduler.js');
const registry = require('../data/players.json');
function seed(value) { let n = value; return () => ((n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296); }
function input(ids = Object.keys(registry)) {
  return { date: '2026-10-17', membershipPeriod: 'current-members', theme: 'geto', players: ids, fixedPlayerIds: [...ids],
    profiles: Object.fromEntries(ids.map(id => [id, structuredClone(registry[id])])), quotas: Object.fromEntries(ids.map(id => [id, 4])),
    availability: Object.fromEntries(ids.map(id => [id, {from:0,to:6}])), lockedPairs: [], allowPartnerRepeats:false, avoidConsecutiveRests:true };
}
function fill(data, n = 3) { return M.fillCourts(data, {random:seed(n)}); }
function generate(data, n = 7) { return S.generate(data, {random:seed(n),budgetMs:5000}); }
function addGuest(data) {
  const id='guest-2026-10-17-01';data.players.push(id);data.profiles[id]={name:'게스트',gender:'male',memberType:'guest'};
  data.quotas[id]=4;data.availability[id]={from:0,to:6};return id;
}
function pairGames(doc,pair) { return doc.teamKeys.filter(k=>k===M.key(pair)).length; }
test('eleven current members fill both courts with four randomly chosen bonus games', () => {
  const data=input(), original=structuredClone(data), result=fill(data);
  assert.deepEqual(data,original);assert.equal(result.unfilledSlots,0);assert.equal(result.reason,'');assert.equal(result.bonusIds.length,4);
  assert.equal(Object.values(result.quotas).filter(q=>q===5).length,4);assert.deepEqual(fill(data),result);
  const doc=generate({...data,quotas:result.quotas});M.validateDocument(doc);
  assert.equal(Object.keys(doc.matches).length,12);assert.ok(Object.values(doc.roundParticipants).every(row=>row.length===8));
  assert.ok(Object.values(M.summary(doc).rows).every(row=>row.floorChanges<=2));
  assert.notDeepEqual(fill(data,9).bonusIds,result.bonusIds);
});
test('ten members need eight bonus games; five-game runs remain valid', () => {
  const data=input(Object.keys(registry).filter(id=>id!=='p002')),result=fill(data,9);
  assert.equal(result.bonusIds.length,8);assert.equal(result.unfilledSlots,0);
  const doc=generate({...data,quotas:result.quotas},11);M.validateDocument(doc);assert.equal(Object.keys(doc.matches).length,12);
});
test('guests and former members never receive a fifth game', () => {
  const data=input(Object.keys(registry).filter(id=>id!=='p002'&&id!=='p003'));const guest=addGuest(data);
  data.fixedPlayerIds=data.fixedPlayerIds.filter(id=>id!=='p001');data.profiles.p001.memberType='guest';
  const result=fill(data);assert.equal(result.quotas[guest],4);assert.equal(result.quotas.p001,4);assert.equal(result.bonusIds.length,8);assert.equal(result.unfilledSlots,0);
  assert.ok(result.bonusIds.every(id=>data.fixedPlayerIds.includes(id)));
});
test('scarce fixed members and early departures leave a clear empty-court count', () => {
  const data=input(Object.keys(registry).filter(id=>id!=='p002'&&id!=='p003'));const guest=addGuest(data);
  data.availability.p001.to=4;data.availability.p004.to=4;data.eligibleIds=data.players.filter(id=>id!=='p005');
  const result=fill(data);assert.equal(result.quotas[guest],4);assert.equal(result.quotas.p001,4);assert.equal(result.quotas.p004,4);assert.equal(result.quotas.p005,4);
  assert.equal(result.bonusIds.length,4);assert.equal(result.unfilledSlots,4);assert.match(result.reason,/1개 코트/);
  const doc=generate({...data,quotas:result.quotas});M.validateDocument(doc);assert.equal(Object.keys(doc.matches).length,11);
});
test('at most nine attendees cannot fill 48 slots with five games each', () => {
  const data=input(Object.keys(registry).filter(id=>id!=='p002'&&id!=='p003'));const result=fill(data);
  assert.equal(result.unfilledSlots,4);assert.equal(result.bonusIds.length,8);assert.ok(Object.values(result.quotas).every(q=>q<=5));
});
test('twelve attendees preserve quotas and get no automatic fifth game', () => {
  const data=input();addGuest(data);assert.deepEqual(fill(data).quotas,data.quotas);assert.deepEqual(fill(data).bonusIds,[]);
  data.quotas.p001=5;assert.throws(()=>M.validateInput(data),/12명 미만/);
});
for (const pair of [['p001','p003'],['p001','p007']]) test('ALL fixed pair bonus quota changes together: '+pair.join(','), () => {
  const data=input();data.lockedPairs=[{players:pair,games:'all'}];data.preferredBonusIds=pair;
  const result=fill(data);assert.equal(result.unfilledSlots,0);assert.equal(result.quotas[pair[0]],5);assert.equal(result.quotas[pair[1]],5);
  const doc=generate({...data,quotas:result.quotas},15);M.validateDocument(doc);assert.equal(pairGames(doc,pair),5);
});
test('guest ALL partner prevents bonus for the paired fixed member', () => {
  const data=input(Object.keys(registry).filter(id=>id!=='p002'));const guest=addGuest(data);
  data.lockedPairs=[{players:['p001',guest],games:'all'}];data.preferredBonusIds=['p001'];
  const result=fill(data);assert.equal(result.quotas.p001,4);assert.equal(result.quotas[guest],4);assert.equal(result.unfilledSlots,0);
});
test('manual eligible list and preferred bonuses stay stable across rerenders', () => {
  const data=input();const first=fill(data);data.preferredBonusIds=first.bonusIds;
  assert.deepEqual(fill(data,100).bonusIds,first.bonusIds);
  data.eligibleIds=data.players.filter(id=>id!==first.bonusIds[0]);const next=fill(data,100);
  assert.ok(!next.bonusIds.includes(first.bonusIds[0]));assert.equal(next.bonusIds.length,4);
  assert.equal(next.bonusIds.filter(id=>first.bonusIds.includes(id)).length,3);
});
test('fixed one/two/three-game partner counts survive bonus fill', () => {
  const data=input();data.lockedPairs=[{players:['p001','p007'],games:2},{players:['p001','p003'],games:1}];
  const result=fill(data),doc=generate({...data,quotas:result.quotas},31);M.validateDocument(doc);
  assert.equal(pairGames(doc,['p001','p007']),2);assert.equal(pairGames(doc,['p001','p003']),1);
});
test('model rejects fifth game for guests and a five-game plan with three floor changes', () => {
  const data=input(Object.keys(registry).filter(id=>id!=='p002'));const guest=addGuest(data);data.quotas[guest]=5;
  assert.throws(()=>M.validateInput(data),/고정 회원/);
  const normal=input(), result=fill(normal),doc=generate({...normal,quotas:result.quotas});
  const id=result.bonusIds[0], matches=Object.values(doc.matches).filter(m=>[...m.teamA,...m.teamB].includes(id)).sort((a,b)=>a.round-b.round);
  // Swap entire court positions in selected rounds, preserving matches and quota
  // but giving this player the sequence 1,2,1,2,2 (three changes).
  const floors=[1,2,1,2,2];matches.forEach((m,index)=>{
    if(m.floor===floors[index])return;const other=Object.values(doc.matches).find(o=>o.round===m.round&&o!==m);
    const old=m.floor;delete doc.matches['r'+m.round+'-f'+m.floor];delete doc.matches['r'+other.round+'-f'+other.floor];
    m.floor=floors[index];other.floor=old;doc.matches['r'+m.round+'-f'+m.floor]=m;doc.matches['r'+other.round+'-f'+other.floor]=other;
  });
  const rounds=Array.from({length:6},(_,i)=>[1,2].flatMap(f=>{const m=doc.matches['r'+(i+1)+'-f'+f];return m?[m.teamA,m.teamB]:[[],[]];}));
  const forged=M.documentOf({...normal,quotas:result.quotas},rounds);assert.throws(()=>M.validateDocument(forged),/층 이동/);
});

test('court fill accounts for too few attendees in a particular round', () => {
  const data=input();for (const id of data.players.slice(0,4)) data.availability[id].from=1;
  // Only seven can play the first round, leaving room for at most11matches.
  const result=fill(data);assert.equal(result.bonusIds.length,0);assert.equal(result.unfilledSlots,4);
  const doc=generate({...data,quotas:result.quotas},37);M.validateDocument(doc);assert.equal(Object.keys(doc.matches).length,11);
});
