# 대포클럽 대진표 · 경기 기록

GitHub Pages 화면과 Firebase Firestore 공동 경기 기록. 로그인 없이 조회·점수 입력·수정한다. `noindex`는 검색 노출 제한 요청이며 접근 제한은 아니다.

## 화면

- `/`: 날짜별 대진표 목록. 기본 클럽 디자인.
- `/2026-10-03/`: 이번 주 대진표, 전체/개인 대진, 점수 입력과 결과. 이번 주에만 고죠 사토루 컨셉.
- `/records/`: 누적 또는 날짜별 고정 멤버 순위, 개인 기록, 경기 기록. 전체·남자·여자 선택. 기본 클럽 디자인.
- `/setup/`: 고정 멤버 11명 최초 등록. 기존 문서는 덮어쓰지 않고 재실행 시 중복 등록하지 않는다.

현재 참가자는 정가영 불참, 남자 게스트 송효종 참석 기준이다. 이재원 08:00~10:00 4경기 연속, 김영진 08:30 시작, 조아라 10:30 종료. 전원 4경기, 페어 중복 없음, 층 이동 개인 최대 2회·전체 12회다.

## DB 구성

Firestore는 두 종류의 문서를 보관한다. 일정과 컨셉 설정은 Git에 보관한다.

```text
users/{고정 멤버 ID}
  name, gender, memberType: "fixed", createdAt

schedules/{YYYY-MM-DD}/matchResults/{r타임-f층}
  date, round, floor
  teamA, teamB                    # 고정 ID 또는 이번 주 게스트 참가 ID
  teamANames, teamBNames          # 당시 표시 이름 보존
  scoreA, scoreB                  # 0~99 정수
  outcome                        # teamA / teamB / draw
  updatedAt                      # 서버 수정 시각
```

고정 ID는 이름이나 로그인과 무관하게 유지한다. `data/players.json`의 11명만 `users`에 등록한다: p001 서명렬, p002 김영진, p003 나창은, p004 박세준, p005 이재원, p006 조아라, p007 성주은, p008 박정민, p009 정가영, p010 김규석, p011 위형종. 고정 명단과 주별 참석 여부를 분리하므로 불참자는 ID를 유지하며 해당 주 경기에는 포함하지 않는다. 게스트는 날짜별 참가 ID와 이름을 경기 기록에 보관하며 `users` 문서를 만들지 않는다.

`outcome`은 점수 비교로 정한다. 높은 점수 팀의 두 선수는 승리, 낮은 점수 팀의 두 선수는 패배, 같은 점수는 네 선수 모두 무승부다. 점수가 없거나 저장되지 않은 경기는 집계하지 않는다. 0:0도 저장하면 무승부다.

- 전체 경기 수 = 승 + 무 + 패
- 승률 = 승 / 전체 경기 수. 무승부 포함. 경기 수 0이면 `—` 표시.
- 승점 = 승 × 3 + 무 × 1. 패배는 0점.
- 순위는 승점 → 승률 → 승수 순. 모두 같으면 이름순.

순위는 경기 결과에서 계산하므로 수정 시 승패와 승점이 중복 누적되지 않는다. 같은 경기는 하나의 문서를 갱신한다. 다른 주차의 기록은 보존하지만 매 수정 이력을 따로 쌓지는 않는다. 게스트와 치른 경기도 고정 멤버의 경기 수·승률·승점에 반영한다.

네 선수 모두 게스트인 경기는 대진만 표시한다. 점수 입력칸과 저장 대상에서 제외하며 기록 화면에도 표시하지 않는다. 고정 멤버가 한 명이라도 있으면 양팀 점수를 입력한다.

## 주차별 설정과 컨셉

- `data/players.json`: 고정 멤버 ID와 이름·성별. 등록 후 ID를 바꾸거나 재사용하지 않는다.
- `data/schedules/날짜.json`: 참가 ID, 고정/게스트 구분, 대진, 시간 조건, 검증 조건, `theme`.
- `themes/컨셉.json`: 이름, 제목, 부제, 이미지, 스타일 파일.
- `themes/컨셉.css`: 컨셉별 디자인.
- `src/scores.css`: 모든 컨셉에서 쓰는 점수 입력 스타일.

이번 주는 `"theme": "gojo"`, 다음 주부터는 `"theme": "club"` 또는 새 컨셉 ID를 지정한다. 새 컨셉은 JSON/CSS와 선택 이미지로 추가한다. 기록 화면과 날짜 목록은 특정 주의 캐릭터 컨셉에 묶이지 않는다.

다음 주 만들기:

1. 새 `data/schedules/YYYY-MM-DD.json` 작성. 고정 ID 유지, 게스트 ID는 해당 날짜로 생성한다.
2. 대진·시간 조건·컨셉 지정.
3. `python3 src/build.py --date YYYY-MM-DD` 실행. 날짜를 생략하면 설정 파일의 최신 날짜를 생성한다.
4. 생성된 HTML, 설정, `firebase/schedules.json`, `firebase/firestore.rules`를 함께 보관한다. 지난 날짜 HTML은 덮어쓰지 않는다.

이미 결과가 있는 날짜의 팀 구성을 변경할 때는 저장된 결과의 팀 정보와 먼저 대조해야 한다. 기존 점수를 다른 팀에 자동 이전하지 않는다.

## Firebase 연결

웹 앱 설정은 `firebase/firebase-config.json`. 서비스 계정 키가 아닌 웹 앱 식별 설정이다. Analytics는 초기화하지 않는다. [Firebase 웹 연결 문서](https://firebase.google.com/docs/web/setup)

Firebase 프로젝트 `daepo-b3b51`의 Firestore Database → 규칙에 `firebase/firestore.rules`를 반영해야 한다. GitHub Pages 배포만으로 규칙이 반영되지는 않는다.

규칙은 공개 조회를 허용하며, 쓰기는 등록된 주차의 12개 경기 점수·결과와 사전에 정한 고정 멤버 11명 최초 생성으로 제한한다. 점수 범위, 점수와 결과 일치, 팀 ID·이름, 서버 수정 시각을 검사한다. 경기 삭제, 팀 변경, 등록된 멤버 수정·삭제, 다른 경로 쓰기는 허용하지 않는다. 기존 규칙이 있다면 보존하며 합쳐야 한다. [필드 검증 문서](https://firebase.google.com/docs/firestore/security/rules-fields)

규칙 적용 후 `/setup/`에서 고정 멤버를 등록한다. 현재 고정 ID는 로그인용 UID가 아니다. 로그인 도입 시 인증 UID와 고정 멤버 ID를 별도로 연결할 수 있다.

점수 입력은 전체/개인 화면에 실시간 공유된다. 개인 화면은 내 팀을 먼저 표시한다. 저장은 서버 확인 후 완료 표시. 다른 사람이 입력 중인 경기 결과를 먼저 변경하면 덮어쓰지 않고 최신 결과를 확인하도록 안내한다. 오프라인에서는 입력값을 유지하고 저장을 비활성화한다. [실시간 갱신 문서](https://firebase.google.com/docs/firestore/query-data/listen)

`firebase/schedules.json`은 지난 날짜의 허용 경기 정보를 보존한다. 새 주차를 추가하면 생성된 규칙도 Firebase에 반영해야 한다.

## 검증과 게시

- 집계 검증: `node --test tests/results.test.cjs`
- 게스트 전원 경기의 입력·저장 제외 검증: `python3 -m unittest discover -s tests -p 'test_*.py'`
- 대진과 생성 검증: `python3 src/build.py`
- 로컬 Firestore: `firebase emulators:start --only firestore --project demo-daepo`
- 브라우저 검증: 로컬 에뮬레이터에서 실제 점수 저장·공유·수정·충돌, 규칙 거부, 등록 중복 방지, 모바일 화면 확인. 실제 프로젝트에 시험 데이터를 쓰지 않는다.

공개 게시 브랜치는 `main`. GitHub Pages 설정: Deploy from a branch → main / (root).
