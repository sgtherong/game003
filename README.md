# Boing! (가칭 「꾹!」에서 변경) — 웹 게임 프로젝트

게임의 공식 이름은 **Boing!**이며 모든 언어에서 같은 이름을 쓴다(2026-10-07 변경). 내부 식별자(저장 키 `kkuk.profile`, 코드 이름 `KKUK`, 캐시 이름 `kkuk-shell-*`, 폴더 `kkuk/`)는 **기존 플레이어의 기록·별·외형을 지키기 위해 그대로 둔다** — 바꾸면 저장 데이터가 사라진다.

누른 채 드래그해 몸을 압축하고 좌우로 움직이며, 손을 떼면 생기는 반동으로 끝없이 올라가는 세로형 아케이드 게임.

규칙 버전은 두 가지다.

- **R0** — 기준 시제품 재현. `reference/kkuk-steering.fragment.html`과 틱 단위로 일치한다(비교·회귀 검사용).
- **R1** — 출시 규칙. R0 수식에 FIX-01~08(저장, 압축 보존 일시정지, 입력 취소, 안전 통과, 입력 방식별 기록, 정지·지연 정책, 실행별 시드·연결 규칙, 재개 준비 시간)을 적용했다. **웹 실행기는 R1을 쓴다.** 자세한 내용은 [ISSUES.md](ISSUES.md).

R1 웹 실행기에는 첫 실행 튜토리얼(5단계, 기록 안 함), 설정(효과음·진동·연출 줄이기·언어 한국어/English·개인정보 안내), 합성 효과음·진동이 들어 있다. 자산 출처는 [ASSETS.md](ASSETS.md).

**성장 모드**(시제품): 구슬을 모아 레벨업하고 능력 카드 3장 중 하나를 고르는 별도 모드. 기록은 도전 모드와 따로 저장된다. 내용과 한계는 [ISSUES.md](ISSUES.md) 끝부분.

## 가장 빠른 실행

Node.js 18 이상 필요(확인 환경: Node 20.19.5, npm 10.8.2). 설치할 의존성은 없다.

```bash
node tools/serve.js
```

브라우저에서 http://localhost:5173/web/ 을 연다. 같은 Wi-Fi의 휴대폰에서는 `http://<PC의 IP>:5173/web/`로 접속할 수 있다(방화벽 허용 필요).

검사 실행:

```bash
node tests/run-tests.js
```

출시 생성기 오프라인 검사(시드 수, 장애물 수, 반응 지연 틱…; 결과는 `reports/seed-sweep.json`):

```bash
node tests/seed-sweep.js 100 200 0 6 8
```

## 조작

| 입력 | 동작 |
|---|---|
| 게임 화면 또는 하단 패드를 누르기 | 압축 |
| 누른 채 좌우 드래그 | 상대 이동(누른 위치로 순간이동하지 않음) |
| 손 떼기 | 반동 1회, 이동 정지 |
| `Space` / `← →`·`A D` / `Esc` | 압축 / 이동 / 일시정지 (웹 테스트용, 압축 없이 이동 가능 → 터치와 다른 조건) |

## 구조

```
config/balance-r0.json             R0 수치의 유일한 원본 (패키지의 balance-reference.json 사본)
config/balance-r1.overrides.json   R1에서 추가·변경하는 값만 (R0 위에 덮어씀)
src/balance-r0.js, balance-r1.js   ↑ 자동 생성본 (npm run sync-config). 직접 수정 금지
src/rng.js                 LCG 난수 (기준과 호출 순서 동일)
src/collision.js           원–벽 거리 판정
src/generator.js           생성기: r0(기준) / g1(실행별 시드·연결 규칙·대체 블록)
src/simulation.js          순수 규칙: createRun / step / stepBody (DOM·엔진 의존 없음)
src/input-adapter.js       포인터·키 → 입력 전이(ops) + 이동 축 (DOM 의존 없음)
src/save.js                프로필 저장·검증·복구·기록 키 (저장 매체는 주입)
src/tutorial.js            튜토리얼 단계·완료 조건·연습 설정 (물리는 R1과 동일, 상승 속도만 느림)
src/growth.js              성장 모드: 구슬·레벨업·능력 카드·진화·저주 (판마다 설정 수치를 덧씌움)
src/feats.js               아슬아슬·배짱·연속/긴 틈 관찰(연출·미션용, 점수 영향 없음)
src/missions.js            미션 3개 진행·달성·교체
src/replay.js              입력 기록·재생(고스트), 날짜 시드
src/challenge.js           친구 도전장 링크 인코딩·검증(재계산)·승패
src/game-controller.js     상태 머신 + 1/120초 고정 간격 루프 + 프레임 정책
web/                       웹 실행기: 캔버스 뷰(연출만, 물리 없음), HUD, 문구(strings.ko.js / strings.en.js), 효과음·진동(audio.js)
reference/                 기준 시제품 원문 (수정 금지, SHA-256 검사)
tests/                     Node 검사(R0 비교 + R1 FIX 검사) + 기준 하네스 + 자동 조작 + 시드 검사
reports/                   시드 검사 결과
tools/                     설정 동기화, 로컬 서버
```

모든 모듈은 `<script>`로 읽으면 `window.KKUK.*`에, Node에서는 `require`로 쓸 수 있다. 번들러가 필요 없다.

한 틱 처리 순서(명세서 7.4): 입력 전이·반동 → 시간·거리 → 좌우 이동 → 에너지 → 반지름 스프링 → 과압축 → 충돌·통과 → 정리·생성.

## 검증 방법

`tests/reference-harness.js`는 기준 HTML 원문을 **디스크에서 수정하지 않고** 읽어, 메모리 안에서만 내부 함수를 노출하는 한 줄을 덧붙여 Node `vm`에서 실행한다. 같은 입력 틱을 기준 코드와 새 모듈에 동시에 넣고 매 틱 거리·X·목표 X·반지름·반지름 속도·에너지·통과 수·장애물 수·생존 여부를 비교한다(허용치: 위치 0.05, 에너지 0.001).

## 버전

| 항목 | 값 |
|---|---|
| rulesVersion | `r0` (기준) / `r1` (웹 실행기) |
| balanceVersion | `reference-r0` / `r1.1` (쉬운 시작·속도 곡선, r1.0 기록은 별도 보관) |
| generatorVersion | `r0` / `g2` |
| 저장 스키마 | 1 (`kkuk.profile`, 백업 `kkuk.profile.backup`) |
| 기준 원문 SHA-256 | `6fdee367e846654846030e4a806e6ba3b0f94a71202f1d8d2ab5534bed69f710` |
| GDevelop | **미설치 — 아직 연결 안 됨** (아래 참고) |

## GDevelop 연결 (다음 단계, 아직 안 함)

이 PC에는 GDevelop이 설치되어 있지 않아 에디터 실행·미리보기·내보내기를 해 보지 못했다. 이벤트 JSON 형식을 추측해 프로젝트 파일을 직접 만들지 않았다.

GDevelop 5 설치 후 진행할 순서:

1. 새 프로젝트 `kkuk-gd`를 만들고 GDevelop 버전을 이 README에 기록한다.
2. `store`를 GDevelop 저장 기능을 감싼 `{ read(key), write(key, text) }`로 바꿔 컨트롤러에 넘긴다.
3. Game 씬에 레이어 Background / World / Effects / HUD / Overlay, 오브젝트 PlayerBody·GateLeft·GateRight·EnergyBar·InputPad 등을 만든다.
4. `src/*.js`를 설치한 GDevelop 버전이 공식 지원하는 방식으로 포함한다(JavaScript Code 이벤트 문서 확인 후 결정). 모듈은 전역 `KKUK`에 붙으므로 엔진 쪽 코드는 `KKUK.GameController.createGameController({ balance: KKUK.balanceR1, store })` 하나만 만들면 된다.
5. 씬 시작 이벤트에서 컨트롤러 생성, 매 프레임 JavaScript 이벤트에서 `ctl.frame(시각 ms)` 한 번만 호출(별도 requestAnimationFrame 금지).
6. GDevelop 터치/마우스 조건에서 `ctl.pointerDown/Move/Up`에 화면 X와 입력 영역 너비를 넘긴다. 터치 취소·앱 가림은 `ctl.pointerCancel` / `ctl.pause`로 보낸다(손 떼기로 처리하지 않음).
7. `web/view.js`와 같은 방식으로 `ctl.run`의 x·radius·gates를 오브젝트 위치·크기에 반영한다(ViewAdapter에서 물리 계산 금지).
8. 미리보기에서 웹 실행기와 같은 입력으로 수치가 같은지 비교한다.

## 공개 배포 (GitHub Pages)

이 폴더 전체를 저장소 루트로 올리고 Pages를 켜면 `https://<계정>.github.io/<저장소>/`에서 실행된다(루트 `index.html`이 `web/`으로 넘기며 도전장 링크 `#c=…`도 유지. 도전장 공유 주소는 미리보기 전용 페이지 `c/`를 거친다). 빌드 단계는 없다. `.nojekyll`은 Pages가 파일을 가공하지 않게 한다.

1. 저장소 Settings → Pages → Source: **Deploy from a branch**, Branch: **main** / **(root)** → Save
2. 1~2분 뒤 위 주소로 접속. https라서 홈 화면 설치·오프라인 실행·친구 도전장이 모두 동작한다.

링크 미리보기 이미지는 `web/og-image.png`(1200×630)다. `tools/thumbnail.html`을 고친 뒤 `node tools/make-thumbnail.js`로 다시 만든다(Chrome/Edge 필요). `index.html`·`web/index.html`의 미리보기 태그에는 공개 주소가 절대 경로로 들어 있으므로 호스팅 주소가 바뀌면 함께 바꾼다.

카카오톡 공유 카드를 쓰려면 developers.kakao.com에서 앱을 만들고, 플랫폼 > Web에 사이트 도메인(예: `https://sgtherong.github.io`)을 등록한 뒤, 앱 키 중 **JavaScript 키**를 `web/share-config.js`의 `kakaoJsKey`에 넣는다. 비어 있으면 카카오 버튼 없이 일반 공유만 보인다. 도전장 카드 이미지는 `node tools/make-thumbnail.js challenge`로 다시 만든다.

공개 저장소이면 이 폴더의 모든 파일(소스·검사·문서·기준 시제품 `reference/`)이 공개된다.
