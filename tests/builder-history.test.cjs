const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const H = require('../src/builder-history.js');
const read = path => JSON.parse(fs.readFileSync(path));
const profiles = read('data/players.json');
const staticSchedules = ['03','10','17'].map(d => read('data/schedules/2026-10-' + d + '.json'));
function sample(date = '2026-10-24', women = 2) {
  const players = Array.from({length:8},(_,i) => 'p' + i);
  const profiles = Object.fromEntries(players.map((id,i)=>[id,{name:id,gender:i>=8-women?'female':'male',memberType:'fixed'}]));
  return {date, players,profiles,fixedPlayerIds:players, availability:Object.fromEntries(players.map(id=>[id,{from:0,to:6}])), quotas:Object.fromEntries(players.map(id=>[id,4])),
    matches:{a:{round:1,floor:1,teamA:['p0','p6'],teamB:['p1','p7']},b:{round:1,floor:2,teamA:['p2','p3'],teamB:['p4','p5']}}};
}
test('normalizes all repository static histories, preserving stable IDs and availability',()=>{
  const result=H.prepare(staticSchedules,[],{profiles,targetDate:'2026-10-24'});
  assert.equal(result.schedules.length,3);
  assert.equal(result.schedules[1].availability.p001.to,4);
  assert.equal(result.schedules[1].matches.length,12);
  assert.equal(result.schedules[1].quotas.p001,4);
});
test('deduplicates date in favor of confirmed live and excludes current, future and old dates',()=>{
  const live=H.normalize(staticSchedules[2],profiles); live.profiles.p002.name='live profile';
  const result=H.prepare([...staticSchedules,{...staticSchedules[0],date:'2026-01-03'}, {...staticSchedules[0],date:'2026-10-24'}, {...staticSchedules[0],date:'2026-10-31'}],[live],{profiles,targetDate:'2026-10-24',liveStatus:'available'});
  assert.deepEqual(result.coverage.dates,['2026-10-03','2026-10-10','2026-10-17']);
  assert.equal(result.coverage.liveCount,1);
  assert.equal(result.schedules[2].profiles.p002.name,'live profile');
  assert.equal(result.coverage.liveStatus,'available');
});
test('invalid live record does not erase valid static fallback; unavailable coverage disclosed',()=>{
  const result=H.prepare(staticSchedules,[{date:'2026-10-17',players:[]}],{profiles,targetDate:'2026-10-24',liveStatus:'unavailable'});
  assert.equal(result.schedules.length,3);
  assert.deepEqual(result.coverage.ignoredDates,['2026-10-17']);
  assert.equal(result.coverage.liveStatus,'unavailable');
});
test('partner and opponent history are soft nonzero preferences with unavoidable women opposition exempt',()=>{
  const past=sample(), current={...sample('2026-10-31'),matches:undefined};
  const value=H.analyze(current,[past]);
  assert.ok(value.partner['p0|p6']>0);
  assert.ok(value.opponent['p0|p1']>0);
  assert.equal(value.opponent['p6|p7'],0);
  assert.equal(value.partner['p0|p7'],0);
  assert.ok(value.mixed.p0>0);
});
test('non-overlapping attendance and impossible gender pools do not create opportunities',()=>{
  const input=sample('2026-10-31');input.availability.p0={from:0,to:2};input.availability.p6={from:2,to:6};
  const value=H.analyze(input,[sample()]);
  assert.equal(value.partner['p0|p6'],undefined);
  input.profiles.p7.gender='male';
  assert.equal(H.analyze(input,[sample()]).mixed.p6,0);
});
test('recent encounters weigh more than otherwise identical older encounters',()=>{
  const input=sample('2026-10-31');
  assert.ok(H.analyze(input,[sample('2026-10-24')]).partner['p0|p6']>H.analyze(input,[sample('2026-09-05')]).partner['p0|p6']);
});
test('missed but feasible coattendance normalizes repeated encounter rate',()=>{
  const input=sample('2026-10-31'),other=sample('2026-10-17');
  other.matches.a.teamA=['p0','p7'];other.matches.a.teamB=['p1','p6'];
  const one=H.analyze(input,[sample()]).partner['p0|p6'];
  const two=H.analyze(input,[sample(),other]).partner['p0|p6'];
  assert.ok(two<one);
});
test('guests with the same display name on different dates are never linked',()=>{
  const past=sample(),input=sample('2026-10-31');
  function rename(s,old,id){s.players=s.players.map(x=>x===old?id:x);s.profiles[id]={...s.profiles[old],name:'same guest',memberType:'guest'};delete s.profiles[old];s.availability[id]=s.availability[old];delete s.availability[old];s.fixedPlayerIds=s.fixedPlayerIds.filter(x=>x!==old);for(const m of Object.values(s.matches))for(const t of ['teamA','teamB'])m[t]=m[t].map(x=>x===old?id:x);}
  rename(past,'p6','guest-2026-10-24-01');rename(input,'p6','guest-2026-10-31-01');
  assert.equal(H.analyze(input,[past]).partner['guest-2026-10-31-01|p0'],0);
});
test('bonus rotation only counts historical under-12 eligible fixed-member days',()=>{
  const past=sample();past.matches={};
  for(let r=1;r<=5;r++)past.matches[r]={round:r,floor:1,teamA:['p0','p6'],teamB:['p1','p7']};
  const input=sample('2026-10-31');
  const value=H.analyze(input,[past]);
  assert.ok(value.bonus.p0>0);assert.equal(value.bonus.p2,0);
  past.fixedPlayerIds=past.fixedPlayerIds.filter(id=>id!=='p0');
  assert.equal(H.analyze(input,[past]).bonus.p0,0);
});
test('empty history is neutral and current target history is excluded again at analysis',()=>{
  const input=sample();const empty=H.analyze(input,[]),current=H.analyze(input,[sample()]);
  assert.equal(empty.coverage.count,0);assert.equal(current.partner['p0|p6'],0);
});
test('malformed records are ignored safely without discarding valid dates',()=>{
  for(const bad of [{matches:7},{matches:null},{matches:{a:null}},{rounds:[null]},{fixedPlayerIds:'bad'},{availability:{p0:null}}]) {
    const raw={...sample(),...bad};
    if(bad.availability)raw.availability={...sample().availability,...bad.availability};
    assert.doesNotThrow(()=>H.normalize(raw));
    assert.doesNotThrow(()=>H.prepare([raw],[],{targetDate:'2026-10-31'}));
  }
});
test('reusing a history payload for an earlier target recomputes coverage and sources',()=>{
  const first=H.prepare(staticSchedules,[H.normalize(staticSchedules[2],profiles)],{profiles,targetDate:'2026-10-24',liveStatus:'available'});
  const input={...sample('2026-10-17'),profiles:{...profiles,...sample().profiles}};
  const coverage=H.analyze(input,first).coverage;
  assert.equal(coverage.count,2);assert.equal(coverage.staticCount,2);assert.equal(coverage.liveCount,0);
  assert.deepEqual(coverage.dates,['2026-10-03','2026-10-10']);
});
