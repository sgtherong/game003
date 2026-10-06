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
  var LANGUAGES = ['ko', 'en'];
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
      settings: { sfx: true, music: false, haptics: true, reducedEffects: false, language: 'ko' },
      records: {},
      lastInputMode: 'touch',
      cosmetics: { unlocked: ['base'], equipped: 'base' },
      softCurrency: 0,
      claimedRewardIds: [],
      missions: { active: [], done: 0, tiers: {} },
      daily: null, // { date, best: { height, passed } | null, attempts, bonusClaimed, replay | null }
      nickname: ''  // 도전장에 표시할 이름(선택, 최대 12자)
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
    ['sfx', 'music', 'haptics', 'reducedEffects'].forEach(function (k) {
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

    return { profile: out, repaired: repaired };
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

  return {
    SCHEMA_VERSION: SCHEMA_VERSION, PRIMARY_KEY: PRIMARY_KEY, BACKUP_KEY: BACKUP_KEY, INPUT_MODES: INPUT_MODES,
    defaultProfile: defaultProfile, recordKey: recordKey, registerCosmetics: registerCosmetics, registerMissions: registerMissions, validateSave: validateSave, serializeSave: serializeSave,
    load: load, save: save, getRecord: getRecord, applyRunResult: applyRunResult, memoryStore: memoryStore
  };
});
