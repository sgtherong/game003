// SaveAdapter — 프로필 직렬화·검증·복구·기록 갱신. 명세서 15장 (FIX-01, FIX-05)
// 저장 매체(localStorage 등)에는 의존하지 않는다. store = { read(key), write(key, text) }를 주입한다.
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var Replay = isNode ? require('./replay.js') : root.KKUK.Replay;
  var mod = factory(Replay);
  if (isNode) module.exports = mod;
  else { root.KKUK = root.KKUK || {}; root.KKUK.Save = mod; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Replay) {
  'use strict';

  var SCHEMA_VERSION = 1;
  var PRIMARY_KEY = 'kkuk.profile';
  var BACKUP_KEY = 'kkuk.profile.backup';
  var INPUT_MODES = ['touch', 'keyboard', 'mixed'];
  var KNOWN_COSMETICS = ['base']; // registerCosmetics()로 설정의 스킨 목록을 등록한다
  // 지원 언어(설정 화면 표시 순서). web/strings.<코드>.js 와 일치해야 한다(tools/check-strings.js)
  var LANGUAGES = ['ko', 'en', 'ja', 'zh-Hans', 'zh-Hant', 'es', 'pt', 'fr', 'de', 'it', 'nl', 'pl', 'ru', 'tr', 'id', 'vi', 'th', 'hi'];
  var MAX_HEIGHT = 1e7;   // 비정상 값 차단용 상한
  var MAX_COUNT = 1e6;

  // 알려진 외형 ID 등록(설정 파일의 스킨 목록). 등록되지 않은 ID는 검증에서 제거된다.
  var KNOWN_MISSIONS = [];
  function registerMissions(ids) {
    (ids || []).forEach(function (id) { if (typeof id === 'string' && KNOWN_MISSIONS.indexOf(id) < 0) KNOWN_MISSIONS.push(id); });
    return KNOWN_MISSIONS.slice();
  }

  function registerCosmetics(ids) {
    (ids || []).forEach(function (id) { if (typeof id === 'string' && KNOWN_COSMETICS.indexOf(id) < 0) KNOWN_COSMETICS.push(id); });
    return KNOWN_COSMETICS.slice();
  }

  function defaultProfile() {
    return {
      schemaVersion: SCHEMA_VERSION,
      tutorialCompleted: false,
      settings: { sfx: true, bgm: true, haptics: true, reducedEffects: false, language: 'ko' },
      records: {},
      lastInputMode: 'touch',
      cosmetics: { unlocked: ['base'], equipped: 'base' },
      softCurrency: 0,
      claimedRewardIds: [],
      missions: { active: [], done: 0, tiers: {} },
      daily: null, // { date, best: { height, passed } | null, attempts, bonusClaimed, replay | null }
      nickname: '',  // 도전장에 표시할 이름(선택, 최대 12자)
      // 순위(기기 안에서만): 모드별 상위 10판 { h, p, at, m: 입력 방식, v: 규칙|설정 버전, s: 외형 }
      history: { challenge: [], growth: [], daily: [] },
      // 받은 도전장의 친구 기록 { n: 이름, h, p, at, my: 그 코스에서 내 최고, r: ''|'win'|'lose'|'draw' } (최근 30명)
      friends: []
    };
  }

  // 기록 키: rulesVersion + balanceVersion + inputMode
  function recordKey(rulesVersion, balanceVersion, inputMode) {
    return rulesVersion + '|' + balanceVersion + '|' + inputMode;
  }
  function parseRecordKey(key) {
    var p = String(key).split('|');
    return p.length === 3 ? { rulesVersion: p[0], balanceVersion: p[1], inputMode: p[2] } : null;
  }

  function isInt(v, max) { return typeof v === 'number' && isFinite(v) && v >= 0 && v <= max && Math.floor(v) === v; }
  function isBool(v) { return typeof v === 'boolean'; }

  function validRecord(r) {
    return r && typeof r === 'object' && isInt(r.height, MAX_HEIGHT) && isInt(r.passed, MAX_COUNT) &&
      typeof r.achievedAt === 'string' && !isNaN(Date.parse(r.achievedAt));
  }

  function migrate(raw, repaired) {
    // schemaVersion 1이 첫 버전. 이후 버전 추가 시 여기서 단계별로 올린다.
    if (raw.schemaVersion !== SCHEMA_VERSION) repaired.push('schemaVersion');
    return raw;
  }

  // 손상된 항목만 안전 기본값으로 복구한다. 반환: { profile, repaired: [필드 경로] }
  function validateSave(raw) {
    var repaired = [];
    var d = defaultProfile();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { profile: d, repaired: ['*'] };
    raw = migrate(raw, repaired);
    var out = defaultProfile();

    out.tutorialCompleted = isBool(raw.tutorialCompleted) ? raw.tutorialCompleted : (repaired.push('tutorialCompleted'), d.tutorialCompleted);

    var s = raw.settings && typeof raw.settings === 'object' ? raw.settings : (repaired.push('settings'), {});
    ['sfx', 'bgm', 'haptics', 'reducedEffects'].forEach(function (k) {
      if (isBool(s[k])) out.settings[k] = s[k]; else if (raw.settings) repaired.push('settings.' + k);
    });
    if (LANGUAGES.indexOf(s.language) >= 0) out.settings.language = s.language; else if (raw.settings) repaired.push('settings.language');

    if (raw.records && typeof raw.records === 'object' && !Array.isArray(raw.records)) {
      Object.keys(raw.records).forEach(function (k) {
        var key = parseRecordKey(k);
        if (key && INPUT_MODES.indexOf(key.inputMode) >= 0 && validRecord(raw.records[k])) {
          var r = raw.records[k];
          out.records[k] = { height: r.height, passed: r.passed, achievedAt: r.achievedAt };
        } else repaired.push('records.' + k);
      });
    } else repaired.push('records');

    if (INPUT_MODES.indexOf(raw.lastInputMode) >= 0 && raw.lastInputMode !== 'mixed') out.lastInputMode = raw.lastInputMode;
    else if (raw.lastInputMode !== undefined) repaired.push('lastInputMode');

    var c = raw.cosmetics && typeof raw.cosmetics === 'object' ? raw.cosmetics : null;
    if (c && Array.isArray(c.unlocked)) {
      var known = c.unlocked.filter(function (id) { return KNOWN_COSMETICS.indexOf(id) >= 0; });
      if (known.length !== c.unlocked.length) repaired.push('cosmetics.unlocked');
      if (known.indexOf('base') < 0) known.unshift('base');
      out.cosmetics.unlocked = known.filter(function (id, i) { return known.indexOf(id) === i; });
      if (out.cosmetics.unlocked.indexOf(c.equipped) >= 0) out.cosmetics.equipped = c.equipped; else repaired.push('cosmetics.equipped');
    } else repaired.push('cosmetics');

    if (isInt(raw.softCurrency, MAX_COUNT)) out.softCurrency = raw.softCurrency; else repaired.push('softCurrency');

    if (Array.isArray(raw.claimedRewardIds)) {
      out.claimedRewardIds = raw.claimedRewardIds.filter(function (id) { return typeof id === 'string' && id.length <= 64; }).slice(-500);
      if (out.claimedRewardIds.length !== raw.claimedRewardIds.length) repaired.push('claimedRewardIds');
    } else repaired.push('claimedRewardIds');

    // 미션: 알려진 ID와 유한한 숫자만 유지
    var m = raw.missions;
    if (m && typeof m === 'object' && Array.isArray(m.active)) {
      out.missions.active = m.active.filter(function (a) {
        return a && KNOWN_MISSIONS.indexOf(a.id) >= 0 && isInt(Math.floor(a.progress), MAX_COUNT) && isFinite(a.progress);
      }).map(function (a) { return { id: a.id, progress: a.progress }; }).slice(0, 5);
      if (out.missions.active.length !== m.active.length) repaired.push('missions.active');
      out.missions.done = isInt(m.done, MAX_COUNT) ? m.done : (repaired.push('missions.done'), 0);
      if (m.tiers && typeof m.tiers === 'object') {
        Object.keys(m.tiers).forEach(function (k) { if (KNOWN_MISSIONS.indexOf(k) >= 0 && isInt(m.tiers[k], 1000)) out.missions.tiers[k] = m.tiers[k]; else repaired.push('missions.tiers.' + k); });
      }
    } else if (raw.missions !== undefined) repaired.push('missions');

    // 닉네임: 제어 문자 제거, 최대 12자
    if (typeof raw.nickname === 'string') {
      out.nickname = Array.from(raw.nickname.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, '').trim()).slice(0, 12).join('');
    } else if (raw.nickname !== undefined) repaired.push('nickname');

    // 오늘의 도전: 날짜 형식·숫자·고스트 기록 검증(손상되면 고스트만 버림)
    var dy = raw.daily;
    if (dy && typeof dy === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(dy.date)) {
      out.daily = {
        date: dy.date,
        best: dy.best && isInt(dy.best.height, MAX_HEIGHT) && isInt(dy.best.passed, MAX_COUNT) ? { height: dy.best.height, passed: dy.best.passed } : null,
        attempts: isInt(dy.attempts, MAX_COUNT) ? dy.attempts : 0,
        bonusClaimed: dy.bonusClaimed === true,
        replay: dy.replay && Replay.validReplay(dy.replay) ? dy.replay : null
      };
      if (dy.replay && !out.daily.replay) repaired.push('daily.replay');
    } else if (dy != null) repaired.push('daily');

    // 순위 기록: 알 수 없는 모드·형식은 버림, 모드별 최대 10개
    if (raw.history && typeof raw.history === 'object' && !Array.isArray(raw.history)) {
      HISTORY_MODES.forEach(function (pm) {
        var list = raw.history[pm];
        if (!Array.isArray(list)) { if (list !== undefined) repaired.push('history.' + pm); return; }
        var ok = list.filter(validHistory).map(function (e) { return { h: e.h, p: e.p, at: e.at, m: e.m, v: e.v, s: e.s }; });
        if (ok.length !== list.length) repaired.push('history.' + pm);
        out.history[pm] = sortRuns(ok).slice(0, HISTORY_MAX);
      });
    } else if (raw.history !== undefined) repaired.push('history');
    if (Array.isArray(raw.friends)) {
      out.friends = raw.friends.filter(validFriend).map(function (f) { return { n: cleanText(f.n), h: f.h, p: f.p, at: f.at, my: f.my, r: f.r }; }).slice(0, FRIENDS_MAX);
      if (out.friends.length !== raw.friends.length) repaired.push('friends');
    } else if (raw.friends !== undefined) repaired.push('friends');

    return { profile: out, repaired: repaired };
  }

  // ── 순위(기기 안에서만) ──
  var HISTORY_MODES = ['challenge', 'growth', 'daily'], HISTORY_MAX = 10, FRIENDS_MAX = 30;
  function cleanText(s) { return Array.from(String(s).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, '').trim()).slice(0, 12).join(''); }
  function isDate(s) { return typeof s === 'string' && s.length <= 40 && !isNaN(Date.parse(s)); }
  function validHistory(e) {
    return e && typeof e === 'object' && isInt(e.h, MAX_HEIGHT) && isInt(e.p, MAX_COUNT) && isDate(e.at) &&
      INPUT_MODES.indexOf(e.m) >= 0 && typeof e.v === 'string' && e.v.length <= 40 && typeof e.s === 'string' && e.s.length <= 24;
  }
  function validFriend(f) {
    return f && typeof f === 'object' && typeof f.n === 'string' && isInt(f.h, MAX_HEIGHT) && isInt(f.p, MAX_COUNT) && isDate(f.at) &&
      isInt(f.my, MAX_HEIGHT) && ['', 'win', 'lose', 'draw'].indexOf(f.r) >= 0;
  }
  function sortRuns(list) { return list.slice().sort(function (a, b) { return b.h - a.h || b.p - a.p || (a.at < b.at ? -1 : a.at > b.at ? 1 : 0); }); }
  // 판 하나를 넣고 이번 판의 순위(1~10, 밖이면 0)를 돌려준다. 버전(v)이 다른 옛 기록은 비교할 수 없어 버린다.
  function addHistory(profile, playMode, entry) {
    if (HISTORY_MODES.indexOf(playMode) < 0 || !validHistory(entry)) return 0;
    if (!profile.history) profile.history = { challenge: [], growth: [], daily: [] };
    var mine = { h: entry.h, p: entry.p, at: entry.at, m: entry.m, v: entry.v, s: entry.s };
    var list = (profile.history[playMode] || []).filter(function (e) { return e.v === entry.v; });
    list.push(mine);
    list = sortRuns(list).slice(0, HISTORY_MAX);
    profile.history[playMode] = list;
    var i = list.indexOf(mine);
    return i < 0 ? 0 : i + 1;
  }
  function getHistory(profile, playMode, v) {
    return ((profile.history && profile.history[playMode]) || []).filter(function (e) { return !v || e.v === v; });
  }
  // 받은 도전장의 친구 기록: 같은 이름은 하나로(더 높은 기록 유지), 최근 30명
  function addFriend(profile, f) {
    if (!profile.friends) profile.friends = [];
    var n = cleanText(f.n || ''), key = n.toLowerCase();
    var prev = null;
    profile.friends = profile.friends.filter(function (x) { if (x.n.toLowerCase() === key) { prev = x; return false; } return true; });
    var e = { n: n, h: f.h, p: f.p, at: f.at, my: prev ? prev.my : 0, r: prev ? prev.r : '' };
    if (prev && prev.h > f.h) { e.h = prev.h; e.p = prev.p; }
    if (!validFriend(e)) { if (prev) profile.friends.unshift(prev); return null; }
    profile.friends.unshift(e);
    profile.friends = profile.friends.slice(0, FRIENDS_MAX);
    return e;
  }
  // 그 친구 코스로 대결한 결과: 내 최고와 마지막 승패
  function setFriendResult(profile, name, myHeight, result) {
    var key = cleanText(name || '').toLowerCase();
    var f = (profile.friends || []).filter(function (x) { return x.n.toLowerCase() === key; })[0];
    if (!f) return null;
    if (isInt(myHeight, MAX_HEIGHT) && myHeight > f.my) f.my = myHeight;
    if (['win', 'lose', 'draw'].indexOf(result) >= 0) f.r = result;
    return f;
  }

  function serializeSave(profile) { return JSON.stringify(profile); }

  function tryParse(text) {
    if (typeof text !== 'string' || !text) return null;
    try { return JSON.parse(text); } catch (e) { return null; }
  }

  // 주 저장본 → 실패 시 마지막 정상 백업 → 실패 시 기본값.
  function load(store) {
    var primaryRaw = tryParse(safeRead(store, PRIMARY_KEY));
    if (primaryRaw) {
      var v = validateSave(primaryRaw);
      if (v.repaired.indexOf('*') < 0) return { profile: v.profile, source: 'primary', repaired: v.repaired };
    }
    var backupRaw = tryParse(safeRead(store, BACKUP_KEY));
    if (backupRaw) {
      var b = validateSave(backupRaw);
      if (b.repaired.indexOf('*') < 0) return { profile: b.profile, source: 'backup', repaired: b.repaired };
    }
    return { profile: defaultProfile(), source: primaryRaw || backupRaw ? 'reset' : 'new', repaired: [] };
  }

  // 현재 주 저장본이 정상이면 백업으로 옮긴 뒤 새 주 저장본을 쓴다.
  function save(store, profile) {
    try {
      var current = tryParse(safeRead(store, PRIMARY_KEY));
      if (current && validateSave(current).repaired.indexOf('*') < 0) store.write(BACKUP_KEY, serializeSave(current));
      store.write(PRIMARY_KEY, serializeSave(profile));
      return true;
    } catch (e) {
      return false; // 저장 실패는 게임 진행을 막지 않는다
    }
  }

  function safeRead(store, key) { try { return store.read(key); } catch (e) { return null; } }

  function getRecord(profile, rulesVersion, balanceVersion, inputMode) {
    return profile.records[recordKey(rulesVersion, balanceVersion, inputMode)] || null;
  }

  // 결과 확정 시 1회 호출. 반환: { isBest, record, key }
  function applyRunResult(profile, result, nowIso) {
    var key = recordKey(result.rulesVersion, result.balanceVersion, result.inputMode);
    var prev = profile.records[key];
    var isBest = !prev || result.height > prev.height;
    if (isBest) profile.records[key] = { height: result.height, passed: result.passed, achievedAt: nowIso };
    if (result.inputMode !== 'mixed') profile.lastInputMode = result.inputMode;
    return { isBest: isBest, record: profile.records[key], key: key };
  }

  function memoryStore(initial) {
    var data = Object.assign({}, initial || {});
    return { read: function (k) { return k in data ? data[k] : null; }, write: function (k, v) { data[k] = String(v); }, data: data };
  }

  // 기기 언어 목록(navigator.languages)에서 지원 언어를 고른다. 없으면 영어.
  // 중국어는 번체(대만·홍콩·마카오, 또는 Hant 표기)와 간체를 나눈다.
  function pickLanguage(tags) {
    var list = Array.isArray(tags) ? tags : [tags];
    for (var i = 0; i < list.length; i++) {
      var t = String(list[i] || '').toLowerCase();
      if (!t) continue;
      var base = t.split(/[-_]/)[0];
      if (base === 'zh') return /hant|-tw|-hk|-mo|_tw|_hk|_mo/.test(t) ? 'zh-Hant' : 'zh-Hans';
      if (LANGUAGES.indexOf(base) >= 0) return base;
      if (base === 'in') return 'id'; // 예전 인도네시아어 코드
    }
    return 'en';
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION, LANGUAGES: LANGUAGES, pickLanguage: pickLanguage, PRIMARY_KEY: PRIMARY_KEY, BACKUP_KEY: BACKUP_KEY, INPUT_MODES: INPUT_MODES,
    defaultProfile: defaultProfile, recordKey: recordKey, addHistory: addHistory, getHistory: getHistory, addFriend: addFriend, setFriendResult: setFriendResult, HISTORY_MAX: HISTORY_MAX, registerCosmetics: registerCosmetics, registerMissions: registerMissions, validateSave: validateSave, serializeSave: serializeSave,
    load: load, save: save, getRecord: getRecord, applyRunResult: applyRunResult, memoryStore: memoryStore
  };
});
