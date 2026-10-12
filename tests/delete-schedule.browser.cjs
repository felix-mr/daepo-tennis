const fs=require('fs'),assert=require('node:assert/strict');
const path=require('node:path'),{execFileSync}=require('node:child_process');
const runtime=process.env.DAEPO_PLAYWRIGHT_MODULE || path.join(require('node:os').homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {chromium}=require(runtime);
const currentRules=fs.readFileSync('firebase/firestore.rules','utf8');
async function loadRules(content){const response=await fetch('http://127.0.0.1:8089/emulator/v1/projects/demo-daepo:securityRules',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({rules:{files:[{name:'firestore.rules',content}]}})});assert.ok(response.ok);const result=await response.json();assert.ok(!(result.issues||[]).some(issue=>issue.severity==='ERROR'));}
(async()=>{
 await loadRules(execFileSync('git',['show','85685ddb550c15e93ba4480d406cd0734f37df8b:firebase/firestore.rules'],{encoding:'utf8'}));
 let cleared;for(let attempt=0;attempt<3;attempt++){cleared=await fetch('http://127.0.0.1:8089/emulator/v1/projects/demo-daepo/databases/(default)/documents',{method:'DELETE'});if(cleared.ok)break;await new Promise(resolve=>setTimeout(resolve,300));}assert.ok(cleared.ok,'Demo reset failed: '+cleared.status);
 const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-features=LocalNetworkAccessChecks','--disable-gpu']});
 try{
 const context=await browser.newContext({viewport:{width:390,height:844}}),origin='http://127.0.0.1:8768';context.setDefaultTimeout(15000);
 const sdkCache=new Map();await context.route('https://www.gstatic.com/firebasejs/**',async route=>{const url=route.request().url();if(!sdkCache.has(url)){const response=await route.fetch({maxRetries:2});assert.equal(response.status(),200);sdkCache.set(url,await response.text());}await route.fulfill({status:200,contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body:sdkCache.get(url)});});
 await context.route('https://firestore.googleapis.com/**',route=>route.abort());
 await context.route(origin+'/**',async route=>{
  const response=await route.fetch();if(route.request().resourceType()!=='document')return route.fulfill({response});
  let body=await response.text();body=body.replaceAll('"projectId": "daepo-b3b51"','"projectId": "demo-daepo"');
  body=body.replaceAll('f.getFirestore(app.initializeApp(config))','f.initializeFirestore(app.initializeApp(config), {experimentalForceLongPolling:true})');
  body=body.replaceAll('firestore.getFirestore(app.initializeApp(firebaseConfig))','firestore.initializeFirestore(app.initializeApp(firebaseConfig), {experimentalForceLongPolling:true})');
  body=body.replaceAll('firestore.getFirestore(appModule.initializeApp(firebaseConfig))','firestore.initializeFirestore(appModule.initializeApp(firebaseConfig), {experimentalForceLongPolling:true})');
  body=body.replace(/((?:db \|\|=|db \?\?=|const db =) (f|firestore).initializeFirestore\([^\n]+\);)/g,'$1\nif(!window.__qaConnected){$2.connectFirestoreEmulator(db,"127.0.0.1",8089);window.__qaConnected=true;}window.__qaDb=db;window.__qaFirestore=$2;');
  body=body.replace('const builderData =','window.__qaStore=builderStore;const builderData =');
  await route.fulfill({response,body});
 });
 const setup=await context.newPage();await setup.goto(origin+'/setup/');await setup.getByRole('button',{name:'회원 정보·회차 명단 반영'}).click();
 await setup.getByText('회원 11명 추가 · 회차 명단 1개 반영 완료. 기존 회원·기록은 유지됩니다.',{exact:true}).waitFor({timeout:25000});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/builder/?date=2026-09-26');
 await page.getByText('초안은 이 브라우저에 보관 · 확정 후 공유 가능',{exact:true}).waitFor({timeout:25000});
 const M=require('../src/builder-model.js'),S=require('../src/builder-scheduler.js'),profiles=require('../data/players.json'),ids=Object.keys(profiles);
 const input={date:'2026-08-08',membershipPeriod:'current-members',theme:'club',players:ids,fixedPlayerIds:ids,profiles,quotas:Object.fromEntries(ids.map(id=>[id,4])),availability:Object.fromEntries(ids.map(id=>[id,{from:0,to:6}])),lockedPairs:[],avoidConsecutiveRests:true,allowPartnerRepeats:false};
 input.quotas=M.fillCourts(input).quotas;const template=S.generate(input);delete template.searchNodes;
 const rounds=Array.from({length:6},(_,r)=>[1,2].flatMap(f=>{const m=template.matches['r'+(r+1)+'-f'+f];return[m.teamA,m.teamB]}));
 const documentFor=date=>M.documentOf({...input,date},rounds);
 const save=async doc=>page.evaluate(async doc=>{await window.__qaStore.save(window.__qaDb.app.options,doc);const f=window.__qaFirestore;return(await f.getDocFromServer(f.doc(window.__qaDb,'schedules',doc.date))).data();},doc);
 const old=await save(template);
 await page.evaluate(async doc=>{const f=window.__qaFirestore;await f.setDoc(f.doc(window.__qaDb,'schedules',doc.date,'matchResults','r1-f1'),{...doc.matches['r1-f1'],scoreA:6,scoreB:4,outcome:'teamA',updatedAt:f.serverTimestamp()});},old);
 await loadRules(currentRules);
 const oldView=await context.newPage();await oldView.goto(origin+'/schedule/?date=2026-08-08');await oldView.getByText('점수 공유 중 · 누구나 입력·수정 가능',{exact:true}).waitFor({timeout:25000});
 const oldForm=oldView.locator('#full-schedule [data-score-form][data-match="r1-f1"]');await oldForm.locator('[name=scoreA]').fill('6');await oldForm.locator('[name=scoreB]').fill('5');await oldForm.getByRole('button',{name:'점수 저장',exact:true}).click();await oldForm.getByText('저장 완료',{exact:true}).waitFor({timeout:25000});
 const migrated=await page.evaluate(async()=>{const f=window.__qaFirestore;return(await f.getDocFromServer(f.doc(window.__qaDb,'schedules','2026-08-08','matchResults','r1-f1'))).data()});assert.equal(migrated.sourceDraftId,old.sourceDraftId);assert.equal(migrated.scoreB,5);console.log('PASS old-score migration');
 await page.locator('#generate').click();await page.locator('#preview').waitFor({state:'visible',timeout:15000});await page.locator('#confirm').click();await page.getByText('대진 확정 완료. 점수는 확정된 대진표에서 입력하세요.',{exact:true}).waitFor({timeout:25000});await page.waitForFunction(()=>!document.getElementById('delete-schedule').disabled);
 const original=await page.evaluate(async()=>{const f=window.__qaFirestore;return(await f.getDocFromServer(f.doc(window.__qaDb,'schedules','2026-09-26'))).data()});
 const live=await context.newPage();await live.goto(origin+'/schedule/?date=2026-09-26');await live.getByText('점수 공유 중 · 누구나 입력·수정 가능',{exact:true}).waitFor({timeout:25000});
 const hub=await context.newPage();await hub.goto(origin+'/');await hub.locator('.date-card[href*="2026-09-26"]').waitFor();console.log('PASS confirm/live/hub');
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});await page.locator('#delete-schedule').click();await page.locator('.delete-dialog').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.locator('[data-cancel-delete]').click();await page.waitForFunction(()=>document.activeElement?.id==='delete-schedule');}
 await page.setViewportSize({width:390,height:844});await page.locator('#delete-schedule').click();await page.locator('.delete-dialog').waitFor({state:'visible'});await page.keyboard.press('Escape');await page.locator('.delete-dialog').waitFor({state:'hidden'});console.log('PASS modal cancellation/escape');
 const negative=await page.evaluate(async doc=>{
   const f=window.__qaFirestore,db=window.__qaDb;if(db.app.options.projectId!=='demo-daepo')throw Error('Wrong project');
   window.__qaRawDelete=async(doc,mode='normal',score=null)=>{const ref=f.doc(db,'schedules',doc.date);return f.runTransaction(db,async batch=>{await batch.get(ref);for(const part of mode==='one'?['rounds1']:['rounds1','rounds2'])batch.set(f.doc(db,'scheduleDeletions',doc.sourceDraftId,'checks',part),{date:doc.date,sourceDraftId:doc.sourceDraftId,createdAt:mode==='time'?f.Timestamp.now():f.serverTimestamp()});if(mode!=='checksOnly')batch.delete(ref);if(score)batch.set(f.doc(ref,'matchResults',score.id),{...doc.matches[score.id],sourceDraftId:doc.sourceDraftId,scoreA:6,scoreB:4,outcome:'teamA',updatedAt:f.serverTimestamp()});});};
   const results={};for(const [name,action]of Object.entries({direct:()=>f.deleteDoc(f.doc(db,'schedules',doc.date)),one:()=>window.__qaRawDelete(doc,'one'),checksOnly:()=>window.__qaRawDelete(doc,'checksOnly'),time:()=>window.__qaRawDelete(doc,'time'),sameBatchScore:()=>window.__qaRawDelete(doc,'normal',{id:'r1-f1'})})){try{await Promise.race([action(),new Promise((_,reject)=>setTimeout(()=>reject(Object.assign(Error('Negative timeout: '+name),{code:'timeout'})),10000))]);results[name]='allowed'}catch(e){if(e.code==='timeout')throw e;results[name]=e.code}}return results;
 },original);assert.deepEqual(negative,{direct:'permission-denied',one:'permission-denied',checksOnly:'permission-denied',time:'permission-denied',sameBatchScore:'permission-denied'});
 await page.locator('#delete-schedule').click();await page.locator('.delete-dialog').waitFor({state:'visible'});await page.screenshot({path:'output/playwright/delete-confirm-mobile.png',fullPage:true});await page.locator('[data-confirm-delete]').click();await page.locator('.delete-dialog').waitFor({state:'hidden',timeout:25000});await page.waitForFunction(()=>document.activeElement?.id==='generate');
 await live.getByText('2026-09-26 대진표가 삭제됐어요.',{exact:false}).waitFor();assert.equal(await live.locator('[data-score-form]:visible').count(),0);await hub.locator('.date-card[href*="2026-09-26"]').waitFor({state:'detached'});assert.equal(await page.locator('#generate').isEnabled(),true);
 const replacementData={...original};delete replacementData.createdAt;delete replacementData.sourceDraftId;const replacement=await save(replacementData);assert.notEqual(replacement.sourceDraftId,original.sourceDraftId);
 await live.getByText('대진표가 새로 만들어졌어요.',{exact:false}).waitFor();
 const stale=await page.evaluate(async({old,newDoc})=>{const f=window.__qaFirestore,db=window.__qaDb,results={};for(const [name,action]of Object.entries({staleRemove:()=>window.__qaStore.remove(db.app.options,old.date,old.sourceDraftId),staleScore:()=>f.setDoc(f.doc(db,'schedules',old.date,'matchResults','r1-f1'),{...newDoc.matches['r1-f1'],sourceDraftId:old.sourceDraftId,scoreA:6,scoreB:4,outcome:'teamA',updatedAt:f.serverTimestamp()}),missingEpoch:()=>f.setDoc(f.doc(db,'schedules',old.date,'matchResults','r1-f1'),{...newDoc.matches['r1-f1'],scoreA:6,scoreB:4,outcome:'teamA',updatedAt:f.serverTimestamp()})})){try{await action();results[name]='allowed'}catch(e){results[name]=e.code}}return results;},{old:original,newDoc:replacement});assert.deepEqual(stale,{staleRemove:'schedule-changed',staleScore:'permission-denied',missingEpoch:'permission-denied'});
 await page.evaluate(async doc=>window.__qaStore.remove(window.__qaDb.app.options,doc.date,doc.sourceDraftId),replacement);
 const replay=await page.evaluate(async doc=>{const f=window.__qaFirestore;try{await f.setDoc(f.doc(window.__qaDb,'schedules',doc.date),{...doc,createdAt:f.serverTimestamp()});return'allowed'}catch(e){return e.code}},original);assert.equal(replay,'permission-denied');
 const final=await save(replacementData);await page.waitForFunction(()=>document.getElementById('delete-schedule') && !document.getElementById('delete-schedule').disabled);
 await page.locator('#delete-schedule').click();await page.locator('.delete-dialog').waitFor({state:'visible'});
 await page.evaluate(async doc=>{const f=window.__qaFirestore;await f.setDoc(f.doc(window.__qaDb,'schedules',doc.date,'matchResults','r6-f2'),{...doc.matches['r6-f2'],sourceDraftId:doc.sourceDraftId,scoreA:6,scoreB:4,outcome:'teamA',updatedAt:f.serverTimestamp()});},final);
 await page.bringToFront();await page.locator('[data-confirm-delete]').click();await page.getByText('점수가 입력된 대진은 삭제할 수 없습니다. 기존 경기 기록을 유지합니다.',{exact:true}).waitFor();await page.locator('[data-cancel-delete]').click();await page.locator('#delete-schedule').click();await page.locator('#schedule-delete-status').getByText('점수가 입력된 대진은 삭제할 수 없습니다. 기존 경기 기록을 유지합니다.',{exact:true}).waitFor();await page.waitForFunction(()=>document.activeElement?.id==='delete-schedule');
 const dates=['2026-08-01','2026-08-15','2026-08-22','2026-08-29','2026-09-05','2026-09-12','2026-09-19','2026-10-17','2026-10-24','2026-10-31'];
 const middle=Object.keys(template.matches).filter(id=>!['r1-f1','r6-f2'].includes(id));const protectedCases=[{doc:old,id:'r1-f1'},{doc:final,id:'r6-f2'}];
 for(let index=0;index<dates.length;index++){
   let doc=await save(documentFor(dates[index]));const id=middle[index];
   if(index<3){const race=await page.evaluate(async({doc,id})=>{const f=window.__qaFirestore,db=window.__qaDb;const result=await Promise.allSettled([window.__qaRawDelete(doc),f.setDoc(f.doc(db,'schedules',doc.date,'matchResults',id),{...doc.matches[id],sourceDraftId:doc.sourceDraftId,scoreA:6,scoreB:4,outcome:'teamA',updatedAt:f.serverTimestamp()})]);const parent=await f.getDocFromServer(f.doc(db,'schedules',doc.date)),scores=await f.getDocsFromServer(f.collection(db,'schedules',doc.date,'matchResults'));return{outcomes:result.map(r=>r.status),parent:parent.exists(),scores:scores.size};},{doc,id});assert.equal(race.outcomes.filter(s=>s==='fulfilled').length,1);assert.equal(race.parent,race.scores===1);if(!race.parent)doc=await save(documentFor(dates[index]));}
   await page.evaluate(async({doc,id})=>{const f=window.__qaFirestore;await f.setDoc(f.doc(window.__qaDb,'schedules',doc.date,'matchResults',id),{...doc.matches[id],sourceDraftId:doc.sourceDraftId,scoreA:6,scoreB:4,outcome:'teamA',updatedAt:f.serverTimestamp()});},{doc,id});protectedCases.push({doc,id});
 }
 const protectedResults=await page.evaluate(async cases=>{const f=window.__qaFirestore,db=window.__qaDb,result=[];for(const{doc,id}of cases){try{await window.__qaRawDelete(doc);result.push(id+':allowed')}catch(e){if(e.code!=='permission-denied')result.push(id+':'+e.code)}if(!(await f.getDocFromServer(f.doc(db,'schedules',doc.date))).exists())result.push(id+':parent missing');if(!(await f.getDocFromServer(f.doc(db,'schedules',doc.date,'matchResults',id))).exists())result.push(id+':score missing');}return result;},protectedCases);assert.deepEqual(protectedResults,[]);
 const legacyMatch=require('../firebase/schedules.json')['2026-10-10']['r1-f1'];
 const legacy=await page.evaluate(async match=>{
   const f=window.__qaFirestore,db=window.__qaDb,ref=f.doc(db,'schedules','2026-10-10','matchResults','r1-f1');
   await f.setDoc(ref,{...match,scoreA:6,scoreB:4,outcome:'teamA',updatedAt:f.serverTimestamp()});
   await f.updateDoc(ref,{scoreA:3,scoreB:3,outcome:'draw',updatedAt:f.serverTimestamp()});
   const record=(await f.getDocFromServer(ref)).data(),denials=[];
   for(const action of [()=>f.deleteDoc(ref),()=>f.updateDoc(ref,{sourceDraftId:'A'.repeat(20),updatedAt:f.serverTimestamp()})]){
     try{await action();denials.push('allowed')}catch(error){denials.push(error.code)}
   }
   return {outcome:record.outcome,hasEpoch:'sourceDraftId' in record,denials};
 },legacyMatch);assert.deepEqual(legacy,{outcome:'draw',hasEpoch:false,denials:['permission-denied','permission-denied']});
 await page.locator('#date').fill('2026-10-10');await page.locator('#date').dispatchEvent('change');assert.equal(await page.locator('#delete-schedule').count(),0);assert.equal(await page.locator('#generate').isDisabled(),true);
 const rebuilt=await context.newPage();await rebuilt.goto(origin+'/builder/?date=2026-10-24');assert.equal(await rebuilt.locator('#date').inputValue(),'2026-10-24');
 await context.setOffline(true);const offline=await page.evaluate(async doc=>{try{await window.__qaStore.remove(window.__qaDb.app.options,doc.date,doc.sourceDraftId);return'allowed'}catch(e){return e.code}},final);assert.equal(offline,'offline');await context.setOffline(false);
 assert.deepEqual(errors,[]);console.log('PASS delete/cancel/escape/focus/4widths/rebuild/live/hub;old-score migration;12resultslotsprotected;3concurrent races;stale score/delete/replay/offline/archives;5forgedbatches denied.');
 }finally{await browser.close();await loadRules(currentRules)}
})().catch(async error=>{await loadRules(currentRules);console.error(error.stack);process.exit(1)});
