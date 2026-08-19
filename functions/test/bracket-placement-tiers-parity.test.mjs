import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { createRequire } from 'node:module';

/**
 * O script de histórico não pode importar o bundle compilado das functions, então
 * `scripts/lib/bracket-placement-tiers.js` é cópia de `src/bracket-placement-tiers.ts`.
 * Divergência entre as duas faz o passado ser recalculado com regra diferente da do
 * presente — exatamente o problema que esta feature existe para resolver.
 */
const require = createRequire(import.meta.url);
const {
  placementTiersFromMatches,
  tierForTopPosition,
} = require('../scripts/lib/bracket-placement-tiers.js');

/** `winnerAdvance` = chave com fiação; `loserAdvance` = perdedor segue vivo. */
const m = (matchType, round, perdedorSegueVivo = false) => ({
  matchType,
  round,
  winnerAdvance: { matchNumber: 999, teamSlot: 'teamAId' },
  ...(perdedorSegueVivo ? { loserAdvance: { matchNumber: 998, teamSlot: 'teamAId' } } : {}),
});
const many = (n, matchType, round) => Array.from({ length: n }, () => m(matchType, round));

describe('cópia JS dos degraus', () => {
  test('mesma faixa por topo de posição', () => {
    assert.equal(tierForTopPosition(5), 'quarters');
    assert.equal(tierForTopPosition(8), 'quarters');
    assert.equal(tierForTopPosition(9), 'r16');
    assert.equal(tierForTopPosition(16), 'r16');
    assert.equal(tierForTopPosition(17), 'r32');
    assert.equal(tierForTopPosition(33), 'r32');
  });

  test('planta de 22: mesmos degraus da versão TypeScript', () => {
    const matches = [
      ...many(6, 'LB', 1),
      ...many(4, 'LB', 2),
      ...many(4, 'LB', 3),
      ...many(2, 'LB', 4),
      ...many(2, 'LB', 5),
      m('LB', 6, true),
      m('THIRD_PLACE', 1),
      m('FINAL', 1),
    ];
    assert.deepEqual(placementTiersFromMatches(matches).lb, {
      1: 'r32',
      2: 'r16',
      3: 'r16',
      4: 'quarters',
      5: 'quarters',
    });
  });

  test('mata-mata simples de 32', () => {
    const matches = [
      ...many(16, 'knockout', 1),
      ...many(8, 'knockout', 2),
      ...many(4, 'knockout', 3),
      m('knockout', 4, true),
      m('knockout', 4, true),
      m('FINAL', 5),
      m('THIRD_PLACE', 5),
    ];
    assert.deepEqual(placementTiersFromMatches(matches).knockout, {
      1: 'r32',
      2: 'r16',
      3: 'quarters',
    });
  });

  test('chave sem fiação não ganha degrau (não adivinha)', () => {
    const matches = [
      { matchType: 'LB', round: 1 },
      { matchType: 'LB', round: 2 },
      { matchType: 'FINAL', round: 1 },
    ];
    assert.deepEqual(placementTiersFromMatches(matches), { lb: {}, knockout: {} });
  });
});
