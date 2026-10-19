// 앱 아이콘 PNG 생성:  node tools/make-icons.js
// tools/icon.html(게임과 같은 그림 코드)을 헤드리스 Chrome/Edge로 크기별로 찍어 web/icons/에 저장한다. 외부 이미지·폰트 없음.
// 띄운 브라우저 프로세스만(PID) 정리한다.
'use strict';
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const browser = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].find(p => fs.existsSync(p));
if (!browser) { console.error('Chrome/Edge를 찾지 못했습니다.'); process.exit(1); }

const out = path.join(__dirname, '..', 'web', 'icons');
fs.mkdirSync(out, { recursive: true });
const page = 'file:///' + path.join(__dirname, 'icon.html').replace(/\\/g, '/');
// any = 둥근 사각형(바깥 투명), full = 꽉 참(안드로이드 마스크는 가운데 80% 원이 안전 영역, iOS는 스스로 둥글게 자름)
const targets = [
  ['icon-192.png', 192, 'any'],
  ['icon-512.png', 512, 'any'],
  ['icon-maskable-512.png', 512, 'full'],
  ['apple-touch-icon.png', 180, 'full']
];

function shoot(url, size, file) {
  return new Promise(resolve => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kkuk-icon-'));
    try { fs.unlinkSync(file); } catch (e) { /* 없음 */ }
    const child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--force-device-scale-factor=1',
      '--default-background-color=00000000', '--allow-file-access-from-files', '--user-data-dir=' + profile,
      '--window-size=' + size + ',' + size, '--virtual-time-budget=3000', '--screenshot=' + file, url], { stdio: 'ignore' });
    const timer = setTimeout(() => { try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) { child.kill(); } }, 30000);
    child.on('exit', () => { clearTimeout(timer); resolve(fs.existsSync(file)); });
  });
}

(async () => {
  for (const [name, size, mode] of targets) {
    const file = path.join(out, name);
    const ok = await shoot(page + '?size=' + size + '&mode=' + mode, size, file);
    if (!ok) { console.log('✗ ' + name); continue; }
    const b = fs.readFileSync(file);
    console.log(`web/icons/${name}  ${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`);
  }
})();
