// 서비스 워커 — 오프라인 실행(명세서 18.2 "오프라인 상태에서 시작·재시작·기록 저장 정상").
// 전략: 네트워크 우선 + 캐시 대체. 온라인이면 항상 최신 파일을 받고 캐시를 갱신하며, 오프라인이면 캐시로 실행한다.
// 게임 실행 중 서버 통신은 없다(기록·설정은 기기 저장소).
'use strict';
var CACHE = 'kkuk-shell-v8';
var SHELL = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'share-config.js', 'strings.ko.js', 'strings.en.js', 'audio.js', 'skins.js', 'view.js', 'app.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
  '../src/balance-r1.js', '../src/rng.js', '../src/collision.js', '../src/generator.js', '../src/simulation.js',
  '../src/input-adapter.js', '../src/replay.js', '../src/save.js', '../src/tutorial.js', '../src/growth.js', '../src/feats.js', '../src/missions.js', '../src/challenge.js', '../src/game-controller.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('kkuk-shell-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req).then(function (res) {
    if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || caches.match('index.html'); });
  }));
});
