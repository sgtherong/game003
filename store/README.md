# Google Play 등록 자료

| 자료 | 위치 | 다시 만들기 |
|---|---|---|
| 앱 이름·짧은 설명·자세한 설명 (18개 언어) | `listing/<코드>.json` (`playLocale`이 Play Console의 언어) | 직접 수정 후 `node tools/check-strings.js`로 길이 검사 |
| 개인정보처리방침 (18개 언어, 한 페이지) | `../privacy/index.html` → https://sgtherong.github.io/game003/privacy/ | `PRIVACY_CONTACT=메일주소 node tools/make-privacy.js` |
| 그래픽 이미지 1024×500 (글자 없음) | `feature-graphic.png` | `node tools/make-thumbnail.js feature` |
| 앱 아이콘 512×512 | `../web/icons/icon-512.png` | `node tools/make-icons.js` |
| 휴대폰 스크린샷 1080×1920 × 5장 (언어별) | `screenshots/<코드>/` | `node tools/make-shots.js [코드 ...]` |

스크린샷 장면: 1 시작 화면(미션·모드) · 2 플레이(압축 게이지) · 3 성장 모드 레벨업 · 4 친구 대결(상대 기록선) · 5 외형.

## Play Console 입력 참고

- 앱 카테고리: 게임 > 아케이드. 무료. 광고 없음.
- 데이터 보안: 수집하는 데이터 없음, 공유하는 데이터 없음(기록은 기기에만 저장, 서버 전송 없음).
- 콘텐츠 등급(IARC): 폭력·선정성·도박 없음. "사용자 간 상호작용/콘텐츠 공유" — 도전장 링크에 사용자가 입력한 이름(최대 12자)이 담겨 상대에게 보이므로 "예"로 답하는 것이 안전.
- 타겟층: 13세 이상 권장(13세 미만 포함 시 가족 정책 추가 심사).
- 번역은 기계 번역 수준의 초안이다. 원어민 검수 전에는 주요 언어부터 확인할 것.
