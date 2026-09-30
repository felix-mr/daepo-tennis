# 대포클럽 대진표

GitHub Pages에서 제공할 정적 대진표. 화면 주소는 공개 URL이며, 현재 HTML에는 검색엔진에 노출하지 말라는 `noindex` 요청이 들어 있다. `noindex`는 로그인이나 접근 제한이 아니다.

## 이번 대진표 수정

1. `src/build.py`의 참가자와 `ROUNDS`를 수정한다.
2. `python3 src/build.py`를 실행해 `index.html`을 다시 만든다.
3. 두 파일을 함께 커밋한다. `main`에 반영되면 GitHub Pages가 새 대진표를 게시한다.

`src/build.py`는 경기 수, 연속 휴식, 필수 페어, 맞대결, 층 이동 횟수를 검증한다. 현재 대진표 기준 검증이므로 다음 주 조건이 바뀌면 해당 검증도 함께 조정한다.

`index.html`은 고죠 이미지를 포함한 단일 파일이다. `src/gojo.webp`는 원본 이미지로 보관한다.

## 배포

저장소 Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`.

## 이후 기록

매주 버전은 Git 커밋 이력으로 보존된다. 날짜별 참석·대진·결과를 사이트에서 조회하거나 입력하려면 별도 데이터 파일과 화면 기능을 추가한다.
