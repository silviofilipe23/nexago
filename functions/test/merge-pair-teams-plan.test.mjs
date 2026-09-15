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

    // Mesma expectativa com a ordem invertida: `velho` é o mais antigo, não
    // simplesmente o primeiro elemento — um stub que devolvesse members[0]
    // passaria na asserção de cima e falharia só aqui.
    const reversed = planGroupMerge({
      members: [...members].reverse(),
      tournamentsByTeamId: { velho: ['T1'], novo: ['T2'] },
      refCountByTeamId: { velho: 5, novo: 5 },
    });
    assert.equal(reversed.survivorId, 'velho');
  });

  test('lookup ausente é falha de dados, não ausência de sobreposição', () => {
    const plan = planGroupMerge({
      members,
      // `novo` não tem entrada nenhuma — nem `[]` — então não dá pra saber se
      // ele está ou não no mesmo torneio que `velho`. Isso tem de pular, não
      // fundir: fundir errado é irreversível, pular só adia.
      tournamentsByTeamId: { velho: ['T1'] },
      refCountByTeamId: { velho: 5, novo: 5 },
    });
    assert.equal(plan.skipped, true);
    assert.equal(plan.reason, 'dados-incompletos');
  });

  test('array vazio declarado explicitamente permite fusão normal', () => {
    const plan = planGroupMerge({
      members,
      // `velho` está declaradamente em ZERO torneios (não ausente) — um doc
      // órfão sem nenhuma inscrição é fundível de verdade.
      tournamentsByTeamId: { velho: [], novo: ['T2'] },
      refCountByTeamId: { velho: 3, novo: 9 },
    });
    assert.equal(plan.skipped, false);
    assert.equal(plan.survivorId, 'novo');
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

  test('mesmo torneio, categorias diferentes contam como 2 (espelha o servidor)', () => {
    // O servidor conta RESULTADOS, não torneios distintos — um par que jogou
    // duas categorias do mesmo torneio tem tournamentsCount: 2 de propósito.
    // Um Set de tournamentId daria 1 aqui e o próximo recompute do servidor
    // desfaria a fusão em silêncio.
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
          results: [{ tournamentId: 'T1', categoryId: 'C2', finalPlace: 5, points: 25, year: 2026 }],
        },
      ],
    );
    assert.equal(merged.tournamentsCount, 2);
  });
});

describe('isPairTeamDoc', () => {
  test('nome ou elenco de 3+ não é dupla', () => {
    assert.equal(isPairTeamDoc({ player1Id: 'a', player2Id: 'b' }), true);
    assert.equal(isPairTeamDoc({ teamName: 'X' }), false);
    assert.equal(isPairTeamDoc({ teamSize: 5 }), false);
  });

  test('memberUids com 3+ também não é dupla', () => {
    // Doc histórico com elenco de 3+ mas sem `teamName` e sem `teamSize`
    // passaria pelos dois testes acima; `memberUids` é o elenco canônico.
    assert.equal(isPairTeamDoc({ memberUids: ['a', 'b', 'c'] }), false);
  });
});
