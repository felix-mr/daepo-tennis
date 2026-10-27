const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const M = require('../src/builder-model.js');
const S = require('../src/builder-scheduler.js');
const context = {builderModel: M, structuredClone};
vm.createContext(context);
vm.runInContext(fs.readFileSync(require.resolve('../src/builder-store.js'), 'utf8') + '\nthis.store = builderStore;', context);
const store = context.store;
const profiles = structuredClone(require('../data/players.json'));
profiles['guest-2026-10-24-01'] = {name:'테스트', gender:'male', memberType:'guest'};
const players = Object.keys(profiles);
const input = {date:'2026-10-24', membershipPeriod:'current-members', theme:'club', players,
  fixedPlayerIds: players.filter(id=>id.startsWith('p')), profiles,
  quotas:Object.fromEntries(players.map(id=>[id,4])), availability:Object.fromEntries(players.map(id=>[id,{from:0,to:6}])),
  lockedPairs:[], avoidConsecutiveRests:true, allowPartnerRepeats:false};
let n=7;
const doc = S.generate(input,{random:()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296),budgetMs:1500,maxCandidates:1});
const state = {date:input.date,selected:players,bonusIds:[]};
test('unconfirmed preview survives a JSON storage round trip',()=>{
  const snapshot=JSON.parse(JSON.stringify(store.snapshotOf(state,doc)));
  assert.deepEqual(store.recoverSnapshot(snapshot,state,input),doc);
});
test('preview never restores for changed editor state, constraints or roster',()=>{
  const snapshot=store.snapshotOf(state,doc);
  assert.equal(store.recoverSnapshot(snapshot,{...state,date:'2026-10-31'},input),null);
  assert.equal(store.recoverSnapshot(snapshot,state,{...input,allowPartnerRepeats:true}),null);
  const changed=structuredClone(input); changed.profiles.p001.name='변경된 이름';
  assert.equal(store.recoverSnapshot(snapshot,state,changed),null);
});
test('confirmed, malformed and tampered previews do not restore',()=>{
  assert.equal(store.snapshotOf(state,{...doc,sourceDraftId:'confirmed'}),null);
  const snapshot=store.snapshotOf(state,doc);
  assert.equal(store.recoverSnapshot(snapshot,state,input,[doc.date]),null);
  snapshot.document.sourceDraftId='confirmed';
  assert.equal(store.recoverSnapshot(snapshot,state,input),null);
  delete snapshot.document.sourceDraftId;
  Object.values(snapshot.document.matches)[0].teamA[0]='missing-player';
  assert.equal(store.recoverSnapshot(snapshot,state,input),null);
  assert.equal(store.recoverSnapshot({version:0},state,input),null);
});
test('preview-only diagnostics are stripped before Firestore publication',()=>{
  const source=fs.readFileSync(require.resolve('../src/builder-store.js'),'utf8');
  for(const field of ['searchNodes','quality','history','historyCoverage']) assert.ok(source.includes('delete payload.'+field+';'));
});

test('editor integration restores identical generated preview, edit removes it, confirmed dates suppress it',()=>{
  const storage=new Map();
  const buildData={players:require('../data/players.json'),memberships:require('../data/memberships.json'),themes:{club:{name:'클럽'}},themePlans:{},legacyDates:[],firebaseConfig:{},staticSchedules:[]};
  function boot(live=[],delayWorker=false){
    const fillCalls=[];
    const nodes=new Map(),listeners={};
    const node=id=>{
      if(!nodes.has(id))nodes.set(id,{id,value:'',hidden:id==='preview',textContent:'',innerHTML:'',dataset:{},style:{setProperty(){},removeProperty(){}},addEventListener(){},scrollIntoView(){},focus(){}});
      return nodes.get(id);
    };
    const sandbox={builderModel:{...M,fillCourts:(data,...args)=>{fillCalls.push([...data.preferredBonusIds]);return M.fillCourts(data,...args);}},builderHistory:require('../src/builder-history.js'),
      builderStore:{...store,listen:async(config,success)=>{sandbox.receive=success;return ()=>{};}},
      scheduleDeletion:{mount:()=>({})},structuredClone,URL,Blob,setTimeout,clearTimeout,
      localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
      document:{getElementById:node,querySelectorAll:()=>[],body:node('body'),addEventListener:(name,cb)=>listeners[name]=cb},
      window:{addEventListener(){}},navigator:{onLine:false},location:{href:'http://local/builder/?date=2026-10-24'},
      Worker:class{terminate(){}postMessage(input){const finish=()=>this.onmessage({data:{document:structuredClone(doc)}});if(delayWorker)sandbox.finishWorker=finish;else finish();}}}
    vm.createContext(sandbox);
    const source=fs.readFileSync(require.resolve('../src/builder.js'),'utf8').replace('__BUILDER_DATA__',JSON.stringify(buildData)).replace('__WORKER_SOURCE__','""');
    vm.runInContext(source,sandbox);
    if(live.length)sandbox.receive(live);
    return {sandbox,node,listeners,fillCalls};
  }
  // Use a 12-person editor state matching the validated fixture; avoid random bonus draws.
  const editor={date:input.date,theme:'club',selected:players,guests:{'guest-2026-10-24-01':profiles['guest-2026-10-24-01']},availability:{},quotas:{},pairs:[],avoidRests:true,repeats:false,fillCourts:true,bonusIds:[]};
  storage.set('daepo-builder-draft-v1',JSON.stringify(editor));
  const first=boot(); vm.runInContext('generate()',first.sandbox);
  assert.equal(first.node('preview').hidden,false);
  const rounds=first.node('preview-rounds').innerHTML;
  const restored=boot(); assert.equal(restored.node('preview').hidden,false);
  assert.equal(restored.node('preview-rounds').innerHTML,rounds);
  const confirmed=boot([{...doc,sourceDraftId:'confirmed'}]);
  assert.equal(confirmed.node('preview').hidden,true);
  // Restore again then explicitly edit: stale preview cannot return on next load.
  storage.set('daepo-builder-preview-v1',JSON.stringify(store.snapshotOf(editor,doc)));
  const editing=boot();vm.runInContext('invalidate(); render()',editing.sandbox);
  assert.equal(storage.has('daepo-builder-preview-v1'),false);
  assert.equal(boot().node('preview').hidden,true);
  storage.set('daepo-builder-draft-v1',JSON.stringify(editor));
  const racing=boot([],true); vm.runInContext('generate()',racing.sandbox);
  racing.sandbox.receive([{...doc,sourceDraftId:'confirmed'}]);
  racing.sandbox.finishWorker();
  assert.equal(racing.node('preview').hidden,true,'late worker result must not show a newly confirmed date');
  assert.equal(storage.has('daepo-builder-preview-v1'),false);
  const eleven={...editor,selected:players.slice(0,-1),guests:{},bonusIds:['p001','p002','p003','p004'],bonusManual:false};
  storage.set('daepo-builder-draft-v1',JSON.stringify(eleven));
  const delayed=boot();
  delayed.sandbox.receive([{...doc,date:'2026-10-17'}]);
  assert.equal(delayed.fillCalls.at(-1).length,0, 'new live history must reconsider provisional bonus recipients');
  storage.set('daepo-builder-draft-v1',JSON.stringify({...eleven,bonusManual:true}));
  const deliberate=boot();
  const preserved=JSON.parse(storage.get('daepo-builder-draft-v1')).bonusIds;
  deliberate.sandbox.receive([{...doc,date:'2026-10-17'}]);
  assert.equal(JSON.stringify(deliberate.fillCalls.at(-1)),JSON.stringify(preserved), 'explicit user redraw must not silently change');
});
