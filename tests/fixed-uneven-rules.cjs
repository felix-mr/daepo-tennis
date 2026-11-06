// Run manually with the demo-daepo Firestore emulator on 127.0.0.1:8089.
// This test never connects to a production database.
const assert = require('node:assert/strict'), fs = require('node:fs'), crypto = require('node:crypto');
const M = require('../src/builder-model.js'), fixture = require('./fixed-uneven-fixture.cjs');
const origin = 'http://127.0.0.1:8089', root = 'projects/demo-daepo/databases/(default)/documents';
const value = x => x === null ? {nullValue:null} : Array.isArray(x) ? {arrayValue:{values:x.map(value)}}
  : typeof x === 'object' ? {mapValue:{fields:fields(x)}} : typeof x === 'boolean' ? {booleanValue:x}
  : typeof x === 'number' ? {integerValue:String(x)} : {stringValue:x};
const fields = x => Object.fromEntries(Object.entries(x).map(([k,v])=>[k,value(v)]));
async function create(path, data, timestamp='createdAt', seedOnly=false) {
  const write={update:{name:root+'/'+path,fields:fields(data)},currentDocument:{exists:false}};
  if(timestamp)write.updateTransforms=[{fieldPath:timestamp,setToServerValue:'REQUEST_TIME'}];
  const r=await fetch(origin+'/v1/'+root+':commit',{method:'POST',headers:{'Content-Type':'application/json', ...(seedOnly?{Authorization:'Bearer owner'}:{})},body:JSON.stringify({writes:[write]})});
  const body=await r.json();return {ok:r.ok,status:r.status,body};
}
async function draft(doc) { const id=crypto.randomBytes(10).toString('hex'); const r=await create('scheduleDrafts/'+id,doc); assert.ok(r.ok,JSON.stringify(r)); return id; }
async function proof(id,part,expected=true){const r=await create('scheduleDrafts/'+id+'/validation/'+part,{date:fixture.input.date});assert.equal(r.ok,expected,part+':'+JSON.stringify(r));return r;}
const witness = () => M.documentOf(structuredClone(fixture.input),fixture.rounds);
(async()=>{
  const reset=await fetch(origin+'/emulator/v1/projects/demo-daepo/databases/(default)/documents',{method:'DELETE'});assert.ok(reset.ok);
  // Keep every validation function intact; substitute only static fixture lookup maps.
  const fixed=Object.fromEntries(Object.entries(fixture.input.profiles).filter(([id])=>fixture.input.fixedPlayerIds.includes(id)));
  let rules=fs.readFileSync('firebase/firestore.rules','utf8');
  for(const [fn,data] of Object.entries({browserDates:{[fixture.input.date]:fixture.input.membershipPeriod},browserNames:Object.fromEntries(Object.entries(fixed).map(([id,p])=>[id,p.name])),browserGenders:Object.fromEntries(Object.entries(fixed).map(([id,p])=>[id,p.gender]))}))rules=rules.replace(new RegExp('function '+fn+'\\(\\) \\{ return .*?; \\}'),'function '+fn+'() { return '+JSON.stringify(data)+'; }');
  const loaded=await fetch(origin+'/emulator/v1/projects/demo-daepo:securityRules',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({rules:{files:[{name:'firestore.rules',content:rules}]}})});
  const compilation=await loaded.json();assert.ok(loaded.ok && !(compilation.issues||[]).some(i=>i.severity==='ERROR'),JSON.stringify(compilation));
  assert.ok((await create('membershipPeriods/'+fixture.input.membershipPeriod,{period:fixture.input.membershipPeriod,memberIds:fixture.input.fixedPlayerIds,startsOn:'2030-01-01',endsBefore:'2030-04-01'},'updatedAt',true)).ok);
  const doc=witness(), id=await draft(doc);
  await proof(id,'structure');
  for(const p of [...Array.from({length:16},(_,i)=>'p'+(i+1)),...Array.from({length:12},(_,i)=>'m'+(i+1)),'l1','l2','players1','players2','matches1','matches2','roster','rounds','locks'])await proof(id,p);
  assert.ok((await create('schedules/'+doc.date,{...doc,sourceDraftId:id})).ok,'approved publication rejected');
  assert.equal((await create('schedules/'+doc.date,{...doc,sourceDraftId:id})).ok,false,'duplicate publication allowed');
  const uneven=Object.values(doc.matches).find(m=>M.type(m.teamA,m.teamB,doc.profiles,doc)==='잡복'), key='r'+uneven.round+'-f'+uneven.floor, marker='m'+((uneven.round-1)*2+uneven.floor);
  for(const flag of [undefined,false]){const bad=witness();if(flag===undefined)delete bad.allowFixedUnevenDoubles;else bad.allowFixedUnevenDoubles=flag;await proof(await draft(bad),marker,false);}
  const badFlag=witness();badFlag.allowFixedUnevenDoubles='true';assert.equal((await create('scheduleDrafts/'+crypto.randomBytes(10).toString('hex'),badFlag)).ok,false);
  // A synthetic guest in the unequal court must be rejected.
  const guest=witness(), m=guest.matches[key], side=m.teamA.filter(p=>guest.genderPlayers.male.includes(p)).length===2?'teamA':'teamB', old=m[side][0], incoming=guest.players.find(p=>!guest.fixedPlayerIds.includes(p));
  m[side][0]=incoming;m[side].sort();m[side+'Names']=m[side].map(p=>guest.profiles[p].name);m.fixedPlayerIds=[...m.teamA,...m.teamB].filter(p=>guest.fixedPlayerIds.includes(p));
  guest.floorPlan[old][m.round-1]=0;guest.floorPlan[incoming][m.round-1]=m.floor;guest.teamKeys[(m.round-1)*4+(m.floor-1)*2+(side==='teamB'?1:0)]=M.key(m[side]);
  await proof(await draft(guest),marker,false);
  for(const count of [2,3]){const bad=witness(),match=bad.matches[key],mixed=match.teamA.filter(p=>bad.genderPlayers.male.includes(p)).length===1?match.teamA:match.teamB,men=mixed===match.teamA?match.teamB:match.teamA; const changed=count===2?mixed.filter(p=>bad.genderPlayers.male.includes(p)):men; bad.genderPlayers.male=bad.genderPlayers.male.filter(p=>!changed.includes(p));bad.genderPlayers.female.push(...changed);await proof(await draft(bad),marker,false);}
  // A legacy balanced match still passes with no new flag.
  const balanced=witness(), normal=Object.values(doc.matches).find(m=>M.type(m.teamA,m.teamB,doc.profiles,doc)!=='잡복');delete balanced.allowFixedUnevenDoubles;await proof(await draft(balanced),'m'+((normal.round-1)*2+normal.floor));
  console.log('PASS rules compile; all 38 proof markers and approved publication; duplicate, false/absent/string flag, guest, MM-vs-FF and three-women denials; legacy balanced match.');
})().catch(error=>{console.error(error);process.exit(1)});
