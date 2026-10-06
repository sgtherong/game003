// PWA(설치·오프라인) 구성 검사. run-tests.js에서 호출한다.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const WEB = path.join(__dirname, '..', 'web');

function pngSize(file) {
  const b = fs.readFileSync(file);
  assert.strictEqual(b.slice(1, 4).toString(), 'PNG', file + ' PNG 아님');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}
function shellList() {
  const src = fs.readFileSync(path.join(WEB, 'sw.js'), 'utf8');
  const m = src.match(/var SHELL = \[([\s\S]*?)\];/);
  return m[1].match(/'([^']+)'/g).map(s => s.slice(1, -1));
}

module.exports = function registerPwaTests(test) {
  test('PWA: 매니페스트와 아이콘(크기·형식) 정상', () => {
    const man = JSON.parse(fs.readFileSync(path.join(WEB, 'manifest.webmanifest'), 'utf8'));
    for (const k of ['name', 'short_name', 'start_url', 'display', 'icons']) assert.ok(man[k], k);
    assert.strictEqual(man.display, 'standalone');
    assert.ok(man.icons.some(i => i.sizes === '192x192') && man.icons.some(i => i.sizes === '512x512'));
    assert.ok(man.icons.some(i => i.purpose === 'maskable'));
    for (const icon of man.icons) {
      const [w, h] = pngSize(path.join(WEB, icon.src));
      assert.strictEqual(w + 'x' + h, icon.sizes, icon.src);
    }
    return man.icons.length + '개 아이콘';
  });

  test('PWA: index.html이 불러오는 모든 파일이 오프라인 캐시 목록에 있고 실제로 존재', () => {
    const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
    const refs = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map(m => m[1]);
    const shell = shellList();
    const missing = refs.filter(r => shell.indexOf(r) < 0);
    assert.deepStrictEqual(missing, [], '캐시 목록에 없는 파일');
    const absent = shell.filter(f => f !== './' && !fs.existsSync(path.join(WEB, f)));
    assert.deepStrictEqual(absent, [], '존재하지 않는 캐시 파일');
    return `참조 ${refs.length}개, 캐시 ${shell.length}개`;
  });
};
