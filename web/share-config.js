// 공유 설정. 운영자가 정하는 값만 둔다.
(function (root) {
  root.KKUK = root.KKUK || {};
  root.KKUK.shareConfig = {
    // 카카오 개발자(developers.kakao.com) 앱의 "JavaScript 키".
    // 브라우저에 공개되는 용도의 키라 소스에 넣어도 되며, 등록한 사이트 도메인에서만 동작한다.
    // 비어 있으면 카카오톡 공유 버튼을 숨기고 일반 공유(공유창·링크 복사)만 쓴다.
    kakaoJsKey: '',
    // 카카오 SDK — integrity는 2026-10-07에 받은 파일로 직접 계산한 값. 버전을 바꾸면 다시 계산한다.
    kakaoSdk: {
      src: 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js',
      integrity: 'sha384-DKYJZ8NLiK8MN4/C5P2dtSmLQ4KwPaoqAfyA/DfmEc1VDxu4yyC7wy6K1Hs90nka'
    },
    // 카드에 쓰는 이미지(공개 주소의 절대 경로여야 한다)
    challengeImage: 'https://sgtherong.github.io/game003/web/og-challenge.png'
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
