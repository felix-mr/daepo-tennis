import base64
from collections import Counter
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

MEN = ("서명렬", "김영진", "나창은", "박세준", "이재원", "정상현", "안홍익")
WOMEN = ("정가영", "조아라", "성주은", "박정민", "권태경")
PEOPLE = set(MEN + WOMEN)

# Each tuple: first-floor team A, first-floor team B, second-floor team A, second-floor team B.
ROUNDS = [
    (("박세준", "조아라"), ("이재원", "박정민"), ("정상현", "권태경"), ("안홍익", "정가영")),
    (("박세준", "박정민"), ("서명렬", "성주은"), ("김영진", "나창은"), ("안홍익", "정상현")),
    (("박세준", "이재원"), ("서명렬", "정상현"), ("성주은", "권태경"), ("정가영", "조아라")),
    (("서명렬", "박정민"), ("안홍익", "성주은"), ("김영진", "권태경"), ("나창은", "조아라")),
    (("박세준", "서명렬"), ("이재원", "정상현"), ("김영진", "조아라"), ("나창은", "정가영")),
    (("정가영", "권태경"), ("성주은", "박정민"), ("김영진", "이재원"), ("나창은", "안홍익")),
]

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
        assert not resting & rests[-1], (i, resting & rests[-1])
    rests.append(resting)
    for floor in range(2):
        a, b = round_[floor*2:floor*2+2]
        types[match_type(a,b)] += 1
        for p in a+b: games[p] += 1
        for team in (a,b): partners[frozenset(team)] += 1
        for p in a:
            for q in b:
                opposed[frozenset((p,q))] += 1

assert len(ROUNDS) == 6 and all(games[p] == 4 for p in PEOPLE)
assert all(n == 1 for n in partners.values())
assert types == {"남복":4, "여복":2, "혼복":6}
assert partners[frozenset(("성주은", "권태경"))] == 1
assert opposed[frozenset(("서명렬", "성주은"))] == 1
assert "김영진" in rests[0] and "김영진" not in rests[1]
assert "조아라" not in rests[4] and "조아라" in rests[5]
def active_span(p):
    active_rounds = [i for i, round_ in enumerate(ROUNDS) if any(p in team for team in round_)]
    return min(active_rounds), max(active_rounds)
assert active_span("이재원") == active_span("정가영")
assert active_span("성주은") == active_span("나창은")
floor_changes = {}
for p in PEOPLE:
    floors = [floor for round_ in ROUNDS for floor in range(2) if p in round_[floor*2] + round_[floor*2+1]]
    floor_changes[p] = sum(a != b for a,b in zip(floors,floors[1:]))
assert sum(floor_changes.values()) == 9 and max(floor_changes.values()) == 2

CSS = r"""
:root{--ink:#132825;--muted:#60736e;--green:#0b5645;--green2:#0e715a;--lime:#d7f16c;--paper:#f3f6f1;--line:#dce6df;--white:#fff;--gold:#e5ae55}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,"Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;line-height:1.45}
button,input{font:inherit}
.shell{max-width:1210px;margin:0 auto;padding:26px 30px 80px}
.hero{position:relative;overflow:hidden;border-radius:28px;background:linear-gradient(125deg,#073e35 0%,#0d5d48 58%,#137460 100%);color:#fff;padding:44px 48px 38px;box-shadow:0 20px 48px rgba(7,60,48,.16)}
.hero:after{content:"";position:absolute;width:360px;height:360px;border:42px solid rgba(215,241,108,.12);border-radius:50%;right:-135px;top:-155px;pointer-events:none}
.topline{display:flex;align-items:center;justify-content:space-between;gap:20px;position:relative;z-index:1}
.eyebrow{font-size:12px;letter-spacing:.18em;font-weight:800;color:var(--lime)}
.print{border:1px solid rgba(255,255,255,.43);background:rgba(255,255,255,.11);color:#fff;padding:10px 16px;border-radius:12px;font-weight:700;cursor:pointer;backdrop-filter:blur(5px)}
.print:hover{background:rgba(255,255,255,.2)}
h1{font-size:clamp(32px,4.8vw,54px);line-height:1.12;letter-spacing:-.055em;margin:21px 0 10px;position:relative;z-index:1}
.subtitle{font-size:16px;color:#d6eae2;margin:0;position:relative;z-index:1}
.hero-bottom{display:flex;justify-content:space-between;gap:25px;align-items:flex-end;position:relative;z-index:1;margin-top:30px}
.hero-notes{display:flex;flex-wrap:wrap;gap:8px;max-width:750px}
.hero-note{border:1px solid rgba(255,255,255,.27);border-radius:999px;background:rgba(255,255,255,.11);padding:7px 11px;font-size:12px;color:#effaf4;font-weight:650}
.metrics{display:flex;gap:20px;white-space:nowrap}
.metric{display:flex;flex-direction:column;text-align:right}.metric strong{font-size:25px;line-height:1;color:var(--lime)}.metric span{font-size:11px;letter-spacing:.03em;color:#d3e7df;margin-top:5px}
.section-head{display:flex;align-items:end;justify-content:space-between;gap:16px;margin:38px 1px 18px}
.section-head h2{margin:0;font-size:26px;letter-spacing:-.045em}.section-head p{margin:0;color:var(--muted);font-size:13px}
.legend{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.legend .tag{font-size:11px}
.round{display:grid;grid-template-columns:160px 1fr 1fr;gap:14px;margin-bottom:14px;align-items:stretch}
.round-time{border-radius:18px;background:#e7eee7;padding:20px 19px;display:flex;flex-direction:column;justify-content:center;min-height:155px}
.round-num{font-size:11px;letter-spacing:.13em;font-weight:850;color:var(--green2);margin-bottom:11px}
.clock{font-size:23px;letter-spacing:-.055em;line-height:1.12;font-weight:850;white-space:nowrap}.clock-end{font-size:18px;color:#59736a;font-weight:650;margin-top:4px}
.match{border:1px solid var(--line);border-radius:18px;background:var(--white);padding:15px 20px 14px;box-shadow:0 5px 16px rgba(23,53,41,.035);min-width:0}
.match-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:11px;gap:10px}.floor{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:850}.floor-dot{width:9px;height:9px;border-radius:50%;background:var(--green2)}.floor-2 .floor-dot{background:var(--gold)}
.tag{border-radius:999px;padding:4px 9px;font-size:11px;font-weight:800;letter-spacing:.01em}.tag-mixed{color:#19624f;background:#e0f3e9}.tag-men{color:#3f5d9b;background:#eaf0fd}.tag-women{color:#a34b72;background:#fbeaf1}
.team-row{padding:3px 0}.team-name{font-size:17px;font-weight:770;letter-spacing:-.045em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.team-name .sep{color:#94aaa0;font-weight:500;padding:0 4px}
.versus{display:flex;align-items:center;gap:10px;color:#849891;font-size:10px;font-weight:900;letter-spacing:.12em;padding:3px 0}.versus:before,.versus:after{content:"";height:1px;background:#edf2ed;flex:1}
.round-rest{grid-column:2/4;margin-top:-5px;display:flex;align-items:center;flex-wrap:wrap;gap:6px 8px;padding:1px 5px 5px;color:#597067;font-size:12px}.rest-label{font-weight:850;color:#366453;margin-right:2px}.rest-name{background:#e7eee7;border-radius:6px;padding:3px 7px}
.flow-section{margin-top:43px}.flow-section .section-head{margin-bottom:15px}.flow-scroll{overflow-x:auto;border:1px solid var(--line);border-radius:18px;background:#fff;box-shadow:0 5px 16px rgba(23,53,41,.035)}
.flow{width:100%;min-width:760px;border-collapse:separate;border-spacing:0;text-align:center}.flow th,.flow td{padding:11px 9px;border-right:1px solid #e9efea;border-bottom:1px solid #e9efea}.flow tr>*:last-child{border-right:0}.flow tbody tr:last-child>*{border-bottom:0}
.flow thead th{background:#ecf3ec;color:#386451;font-size:12px;font-weight:850}.flow thead th:first-child{text-align:left;padding-left:19px;width:150px}.flow thead small{display:block;color:#779087;font-size:10px;font-weight:650;margin-top:2px}
.flow tbody th{text-align:left;font-size:14px;font-weight:800;padding-left:19px;background:#fff;white-space:nowrap}.flow tbody th small{display:block;color:#82948d;font-weight:600;font-size:10px;margin-top:1px}.flow tbody tr.group-start>*{border-top:3px solid #dbe8dd}
.flow thead th:first-child{position:sticky;left:0;z-index:3}.flow tbody th{position:sticky;left:0;z-index:2;box-shadow:2px 0 0 #36394b}
.flow td{font-size:13px;font-weight:850}.flow td small{display:block;font-size:10px;font-weight:650;margin-top:1px}.flow td.play-1{color:#116249;background:#ecf8f0}.flow td.play-2{color:#9b6022;background:#fff6e9}.flow td.rest{color:#9aa9a1;background:#fafcf9;font-weight:650}
.footer{display:flex;align-items:center;justify-content:space-between;gap:20px;border-top:1px solid #d9e5dc;margin-top:30px;padding:19px 2px;color:#667970;font-size:12px}.footer strong{color:#215c49}
@media(max-width:900px){.round{grid-template-columns:120px 1fr 1fr}.round-time{padding:17px 14px}.match{padding:14px}.team-name{font-size:15px}.clock{font-size:20px}.clock-end{font-size:16px}}
@media(max-width:700px){.shell{padding:12px 12px 45px}.hero{padding:27px 24px 29px;border-radius:20px}.hero-bottom{display:block;margin-top:26px}.metrics{margin-top:22px;justify-content:flex-start}.metric{text-align:left}.section-head{display:block;margin:29px 3px 16px}.section-head p{margin-top:5px}.legend{margin-top:12px}.round{grid-template-columns:1fr 1fr;gap:9px;margin-bottom:17px}.round-time{grid-column:1/3;min-height:0;display:flex;flex-direction:row;justify-content:flex-start;align-items:baseline;gap:8px;padding:10px 13px;border-radius:12px}.round-num{margin:0 7px 0 0}.clock{font-size:17px}.clock-end{font-size:15px;margin:0}.match{padding:12px;border-radius:13px}.team-name{font-size:13px}.team-name .sep{padding:0 1px}.floor{font-size:12px}.round-rest{grid-column:1/3;margin:0;padding:0 3px 2px}.footer{display:block}.footer span{display:block;margin-bottom:5px}}
@media(max-width:390px){.match{padding:10px}.team-name{font-size:12px}.tag{font-size:10px;padding:3px 7px}.hero-note{font-size:11px}}
/* Original manga-inspired court domain: ink panels, curse-red seals, cyan energy. */
:root{--ink:#eef0f8;--muted:#a2a8bd;--green:#f85b79;--green2:#f85b79;--lime:#a8f7ec;--paper:#0b0c14;--line:#34374a;--white:#171924;--gold:#65e9e2}
body{background:radial-gradient(circle at 85% 0%,rgba(112,25,57,.25),transparent 30%),radial-gradient(circle at 5% 56%,rgba(30,99,116,.13),transparent 36%),repeating-linear-gradient(125deg,transparent 0 29px,rgba(255,255,255,.008) 30px 31px),#0b0c14}
.hero{background:radial-gradient(circle at 82% 44%,rgba(236,64,100,.24),transparent 32%),linear-gradient(115deg,#15141f 0%,#211624 63%,#3c172b 100%);border:1px solid #6d2b45;box-shadow:0 24px 65px rgba(0,0,0,.4),0 0 0 1px rgba(255,90,126,.08) inset}
.hero{min-height:382px;padding-right:345px}.hero-bottom{display:block}.metrics{justify-content:flex-start;margin-top:19px}.metric{text-align:left}
.hero-art{position:absolute;z-index:0;right:-35px;bottom:-72px;height:480px;width:auto;max-width:none;object-fit:contain;filter:drop-shadow(-16px 10px 23px rgba(0,0,0,.5));pointer-events:none}
.hero:before{content:"呪";position:absolute;right:35px;top:-76px;font-size:320px;line-height:1;font-weight:900;color:transparent;-webkit-text-stroke:2px rgba(248,91,121,.19);transform:rotate(-11deg);pointer-events:none}
.hero:after{width:305px;height:305px;border:1px solid rgba(255,86,122,.34);box-shadow:0 0 0 18px rgba(255,86,122,.04),0 0 0 42px rgba(255,86,122,.035),inset 0 0 0 22px rgba(255,86,122,.025);right:10px;top:-55px;transform:rotate(18deg)}
.eyebrow{color:#ff718d}.print{background:#b62b4d;border:1px solid #ec7790;box-shadow:0 6px 22px rgba(227,55,98,.22)}.print:hover{background:#d93c60}
h1{font-weight:900;text-shadow:0 3px 24px rgba(0,0,0,.26)}h1 .accent{color:#ffd6de}.subtitle{color:#d9d9e4}
.hero-note{border-color:rgba(251,126,153,.3);background:rgba(112,37,65,.32);color:#ffe4ea}.metric strong{color:#a8f7ec}.metric span{color:#c5c6d5}
.section-head h2{color:#f2f2fa}.section-head h2:before{content:"◈";color:#f85b79;margin-right:9px;font-size:.77em}.section-head p{color:#a2a8bd}
.round-time{background:linear-gradient(140deg,#1c1a29,#171a26);border:1px solid #494054;border-left:4px solid #e74768}.round-num{color:#ff6f8c}.clock{color:#f4edf3}.clock-end{color:#a2a9bf}
.match{background:linear-gradient(155deg,#1a1c29,#151721);border:1px solid #3b3d50;box-shadow:0 8px 24px rgba(0,0,0,.16)}.match.floor-1{border-top:2px solid #f35b7a}.match.floor-2{border-top:2px solid #64e3dc}
.floor{color:#f4f3fa}.floor-dot{background:#f35b7a;box-shadow:0 0 10px #f35b7a}.floor-2 .floor-dot{background:#64e3dc;box-shadow:0 0 10px #64e3dc}
.tag-men{color:#8fc7ff;background:#1a3148}.tag-mixed{color:#ff9ab0;background:#482537}.tag-women{color:#bda7ff;background:#33274c}
.team-name{color:#eef0f8}.team-name .sep{color:#756d83}.versus{color:#ff809a}.versus:before,.versus:after{background:#333443}
.round-rest{color:#aaadbd}.rest-label{color:#f57590}.rest-name{background:#252634;color:#d5d4e0;border:1px solid #36394c}
.flow-scroll{background:#161823;border-color:#3c4052;box-shadow:0 9px 28px rgba(0,0,0,.2)}.flow th,.flow td{border-color:#36394b}.flow thead th{background:#242437;color:#f39ab0}.flow thead th:first-child{color:#f39ab0}.flow thead small{color:#a3a1b3}
.flow tbody th{background:#1a1b29;color:#f3f1fa}.flow tbody th small{color:#a8a7b8}.flow tbody tr.group-start>*{border-top-color:#6d3956}
.flow td.play-1{color:#ffa3b7;background:#3a2535}.flow td.play-2{color:#91f2eb;background:#1e3940}.flow td.rest{color:#7f8395;background:#171822}
.footer{border-color:#393b4d;color:#999daf}.footer strong{color:#f77a93}
@media(max-width:1000px){.hero{padding-right:290px}.hero-art{height:410px;right:-65px;bottom:-48px}.hero-note{font-size:11px}}
@media(max-width:700px){.hero{min-height:0;padding-right:24px}.hero-art{position:relative;right:auto;bottom:auto;display:block;height:280px;max-width:100%;margin:2px auto -42px}.hero:before{font-size:240px;right:-15px;top:170px}.hero:after{top:245px;right:-70px}.metrics{justify-content:flex-start}.metric{text-align:left}}
@media print{@page{size:A4 portrait;margin:10mm}body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.shell{max-width:none;padding:0}.hero{min-height:0;box-shadow:none;border-radius:0;padding:18px 230px 18px 22px}.hero-art{height:275px;right:3px;bottom:-26px}.hero:before,.hero:after{display:none}.print{display:none}h1{font-size:32px;margin:9px 0 6px}.hero-bottom{margin-top:13px}.hero-note{font-size:10px;padding:3px 7px}.metrics{gap:13px}.metric strong{font-size:19px}.section-head{margin:20px 0 11px}.section-head h2{font-size:19px;color:#1a1b29}.round{grid-template-columns:112px 1fr 1fr;gap:8px;margin-bottom:5px;break-inside:avoid}.round-time{min-height:107px;border-radius:9px;padding:10px}.round-num{margin-bottom:6px}.clock{font-size:17px}.clock-end{font-size:14px}.match{padding:8px 11px;border-radius:9px;box-shadow:none}.match-head{margin-bottom:4px}.team-row{padding:2px 0}.team-name{font-size:12px}.versus{padding:1px 0}.round-rest{font-size:10px;padding-bottom:0;margin-top:-3px}.rest-name{padding:1px 5px}.flow-section{break-before:page;margin-top:0}.flow-scroll{box-shadow:none;border-radius:0}.flow{min-width:0}.flow th,.flow td{padding:8px 5px}.flow thead th:first-child,.flow tbody th{padding-left:9px}.flow tbody th{font-size:11px}.flow td{font-size:11px}.footer{margin-top:8px;padding-top:7px;font-size:10px}}
"""

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
    </article>'''

def round_html(i, round_):
    start = 8*60 + i*30
    end = start+30
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
    role = ("고정" if p in MEN[:5] or p in WOMEN[:4] else "게스트") + (" · 남" if p in MEN else " · 여")
    cells = []
    for i, round_ in enumerate(ROUNDS):
        found = next((floor for floor in range(2) if p in round_[floor*2] + round_[floor*2+1]), None)
        if found is None:
            cells.append('<td class="rest">휴식</td>')
        else:
            typ = match_type(round_[found*2],round_[found*2+1])
            cells.append(f'<td class="play-{found+1}">{found+1}층<small>{typ}</small></td>')
    group_start = ' class="group-start"' if index in (5,7,11) else ''
    return f'<tr{group_start}><th scope="row">{escape(p)}<small>{role}</small></th>{"".join(cells)}</tr>'

flow_headers = "".join(f'<th scope="col">{8+i//2:02d}:{(i%2)*30:02d}<small>{8+(i+1)//2:02d}:{((i+1)%2)*30:02d}까지</small></th>' for i in range(6))
flow_rows = "\n".join(flow_row(p, i) for i,p in enumerate(MEN+WOMEN))
hero_image_data = base64.b64encode((ROOT / "src/gojo.webp").read_bytes()).decode("ascii")
html = f'''<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#141420">
  <meta name="robots" content="noindex,nofollow">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23141420'/%3E%3Ccircle cx='32' cy='32' r='18' fill='%23f85b79'/%3E%3Cpath d='M18 20q23 11 28 28M21 48q17-20 23-31' fill='none' stroke='%23ffe9ef' stroke-width='3'/%3E%3C/svg%3E">
  <title>대포클럽 토요일 대진표</title>
  <style>{CSS}</style>
</head>
<body>
<div class="shell">
  <header class="hero">
    <div class="topline"><div class="eyebrow">領域展開 // DAEPO COURT DOMAIN</div><button class="print" type="button" onclick="window.print()">인쇄 / PDF 저장</button></div>
    <h1>대포클럽<br><span class="accent">토요일 대진표</span></h1>
    <p class="subtitle">08:00 — 11:00 &nbsp;·&nbsp; 1층 / 2층 코트</p>
    <div class="hero-bottom"><div class="hero-notes">
      <span class="hero-note">전원 4경기</span><span class="hero-note">연속 휴식 없음</span><span class="hero-note">층 이동 최대 2회</span><span class="hero-note">김영진 08:30 시작</span><span class="hero-note">조아라 10:30 종료</span>
      <span class="hero-note">성주은·권태경 페어 1회</span><span class="hero-note">서명렬 ↔ 성주은 맞대결 1회</span>
    </div><div class="metrics"><div class="metric"><strong>12</strong><span>참가 인원</span></div><div class="metric"><strong>6</strong><span>타임</span></div><div class="metric"><strong>12</strong><span>경기</span></div></div></div>
    <img class="hero-art" src="data:image/webp;base64,{hero_image_data}" alt="푸른 기운에 둘러싸여 테니스 라켓을 든 고죠 사토루">
  </header>
  <main>
    <div class="section-head"><div><h2>경기 일정</h2><p>타임별 코트와 휴식 명단</p></div><div class="legend"><span class="tag tag-men">남복 4</span><span class="tag tag-mixed">혼복 6</span><span class="tag tag-women">여복 2</span></div></div>
    {rounds_html}
    <section class="flow-section" aria-label="선수별 타임테이블">
      <div class="section-head"><div><h2>선수별 타임테이블</h2><p>각자 언제 경기하고 쉬는지 한눈에 확인 · 휴대폰에서는 표를 좌우로 밀어보기</p></div><div class="legend"><span class="tag tag-mixed">1층 경기</span><span class="tag tag-women">2층 경기</span><span class="tag tag-men">휴식</span></div></div>
      <div class="flow-scroll"><table class="flow"><thead><tr><th scope="col">선수<small>4경기 · 2휴식</small></th>{flow_headers}</tr></thead><tbody>{flow_rows}</tbody></table></div>
    </section>
  </main>
  <footer class="footer"><span><strong>대포클럽</strong> · 토요일 복식 대진표</span><span>각 타임 30분 · 1층 / 2층 동시 진행</span></footer>
</div>
</body>
</html>
'''
target = ROOT / "index.html"
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(html, encoding="utf-8")
print(target.resolve())
print("validated:", dict(types), "12 players × 4 matches; no consecutive rests or repeat partners; special pairs met;", sum(floor_changes.values()), "floor changes total")
