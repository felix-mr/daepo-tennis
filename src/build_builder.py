"""Generate builder and live-view pages without rewriting archived schedules."""
import json
from pathlib import Path


def build_builder(root):
    root = Path(root)
    from build_character_themes import build_character_themes
    build_character_themes(root)
    themes = {path.stem: json.loads(path.read_text()) for path in (root / 'themes').glob('*.json')}
    static_dates = set(json.loads((root / 'firebase/schedules.json').read_text()))
    static_dates.update(path.stem for path in (root / 'data/schedules').glob('*.json')
                        if json.loads(path.read_text()).get('display', {}).get('readOnly')
                        and (root / path.stem / 'index.html').is_file())
    data = {
        'players': json.loads((root / 'data/players.json').read_text()),
        'memberships': json.loads((root / 'data/memberships.json').read_text()),
        'themePlans': json.loads((root / 'data/theme-plans.json').read_text()) if (root / 'data/theme-plans.json').exists() else {},
        'themes': themes,
        'legacyDates': sorted(static_dates),
        'staticSchedules': [json.loads(path.read_text()) for path in sorted((root / 'data/schedules').glob('*.json'))],
        'firebaseConfig': json.loads((root / 'firebase/firebase-config.json').read_text()),
    }
    source = lambda name: (root / 'src' / name).read_text()
    model, store = source('builder-model.js'), source('builder-store.js')
    deletion = source('schedule-delete.js')
    history = source('builder-history.js')
    worker = model + '\n' + history + '\n' + source('builder-scheduler.js') + '''
onmessage = event => {
  try { postMessage({ document: builderScheduler.generate(event.data) }); }
  catch (error) { postMessage({ error: error.message }); }
};
'''
    script = model + '\n' + history + '\n' + store + '\n' + deletion + '\n' + source('builder.js').replace('__BUILDER_DATA__', json.dumps(data, ensure_ascii=False)).replace('__WORKER_SOURCE__', json.dumps(worker))
    builder_dir = root / 'builder'
    builder_dir.mkdir(exist_ok=True)
    builder_dir.joinpath('index.html').write_text(source('builder.html').replace('__CSS__', source('builder.css') + '\n' + source('concept-scene.css') + '\n' + source('schedule-delete.css')).replace('__SCRIPT__', script))
    score = source('results.js') + '\n' + source('membership.js') + '\n' + source('scores.js')
    score = score.replace('__MEMBERSHIPS__', json.dumps(data['memberships'], ensure_ascii=False)).replace('__FIREBASE_CONFIG__', 'config').replace('__SCHEDULE_DATE__', 'day').replace('__MATCHES__', 'scoreMatches')
    mount = '\nfunction startScores(config, day, scoreMatches, sourceDraftId) {\n' + score + '\n}\n'
    live_script = model + '\n' + store + '\n' + deletion + '\n' + mount + source('live-schedule.js').replace('__LIVE_DATA__', json.dumps(data, ensure_ascii=False))
    live_css = (root / 'themes/club.css').read_text() + '\n' + source('scores.css') + '\n.lookup select{width:100%;padding:11px;border-radius:10px;border:1px solid var(--line);background:var(--paper);color:var(--ink);font:inherit}.shell>nav{margin-bottom:20px}[hidden]{display:none!important}'
    live_css += '\n' + source('schedule-delete.css')
    live_dir = root / 'schedule'
    live_dir.mkdir(exist_ok=True)
    live_dir.joinpath('index.html').write_text(source('live-schedule.html').replace('__CSS__', live_css).replace('__SCRIPT__', live_script))
    records_path = root / 'records/index.html'
    if records_path.exists():
        import re
        records_script = source('results.js') + '\n' + source('membership.js') + '\n' + source('records.js')
        records_script = records_script.replace('__MEMBERSHIPS__', json.dumps(data['memberships'], ensure_ascii=False)).replace('__FIREBASE_CONFIG__', json.dumps(data['firebaseConfig'])).replace('__PLAYERS__', json.dumps(data['players'], ensure_ascii=False))
        records_page = re.sub(r'<script type="module">[\s\S]*?</script>', lambda _: '<script type="module">'+records_script+'</script>', records_path.read_text())
        records_path.write_text(records_page)
    # Only the date hub receives the new entry points. Archived date files stay untouched.
    hub_path = root / 'index.html'
    if hub_path.exists():
        hub = hub_path.read_text()
        if 'data-builder-launch' not in hub:
            hub = hub.replace('</header>', '<a data-builder-launch class="builder-launch" href="./builder/">대진표 만들기 →</a></header>', 1)
            hub = hub.replace('</style>', '.builder-launch{display:inline-block;margin-top:16px;padding:10px 16px;background:#fff;border-radius:10px;color:#135b43;font-weight:850}.hub-status{font-size:12px;color:#65796f}</style>', 1)
        import re
        hub = re.sub(r'<script type="module" data-live-hub>[\s\S]*?</script>', '', hub)
        if 'data-live-hub' not in hub:
            hub_script = model + '\n' + store + '\nconst hubConfig=' + json.dumps(data['firebaseConfig']) + ''';
const list=document.querySelector('.date-list');
const staticCards=new Map([...list.querySelectorAll('.date-card')].map(card=>[card.getAttribute('href').match(/\\d{4}-\\d{2}-\\d{2}/)[0],card]));
const status=document.createElement('p');status.className='hub-status';status.setAttribute('role','status');list.after(status);
builderStore.listen(hubConfig,documents=>{
  const cards=new Map(staticCards);
  for(const doc of documents){
    if(!builderModel.validDate(doc.date)||doc.schemaVersion!==1||cards.has(doc.date))continue;
    const card=document.createElement('a');card.className='date-card';card.href='./schedule/?date='+encodeURIComponent(doc.date);
    const info=document.createElement('span');info.className='date-info';
    const label=document.createElement('span');label.className='date-label';label.textContent=doc.date+' 토요일';
    const sub=document.createElement('span');sub.className='date-sub';sub.textContent='08:00–11:00 · 확정된 대진';info.append(label,sub);
    const arrow=document.createElement('span');arrow.className='arrow';arrow.textContent='↗';card.append(info,arrow);cards.set(doc.date,card);
  }
  const ordered=[...cards].sort(([a],[b])=>b.localeCompare(a)).map(([,card])=>card);
  for(const card of ordered)card.querySelector('.badge')?.remove();
  if(ordered[0]){const badge=document.createElement('span');badge.className='badge';badge.textContent='최신 대진';ordered[0].querySelector('.date-info').append(badge);}
  list.replaceChildren(...ordered);status.textContent='';
},()=>status.textContent='새로 확정한 대진을 불러오지 못했습니다. 기존 대진은 계속 볼 수 있습니다.').catch(()=>status.textContent='새로 확정한 대진 연결에 실패했습니다.');
'''
            hub = hub.replace('</body>', '<script type="module" data-live-hub>' + hub_script + '</script></body>')
        hub_path.write_text(hub)
    print('builder:', builder_dir)
    print('shared schedule:', live_dir)


if __name__ == '__main__':
    build_builder(Path(__file__).resolve().parents[1])
