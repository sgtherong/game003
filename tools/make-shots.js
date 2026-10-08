// Google Play 휴대폰 스크린샷 생성:  node tools/make-shots.js [언어 ...]   (기본: ko en)
// 로컬 서버(포트 5199)를 잠시 띄우고, 헤드리스 Chrome/Edge로 tools/shots.html의 장면을 1080×1920으로 찍는다.
// 헤드리스 창은 폭 500px 아래로 줄지 않으므로 500×889 @2.16배로 찍는다(큰 휴대폰 화면 폭).
// 결과: store/screenshots/<언어>/<번호>-<장면>.png. 띄운 서버·브라우저 프로세스만(PID) 정리한다.
'use strict';
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.join(__dirname, '..');
const PORT = 5199;
const SCENES = ['menu', 'play', 'growth', 'duel', 'skins'];
const langs = process.argv.slice(2).length ? process.argv.slice(2) : ['ko', 'en'];
const browser = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].find(p => fs.existsSync(p));
if (!browser) { console.error('Chrome/Edge를 찾지 못했습니다.'); process.exit(1); }

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) { try { child.kill(); } catch (e2) { /* 이미 종료 */ } }
}

function shoot(url, out) {
  return new Promise((resolve) => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kkuk-shot-'));
    try { fs.unlinkSync(out); } catch (e) { /* 없음 */ }
    const child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--mute-audio',
      '--force-device-scale-factor=2.16', '--user-data-dir=' + profile, '--window-size=500,889', '--virtual-time-budget=8000',
      '--screenshot=' + out, url], { stdio: 'ignore' });
    const timer = setTimeout(() => killTree(child), 60000);
    child.on('exit', () => { clearTimeout(timer); resolve(fs.existsSync(out)); });
  });
}

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, 'serve.js')], { env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: 'ignore' });
  try {
    await new Promise(r => setTimeout(r, 800));
    for (const lang of langs) {
      const dir = path.join(root, 'store', 'screenshots', lang);
      fs.mkdirSync(dir, { recursive: true });
      for (let i = 0; i < SCENES.length; i++) {
        const out = path.join(dir, (i + 1) + '-' + SCENES[i] + '.png');
        const ok = await shoot(`http://localhost:${PORT}/tools/shots.html?scene=${SCENES[i]}&lang=${encodeURIComponent(lang)}`, out);
        if (!ok) { console.log('✗ ' + lang + ' ' + SCENES[i]); continue; }
        const b = fs.readFileSync(out);
        console.log(`store/screenshots/${lang}/${path.basename(out)}  ${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`);
      }
    }
  } finally {
    killTree(server);
  }
})();
