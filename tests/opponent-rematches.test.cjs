const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/builder-model.js');
const S = require('../src/builder-scheduler.js');
const emptyHistory = {partner:{}, opponent:{}, mixed:{}};
const players = ['p001','p002','p003','p004'];
function fixture(genders, games, split, allowFixedUnevenDoubles = false) {
  const input = M.validateInput({
    date:'2026-11-21', membershipPeriod:'test', theme:'club', players, fixedPlayerIds:players,
    profiles:Object.fromEntries(players.map((id,i) => [id,{name:'테스트'+i,gender:genders[i],memberType:'fixed'}])),
    quotas:Object.fromEntries(players.map(id => [id,games])),
    availability:Object.fromEntries(players.map(id => [id,{from:0,to:games}])),
    lockedPairs:[], avoidConsecutiveRests:false, allowPartnerRepeats:true, allowFixedUnevenDoubles,
  });
  const rows = Array.from({length:6}, (_,i) => i < games ?
    (split && i%2 ? [[players[0],players[3]],[players[2],players[1]],[],[]]
      : [[players[0],players[1]],[players[2],players[3]],[],[]]) : [[],[],[],[]]);
  return M.validateDocument(M.documentOf(input, rows));
}
test('warns at total 3 meetings, counts one each per match, and never counts teammates', () => {
  const genders = ['male','male','male','male'];
  assert.deepEqual(M.summary(fixture(genders,2,false)).frequentOpponents, []);
  const warning = M.summary(fixture(genders,3,false)).frequentOpponents;
  assert.equal(warning.length,4);
  assert.ok(warning.every(entry => entry.games === 3 && !entry.forcedMixed));
  assert.ok(warning.some(entry => M.key(entry.players) === 'p001|p003'));
  assert.ok(warning.every(entry => M.key(entry.players) !== 'p001|p002'));
});
test('strengthens candidate score from its third meeting without forbidding the game', () => {
  const genders = ['male','male','male','male'];
  assert.equal(S.quality(fixture(genders,2,false), emptyHistory).historyDiversityCost,10);
  assert.equal(S.quality(fixture(genders,3,false), emptyHistory).historyDiversityCost,50);
  const concentrated = S.quality(fixture(genders,4,false),emptyHistory);
  const spread = S.quality(fixture(genders,4,true),emptyHistory);
  assert.ok(S.better(spread, concentrated));
});
test('two female players can still meet in four mixed matches and are labeled structural', () => {
  const doc=fixture(['female','male','female','male'],4,true,true);
  assert.equal(M.forcedMixedOpponentKey(doc),'p001|p003');
  assert.deepEqual(M.summary(doc).frequentOpponents.find(entry => M.key(entry.players)==='p001|p003'),
    {players:['p001','p003'],games:4,forcedMixed:true});
  const built=S.generate(doc,{random:()=>0.4,maxCandidates:1,budgetMs:4000});
  M.validateDocument(built);
  assert.ok(M.summary(built).frequentOpponents.some(entry=>entry.forcedMixed && entry.games===4));
});
test('does not make a structural claim if fixed uneven doubles may provide alternatives', () => {
  const doc=fixture(['female','male','female','male'],3,true,true);
  const extra='p005';
  const mayPlayUneven={...doc,players:[...doc.players,extra],fixedPlayerIds:[...doc.fixedPlayerIds,extra],
    profiles:{...doc.profiles,[extra]:{name:'추가',gender:'male',memberType:'fixed'}}};
  assert.equal(M.forcedMixedOpponentKey(mayPlayUneven),null);
});
