// 기준 시제품 원문을 수정 없이 읽어, 메모리 안에서만 내부 함수를 노출하는 훅을 덧붙여 실행한다.
// 원본 파일은 건드리지 않는다. 가짜 DOM은 게임 규칙에 영향을 주지 않는 최소 구현이다.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const REF_PATH = path.join(__dirname, '..', 'reference', 'kkuk-steering.fragment.html');
const REF_SHA = '6fdee367e846654846030e4a806e6ba3b0f94a71202f1d8d2ab5534bed69f710';

function referenceSha() {
  return crypto.createHash('sha256').update(fs.readFileSync(REF_PATH)).digest('hex');
}

function stubElement() {
  const el = {
    style: {}, hidden: false, disabled: false, textContent: '', isConnected: true,
    setAttribute() {}, addEventListener() {}, append() {}, focus() {}, setPointerCapture() {},
    getBoundingClientRect: () => ({ width: 360, height: 430, left: 0, top: 0 }),
    contains: () => true,
    getContext: () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } })
  };
  el.querySelector = () => stubElement();
  return el;
}

function loadReference() {
  const html = fs.readFileSync(REF_PATH, 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('reference script not found');
  const hook = 'globalThis.__ref={get g(){return g},get mode(){return mode},step,setHeld,start,pause,moveKeys,clampX,collision,setTarget(x){g.targetX=x},snap(){g.targetX=g.x}};';
  const src = m[1].replace(/\n\s*reset\(\);ui\.pause\.disabled=true;draw\(\);renderHud\(\);requestAnimationFrame\(frame\);\s*\n\}\)\(\);\s*$/,
    '\n reset();ui.pause.disabled=true;draw();renderHud();' + hook + '\n})();');
  if (src === m[1]) throw new Error('hook injection point not found — reference changed?');

  const root = stubElement();
  const sandbox = {
    document: { getElementById: () => root, createElement: () => stubElement(), addEventListener() {}, hidden: false },
    window: { addEventListener() {} },
    getComputedStyle: () => ({ color: '#000' }),
    matchMedia: () => ({ addEventListener() {} }),
    requestAnimationFrame() {},
    Math, Number, String, Set, Object, Array
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.__ref;
}

module.exports = { loadReference, referenceSha, REF_SHA, REF_PATH };
