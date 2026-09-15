import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { createRequire } from 'node:module';

/**
 * Guarda da decisão de fusão das duplas duplicadas
 * (`scripts/merge-duplicate-pair-teams.js`). Eleger o sobrevivente errado
 * reescreve partida encerrada e ranking de graça, e fundir uma convivência
 * legítima (o par em duas categorias do MESMO torneio) colocaria a mesma
 * equipe em duas chaves do mesmo evento.
 */

const require = createRequire(import.meta.url);
const {
  buildPairKey,
  isPairTeamDoc,
  groupTeamsByPair,
  planGroupMerge,
  mergeTeamRankingDocs,
} = require('../scripts/lib/merge-pair-teams-plan.js');

describe('buildPairKey', () => {
  test('ordena e rejeita par inválido', () => {
    assert.equal(buildPairKey('b', 'a'), 'a:b');
    assert.equal(buildPairKey('a', 'a'), '');
    assert.equal(buildPairKey('a', ''), '');
  });
});

describe('groupTeamsByPair', () => {
  test('agrupa duplas e ignora equipe nomeada', () => {
    const groups = groupTeamsByPair([
      { id: 't1', data: { player1Id: 'a', player2Id: 'b', createdAt: 100 } },
      { id: 't2', data: { player1Id: 'b', player2Id: 'a', createdAt: 200 } },
      { id: 't3', data: { player1Id: 'a', player2Id: 'b', teamName: 'Nomeada' } },
    ]);
    assert.equal(groups.size, 1);
    assert.deepEqual(
      groups.get('a:b').map((t) => t.id),
      ['t1', 't2'],
    );
  });
});

describe('planGroupMerge', () => {
  const members = [
    { id: 'velho', createdAtMs: 100 },
    { id: 'novo', createdAtMs: 200 },
  ];

  test('sobrevive quem tem mais referências', () => {
    const plan = planGroupMerge({
      members,
      tournamentsByTeamId: { velho: ['T1'], novo: ['T2'] },
      refCountByTeamId: { velho: 3, novo: 9 },
    });
    assert.equal(plan.skipped, false);
    assert.equal(plan.survivorId, 'novo');
    assert.deepEqual(plan.absorbedIds, ['velho']);
  });

  test('empate de referências desempata pelo mais antigo', () => {
    const plan = planGroupMerge({
      members,
      tournamentsByTeamId: { velho: ['T1'], novo: ['T2'] },
      refCountByTeamId: { velho: 5, novo: 5 },
    });
    assert.equal(plan.survivorId, 'velho');
  });

  test('torneio em comum é convivência legítima, não duplicação', () => {
    const plan = planGroupMerge({
      members,
      tournamentsByTeamId: { velho: ['T1'], novo: ['T1'] },
      refCountByTeamId: { velho: 5, novo: 1 },
    });
    assert.equal(plan.skipped, true);
    assert.equal(plan.reason, 'convivencia-legitima');
    assert.deepEqual(plan.absorbedIds, []);
  });

  test('grupo de um doc só não gera fusão', () => {
    const plan = planGroupMerge({
      members: [{ id: 'unico', createdAtMs: 100 }],
      tournamentsByTeamId: { unico: ['T1'] },
      refCountByTeamId: { unico: 2 },
    });
    assert.equal(plan.skipped, true);
    assert.equal(plan.reason, 'sem-duplicado');
  });
});

describe('mergeTeamRankingDocs', () => {
  test('soma resultados, pontos e contagem de torneios', () => {
    const merged = mergeTeamRankingDocs(
      {
        totalPoints: 83,
        pointsByYear: { 2026: 83 },
        tournamentsCount: 1,
        results: [{ tournamentId: 'T1', categoryId: 'C1', finalPlace: 3, points: 83, year: 2026 }],
      },
      [
        {
          totalPoints: 25,
          pointsByYear: { 2026: 25 },
          tournamentsCount: 1,
          results: [{ tournamentId: 'T2', categoryId: 'C2', finalPlace: 5, points: 25, year: 2026 }],
        },
      ],
    );
    assert.equal(merged.totalPoints, 108);
    assert.deepEqual(merged.pointsByYear, { 2026: 108 });
    assert.equal(merged.tournamentsCount, 2);
    assert.equal(merged.results.length, 2);
  });

  test('resultado repetido do mesmo torneio+categoria conta uma vez só', () => {
    const merged = mergeTeamRankingDocs(
      {
        totalPoints: 83,
        pointsByYear: { 2026: 83 },
        tournamentsCount: 1,
        results: [{ tournamentId: 'T1', categoryId: 'C1', finalPlace: 3, points: 83, year: 2026 }],
      },
      [
        {
          totalPoints: 83,
          pointsByYear: { 2026: 83 },
          tournamentsCount: 1,
          results: [{ tournamentId: 'T1', categoryId: 'C1', finalPlace: 3, points: 83, year: 2026 }],
        },
      ],
    );
    assert.equal(merged.totalPoints, 83);
    assert.equal(merged.results.length, 1);
    assert.equal(merged.tournamentsCount, 1);
  });

  test('sobrevivente sem doc de ranking absorve o do outro', () => {
    const merged = mergeTeamRankingDocs(null, [
      {
        totalPoints: 25,
        pointsByYear: { 2026: 25 },
        tournamentsCount: 1,
        results: [{ tournamentId: 'T2', categoryId: 'C2', finalPlace: 5, points: 25, year: 2026 }],
      },
    ]);
    assert.equal(merged.totalPoints, 25);
    assert.equal(merged.results.length, 1);
  });
});

describe('isPairTeamDoc', () => {
  test('nome ou elenco de 3+ não é dupla', () => {
    assert.equal(isPairTeamDoc({ player1Id: 'a', player2Id: 'b' }), true);
    assert.equal(isPairTeamDoc({ teamName: 'X' }), false);
    assert.equal(isPairTeamDoc({ teamSize: 5 }), false);
  });
});
