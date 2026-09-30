import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { kocRankingAwards } = require('../scripts/lib/koc-ranking-awards.js');

const round = (kocPhase, kocTeamIds, extra = {}) => ({
  matchType: 'koc_round',
  status: 'Completed',
  kocPhase,
  kocTeamIds,
  ...extra,
});
const final = (kocPhase, teamIds, extra = {}) =>
  round(kocPhase, teamIds, {
    matchType: 'koc_final',
    kocStandings: teamIds.map((teamId, i) => ({ teamId, place: i + 1 })),
    ...extra,
  });

const byTeam = (awards) =>
  Object.fromEntries(awards.map((a) => [a.teamId, a.place ?? a.bucket]));

describe('kocRankingAwards', () => {
  test('planta de 12 (6+6 → 8 → 4): pódio, quartas pra quem para na semi, participação na 1ª fase', () => {
    const awards = kocRankingAwards([
      round(1, ['a', 'b', 'c', 'd', 'e', 'f']),
      round(1, ['b', 'c', 'd', 'e', 'f']),
      round(1, ['g', 'h', 'i', 'j', 'k', 'l']),
      round(1, ['h', 'i', 'j', 'k', 'l']),
      round(2, ['a', 'b', 'g', 'h'], { matchType: 'koc_semifinal' }),
      round(2, ['c', 'd', 'i', 'j'], { matchType: 'koc_semifinal' }),
      final(3, ['c', 'a', 'i', 'g']),
    ]);
    assert.deepEqual(byTeam(awards), {
      c: 1, a: 2, i: 3, g: 4,
      b: 'quarters', h: 'quarters', d: 'quarters', j: 'quarters',
      e: 'groups', f: 'groups', k: 'groups', l: 'groups',
    });
  });

  test('planta de 6 (6 → 4): quem cai na 1ª fase leva participação, não quartas', () => {
    const awards = kocRankingAwards([
      round(1, ['a', 'b', 'c', 'd', 'e', 'f']),
      round(1, ['b', 'c', 'd', 'e', 'f']),
      final(2, ['b', 'a', 'd', 'c']),
    ]);
    assert.deepEqual(byTeam(awards), {
      b: 1, a: 2, d: 3, c: 4, e: 'groups', f: 'groups',
    });
  });

  test('final de 5: o 5º da tabela vira quartas (a escada só paga 1º–4º por lugar)', () => {
    const awards = kocRankingAwards([
      round(1, ['a', 'b', 'c', 'd', 'e', 'f']),
      final(2, ['a', 'b', 'c', 'd', 'e']),
    ]);
    assert.equal(byTeam(awards).e, 'quarters');
    assert.equal(byTeam(awards).f, 'groups');
  });

  test('pódio sai da tabela, não do winnerId', () => {
    const awards = kocRankingAwards([
      round(1, ['a', 'b', 'c']),
      final(2, ['b', 'a', 'c'], { winnerId: 'a' }),
    ]);
    assert.equal(byTeam(awards).b, 1);
  });

  test('recusa rodada KOTC não concluída', () => {
    assert.throws(
      () => kocRankingAwards([round(1, ['a', 'b', 'c']), final(2, ['a', 'b', 'c'], { status: 'In Progress' })]),
      /não concluída/,
    );
  });

  test('recusa final com equipe removida por lesão', () => {
    assert.throws(
      () =>
        kocRankingAwards([
          final(1, ['a', 'b', 'c'], {
            kocStandings: [
              { teamId: 'a', place: 1 },
              { teamId: 'b', place: 2 },
              { teamId: 'c', place: 3, removed: true },
            ],
          }),
        ]),
      /removida/,
    );
  });

  test('recusa categoria sem final KOTC', () => {
    assert.throws(() => kocRankingAwards([round(1, ['a', 'b', 'c'])]), /koc_final/);
  });
});
