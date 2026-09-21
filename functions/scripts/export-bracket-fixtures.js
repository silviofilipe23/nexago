// functions/scripts/export-bracket-fixtures.js
//
// Exporta TODAS as plantas materializadas para um fixture consumido pelos
// testes de layout do app e dos portais. Roda depois de `npm run build` em
// functions/, porque lê o JS compilado em lib/.
//
// Uso: node scripts/export-bracket-fixtures.js
const fs = require('node:fs');
const path = require('node:path');

const {BRACKET_DEFINITIONS} = require('../lib/bracket-definitions/bracket-definitions');
const {buildMatchesFromDefinition} = require('../lib/category-bracket-builders');

/** 'teamAId' → 'A' — o modelo do app usa a letra, a CF grava o nome do campo. */
function slotLetter(slot) {
  if (slot === 'teamAId') return 'A';
  if (slot === 'teamBId') return 'B';
  return null;
}

const out = {};
for (const [teamCount, definition] of Object.entries(BRACKET_DEFINITIONS)) {
  const n = Number(teamCount);
  const teamIds = Array.from({length: n}, (_, i) => `t${i + 1}`);
  out[teamCount] = buildMatchesFromDefinition(definition, teamIds)
    .sort((a, b) => a.matchNumber - b.matchNumber)
    .map((m) => ({
      matchNumber: m.matchNumber,
      matchType: m.matchType,
      round: m.round,
      winnerAdvanceMatchNumber: m.winnerAdvance?.matchNumber ?? null,
      winnerAdvanceSlot: slotLetter(m.winnerAdvance?.teamSlot) ?? null,
      loserAdvanceMatchNumber: m.loserAdvance?.matchNumber ?? null,
      loserAdvanceSlot: slotLetter(m.loserAdvance?.teamSlot) ?? null,
    }));
}

const dest = path.join(
  __dirname, '..', '..', 'nexago_app', 'test', 'fixtures', 'bracket_plants.json',
);
fs.mkdirSync(path.dirname(dest), {recursive: true});
fs.writeFileSync(dest, `${JSON.stringify(out, null, 2)}\n`);
console.log(`${Object.keys(out).length} plantas exportadas para ${dest}`);
