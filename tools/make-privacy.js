// 개인정보처리방침 페이지 생성:  node tools/make-privacy.js
// store/listing/<코드>.json 의 privacy 항목으로 privacy/index.html 하나를 만든다(모든 언어, 기기 언어를 먼저 보여 줌).
// Google Play 등록 시 "개인정보처리방침 URL"에 https://sgtherong.github.io/game003/privacy/ 를 넣는다.
'use strict';
const fs = require('fs');
const path = require('path');
const Save = require('../src/save.js');

const root = path.join(__dirname, '..');
// 문의 주소: 공개 페이지에 실리므로 운영자가 정한 값만 넣는다(비어 있으면 문의 줄을 빼고 Play 등록 정보의 연락처를 쓴다)
const CONTACT = process.env.PRIVACY_CONTACT || '';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const langs = Save.LANGUAGES.filter(l => fs.existsSync(path.join(root, 'store', 'listing', l + '.json')));
const sections = langs.map(l => {
  const j = JSON.parse(fs.readFileSync(path.join(root, 'store', 'listing', l + '.json'), 'utf8'));
  const p = j.privacy;
  return `<section lang="${l}" id="${l}">
  <h2>${esc(p.title)}</h2>
  <p class="date">${esc(p.updated)}</p>
${p.body.map(b => '  <p>' + esc(b) + '</p>').join('\n')}
${CONTACT ? `  <p>${esc(p.contact)}: <a href="mailto:${esc(CONTACT)}">${esc(CONTACT)}</a></p>\n` : ''}</section>`;
});
const names = {};
for (const l of langs) {
  const src = fs.readFileSync(path.join(root, 'web', 'strings.' + l + '.js'), 'utf8');
  const m = /langName:\s*'([^']+)'/.exec(src);
  names[l] = m ? m[1] : l;
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Boing! — Privacy Policy</title>
<meta name="robots" content="index">
<!-- 자동 생성 파일 — 직접 수정 금지. 원본: store/listing/*.json (node tools/make-privacy.js) -->
<style>
  :root { --bg: #fbf4ea; --ink: #1d2833; --muted: #6b7480; --line: #e6dccd; --accent: #c2364a; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0d1626; --ink: #eef2f8; --muted: #9aa6b4; --line: #26324a; --accent: #ff8a9a; } }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.65 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 680px; margin: 0 auto; padding: 24px 16px 64px; }
  h1 { font-size: 26px; margin: 8px 0 4px; }
  nav { display: flex; flex-wrap: wrap; gap: 6px; margin: 16px 0 8px; }
  nav a { padding: 4px 10px; border: 1px solid var(--line); border-radius: 99px; color: var(--ink); text-decoration: none; font-size: 14px; }
  nav a.on { border-color: var(--accent); color: var(--accent); font-weight: 700; }
  section { border-top: 1px solid var(--line); padding-top: 8px; margin-top: 24px; }
  h2 { font-size: 20px; margin: 12px 0 0; }
  .date { color: var(--muted); font-size: 14px; margin-top: 2px; }
  a { color: var(--accent); }
</style>
</head>
<body>
<main>
<h1>Boing!</h1>
<nav>
${langs.map(l => `  <a href="#${l}" data-l="${l}">${esc(names[l])}</a>`).join('\n')}
</nav>
${sections.join('\n')}
</main>
<script>
// 기기 언어의 방침을 맨 위로 올린다(다른 언어는 아래에 그대로 둔다)
(function () {
  var tags = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en'];
  var have = ${JSON.stringify(langs)}, pick = null;
  for (var i = 0; i < tags.length && !pick; i++) {
    var t = String(tags[i]).toLowerCase(), b = t.split('-')[0];
    if (b === 'zh') pick = /hant|-tw|-hk|-mo/.test(t) ? 'zh-Hant' : 'zh-Hans';
    else if (have.indexOf(b) >= 0) pick = b;
  }
  pick = location.hash.slice(1) || pick || 'en';
  var sec = document.getElementById(pick), main = document.querySelector('main');
  if (sec) main.insertBefore(sec, document.querySelector('nav').nextSibling);
  document.documentElement.lang = pick;
  var a = document.querySelector('nav a[data-l="' + pick + '"]'); if (a) a.className = 'on';
})();
</script>
</body>
</html>
`;
fs.mkdirSync(path.join(root, 'privacy'), { recursive: true });
fs.writeFileSync(path.join(root, 'privacy', 'index.html'), html);
console.log('privacy/index.html — ' + langs.length + '개 언어' + (CONTACT ? ', 문의 ' + CONTACT : ', 문의 주소 없음(PRIVACY_CONTACT로 지정)'));
