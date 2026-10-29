import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { createRequire } from 'node:module';

/**
 * Guarda da fusão de contas do mesmo atleta
 * (`scripts/merge-athlete-accounts.js`). Uma troca de uid que escapa deixa
 * inscrição, partida ou ranking apontando para um perfil apagado; uma troca
 * que vai longe demais põe a mesma pessoa duas vezes na mesma dupla.
 */

const require = createRequire(import.meta.url);
const {
  remapUid,
  classifyPath,
  planGenericRemap,
  planTeamPatch,
  planRankingMerge,
} = require('../scripts/lib/merge-athlete-accounts-plan.js');

const FROM = 'uidOrfao';
const TO = 'uidReal';
const BASE = 'artifacts/p/public/data';

describe('remapUid', () => {
  test('troca valores inteiros e chaves de mapa, em qualquer profundidade', () => {
    const out = remapUid(
      {
        athleteIds: ['x', FROM],
        teamB: { athleteIds: [FROM, 'y'] },
        pre: { [FROM]: { r: 1600 }, x: { r: 1700 } },
      },
      FROM,
      TO,
    );
    assert.deepEqual(out, {
      athleteIds: ['x', TO],
      teamB: { athleteIds: [TO, 'y'] },
      pre: { [TO]: { r: 1600 }, x: { r: 1700 } },
    });
  });

  test('não mexe em pedaço de texto e devolve null sem mudança', () => {
    assert.equal(remapUid({ pairKey: `a:${FROM}` }, FROM, TO), null);
    assert.equal(remapUid({ a: 1 }, FROM, TO), null);
  });

  test('Timestamp passa intacto (não é objeto plano)', () => {
    const ts = { toDate: () => new Date(0), toMillis: () => 0, isEqual: () => true };
    const out = remapUid({ at: ts, uid: FROM }, FROM, TO);
    assert.equal(out.at, ts);
    assert.equal(out.uid, TO);
  });
});

describe('classifyPath', () => {
  const opts = { base: BASE, from: FROM };

  test('perfil e subcoleções são da conta absorvida', () => {
    assert.equal(classifyPath(`users/${FROM}`, opts).kind, 'owned');
    assert.equal(classifyPath(`users/${FROM}/notifications/n1`, opts).kind, 'owned');
    assert.equal(classifyPath(`public_profiles/${FROM}`, opts).kind, 'owned');
    assert.equal(classifyPath(`athlete_profiles/${FROM}`, opts).kind, 'owned');
  });

  test('não confunde perfil com prefixo parecido', () => {
    assert.equal(classifyPath(`users/${FROM}X`, opts).kind, 'blocked');
  });

  test('ranking, ranking por esporte e rating chaveados pelo uid', () => {
    assert.equal(classifyPath(`${BASE}/athleteRankings/${FROM}`, opts).kind, 'ranking');
    assert.deepEqual(classifyPath(`${BASE}/athleteRankingsBySport/${FROM}_VOLEI_PRAIA`, opts), {
      kind: 'rankingBySport',
      sportCode: 'VOLEI_PRAIA',
    });
    assert.deepEqual(classifyPath(`${BASE}/athleteRatings/${FROM}_FUTEVOLEI`, opts), {
      kind: 'rating',
      sportCode: 'FUTEVOLEI',
    });
  });

  test('uid no caminho de outra coleção bloqueia', () => {
    assert.equal(classifyPath(`users/outro/following/${FROM}`, opts).kind, 'blocked');
    assert.equal(classifyPath(`tournamentPredictions/t1/entries/${FROM}`, opts).kind, 'blocked');
  });

  test('equipe e o resto', () => {
    assert.equal(classifyPath(`${BASE}/teams/t1`, opts).kind, 'team');
    assert.equal(classifyPath(`${BASE}/inscriptions/i1`, opts).kind, 'generic');
    assert.equal(classifyPath(`${BASE}/ratingEvents/VOLEI_PRAIA_m1`, opts).kind, 'generic');
  });
});

describe('planGenericRemap', () => {
  test('troca o participante da inscrição', () => {
    const plan = planGenericRemap('i1', { participantUids: [FROM, 'p'] }, { from: FROM, to: TO });
    assert.deepEqual(plan, { data: { participantUids: [TO, 'p'] } });
  });

  test('doc que já cita a outra conta bloqueia', () => {
    const plan = planGenericRemap('i1', { participantUids: [FROM, TO] }, { from: FROM, to: TO });
    assert.ok(plan.blocked);
  });

  test('uid só como pedaço de texto bloqueia', () => {
    const plan = planGenericRemap('i1', { note: `era ${FROM}` }, { from: FROM, to: TO });
    assert.ok(plan.blocked);
  });
});

describe('planTeamPatch', () => {
  const team = {
    player1Id: FROM,
    player2Id: 'parceiro',
    player1DisplayName: 'Apelido velho',
    player2DisplayName: 'Parceiro',
    pairKey: `${FROM}:parceiro`,
  };

  test('troca jogador, nome do slot e recalcula pairKey ordenado', () => {
    const plan = planTeamPatch('t1', team, { from: FROM, to: TO, toDisplayName: 'Apelido novo' });
    assert.deepEqual(plan.data, {
      player1Id: TO,
      player2Id: 'parceiro',
      player1DisplayName: 'Apelido novo',
      player2DisplayName: 'Parceiro',
      pairKey: ['parceiro', TO].sort().join(':'),
    });
  });

  test('sem pairKey original, não inventa um', () => {
    const { pairKey, ...legacy } = team;
    const plan = planTeamPatch('t1', legacy, { from: FROM, to: TO, toDisplayName: 'X' });
    assert.equal(plan.data.pairKey, undefined);
  });

  test('equipe com as duas contas bloqueia', () => {
    const plan = planTeamPatch('t1', { ...team, player2Id: TO }, { from: FROM, to: TO, toDisplayName: 'X' });
    assert.ok(plan.blocked);
  });
});

describe('planRankingMerge', () => {
  const r = (tournamentId, categoryId, points) => ({ tournamentId, categoryId, points, year: 2026 });

  test('junta os resultados das duas contas', () => {
    const plan = planRankingMerge(
      { scaleVersion: 2, results: [r('t1', 'c1', 250)] },
      { scaleVersion: 2, results: [r('t2', 'c9', 300)] },
    );
    assert.deepEqual(plan, { results: [r('t1', 'c1', 250), r('t2', 'c9', 300)], scaleVersion: 2 });
  });

  test('conta que fica sem doc nasce com os do absorvido', () => {
    const plan = planRankingMerge(null, { scaleVersion: 2, results: [r('t2', 'c9', 300)] });
    assert.deepEqual(plan, { results: [r('t2', 'c9', 300)], scaleVersion: 2 });
  });

  test('mesma categoria nas duas contas bloqueia', () => {
    const plan = planRankingMerge(
      { scaleVersion: 2, results: [r('t1', 'c1', 250)] },
      { scaleVersion: 2, results: [r('t1', 'c1', 300)] },
    );
    assert.match(plan.blocked, /t1_c1/);
  });

  test('escalas diferentes bloqueiam', () => {
    const plan = planRankingMerge({ scaleVersion: 1, results: [] }, { scaleVersion: 2, results: [] });
    assert.match(plan.blocked, /scaleVersion/);
  });
});
