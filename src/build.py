import base64
import argparse
import json
from collections import Counter
from datetime import date
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXED_PLAYERS = json.loads((ROOT / "data/players.json").read_text(encoding="utf-8"))
MEMBERSHIPS = json.loads((ROOT / "data/memberships.json").read_text(encoding="utf-8"))
windows = []
for period, membership in MEMBERSHIPS.items():
    assert period and "/" not in period, "회차 ID는 경로 문자를 포함할 수 없습니다"
    assert membership.get("startsOn") and membership.get("endsBefore"), "회원 회차의 실제 시작일과 종료일을 설정해야 합니다"
    start, end = date.fromisoformat(membership["startsOn"]), date.fromisoformat(membership["endsBefore"])
    assert start < end, "회원 회차의 종료일은 시작일보다 뒤여야 합니다"
    windows.append((start, end))
    assert len(membership["memberIds"]) == len(set(membership["memberIds"])), "회차 명단에 중복 ID가 있습니다"
    assert set(membership["memberIds"]) <= set(FIXED_PLAYERS), "회원 프로필이 없는 ID가 있습니다"
windows.sort()
assert all(previous[1] <= following[0] for previous, following in zip(windows, windows[1:])), "회원 회차의 기간이 겹칩니다"
parser = argparse.ArgumentParser(description="대포클럽 날짜별 대진표와 기록 화면 생성")
parser.add_argument("--date", default=max(path.stem for path in (ROOT / "data/schedules").glob("*.json")))
SCHEDULE_DATE = parser.parse_args().date
settings = json.loads((ROOT / f"data/schedules/{SCHEDULE_DATE}.json").read_text(encoding="utf-8"))
assert settings["date"] == SCHEDULE_DATE
PLAYERS = {**FIXED_PLAYERS, **settings.get("guests", {})}
schedule_day = date.fromisoformat(SCHEDULE_DATE)
membership_period = next((period for period, membership in MEMBERSHIPS.items()
                          if membership["startsOn"] <= SCHEDULE_DATE < membership["endsBefore"]), None)
assert membership_period, "경기 날짜에 적용되는 회원 회차를 먼저 등록해야 합니다"
assert schedule_day.weekday() == 5, "대포클럽 일정은 토요일이어야 합니다"
date_label = f"{schedule_day.year}년 {schedule_day.month}월 {schedule_day.day}일 토요일"
theme = json.loads((ROOT / f"themes/{settings['theme']}.json").read_text(encoding="utf-8"))
player_ids = {PLAYERS[pid]["name"]: pid for pid in settings["players"]}
assert len(player_ids) == len(settings["players"]), "동명이인은 표시 이름을 구분해야 합니다"
fixed_ids = set(MEMBERSHIPS[membership_period]["memberIds"])
assert set(settings["fixedPlayers"]) == set(settings["players"]) & fixed_ids, "참석한 고정 멤버를 해당 회차 명단과 대조해야 합니다"
FIXED_MEN = tuple(PLAYERS[pid]["name"] for pid in settings["players"] if pid in fixed_ids and PLAYERS[pid]["gender"] == "male")
GUEST_MEN = tuple(PLAYERS[pid]["name"] for pid in settings["players"] if pid not in fixed_ids and PLAYERS[pid]["gender"] == "male")
FIXED_WOMEN = tuple(PLAYERS[pid]["name"] for pid in settings["players"] if pid in fixed_ids and PLAYERS[pid]["gender"] == "female")
GUEST_WOMEN = tuple(PLAYERS[pid]["name"] for pid in settings["players"] if pid not in fixed_ids and PLAYERS[pid]["gender"] == "female")
MEN = FIXED_MEN + GUEST_MEN
WOMEN = FIXED_WOMEN + GUEST_WOMEN
FIXED_MEMBERS = set(FIXED_MEN + FIXED_WOMEN)
PEOPLE = set(MEN + WOMEN)
ROUNDS = [tuple(tuple(PLAYERS[pid]["name"] for pid in team) for team in round_) for round_ in settings["rounds"]]
conditions = settings["conditions"]
start_minutes = conditions["startMinutes"]
round_minutes = conditions["roundMinutes"]
exceptions = {PLAYERS[pid]["name"] for pid in conditions["consecutiveExceptions"]}
fmt = lambda minute: f"{minute//60:02d}:{minute%60:02d}"
time_notes = [(PLAYERS[pid]["name"], minute, "시작") for pid,minute in conditions["lateArrival"].items()]
time_notes += [(PLAYERS[pid]["name"], minute, "종료") for pid,minute in conditions["earlyDeparture"].items()]
time_notes_html = "".join(f'<span class="hero-note">{escape(name)} {fmt(minute)} {label}</span>' for name,minute,label in time_notes)

def match_type(a, b):
    players = a + b
    males = sum(p in MEN for p in players)
    females = sum(p in WOMEN for p in players)
    if males == 4:
        return "남복"
    if females == 4:
        return "여복"
    assert males == females == 2 and all(sum(p in MEN for p in team) == 1 for team in (a,b)), (a,b)
    return "혼복"

games = Counter()
partners = Counter()
rests = []
types = Counter()
opposed = Counter()
for i, round_ in enumerate(ROUNDS):
    active = [p for team in round_ for p in team]
    assert len(active) == len(set(active)) == 8
    assert set(active) <= PEOPLE
    resting = PEOPLE - set(active)
    assert len(resting) == 4
    if rests:
        assert not (resting & rests[-1]) - exceptions, (i, resting & rests[-1])
    rests.append(resting)
    for floor in range(2):
        a, b = round_[floor*2:floor*2+2]
        types[match_type(a,b)] += 1
        for p in a+b: games[p] += 1
        for team in (a,b): partners[frozenset(team)] += 1
        for p in a:
            for q in b:
                opposed[frozenset((p,q))] += 1

assert len(ROUNDS) == 6 and all(games[p] == conditions["gamesPerPlayer"] for p in PEOPLE)
for p in PEOPLE:
    pattern = "".join("G" if any(p in team for team in round_) else "-" for round_ in ROUNDS)
    assert p in exceptions or "GGGG" not in pattern, (p, pattern)
assert all(n == 1 for n in partners.values())
assert sum(types.values()) == 12
for pair in conditions["requiredPartners"]:
    assert partners[frozenset(PLAYERS[pid]["name"] for pid in pair)] == 1
for pair in conditions["requiredOpponents"]:
    assert opposed[frozenset(PLAYERS[pid]["name"] for pid in pair)] == 1
for pid, minute in conditions["lateArrival"].items():
    name = PLAYERS[pid]["name"]
    active = [i for i,r in enumerate(ROUNDS) if name in sum(r, ())]
    assert start_minutes + min(active)*round_minutes == minute
for pid, minute in conditions["earlyDeparture"].items():
    name = PLAYERS[pid]["name"]
    active = [i for i,r in enumerate(ROUNDS) if name in sum(r, ())]
    assert start_minutes + (max(active)+1)*round_minutes == minute

def active_span(p):
    active_rounds = [i for i, round_ in enumerate(ROUNDS) if any(p in team for team in round_)]
    return min(active_rounds), max(active_rounds)
for pair in conditions["sameActiveSpan"]:
    assert active_span(PLAYERS[pair[0]]["name"]) == active_span(PLAYERS[pair[1]]["name"])
floor_changes = {}
for p in PEOPLE:
    floors = [floor for round_ in ROUNDS for floor in range(2) if p in round_[floor*2] + round_[floor*2+1]]
    floor_changes[p] = sum(a != b for a,b in zip(floors,floors[1:]))
assert max(floor_changes.values()) <= conditions["maxFloorChanges"]

CSS = (ROOT / theme["stylesheet"]).read_text(encoding="utf-8")

CSS += (ROOT / "src/scores.css").read_text(encoding="utf-8")

score_matches = {}
for round_idx, round_ in enumerate(ROUNDS):
    for floor_idx in range(2):
        if not FIXED_MEMBERS.intersection(round_[floor_idx*2] + round_[floor_idx*2+1]):
            continue
        score_matches[f"r{round_idx+1}-f{floor_idx+1}"] = {
            "round": round_idx+1, "floor": floor_idx+1,
            "date": SCHEDULE_DATE,
            "fixedPlayerIds": [player_ids[name] for name in round_[floor_idx*2] + round_[floor_idx*2+1] if name in FIXED_MEMBERS],
            "teamA": [player_ids[name] for name in round_[floor_idx*2]],
            "teamB": [player_ids[name] for name in round_[floor_idx*2+1]],
            "teamANames": list(round_[floor_idx*2]), "teamBNames": list(round_[floor_idx*2+1]),
        }

def score_form(round_idx, floor_idx, reverse=False, personal=False):
    match_id = f"r{round_idx+1}-f{floor_idx+1}"
    if match_id not in score_matches:
        return ""
    match = score_matches[match_id]
    fields = ("B", "A") if reverse else ("A", "B")
    labels = "".join(
        f'<label><span>{escape(" · ".join(match["team"+side+"Names"]))}</span>'
        f'<input name="score{side}" type="number" min="0" max="99" step="1" required inputmode="numeric" '
        f'aria-label="{escape(" · ".join(match["team"+side+"Names"]))} 점수" placeholder="점수"></label>'
        for side in fields
    )
    return f'''<form class="score-form" data-score-form data-match="{match_id}" data-reverse="{str(reverse).lower()}" data-personal-score="{str(personal).lower()}">
      <output class="score-result" data-score-result>저장된 점수 · 미입력</output><span class="score-outcome" data-score-outcome></span>
      <div class="score-fields">{labels}</div>
      <div class="score-actions"><button type="submit" disabled>점수 저장</button><button type="button" data-reset-score hidden>취소</button></div>
      <span class="score-message" data-score-message role="status" aria-live="polite"></span>
    </form>'''

def match_html(round_idx, floor_idx, team_a, team_b):
    typ = match_type(team_a, team_b)
    klass = {"남복":"men", "여복":"women", "혼복":"mixed"}[typ]
    def team_row(team):
        return f'<div class="team-row"><div class="team-name">{escape(team[0])}<span class="sep">·</span>{escape(team[1])}</div></div>'
    return f'''<article class="match floor-{floor_idx+1}">
      <div class="match-head"><div class="floor"><span class="floor-dot"></span>{floor_idx+1}층 코트</div><span class="tag tag-{klass}">{typ}</span></div>
      {team_row(team_a)}
      <div class="versus">VS</div>
      {team_row(team_b)}
      {score_form(round_idx, floor_idx)}
    </article>'''

def round_html(i, round_):
    start = start_minutes + i*round_minutes
    end = start+round_minutes
    fmt = lambda m: f"{m//60:02d}:{m%60:02d}"
    names = "".join(f'<span class="rest-name">{escape(p)}</span>' for p in MEN+WOMEN if p in rests[i])
    return f'''<section class="round" aria-label="{i+1}타임 {fmt(start)}부터 {fmt(end)}까지">
      <div class="round-time"><div class="round-num">ROUND {i+1:02d}</div><div class="clock">{fmt(start)}</div><div class="clock-end">— {fmt(end)}</div></div>
      {match_html(i,0,round_[0],round_[1])}
      {match_html(i,1,round_[2],round_[3])}
      <div class="round-rest"><span class="rest-label">휴식</span>{names}</div>
    </section>'''

rounds_html = "\n".join(round_html(i, r) for i, r in enumerate(ROUNDS))

def flow_row(p, index):
    role = ("고정" if p in FIXED_MEMBERS else "게스트") + (" · 남" if p in MEN else " · 여")
    cells = []
    for i, round_ in enumerate(ROUNDS):
        found = next((floor for floor in range(2) if p in round_[floor*2] + round_[floor*2+1]), None)
        if found is None:
            cells.append('<td class="rest">휴식</td>')
        else:
            typ = match_type(round_[found*2],round_[found*2+1])
            cells.append(f'<td class="play-{found+1}">{found+1}층<small>{typ}</small></td>')
    group_start_indexes = (len(FIXED_MEN), len(MEN), len(MEN) + len(FIXED_WOMEN))
    group_start = ' class="group-start"' if index in group_start_indexes else ''
    return f'<tr{group_start}><th scope="row">{escape(p)}<small>{role}</small></th>{"".join(cells)}</tr>'

flow_headers = "".join(f'<th scope="col">{fmt(start_minutes+i*round_minutes)}<small>{fmt(start_minutes+(i+1)*round_minutes)}까지</small></th>' for i in range(len(ROUNDS)))
flow_rows = "\n".join(flow_row(p, i) for i,p in enumerate(MEN+WOMEN))

def personal_round_html(player, i, round_):
    start = start_minutes + i*round_minutes
    end = start + round_minutes
    time = f'<div class="personal-time"><strong>{start//60:02d}:{start%60:02d}</strong><span>— {end//60:02d}:{end%60:02d}</span></div>'
    for floor in range(2):
        a, b = round_[floor*2:floor*2+2]
        if player not in a+b:
            continue
        own, other = (a,b) if player in a else (b,a)
        partner = next(p for p in own if p != player)
        typ = match_type(a,b)
        klass = {"남복":"men", "여복":"women", "혼복":"mixed"}[typ]
        card = f'''<div class="personal-card floor-{floor+1}">
          <div class="personal-card-top"><span class="floor"><span class="floor-dot"></span>{floor+1}층 코트</span><span class="tag tag-{klass}">{typ}</span></div>
          <div class="personal-versus"><span class="own">{escape(player)} <span class="pair-sep">·</span> {escape(partner)}</span><span class="vs">VS</span><span class="opponent">{escape(other[0])} <span class="pair-sep">·</span> {escape(other[1])}</span></div>
          {score_form(i, floor, player in b, True)}
        </div>'''
        break
    else:
        message = "오늘도 고생하셨습니다!" if i == len(ROUNDS)-1 else "다음 경기를 준비하세요"
        card = f'<div class="personal-card rest-card"><strong>휴식</strong><span>{message}</span></div>'
    return f'<div class="personal-round" aria-label="{i+1}타임">{time}{card}</div>'

def personal_html(player):
    role = "고정멤버" if player in FIXED_MEMBERS else "게스트"
    member_status = "fixed" if player in FIXED_MEMBERS else "guest"
    pid = player_ids[player]
    records_query = f"?player={pid}&period=all" if pid in FIXED_PLAYERS else ""
    records_label = "개인 기록 · 순위 보기" if player in FIXED_MEMBERS else ("고정 멤버 시절 기록 보기" if pid in FIXED_PLAYERS else "고정 멤버 순위 보기")
    rounds = "\n".join(personal_round_html(player, i, r) for i, r in enumerate(ROUNDS))
    return f'''<section class="personal-schedule" data-personal="{escape(player)}" aria-label="{escape(player)} 개인 대진표" hidden>
      <div class="personal-head"><div><h2>{escape(player)} 대진표</h2><p>{fmt(start_minutes)}–{fmt(start_minutes+len(ROUNDS)*round_minutes)} · 경기 {games[player]}회 / 휴식 {len(ROUNDS)-games[player]}회</p></div><button class="all-button" type="button" data-show-all>전체 대진표 보기</button></div>
      <div class="personal-meta"><span>{role}</span><span>층 이동 {floor_changes[player]}회</span><span>{round_minutes}분 × {len(ROUNDS)}타임</span></div>
      <p class="player-summary" data-player-summary="{pid}" data-member-status="{member_status}">기록 연결 중…</p><a class="archive-back" href="../records/{records_query}">{records_label} →</a>
      {rounds}
    </section>'''

personal_sections = "\n".join(personal_html(p) for p in MEN+WOMEN)
lookup_buttons = "\n".join(f'<button type="button" data-select-player="{escape(p)}">{escape(p)}</button>' for p in MEN+WOMEN)
hero_image_data = base64.b64encode((ROOT / theme["heroImage"]).read_bytes()).decode("ascii") if theme["heroImage"] else ""
hero_art = f'<img class="hero-art" src="data:image/webp;base64,{hero_image_data}" alt="{escape(theme["heroAlt"])}">' if hero_image_data else ""
score_script = (ROOT / "src/results.js").read_text(encoding="utf-8") + "\n" + (ROOT / "src/membership.js").read_text(encoding="utf-8") + "\n" + (ROOT / "src/scores.js").read_text(encoding="utf-8")
score_script = score_script.replace("__MEMBERSHIPS__", json.dumps(MEMBERSHIPS, ensure_ascii=False))
score_script = score_script.replace("__FIREBASE_CONFIG__", (ROOT / "firebase/firebase-config.json").read_text(encoding="utf-8"))
score_script = score_script.replace("__SCHEDULE_DATE__", json.dumps(SCHEDULE_DATE))
score_script = score_script.replace("__MATCHES__", json.dumps(score_matches, ensure_ascii=False))
html = f'''<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#141420">
  <meta name="robots" content="noindex,nofollow">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23141420'/%3E%3Ccircle cx='32' cy='32' r='18' fill='%23f85b79'/%3E%3Cpath d='M18 20q23 11 28 28M21 48q17-20 23-31' fill='none' stroke='%23ffe9ef' stroke-width='3'/%3E%3C/svg%3E">
  <title>대포클럽 {date_label} 대진표</title>
  <style>{CSS}</style>
</head>
<body>
<div class="shell">
  <section class="lookup" aria-label="내 대진 찾기">
    <div class="lookup-head"><div><h2>대포클럽 · 내 대진 찾기</h2><p>{date_label} · 이름 입력 후 선택하면 내 경기와 휴식만 표시됩니다.</p></div><div class="page-links"><a class="archive-back" href="../">← 날짜별 목록</a><a class="archive-back" href="../records/">기록 · 순위 →</a></div></div>
    <label class="lookup-input-wrap" for="player-search"><span class="lookup-icon" aria-hidden="true">⌕</span><input id="player-search" type="search" aria-label="선수 이름 검색" placeholder="이름 검색 · 예: 서명렬" autocomplete="off" aria-controls="player-results"></label>
    <div class="lookup-results" id="player-results" aria-live="polite" hidden>{lookup_buttons}</div>
    <p class="lookup-empty" id="player-empty" role="status" hidden>일치하는 이름이 없습니다.</p>
  </section>
  <section class="score-connection" aria-label="점수 공유 상태"><p id="score-connection-status" role="status" aria-live="polite">점수 연결 중…</p><button id="score-retry" type="button" hidden>다시 연결</button></section>
  <header class="hero">
    <div class="topline"><div class="eyebrow">{escape(theme["eyebrow"])}</div><button class="print" type="button" onclick="window.print()">인쇄 / PDF 저장</button></div>
    <h1>{escape(theme["title"])}<br><span class="accent">{escape(theme["accent"])}</span></h1>
    <p class="subtitle">{date_label} &nbsp;·&nbsp; {fmt(start_minutes)} — {fmt(start_minutes+len(ROUNDS)*round_minutes)} &nbsp;·&nbsp; 1층 / 2층 코트</p>
    <div class="hero-bottom"><div class="hero-notes">{time_notes_html}</div><div class="metrics"><div class="metric"><strong>12</strong><span>참가 인원</span></div><div class="metric"><strong>6</strong><span>타임</span></div><div class="metric"><strong>12</strong><span>경기</span></div></div></div>
    {hero_art}
  </header>
  <main id="full-schedule">
    <div class="section-head"><div><h2>경기 일정</h2><p>타임별 코트와 휴식 명단</p></div><div class="legend"><span class="tag tag-men">남복 {types["남복"]}</span><span class="tag tag-mixed">혼복 {types["혼복"]}</span><span class="tag tag-women">여복 {types["여복"]}</span></div></div>
    {rounds_html}
    <section class="flow-section" aria-label="선수별 타임테이블">
      <div class="section-head"><div><h2>선수별 타임테이블</h2><p>각자 언제 경기하고 쉬는지 한눈에 확인 · 휴대폰에서는 표를 좌우로 밀어보기</p></div><div class="legend"><span class="tag tag-mixed">1층 경기</span><span class="tag tag-women">2층 경기</span><span class="tag tag-men">휴식</span></div></div>
      <div class="flow-scroll"><table class="flow"><thead><tr><th scope="col">선수<small>4경기 · 2휴식</small></th>{flow_headers}</tr></thead><tbody>{flow_rows}</tbody></table></div>
    </section>
  </main>
  <main id="personal-schedules" hidden>{personal_sections}</main>
  <footer class="footer"><span><strong>대포클럽</strong> · {date_label} 복식 대진표</span><span>각 타임 {round_minutes}분 · 1층 / 2층 동시 진행</span></footer>
</div>
<script>
(() => {{
  const input = document.getElementById('player-search');
  const results = document.getElementById('player-results');
  const empty = document.getElementById('player-empty');
  const hero = document.querySelector('.hero');
  const full = document.getElementById('full-schedule');
  const personal = document.getElementById('personal-schedules');
  const buttons = [...results.querySelectorAll('[data-select-player]')];
  const sections = [...personal.querySelectorAll('[data-personal]')];
  const names = buttons.map(button => button.dataset.selectPlayer);

  function updateUrl(name) {{
    const url = new URL(window.location.href);
    if (name) url.searchParams.set('player', name);
    else url.searchParams.delete('player');
    window.history.replaceState(null, '', url);
  }}

  function showAll(update = true) {{
    hero.hidden = false;
    full.hidden = false;
    personal.hidden = true;
    sections.forEach(section => section.hidden = true);
    if (update) updateUrl('');
  }}

  function select(name, update = true) {{
    const section = sections.find(item => item.dataset.personal === name);
    if (!section) return;
    input.value = name;
    hero.hidden = true;
    full.hidden = true;
    personal.hidden = false;
    sections.forEach(item => item.hidden = item !== section);
    results.hidden = true;
    empty.hidden = true;
    if (update) updateUrl(name);
  }}

  input.addEventListener('input', () => {{
    const query = input.value.trim().replaceAll(' ', '');
    if (names.includes(query)) {{ select(query); return; }}
    showAll();
    const matches = buttons.filter(button => button.dataset.selectPlayer.includes(query));
    buttons.forEach(button => button.hidden = !matches.includes(button));
    results.hidden = !query || matches.length === 0;
    empty.hidden = !query || matches.length !== 0;
  }});
  input.addEventListener('keydown', event => {{
    if (event.key !== 'Enter') return;
    const visible = buttons.filter(button => !button.hidden);
    if (visible.length === 1) {{ event.preventDefault(); select(visible[0].dataset.selectPlayer); }}
  }});
  results.addEventListener('click', event => {{
    const button = event.target.closest('[data-select-player]');
    if (button) select(button.dataset.selectPlayer);
  }});
  personal.addEventListener('click', event => {{
    if (!event.target.closest('[data-show-all]')) return;
    input.value = '';
    showAll();
    results.hidden = true;
    input.focus();
  }});
  const initial = new URL(window.location.href).searchParams.get('player');
  if (initial && names.includes(initial)) select(initial, false);
}})();
</script>
<script type="module">{score_script}</script>
</body>
</html>
'''
dated_target = ROOT / SCHEDULE_DATE / "index.html"
dated_target.parent.mkdir(parents=True, exist_ok=True)
dated_target.write_text(html, encoding="utf-8")

from firebase_rules import write_rules
write_rules(ROOT, SCHEDULE_DATE, score_matches)

archive_dates = {SCHEDULE_DATE}
for directory in ROOT.iterdir():
    if not directory.is_dir() or not (directory / "index.html").is_file():
        continue
    try:
        archived_day = date.fromisoformat(directory.name)
    except ValueError:
        continue
    if archived_day.weekday() == 5:
        archive_dates.add(directory.name)

cards = []
for index, day_string in enumerate(sorted(archive_dates, reverse=True)):
    day = date.fromisoformat(day_string)
    label = f"{day.year}년 {day.month}월 {day.day}일 토요일"
    badge = '<span class="badge">최신 대진</span>' if index == 0 else ''
    cards.append(f'''<a class="date-card" href="./{day_string}/" aria-label="{label} 대진표 보기">
      <span class="date-info"><span class="date-label">{label}</span>{badge}<span class="date-sub">08:00–11:00 · 1층 / 2층</span></span><span class="arrow" aria-hidden="true">↗</span>
    </a>''')

hub_css = (ROOT / "src/records.css").read_text(encoding="utf-8")
hub = f'''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>대포클럽 날짜별 대진표</title><style>{hub_css}</style></head><body><main class="shell"><nav><strong>대포클럽</strong><a href="./records/">기록 · 순위 →</a></nav><header class="hero"><p class="eyebrow">DAEPO TENNIS CLUB</p><h1>토요일 대진표</h1><p>날짜를 선택해 대진과 개인 일정을 확인하세요.</p></header><section aria-label="날짜별 대진표"><h2>날짜별 대진표</h2><div class="date-list">{''.join(cards)}</div></section></main></body></html>'''
(ROOT / "index.html").write_text(hub, encoding="utf-8")
records_template = (ROOT / "src/records.html").read_text(encoding="utf-8")
records_script = (ROOT / "src/results.js").read_text(encoding="utf-8") + "\n" + (ROOT / "src/membership.js").read_text(encoding="utf-8") + "\n" + (ROOT / "src/records.js").read_text(encoding="utf-8")
records_script = records_script.replace("__MEMBERSHIPS__", json.dumps(MEMBERSHIPS, ensure_ascii=False))
records_script = records_script.replace("__FIREBASE_CONFIG__", (ROOT / "firebase/firebase-config.json").read_text(encoding="utf-8"))
records_script = records_script.replace("__PLAYERS__", json.dumps(FIXED_PLAYERS, ensure_ascii=False))
records_dir = ROOT / "records"
records_dir.mkdir(exist_ok=True)
(records_dir / "index.html").write_text(records_template.replace("__CSS__", hub_css).replace("__SCRIPT__", records_script), encoding="utf-8")
setup_script = (ROOT / "src/setup.js").read_text(encoding="utf-8")
setup_script = setup_script.replace("__FIREBASE_CONFIG__", (ROOT / "firebase/firebase-config.json").read_text(encoding="utf-8"))
setup_script = setup_script.replace("__PLAYERS__", json.dumps(FIXED_PLAYERS, ensure_ascii=False))
setup_script = setup_script.replace("__MEMBERSHIPS__", json.dumps(MEMBERSHIPS, ensure_ascii=False))
setup_dir = ROOT / "setup"
setup_dir.mkdir(exist_ok=True)
setup_dir.joinpath("index.html").write_text((ROOT / "src/setup.html").read_text(encoding="utf-8").replace("__CSS__", hub_css).replace("__SCRIPT__", setup_script).replace("__COUNT__", str(len(FIXED_PLAYERS))), encoding="utf-8")
print("dated schedule:", dated_target.resolve())
print("records:", records_dir.resolve())
print("validated:", dict(types), "12 players × 4 matches; no repeat partners;", sum(floor_changes.values()), "floor changes total")
