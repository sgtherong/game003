// 공유 미리보기 이미지 생성:  node tools/make-thumbnail.js
// tools/thumbnail.html 을 헤드리스 Chrome(또는 Edge)으로 1200×630 크기로 찍어 web/og-image.png 로 저장한다.
// 띄운 브라우저 프로세스만(PID) 정리한다.
'use strict';
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.join(__dirname, '..');
const out = path.join(root, 'web', 'og-image.png');
const page = 'file:///' + path.join(__dirname, 'thumbnail.html').replace(/\\/g, '/');
const candidates = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
];
const browser = candidates.find(p => fs.existsSync(p));
if (!browser) { console.error('Chrome/Edge를 찾지 못했습니다.'); process.exit(1); }

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kkuk-thumb-'));
try { fs.unlinkSync(out); } catch (e) {}
const child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--force-device-scale-factor=1',
  '--user-data-dir=' + profile, '--window-size=1200,630', '--virtual-time-budget=3000', '--screenshot=' + out, page], { stdio: 'ignore' });

const timer = setTimeout(() => { try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) { child.kill(); } }, 30000);
child.on('exit', () => {
  clearTimeout(timer);
  if (!fs.existsSync(out)) { console.error('스크린샷 실패'); process.exit(1); }
  const b = fs.readFileSync(out);
  console.log(`web/og-image.png  ${b.readUInt32BE(16)}x${b.readUInt32BE(20)}  ${b.length} bytes`);
});
