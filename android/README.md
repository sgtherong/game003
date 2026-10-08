# Android 앱(Google Play) — TWA

웹 게임(https://sgtherong.github.io/game003/web/)을 Trusted Web Activity로 감싼 안드로이드 앱 설정.
게임 코드는 웹과 같다. 웹을 배포하면 앱도 다음 실행부터 새 버전을 쓴다(앱 재심사 불필요).

- `twa-manifest.json`: Bubblewrap 설정. **packageId(`io.github.sgtherong.boing`)는 Play에 올린 뒤 바꿀 수 없다.**
- 서명 키(`android.keystore`)와 비밀번호는 저장소에 올리지 않는다(.gitignore). 잃어버리면 업데이트를 올릴 수 없으므로 따로 안전하게 보관.

## 빌드 (JDK 17 + Android SDK 필요 — Bubblewrap이 처음 실행 때 내려받음)

    npm i -g @bubblewrap/cli
    cd android
    bubblewrap build          # app-release-bundle.aab, app-release-signed.apk 생성

## 사이트 소유 확인(주소창 없애기)

앱이 주소창 없이 열리려면 `https://sgtherong.github.io/.well-known/assetlinks.json`이 있어야 한다.
GitHub Pages 프로젝트 사이트(/game003/)에는 이 경로를 둘 수 없으므로 사용자 사이트 저장소 `sgtherong/sgtherong.github.io`에 올린다.
들어갈 SHA-256 지문: (1) 업로드 키 — `keytool -list -v -keystore android.keystore` (2) Play 앱 서명 키 — Play Console > 설정 > 앱 무결성.
