// 번역 검사:  node tools/check-strings.js [언어코드 ...]
// web/strings.<코드>.js 가 영어(strings.en.js)와 같은 키·같은 자리표시자({n} 등)를 갖는지,
// store/listing/<코드>.json 이 Play 길이 제한(제목 30, 짧은 설명 80, 긴 설명 4000자)을 지키는지 본다.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
function loadStrings() {
  const ctx = { globalThis: {} };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of fs.readdirSync(path.join(root, 'web')).filter(f => /^strings\..+\.js$/.test(f))) {
    vm.runInContext(fs.readFileSync(path.join(root, 'web', f), 'utf8'), ctx, { filename: f });
  }
  return ctx.KKUK.stringsByLang;
}
const holders = s => (String(s).match(/\{[a-z]+\}/g) || []).sort().join(',');

function compare(ref, obj, at, errors) {
  if (Array.isArray(ref)) {
    if (!Array.isArray(obj) || obj.length !== ref.length) errors.push(at + ': 배열 길이 ' + (obj && obj.length) + ' ≠ ' + ref.length);
    else ref.forEach((v, i) => compare(v, obj[i], at + '[' + i + ']', errors));
    return;
  }
  if (ref && typeof ref === 'object') {
    if (!obj || typeof obj !== 'object') { errors.push(at + ': 객체가 아님'); return; }
    for (const k of Object.keys(ref)) if (!(k in obj)) errors.push(at + '.' + k + ': 없음');
    for (const k of Object.keys(obj)) if (!(k in ref)) errors.push(at + '.' + k + ': 영어에 없는 키');
    for (const k of Object.keys(ref)) if (k in obj) compare(ref[k], obj[k], at + '.' + k, errors);
    return;
  }
  if (typeof obj !== 'string') { errors.push(at + ': 문자열이 아님'); return; }
  if (ref !== '' && obj.trim() === '') errors.push(at + ': 비어 있음');
  if (holders(ref) !== holders(obj)) errors.push(at + ': 자리표시자 ' + holders(obj) + ' ≠ ' + holders(ref));
}

function checkListing(code, errors) {
  const f = path.join(root, 'store', 'listing', code + '.json');
  if (!fs.existsSync(f)) { errors.push('store/listing/' + code + '.json 없음'); return; }
  let j;
  try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { errors.push(code + '.json: JSON 오류 ' + e.message); return; }
  const len = s => Array.from(s || '').length;
  if (!j.title || len(j.title) > 30) errors.push(code + '.json title ' + len(j.title) + '자(최대 30)');
  if (!j.short || len(j.short) > 80) errors.push(code + '.json short ' + len(j.short) + '자(최대 80)');
  if (!j.full || len(j.full) > 4000) errors.push(code + '.json full ' + len(j.full) + '자(최대 4000)');
  const p = j.privacy || {};
  if (!p.title || !p.updated || !Array.isArray(p.body) || p.body.length !== 6 || !p.contact) errors.push(code + '.json privacy 형식(title, updated, body 6문단, contact)');
}

const all = loadStrings();
const codes = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(all);
let bad = 0;
for (const code of codes) {
  const errors = [];
  if (!all[code]) errors.push('web/strings.' + code + '.js 없음 또는 등록 코드 불일치');
  else if (code !== 'en') compare(all.en, all[code], code, errors);
  if (all[code] && all[code].title !== 'Boing!') errors.push(code + '.title은 Boing! 그대로');
  checkListing(code, errors);
  if (errors.length) { bad++; console.log('✗ ' + code + '\n  ' + errors.join('\n  ')); }
  else console.log('✓ ' + code + ' (' + all[code].langName + ')');
}
process.exitCode = bad ? 1 : 0;
