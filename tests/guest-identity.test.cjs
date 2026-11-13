const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const M = require('../src/builder-model.js'), H = require('../src/builder-history.js');
const players = require('../data/players.json'), memberships = require('../data/memberships.json');
const source = file => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
const results = vm.runInNewContext(source('results.js') + ';resultModel;');
function harness() {
  const elements = new Map(), handlers = {}, storage = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {id, value:'', checked:false, hidden:true, textContent:'', innerHTML:'', dataset:{}, style:{setProperty(){},removeProperty(){}}, addEventListener:(type,fn)=>handlers[id+':'+type]=fn, scrollIntoView(){},focus(){},setAttribute(){}});
    return elements.get(id);
  };
  const context = {builderModel:M, builderHistory:H, structuredClone, URL, console,
    location:{href:'https://ui.test/builder/?date=2026-11-14'}, navigator:{onLine:true},
    localStorage:{getItem:key=>storage.get(key)||null, setItem:(key,value)=>storage.set(key,value), removeItem:key=>storage.delete(key)},
    document:{getElementById:element,querySelectorAll:()=>[],body:element('body'),addEventListener:(type,fn)=>handlers[type]=fn},
    window:{addEventListener(){}},scheduleDeletion:{mount:()=>({})}};
  vm.createContext(context);
  vm.runInContext(source('builder-store.js') + ';builderStore.listen=async()=>()=>{};builderStore.save=async()=>{throw Error("Unexpected write");};',context);
  vm.runInContext(source('builder.js').replace('__BUILDER_DATA__',JSON.stringify({players,memberships,themes:{club:{name:'클럽'}},themePlans:{},legacyDates:[],staticSchedules:[],firebaseConfig:{}})).replace('__WORKER_SOURCE__','""'),context);
  return {context,element,run:code=>vm.runInContext(code,context),snapshot:()=>JSON.parse(storage.get('daepo-builder-draft-v1')),add(name,gender='male'){element('guest-name').value=name;element('guest-gender').value=gender;handlers['guest-form:submit']({preventDefault(){}});},changeDate(date){element('date').value=date;handlers.change({target:element('date')});}};
}
test('absent fixed member and same-name guest retain separate IDs, gender and selection', () => {
  const h=harness();h.run("state.fillCourts=false;state.selected=state.selected.filter(id=>id!=='p001');render();");
  h.add('서명렬','female');const saved=h.snapshot(), id=Object.keys(saved.guests)[0];
  assert.equal(id,'guest-2026-11-14-01');assert.equal(saved.guests[id].gender,'female');
  assert.equal(saved.selected.includes('p001'),false);assert.equal(saved.selected.includes(id),true);
  assert.equal(h.element('error').hidden,true);assert.equal(players.p001.gender,'male');
  assert.match(h.element('guests').innerHTML,/서명렬 \(게스트\)/);
});
test('same-name attending member and multiple guests are distinct in conditions and pairs', () => {
  const h=harness();h.run('state.fillCourts=false;');h.add('서명렬');h.add('서명렬');
  const saved=h.snapshot(), ids=Object.keys(saved.guests);
  assert.deepEqual(ids,['guest-2026-11-14-01','guest-2026-11-14-02']);
  assert.equal(saved.selected.includes('p001'),true);assert.equal(new Set(saved.selected).size,12);
  assert.match(h.element('pair-a').innerHTML,/서명렬 \(고정멤버\)/);
  assert.match(h.element('pair-a').innerHTML,/서명렬 \(게스트 1\)/);
  assert.match(h.element('pair-a').innerHTML,/서명렬 \(게스트 2\)/);
  assert.match(h.element('player-options').innerHTML,/서명렬 \(게스트 2\)/);
});
test('past member name never silently reuses their identity; date change keeps separate guests', () => {
  const h=harness();h.run('state.fillCourts=false;');h.add('김규석','female');h.add('김규석','male');
  assert.equal(h.snapshot().guests.p010,undefined);
  h.changeDate('2026-11-21');
  assert.deepEqual(Object.keys(h.snapshot().guests),['guest-2026-11-21-01','guest-2026-11-21-02']);
  assert.deepEqual(Object.values(h.snapshot().guests).map(p=>p.gender),['female','male']);
});
const {document}=require('./guest-identity-fixture.cjs');
test('same-name participants generate valid ID-based matches, snapshots and separate statistics', () => {
  const doc=document();assert.doesNotThrow(()=>M.validateDocument(doc));assert.ok(H.normalize(doc));
  assert.equal(M.summary(doc).rows.p001.games,3);assert.equal(M.summary(doc).rows['guest-2026-11-14-01'].games,3);
  const record={...doc.matches['r1-f1'],scoreA:6,scoreB:4,outcome:'teamA'};
  const all=results.aggregate([record]), fixed=results.aggregate([record],players,{fixedOnly:true});
  assert.equal(all.get('p001').wins,1);assert.equal(all.get('guest-2026-11-14-01').losses,1);
  assert.equal(fixed.get('p001').games,1);assert.equal(fixed.has('guest-2026-11-14-01'),false);
  const bad=structuredClone(doc);bad.players[3]='p001';assert.throws(()=>M.validateInput(bad),/참석자/);
  const badName=structuredClone(doc);badName.profiles['guest-2026-11-14-01'].name=' 서명렬 ';assert.throws(()=>M.validateInput(badName),/공백/);
});
test('shared view separates same-name match labels, individual choices and score labels', () => {
  const h=harness(), doc=document();h.context.fixture=doc;h.context.startScores=()=>{};h.context.history={replaceState(){}};h.context.document.querySelector=()=>h.element('hero');
  vm.runInContext(source('live-schedule.js').replace('__LIVE_DATA__',JSON.stringify({themes:{club:{}},firebaseConfig:{}})).replace('const deletionControl=','const liveDeletionControl=').replace(/load\(\);\s*$/,''),h.context);
  h.run('mount(fixture)');
  const html=h.element('live-content').innerHTML;
  assert.match(html,/<option value="p001">서명렬 \(고정멤버\)<\/option>/);
  assert.match(html,/<option value="guest-2026-11-14-01">서명렬 \(게스트\)<\/option>/);
  assert.match(html,/aria-label="서명렬 \(고정멤버\) · 김영진 점수"/);
  assert.match(h.run('personal("guest-2026-11-14-01")'),/서명렬 \(게스트\) 대진표/);
  assert.equal(doc.profiles.p001.name,'서명렬');assert.deepEqual(doc.matches['r1-f1'].teamANames,['서명렬','김영진']);
});
