// Local emulator only: no production endpoint, credentials, or real match writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {document:witness}=require('./guest-identity-fixture.cjs');
const periods=require('../data/memberships.json');
const origin='http://127.0.0.1:8089',root='projects/demo-daepo/databases/(default)/documents';
const value=x=>x===null?{nullValue:null}:Array.isArray(x)?{arrayValue:{values:x.map(value)}}:typeof x==='object'?{mapValue:{fields:fields(x)}}:typeof x==='boolean'?{booleanValue:x}:typeof x==='number'?{integerValue:String(x)}:{stringValue:x};
const fields=x=>Object.fromEntries(Object.entries(x).map(([k,v])=>[k,value(v)]));
async function create(path,data,timestamp='createdAt'){
 const write={update:{name:root+'/'+path,fields:fields(data)},currentDocument:{exists:false}};
 if(timestamp)write.updateTransforms=[{fieldPath:timestamp,setToServerValue:'REQUEST_TIME'}];
 const r=await fetch(origin+'/v1/'+root+':commit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({writes:[write]})});return{ok:r.ok,body:await r.json()};
}
async function draft(doc){const id=crypto.randomBytes(10).toString('hex'),r=await create('scheduleDrafts/'+id,doc);assert.ok(r.ok,JSON.stringify(r));return id;}
async function proof(id,key,expected=true){const r=await create('scheduleDrafts/'+id+'/validation/'+key,{date:'2026-11-14'});assert.equal(r.ok,expected,key+':'+JSON.stringify(r));}
(async()=>{
 const rules=fs.readFileSync('firebase/firestore.rules','utf8');
 const loaded=await fetch(origin+'/emulator/v1/projects/demo-daepo:securityRules',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({rules:{files:[{name:'firestore.rules',content:rules}]}})});
 const compilation=await loaded.json();assert.ok(loaded.ok && !(compilation.issues||[]).some(i=>i.severity==='ERROR'),JSON.stringify(compilation));
 assert.ok((await fetch(origin+'/emulator/v1/projects/demo-daepo/databases/(default)/documents',{method:'DELETE'})).ok);
 const doc=witness(),period=doc.membershipPeriod;
 assert.ok((await create('membershipPeriods/'+period,{period,...periods[period]},'updatedAt')).ok);
 const id=await draft(doc);
 for(const key of ['structure',...Array.from({length:16},(_,i)=>'p'+(i+1)),...Array.from({length:12},(_,i)=>'m'+(i+1)),'l1','l2','players1','players2','matches1','matches2','roster','rounds','locks'])await proof(id,key);
 assert.ok((await create('schedules/'+doc.date,{...doc,sourceDraftId:id})).ok,'homonym publication denied');
 const match=doc.matches['r1-f1'],result={...match,sourceDraftId:id,scoreA:6,scoreB:4,outcome:'teamA'};
 assert.ok((await create('schedules/'+doc.date+'/matchResults/r1-f1',result,'updatedAt')).ok,'homonym score denied');
 // Duplicate names are allowed, duplicate IDs and profile impersonation still fail.
 let bad=witness();bad.players[3]='p001';assert.equal((await create('scheduleDrafts/'+crypto.randomBytes(10).toString('hex'),bad)).ok,false);
 bad=witness();bad.profiles.p001.name='다른 이름';await proof(await draft(bad),'p1',false);
 bad=witness();bad.playerNames[0]='다른 이름';await proof(await draft(bad),'p1',false);
 bad=witness();bad.fixedPlayerIds.push('guest-2026-11-14-01');await proof(await draft(bad),'p4',false);
 const forged={...result,...doc.matches['r3-f1'],fixedPlayerIds:[...doc.matches['r3-f1'].fixedPlayerIds,'guest-2026-11-14-01']};
 assert.equal((await create('schedules/'+doc.date+'/matchResults/r3-f1',forged,'updatedAt')).ok,false);
 console.log('PASS: identical names publish and save scores under separate IDs; duplicate IDs, spoofed profiles, mismatched names and guest membership rejected. Local demo-daepo only.');
})().catch(error=>{console.error(error);process.exit(1)});
