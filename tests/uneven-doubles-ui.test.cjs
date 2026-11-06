// Exercise actual builder/live source with a minimal in-memory DOM. No network or DB writes.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/builder-model.js');
const H = require('../src/builder-history.js');
const source = name => fs.readFileSync(path.join(__dirname, '../src', name), 'utf8');
const players = ['p001', 'p002', 'p003', 'p004'];
const profiles = Object.fromEntries(players.map((id, i) => [id, {name: '선수' + i, gender: i === 0 ? 'female' : 'male'}]));
const state = {date:'2026-11-07', theme:'madara', selected:players, guests:{}, availability:Object.fromEntries(players.map(id => [id, {from:0,to:2}])), quotas:Object.fromEntries(players.map(id => [id,2])), pairs:[], avoidRests:true, repeats:true, fillCourts:false, bonusIds:[], bonusManual:false, allowFixedUnevenDoubles:true};
const input = {date:state.date, theme:state.theme, membershipPeriod:'test', players, fixedPlayerIds:players, profiles:Object.fromEntries(players.map(id => [id, {...profiles[id], memberType:'fixed'}])), quotas:state.quotas, availability:state.availability, lockedPairs:[], avoidConsecutiveRests:true, allowPartnerRepeats:true, allowFixedUnevenDoubles:true};
const rounds = Array.from({length:6}, (_, i) => i < 2 ? [[players[0], players[1]], [players[2], players[3]], [], []] : [[], [], [], []]);
const doc = M.documentOf(M.validateInput(input), rounds);
M.validateDocument(doc);
const theme = {name:'마다라', title:'대포', accent:'테니스', eyebrow:'대포클럽', stylesheet:'theme.css'};
const data = {players:profiles, memberships:{test:{label:'테스트 회차',startsOn:'2026-08-01',endsBefore:'2027-02-01',memberIds:players}}, themes:{club:{...theme,name:'클럽'}, madara:theme}, themePlans:{}, legacyDates:[], staticSchedules:[], firebaseConfig:{}};

const draftKey = 'daepo-builder-draft-v1', previewKey = 'daepo-builder-preview-v1';
function harness(saved = null, preview = null) {
  const elements = new Map(), handlers = {}, storage = new Map();
  if (saved) storage.set(draftKey, JSON.stringify(saved));
  if (preview) storage.set(previewKey, JSON.stringify(preview));
  const element = id => {
    if (!elements.has(id)) elements.set(id, {id, value:'', checked:false, hidden:true, textContent:'', innerHTML:'', dataset:{}, style:{setProperty(){},removeProperty(){}}, addEventListener(){}, scrollIntoView(){},focus(){}});
    return elements.get(id);
  };
  const context = {builderModel:M, builderHistory:H, structuredClone, URL, console,
    location:{href:'http://ui.test/builder/?date=2026-11-07'}, navigator:{onLine:true},
    localStorage:{getItem:key=>storage.get(key)||null, setItem:(key,value)=>storage.set(key,value), removeItem:key=>storage.delete(key)},
    document:{getElementById:element, querySelectorAll:()=>[], body:element('body'), addEventListener:(type,fn)=>handlers[type]=fn},
    window:{addEventListener(){}}, scheduleDeletion:{mount:()=>({})}};
  vm.createContext(context);
  vm.runInContext(source('builder-store.js') + ';builderStore.listen=async()=>()=>{};builderStore.save=async()=>{throw Error("Unexpected write");};', context);
  const script = source('builder.js').replace('__BUILDER_DATA__', JSON.stringify(data)).replace('__WORKER_SOURCE__', '""');
  vm.runInContext(script, context);
  return {context, element, storage, run:code=>vm.runInContext(code,context), change(value){const field=element('allow-fixed-uneven-doubles');field.checked=value;handlers.change({target:field});}, snapshot:()=>JSON.parse(storage.get(draftKey))};
}
test('fresh, old and malformed drafts do not opt into fixed uneven doubles', () => {
  assert.equal(harness().snapshot().allowFixedUnevenDoubles, false);
  for (const flag of [undefined, false, 'true', 1]) {
    const saved=structuredClone(state);
    if(flag===undefined) delete saved.allowFixedUnevenDoubles;else saved.allowFixedUnevenDoubles=flag;
    const h=harness(saved);
    assert.equal(h.element('allow-fixed-uneven-doubles').checked,false);
    assert.equal(h.snapshot().allowFixedUnevenDoubles,false);
    assert.equal(h.snapshot().theme,'madara');
  }
});
test('repeated flag toggles invalidate previews and preserve exact date/theme', () => {
  const h=harness(state);
  assert.equal(h.element('allow-fixed-uneven-doubles').checked,true);
  h.context.fixture=doc;
  for (const value of [false,true,false,true]) {
    h.run('draft=structuredClone(fixture);preview(draft);persist();');
    assert.ok(h.storage.get(previewKey));
    h.change(value);
    assert.equal(h.run('draft'),null);
    assert.equal(h.element('preview').hidden,true);
    assert.equal(h.storage.get(previewKey),undefined);
    assert.equal(h.snapshot().allowFixedUnevenDoubles,value);
    assert.equal(h.snapshot().theme,'madara');
    assert.equal(h.snapshot().date,'2026-11-07');
    assert.equal(h.run('inputOf().allowFixedUnevenDoubles'),value);
  }
});
test('opt-in preview restores only with matching state and counts uneven separately', () => {
  const original=harness(state);original.context.fixture=doc;
  original.run('draft=structuredClone(fixture);preview(draft);persist();');
  const snapshot=JSON.parse(original.storage.get(previewKey));
  const restored=harness(original.snapshot(),snapshot);
  assert.equal(restored.element('preview').hidden,false);
  assert.equal(restored.run('draft.allowFixedUnevenDoubles'),true);
  assert.match(restored.element('preview-summary').textContent,/혼복 0.*잡복 2/);
  assert.match(restored.element('preview-players').innerHTML,/혼복 0.*잡복 2/);
  assert.equal((restored.element('preview-rounds').innerHTML.match(/층 · 잡복/g)||[]).length,2);
  const changed={...original.snapshot(),allowFixedUnevenDoubles:false};
  const rejected=harness(changed,snapshot);
  assert.equal(rejected.run('draft'),null);
  assert.equal(rejected.element('allow-fixed-uneven-doubles').checked,false);
});
test('live full and individual views use uneven tags and separate counts', () => {
  const h=harness(state);h.context.fixture=doc;h.context.startScores=()=>{};
  h.context.history={replaceState(){}};
  h.context.document.querySelector=()=>h.element('hero');
  const script=source('live-schedule.js').replace('__LIVE_DATA__',JSON.stringify(data)).replace('const deletionControl=', 'const liveDeletionControl=').replace(/load\(\);\s*$/, '');
  vm.runInContext(script,h.context);
  h.run('mount(fixture)');
  const html=h.element('live-content').innerHTML;
  assert.match(html,/혼복 0 · 여복 0 · 잡복 2/);
  assert.match(html,/class="tag tag-uneven">잡복/);
  assert.doesNotMatch(html,/tag-mixed|tag-undefined/);
  assert.match(h.run('personal("p001")'),/혼복 0 · 여복 0 · 잡복 2/);
});
