// 출시 생성 정책(g1) 오프라인 검사:  node tests/seed-sweep.js [시드 수] [장애물 수] [반응 지연 틱...]
// 터치 제약 자동 조작으로 각 시드를 돌리고, 실패 조합과 재현 정보를 reports/seed-sweep.json에 남긴다.
// 반응 지연은 자동 조작의 결정을 N틱 늦게 적용해 여유를 본다. 사람의 실력·재미를 대변하지 않는다.
'use strict';
const fs = require('fs');
const path = require('path');
const balance = require('../src/balance-r1.js');
const Simulation = require('../src/simulation.js');
const { createAutopilot, decisionToOps } = require('./autopilot.js');

const seeds = Number(process.argv[2]) || 100;
const gates = Number(process.argv[3]) || 200;
const delays = process.argv.slice(4).map(Number);
if (!delays.length) delays.push(0, 6, 8);
const DT = balance.world.fixedStepSeconds;

function sweep(delay) {
  const failures = [], groups = {};
  let survived = 0, fallbacks = 0;
  for (let s = 1; s <= seeds; s++) {
    const seed = (s * 2654435761) >>> 0;
    const run = Simulation.createRun({ balance, seed, rulesVersion: 'r1' });
    const bot = createAutopilot(balance);
    const blocks = {}, queue = [];
    let lastTarget = null, death = null;
    while (run.alive && run.passedCount < gates) {
      for (const g of run.gates) if (!blocks[g.block]) blocks[g.block] = g;
      queue.push(bot({ distance: run.distance, x: run.x, energy: run.energy, held: run.logicalHeld, speed: Simulation.currentSpeed(run, balance), gates: run.gates }));
      const d = queue.length > delay ? queue.shift() : { held: false, targetX: null };
      const ops = decisionToOps(d, run.logicalHeld, lastTarget);
      lastTarget = d.held ? d.targetX : null;
      for (const e of Simulation.step(run, { ops, axis: 0 }, DT, balance)) if (e.type === 'death') death = e;
    }
    fallbacks += run.generator.fallbacks;
    if (run.alive) { survived++; continue; }
    const g = run.gates.find(x => x.id === death.gateId);
    const prev = g ? blocks[g.block - 1] : null;
    const group = g ? `${prev ? prev.kind : '-'}>${g.kind} shift ${prev ? Math.abs(g.cx - prev.cx) : 0}${g.block <= 3 ? ' (start section)' : ''}` : death.reason;
    groups[group] = (groups[group] || 0) + 1;
    failures.push({ seed, tick: run.tick, passed: run.passedCount, reason: death.reason, block: g ? g.block : null, group,
      replay: `Simulation.createRun({ balance: balanceR1, seed: ${seed}, rulesVersion: 'r1' }) + autopilot delay ${delay}` });
  }
  return { delayTicks: delay, seeds, gates, survived, fallbacks, groups, failures };
}

const report = {
  createdAt: new Date().toISOString(),
  rulesVersion: 'r1', balanceVersion: balance.balanceVersion, generatorVersion: balance.generator.version,
  connection: balance.generator.connection,
  note: 'Automated touch-constrained bot. Passing does not prove human difficulty or fun.',
  results: delays.map(sweep)
};
fs.mkdirSync(path.join(__dirname, '..', 'reports'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'reports', 'seed-sweep.json'), JSON.stringify(report, null, 2));
for (const r of report.results) {
  console.log(`지연 ${r.delayTicks}틱: ${r.survived}/${r.seeds} 시드가 ${r.gates}개 통과, 대체 블록 ${r.fallbacks}회`);
  for (const [k, v] of Object.entries(r.groups).sort((a, b) => b[1] - a[1])) console.log(`   실패 ${v}  ${k}`);
}
console.log('→ reports/seed-sweep.json');
