const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/builder-model.js');
const S = require('../src/builder-scheduler.js');
const H = require('../src/builder-history.js');
function seed(n) { return () => ((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296); }
function input() {
  const profiles=structuredClone(require('../data/players.json'));
  profiles['guest-2026-10-31-01']={name:'테스트 게스트',gender:'male',memberType:'guest'};
  const players=Object.keys(profiles);
  return {date:'2026-10-31',membershipPeriod:'current-members',theme:'club',players,profiles,fixedPlayerIds:players.filter(id=>id.startsWith('p')),
    quotas:Object.fromEntries(players.map(id=>[id,4])),availability:Object.fromEntries(players.map(id=>[id,{from:0,to:6}])),lockedPairs:[],allowPartnerRepeats:false,avoidConsecutiveRests:true};
}
test('bounded candidate comparison never selects worse than its first feasible draw',()=>{
  const data=input();
  const first=S.generate(data,{random:seed(12),budgetMs:4000,maxCandidates:1});
  const best=S.generate(data,{random:seed(12),budgetMs:4000,maxCandidates:12});
  M.validateDocument(best);
  assert.ok(best.quality.candidates>1);
  assert.ok(!S.better(first.quality,best.quality));
  assert.ok(best.quality.attemptedCandidates<=12);
  assert.equal(first.quality.attemptedCandidates,1);
});
test('cross-week history influences partner and opponent selection without becoming a hard ban',()=>{
  const data=input();
  const previous=S.generate(data,{random:seed(7),budgetMs:4000,maxCandidates:1});
  previous.date='2026-10-24';
  const history=H.combine([], [previous], {profiles:data.profiles,targetDate:data.date,liveStatus:'available'});
  const neutral=S.generate(data,{random:seed(7),budgetMs:4000,maxCandidates:1});
  const informed=S.generate({...data,history},{random:seed(7),budgetMs:4000,maxCandidates:1});
  M.validateDocument(informed);
  const costs=H.analyze(data,history);
  const pairCost=doc=>Object.values(doc.matches).reduce((sum,m)=>sum+[m.teamA,m.teamB].reduce((n,p)=>n+(costs.partner[M.key(p)]||0),0),0);
  const opponentCost=doc=>Object.values(doc.matches).reduce((sum,m)=>sum+m.teamA.reduce((n,a)=>n+m.teamB.reduce((k,b)=>k+(costs.opponent[M.key([a,b])]||0),0),0),0);
  assert.ok(pairCost(informed)<pairCost(neutral));
  assert.ok(opponentCost(informed)<opponentCost(neutral));
  assert.equal(informed.quality.historyCoverage.count,1);
});
test('forced attendance runs are reported separately, not presented as avoidable failure',()=>{
  const data=input();data.availability.p001.to=4;
  const doc=S.generate(data,{random:seed(3),budgetMs:4000,maxCandidates:2});
  M.validateDocument(doc);
  assert.ok(doc.quality.forcedLongRuns>=2);
  assert.equal(doc.floorPlan.p001.filter(Boolean).length,4);
});
test('fifth-game draw rotates away from eligible members who recently received it',()=>{
  const data=input();const guest=data.players.pop();delete data.profiles[guest];delete data.quotas[guest];delete data.availability[guest];
  const old=M.fillCourts(data,{random:seed(3)});
  const previous=S.generate({...data,quotas:old.quotas},{random:seed(7),budgetMs:4000,maxCandidates:1});previous.date='2026-10-24';
  const history=H.combine([], [previous], {profiles:data.profiles,targetDate:data.date,liveStatus:'available'});
  const fresh=M.fillCourts({...data,history},{random:seed(3)});
  assert.equal(fresh.bonusIds.length,4);
  assert.ok(fresh.bonusIds.every(id=>!old.bonusIds.includes(id)));
  assert.deepEqual(M.fillCourts({...data,history,preferredBonusIds:fresh.bonusIds},{random:seed(17)}).bonusIds,fresh.bonusIds);
});
