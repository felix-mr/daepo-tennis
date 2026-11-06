const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const M = require('../src/builder-model.js'), S = require('../src/builder-scheduler.js'), H = require('../src/builder-history.js');
const fixture = require('./fixed-uneven-fixture.cjs');
const syntheticDocument = () => M.documentOf(structuredClone(fixture.input), fixture.rounds);
const seed = value => () => ((value = (Math.imul(value,1664525)+1013904223) >>> 0) / 4294967296);
test('synthetic schedule retains constrained windows and all twelve quotas, with four fixed-only unequal courts', () => {
  const doc = syntheticDocument(); M.validateDocument(doc);
  assert.equal(doc.allowFixedUnevenDoubles,true);
  assert.equal(M.summary(doc).types['잡복'],4);
  assert.equal(doc.players.length,12);
  assert.ok(Object.values(doc.quotas).every(n=>n===4));
  assert.deepEqual(doc.availability,fixture.input.availability);
  for (const m of Object.values(doc.matches)) if (M.type(m.teamA,m.teamB,doc.profiles,doc)==='잡복') {
    assert.ok([...m.teamA,...m.teamB].every(id=>doc.fixedPlayerIds.includes(id)));
    assert.equal([...m.teamA,...m.teamB].filter(id=>doc.profiles[id].gender==='female').length,1);
  }
});
test('flag absent, false, or nonboolean cannot authorize unequal matches', () => {
  for (const flag of [undefined,false,'true',1,null]) {
    const doc=syntheticDocument(); if(flag===undefined) delete doc.allowFixedUnevenDoubles; else doc.allowFixedUnevenDoubles=flag;
    assert.throws(()=>M.validateDocument(doc)); assert.equal(H.normalize(doc),null);
  }
});
test('classification remains strict without context and rejects guests, three women and MM vs FF', () => {
  const profiles={a:{gender:'male'},b:{gender:'female'},c:{gender:'male'},d:{gender:'male'}};
  const context={allowFixedUnevenDoubles:true,fixedPlayerIds:['a','b','c','d']};
  assert.equal(M.type(['a','b'],['c','d'],profiles),null);
  assert.equal(M.type(['a','b'],['c','d'],profiles,context),'잡복');
  assert.equal(M.type(['c','d'],['a','b'],profiles,context),'잡복');
  assert.equal(M.type(['a','b'],['c','d'],profiles,{...context,fixedPlayerIds:['a','b','c']}),null);
  profiles.c.gender=profiles.d.gender='female';
  assert.equal(M.type(['a','b'],['c','d'],profiles,context),null);
  profiles.b.gender='male';
  assert.equal(M.type(['a','b'],['c','d'],profiles,context),null);
});
test('document snapshot membership controls legality and malformed history is rejected', () => {
  const doc=syntheticDocument(), unequal=Object.values(doc.matches).find(m=>M.type(m.teamA,m.teamB,doc.profiles,doc)==='잡복');
  doc.fixedPlayerIds=doc.fixedPlayerIds.filter(id=>id!==unequal.teamA[0]);
  assert.throws(()=>M.validateDocument(doc)); assert.equal(H.normalize(doc),null);
  const malformed=syntheticDocument();
  const male=[...unequal.teamA,...unequal.teamB].find(id=>malformed.profiles[id].gender==='male');
  malformed.profiles[male].gender='female';
  assert.equal(H.normalize(malformed),null);
});
test('history survives normalization twice without treating unequal matches as balanced mixed', () => {
  const doc=syntheticDocument(), normalized=H.normalize(doc);
  assert.equal(normalized.allowFixedUnevenDoubles,true); assert.ok(H.normalize(normalized));
  const onlyUnequal={...doc,matches:Object.fromEntries(Object.entries(doc.matches).filter(([,m])=>M.type(m.teamA,m.teamB,doc.profiles,doc)==='잡복'))};
  const history=H.analyze({...doc,date:'2030-01-12'},[onlyUnequal]);
  assert.equal(history.coverage.count,1);
  assert.ok(Object.values(history.mixed).every(n=>n===0));
});
test('bounded opt-in generation finds a valid four-unequal variant with synthetic constraints', () => {
  const doc=S.generate(fixture.input,{random:seed(7),budgetMs:6000});
  M.validateDocument(doc); assert.equal(M.summary(doc).types['잡복'],4);
  assert.deepEqual(doc.quotas,fixture.input.quotas); assert.deepEqual(doc.availability,fixture.input.availability);
  assert.equal(doc.quality.unevenDoubles,4);
});
test('unequal count ranks before all prior quality preferences', () => {
  const good={unevenDoubles:0,avoidableLongRuns:100,historyDiversityCost:100,floorChanges:100};
  const bad={unevenDoubles:1,avoidableLongRuns:0,historyDiversityCost:0,floorChanges:0};
  assert.ok(S.better(good,bad)); assert.ok(!S.better(bad,good));
});
test('legacy documents omit flag and previews cannot silently retain opt-in', () => {
  const input={...fixture.input,allowFixedUnevenDoubles:false,availability:Object.fromEntries(fixture.input.players.map(id=>[id,{from:0,to:6}]))};
  const doc=S.generate(input,{random:seed(7),budgetMs:5000,maxCandidates:1});
  assert.equal(Object.hasOwn(doc,'allowFixedUnevenDoubles'),false); M.validateDocument(doc); assert.ok(H.normalize(doc));
  const context={builderModel:M,structuredClone};vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../src/builder-store.js'),'utf8')+'\nthis.store=builderStore;',context);
  const state={date:doc.date}, snapshot=context.store.snapshotOf(state,doc);
  assert.ok(context.store.recoverSnapshot(snapshot,state,input));
  const uneven=syntheticDocument(), unevenSnapshot=context.store.snapshotOf(state,uneven);
  const omitted={...fixture.input}; delete omitted.allowFixedUnevenDoubles;
  assert.equal(context.store.recoverSnapshot(unevenSnapshot,state,omitted),null);
  assert.ok(context.store.recoverSnapshot(unevenSnapshot,state,fixture.input));
});
