// Mede o orçamento de expressões (teto de 1000/request) do update de `users/{uid}`:
// gera variantes do `firestore.rules` com N esportes na guarda de nível
// (`athleteLevelsNotDowngraded`) e um enchimento de comparações triviais no começo da
// regra; por bissecção acha a FOLGA (unidades de enchimento que ainda cabem) em 4 cenários.
// Folga cai X por esporte = custo do esporte, em unidades (~5 expressões cada, calibrado).
// Não altera o firestore.rules do repo.
//
//   cd functions && firebase emulators:exec --only firestore --project nexago-rules-test \
//     "node scripts/measure-users-rules-budget.mjs"
//   NS=0,9,10,12 (lista de N de esportes na guarda)
//
// Resultado de 05/10/2026 no spec multiesporte (emenda "Medição de 05/10/2026").
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_RULES = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');
const REAL = ['VOLEI_PRAIA','VOLEI_QUADRA','BEACH_TENNIS','FUTEVOLEI','FUTEBOL','BASQUETE','TENIS','CORRIDA','PADEL','OUTROS'];
const sportsFor = (n) => [...REAL, ...Array.from({ length: 20 }, (_, i) => `XTRA_${i + 1}`)].slice(0, n);

const UPDATE_HEAD = 'allow update: if request.auth != null && (\n        (\n          request.auth.uid == userId &&';
if (!BASE_RULES.includes(UPDATE_HEAD)) throw new Error('âncora do update de users não encontrada');
const BLOCK = /\(reqLevels == curLevels \|\| \(\n([\s\S]*?)\n\s*\)\);\n\s*\}\n\s*\/\/ O dono nunca escreve o lock/;
if (!BLOCK.test(BASE_RULES)) throw new Error('bloco de esportes não encontrado');

const P10 = Array.from({ length: 10 }, () => '(1 == 1)').join(' && ');
const P100 = Array.from({ length: 10 }, () => 'expPad10()').join(' && ');
const PAD_FUNCS = `    function expPad10() { return ${P10}; }\n    function expPad100() { return ${P100}; }\n`;
/** k unidades = centenas via expPad100(), dezenas via expPad10(), resto inline (árvore rasa). */
function pad(k) {
  const parts = [];
  for (let i = 0; i < Math.floor(k / 100); i++) parts.push('expPad100()');
  for (let i = 0; i < Math.floor((k % 100) / 10); i++) parts.push('expPad10()');
  for (let i = 0; i < k % 10; i++) parts.push('(1 == 1)');
  return parts.map((p) => p + ' && ').join('');
}

function rulesFor(n, k) {
  const sports = sportsFor(n);
  const lines = sports.length
    ? sports.map((s) => `          sportLevelOk(reqLevels.get('${s}', null), curLevels.get('${s}', null), ranks, lockedSports.get('${s}', false))`).join(' &&\n')
    : '          true';
  let r = BASE_RULES.replace(BLOCK, (m) => m.replace(/\(reqLevels == curLevels \|\| \(\n[\s\S]*?\n(\s*)\)\);/, `(reqLevels == curLevels || (\n${lines}\n$1));`));
  r = r.replace(UPDATE_HEAD, `allow update: if ${pad(k)}request.auth != null && (\n        (\n          request.auth.uid == userId &&`);
  // Coleção de calibração: só enchimento.
  r = r.replace('    match /{document=**} {', `    match /probeCal/{id} { allow write: if ${pad(k)}true; }\n    match /{document=**} {`);
  r = r.replace('    function isSuperAdmin() {', PAD_FUNCS + '    function isSuperAdmin() {');
  return r;
}

const baseUser = {
  fullName: 'Atleta Teste', email: 'atleta@test.dev', roles: ['athlete'], city: 'Goiânia',
  level: 'intermediario_1', sportProfile: { level: 'intermediario_1' },
};
function user(n, locked) {
  const sports = sportsFor(Math.max(n, 1));
  return {
    ...baseUser,
    sportOnboarding: {
      version: 1, primarySportId: 'VOLEI_PRAIA', secondarySportIds: sports.slice(1),
      levelsBySport: Object.fromEntries(sports.map((s) => [s, 'intermediario_1'])),
      ...(locked ? { levelLocked: Object.fromEntries(sports.map((s) => [s, true])) } : {}),
    },
  };
}
const raiseAll = (n) => Object.fromEntries(sportsFor(n).map((s) => [`sportOnboarding.levelsBySport.${s}`, 'intermediario_2']));

const SCENARIOS = {
  'sobe global (permitida)': { seed: (n) => user(n, false), patch: () => ({ level: 'open' }), expect: 'allow' },
  'rebaixa global (negada)': { seed: (n) => user(n, false), patch: () => ({ level: 'iniciante_1' }), expect: 'deny' },
  'sobe todos travados + global (permitida)': { seed: (n) => user(n, true), patch: (n) => ({ ...raiseAll(n), level: 'intermediario_2', 'sportProfile.level': 'intermediario_2' }), expect: 'allow' },
  'rebaixa 1 esporte travado (negada)': { seed: (n) => user(n, true), patch: () => ({ 'sportOnboarding.levelsBySport.VOLEI_PRAIA': 'iniciante_1' }), expect: 'deny' },
};

let seq = 0;
async function attempt(n, k, scenario) {
  const env = await initializeTestEnvironment({ projectId: `exp-${seq++}`, firestore: { rules: rulesFor(n, k) } });
  try {
    if (scenario === 'calibração') {
      try { await setDoc(doc(env.authenticatedContext('u1').firestore(), 'probeCal', 'p'), { a: 1 }); return 'ok'; }
      catch (e) { return /maximum of \d+ expressions/i.test(String(e.message)) ? 'limit' : 'denied'; }
    }
    const sc = SCENARIOS[scenario];
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'users', 'u1'), sc.seed(n)));
    try {
      await updateDoc(doc(env.authenticatedContext('u1').firestore(), 'users', 'u1'), sc.patch(n));
      return sc.expect === 'allow' ? 'ok' : 'WRONG_ALLOW';
    } catch (e) {
      const m = String(e.message);
      if (/maximum of \d+ expressions/i.test(m)) return 'limit';
      return sc.expect === 'deny' ? 'ok' : 'WRONG_DENY:' + m.slice(0, 80);
    }
  } finally { await env.cleanup(); }
}

/** Maior enchimento k (0..hi) com resultado correto; -1 se nem k=0 cabe. */
async function headroom(n, scenario, hi = 1200) {
  const r0 = await attempt(n, 0, scenario);
  if (r0 !== 'ok') return { k: -1, note: r0 };
  let lo = 0, top = hi;
  while (lo < top) {
    const mid = Math.ceil((lo + top) / 2);
    const r = await attempt(n, mid, scenario);
    if (r === 'ok') lo = mid; else if (r === 'limit') top = mid - 1; else return { k: lo, note: `parou: ${r}` };
  }
  return { k: lo, note: '' };
}

const cal = await headroom(0, 'calibração', 2000);
console.log(`CALIBRAÇÃO: coleção só com enchimento cabe k=${cal.k} → ~${(1000 / (cal.k + 1)).toFixed(2)} expressões por unidade`);
const Ns = (process.env.NS ?? '0,5,10,11,12').split(',').map(Number);
for (const scenario of Object.keys(SCENARIOS)) {
  const row = [];
  for (const n of Ns) {
    const h = await headroom(n, scenario);
    row.push(`N=${n}: ${h.k}${h.note ? ` (${h.note})` : ''}`);
  }
  console.log(`${scenario} | ${row.join(' | ')}`);
}
