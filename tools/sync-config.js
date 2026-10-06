// config/*.json → src/balance-*.js
// 브라우저에서 file:// 로 열어도 설정을 읽을 수 있도록 JSON을 스크립트로 감싼다.
// 수치의 원본은 JSON뿐이다. 생성 파일을 수정하지 말고 JSON을 고친 뒤 다시 실행한다.
//   balance-r0.json                → src/balance-r0.js (KKUK.balanceR0)
//   balance-r0.json + r1 overrides → src/balance-r1.js (KKUK.balanceR1)
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, 'config', f), 'utf8'));

function deepMerge(base, over) {
  if (over === null || typeof over !== 'object' || Array.isArray(over)) return over;
  const out = Object.assign({}, base);
  for (const k of Object.keys(over)) out[k] = (k in out) ? deepMerge(out[k], over[k]) : over[k];
  return out;
}

function emit(file, globalName, source, data) {
  const out = `// 자동 생성 파일 — 직접 수정 금지. 원본: ${source} (npm run sync-config)
(function (root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else { root.KKUK = root.KKUK || {}; root.KKUK.${globalName} = data; }
})(typeof globalThis !== 'undefined' ? globalThis : this, ${JSON.stringify(data, null, 2)});
`;
  fs.writeFileSync(path.join(root, 'src', file), out);
  console.log(`src/${file} 갱신 완료`);
}

const r0 = read('balance-r0.json');
const r1 = deepMerge(r0, read('balance-r1.overrides.json'));
delete r1.releaseChangesRequired;

emit('balance-r0.js', 'balanceR0', 'config/balance-r0.json', r0);
emit('balance-r1.js', 'balanceR1', 'config/balance-r0.json + config/balance-r1.overrides.json', r1);

