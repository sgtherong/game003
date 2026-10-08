// 다국어 검사: 모든 언어 파일이 영어와 같은 키·자리표시자를 갖고, 스토어 문구가 길이 제한을 지키는지. run-tests.js에서 호출한다.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const Save = require('../src/save.js');

const root = path.join(__dirname, '..');

module.exports = function registerI18nTests(test) {
  test('다국어: 설정의 모든 언어에 문구 파일·스토어 문구가 있고 영어와 키·자리표시자가 같음', () => {
    for (const l of Save.LANGUAGES) assert.ok(fs.existsSync(path.join(root, 'web', 'strings.' + l + '.js')), 'web/strings.' + l + '.js');
    const html = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
    for (const l of Save.LANGUAGES) assert.ok(html.includes('src="strings.' + l + '.js"'), 'index.html에 ' + l);
    let out;
    try { out = execFileSync(process.execPath, [path.join(root, 'tools', 'check-strings.js'), ...Save.LANGUAGES], { encoding: 'utf8' }); }
    catch (e) { assert.fail(e.stdout || e.message); }
    return Save.LANGUAGES.length + '개 언어';
  });

  test('다국어: 기기 언어로 첫 언어 고르기(중국어 간체·번체 구분, 없으면 영어), 잘못된 저장값은 기본값', () => {
    assert.strictEqual(Save.pickLanguage(['ko-KR', 'en-US']), 'ko');
    assert.strictEqual(Save.pickLanguage(['fr-CA']), 'fr');
    assert.strictEqual(Save.pickLanguage(['pt-PT']), 'pt');
    assert.strictEqual(Save.pickLanguage(['zh-TW']), 'zh-Hant');
    assert.strictEqual(Save.pickLanguage(['zh-Hant-HK']), 'zh-Hant');
    assert.strictEqual(Save.pickLanguage(['zh-CN']), 'zh-Hans');
    assert.strictEqual(Save.pickLanguage(['zh']), 'zh-Hans');
    assert.strictEqual(Save.pickLanguage(['in-ID']), 'id');
    assert.strictEqual(Save.pickLanguage(['sw-KE', 'de-AT']), 'de');
    assert.strictEqual(Save.pickLanguage(['sw-KE']), 'en');
    assert.strictEqual(Save.pickLanguage([]), 'en');
    const p = Save.defaultProfile(); p.settings.language = 'zh-Hant';
    assert.strictEqual(Save.validateSave(p).profile.settings.language, 'zh-Hant');
    p.settings.language = 'xx';
    assert.strictEqual(Save.validateSave(p).profile.settings.language, 'ko');
  });
};
