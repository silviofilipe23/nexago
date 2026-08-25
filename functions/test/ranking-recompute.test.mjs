import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { createRequire } from 'node:module';

/**
 * Guarda da matemática do recálculo retroativo do ranking geral
 * (`scripts/recompute-ranking-weights.js`). Este módulo decide quanto vale
 * CADA resultado já gravado do histórico: um peso inferido errado reescreve
 * o ranking inteiro de um torneio, e nada disso aparece em teste de UI ou de
 * trigger. As tabelas aqui são cópias de `functions/src/tournament-ranking.ts`
 * e `functions/src/category-presets.ts` (script standalone, sem import do
 * bundle compilado) — o teste é o que trava a paridade.
 */

const require = createRequire(import.meta.url);
const {
  basePointsForFinalPlace,
  levelRank,
  presetWeightForCategory,
  sanitizeRankingWeight,
  bracketSizeFactor,
  pointsForEntry,
  aggregateRankingResults,
} = require('../scripts/lib/ranking-recompute.js');

describe('basePointsForFinalPlace', () => {
  test('colocações do pódio vêm da tabela-base ×10', () => {
    assert.equal(basePointsForFinalPlace(1), 1000);
    assert.equal(basePointsForFinalPlace(2), 800);
    assert.equal(basePointsForFinalPlace(3), 600);
    assert.equal(basePointsForFinalPlace(4), 500);
  });

  test('a escada por fase: 5 quartas, 9 oitavas, 17 16-avos, 0 participação', () => {
    assert.equal(basePointsForFinalPlace(5), 330);
    assert.equal(basePointsForFinalPlace(9), 200);
    assert.equal(basePointsForFinalPlace(17), 130);
    assert.equal(basePointsForFinalPlace(0), 100);
  });

  test('colocação fora da tabela devolve null (entrada não é tocada)', () => {
    for (const raw of [6, 7, 8, 10, 18, -1, null, undefined, 'x', NaN]) {
      assert.equal(basePointsForFinalPlace(raw), null, `finalPlace=${String(raw)}`);
    }
  });
});

describe('levelRank (paridade com category-level-eligibility.ts)', () => {
  test('escada de 7 degraus por label e por código', () => {
    assert.equal(levelRank('Iniciante 1'), 0);
    assert.equal(levelRank('iniciante_2'), 1);
    assert.equal(levelRank('Intermediário 1'), 2);
    assert.equal(levelRank('Intermediário 2'), 3);
    assert.equal(levelRank('Avançado 1'), 4);
    assert.equal(levelRank('avancado_2'), 5);
    assert.equal(levelRank('Open'), 6);
  });

  test('acento, caixa e espaço não mudam o degrau', () => {
    assert.equal(levelRank('  INTERMEDIARIO 2 '), 3);
    assert.equal(levelRank('avançado 1'), 4);
  });

  test('legados conhecidos: escada de 3, básico, livre e open/federado', () => {
    assert.equal(levelRank('Iniciante'), 0);
    assert.equal(levelRank('Intermediário'), 2);
    assert.equal(levelRank('Básico'), 0);
    assert.equal(levelRank('Livre'), 6);
    assert.equal(levelRank('Open / federado'), 6);
  });

  test('rótulo desconhecido é null — nunca um degrau chutado', () => {
    for (const raw of ['Profissional', '', null, undefined, 7]) {
      assert.equal(levelRank(raw), null, `label=${String(raw)}`);
    }
  });
});

describe('presetWeightForCategory — categoria COM piso (preset real)', () => {
  test('faixas canônicas devolvem o peso da tabela de presets', () => {
    const casos = [
      [{ minLevel: 'Iniciante 1', level: 'Iniciante 2' }, 0.125, 'iniciante'],
      [{ minLevel: 'Intermediário 1', level: 'Intermediário 2' }, 0.25, 'intermediario'],
      [{ minLevel: 'Avançado 1', level: 'Avançado 2' }, 0.5, 'avancado'],
      [{ minLevel: 'Avançado 1', level: 'Open' }, 1, 'open'],
      [{ minLevel: 'Open', level: 'Open' }, 1.2, 'elite'],
      [{ minLevel: 'Iniciante 1', level: 'Open' }, 0.125, 'livre'],
    ];
    for (const [categoria, peso, chave] of casos) {
      const got = presetWeightForCategory(categoria);
      assert.equal(got.weight, peso, `${categoria.minLevel}..${categoria.level}`);
      assert.equal(got.presetKey, chave);
      assert.equal(got.inferred, false);
    }
  });

  test('faixa fora da tabela cai no peso legado 1 (mesma regra do motor)', () => {
    const got = presetWeightForCategory({ minLevel: 'Intermediário 1', level: 'Avançado 2' });
    assert.equal(got.weight, 1);
    assert.equal(got.presetKey, null);
  });

  test('piso irreconhecível é tratado como categoria sem piso', () => {
    const got = presetWeightForCategory({ minLevel: 'Profissional', level: 'Intermediário 2' });
    assert.equal(got.weight, 0.25);
    assert.equal(got.inferred, true);
  });
});

describe('presetWeightForCategory — categoria LEGADA (sem piso, inferência pelo teto)', () => {
  test('o teto vira a faixa canônica do preset', () => {
    const casos = [
      [{ level: 'Iniciante 1' }, 0.125, 'iniciante'],
      [{ level: 'Iniciante 2' }, 0.125, 'iniciante'],
      [{ level: 'Intermediário 1' }, 0.25, 'intermediario'],
      [{ level: 'Intermediário 2' }, 0.25, 'intermediario'],
      [{ level: 'Avançado 1' }, 0.5, 'avancado'],
      [{ level: 'Avançado 2' }, 0.5, 'avancado'],
    ];
    for (const [categoria, peso, chave] of casos) {
      const got = presetWeightForCategory(categoria);
      assert.equal(got.weight, peso, categoria.level);
      assert.equal(got.presetKey, chave);
      assert.equal(got.inferred, true);
    }
  });

  test('teto Open é ambíguo (open/elite/livre) e resolve em 1 — ninguém perde nem ganha', () => {
    const got = presetWeightForCategory({ level: 'Open' });
    assert.equal(got.weight, 1);
    assert.equal(got.presetKey, 'open');
    assert.equal(got.inferred, true);
  });

  test('legado de 3 degraus infere pelo degrau inferior do split', () => {
    assert.equal(presetWeightForCategory({ level: 'Intermediário' }).weight, 0.25);
    assert.equal(presetWeightForCategory({ level: 'Iniciante' }).weight, 0.125);
  });

  test('categoria ausente ou com teto irreconhecível devolve null (não toca)', () => {
    assert.equal(presetWeightForCategory(null), null);
    assert.equal(presetWeightForCategory(undefined), null);
    assert.equal(presetWeightForCategory({}), null);
    assert.equal(presetWeightForCategory({ level: 'Profissional' }), null);
  });
});

describe('sanitizeRankingWeight (paridade com o motor)', () => {
  test('ausente, zero, negativo e não-numérico caem em 1', () => {
    for (const raw of [undefined, null, 0, -3, NaN, 'abc', {}]) {
      assert.equal(sanitizeRankingWeight(raw), 1, `raw=${String(raw)}`);
    }
  });

  test('peso válido é preservado, inclusive string numérica', () => {
    assert.equal(sanitizeRankingWeight(2), 2);
    assert.equal(sanitizeRankingWeight(1.5), 1.5);
    assert.equal(sanitizeRankingWeight('2'), 2);
  });
});

describe('bracketSizeFactor', () => {
  test('degraus ≥8 / 4–7 / <4', () => {
    assert.equal(bracketSizeFactor(22), 1);
    assert.equal(bracketSizeFactor(8), 1);
    assert.equal(bracketSizeFactor(7), 0.6);
    assert.equal(bracketSizeFactor(4), 0.6);
    assert.equal(bracketSizeFactor(3), 0.25);
    assert.equal(bracketSizeFactor(0), 0.25);
  });
});

describe('pointsForEntry', () => {
  test('Copa Goiás: intermediário legado, chave cheia, sem grade', () => {
    const ctx = { weight: 0.25, rankingWeight: 1, bracketFactor: 1 };
    assert.equal(pointsForEntry(1, ctx), 250);
    assert.equal(pointsForEntry(2, ctx), 200);
    assert.equal(pointsForEntry(3, ctx), 150);
    assert.equal(pointsForEntry(4, ctx), 125);
    assert.equal(pointsForEntry(5, ctx), 83); // quartas
    assert.equal(pointsForEntry(9, ctx), 50); // oitavas
    assert.equal(pointsForEntry(17, ctx), 33); // 16-avos
    assert.equal(pointsForEntry(0, ctx), 25); // participação
  });

  test('âncora da spec: Elite com chave cheia paga 1200 ao campeão', () => {
    assert.equal(pointsForEntry(1, { weight: 1.2, rankingWeight: 1, bracketFactor: 1 }), 1200);
  });

  test('os três fatores se compõem antes do arredondamento', () => {
    // 1000 × 0.25 × 2 × 0.6
    assert.equal(pointsForEntry(1, { weight: 0.25, rankingWeight: 2, bracketFactor: 0.6 }), 300);
    // 330 × 0.5 × 1 × 0.25 = 41.25
    assert.equal(pointsForEntry(5, { weight: 0.5, rankingWeight: 1, bracketFactor: 0.25 }), 41);
  });

  test('colocação desconhecida devolve null em vez de zerar a entrada', () => {
    assert.equal(pointsForEntry(7, { weight: 1, rankingWeight: 1, bracketFactor: 1 }), null);
    assert.equal(pointsForEntry(18, { weight: 1, rankingWeight: 1, bracketFactor: 1 }), null);
  });
});

describe('aggregateRankingResults (paridade pós-D1: soma integral)', () => {
  test('soma TODOS os resultados do ano, sem descarte de melhores N', () => {
    const got = aggregateRankingResults([
      { year: 2026, points: 250 },
      { year: 2026, points: 83 },
      { year: 2025, points: 200 },
    ]);
    assert.equal(got.totalPoints, 533);
    assert.equal(got.tournamentsCount, 3);
    assert.deepEqual(got.pointsByYear, { 2026: 333, 2025: 200 });
  });

  test('ano ausente vira 0 e ponto inválido não derruba a soma', () => {
    const got = aggregateRankingResults([{ points: 100 }, { year: 2026, points: 'x' }]);
    assert.deepEqual(got.pointsByYear, { 0: 100, 2026: 0 });
    assert.equal(got.totalPoints, 100);
  });
});
