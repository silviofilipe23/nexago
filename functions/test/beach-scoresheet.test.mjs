import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { createRequire } from 'node:module';

/** Súmulas de vôlei de praia em PDF: dados de cada jogo e o HTML da folha. */

const require = createRequire(import.meta.url);
const {
  tidyName, phaseLabel, formatLabel, setTimesFromEvents, buildSheetContext, orderMatches,
} = require('../scripts/lib/beach-scoresheet.js');
const { renderDocument } = require('../scripts/lib/beach-scoresheet-html.js');

const playersA = [{ short: 'Ana', full: 'Ana Souza' }, { short: 'Bia', full: 'Beatriz Lima' }];
const playersB = [{ short: 'Cris', full: 'Cristina Melo' }, { short: 'Duda', full: 'Eduarda Reis' }];

function match(overrides = {}) {
  return {
    matchNumber: 7, matchType: 'WB', round: 2, bestOf: 3,
    scoringProfile: { setTarget: 21, decidingSetTarget: 15 },
    courtName: 'Quadra 1', scheduleTime: '2026-10-31T20:00:00.000Z', matchStartedAt: null, matchEndedAt: null,
    teamAId: 'tA', teamBId: 'tB', teamADescription: 'Vencedor Jogo #3', teamBDescription: 'Perdedor Jogo #4',
    winnerId: 'tB', resultA: '1', resultB: '2',
    sets: [
      { a: 21, b: 18, startedAt: '2026-10-31T20:05:00.000Z', endedAt: '2026-10-31T20:25:00.000Z' },
      { a: 17, b: 21, startedAt: '2026-10-31T20:27:00.000Z', endedAt: '2026-10-31T20:45:00.000Z' },
      { a: 12, b: 15, startedAt: '2026-10-31T20:47:00.000Z', endedAt: '2026-10-31T21:00:00.000Z' },
    ],
    ...overrides,
  };
}

const sheetOptions = {
  categoryName: 'Feminino', bracketFormat: 'double_elimination', locationName: 'Arena Teste',
  competition: 'Open Teste 2026', playersA, playersB, sheetIndex: 3, sheetTotal: 10,
};

describe('tidyName', () => {
  test('palavra toda em caixa alta ou baixa vira título, partículas ficam minúsculas', () => {
    assert.equal(tidyName('DIOGO DE ABREU'), 'Diogo de Abreu');
    assert.equal(tidyName('Isaura matos'), 'Isaura Matos');
    assert.equal(tidyName('  maria   DA silva '), 'Maria da Silva');
  });

  test('palavra com caixa mista fica como está e vazio vira vazio', () => {
    assert.equal(tidyName('McCartney Sá'), 'McCartney Sá');
    assert.equal(tidyName(undefined), '');
  });
});

describe('phaseLabel', () => {
  test('dá nome à chave e à rodada da dupla eliminação', () => {
    assert.equal(phaseLabel({ matchType: 'WB', round: 1 }), 'Chave principal – rodada 1');
    assert.equal(phaseLabel({ matchType: 'LB', round: 4 }), 'Repescagem – rodada 4');
    assert.equal(phaseLabel({ matchType: 'Final', round: 1 }), 'Final');
    assert.equal(phaseLabel({ matchType: 'Third Place', round: 1 }), 'Disputa de 3º lugar');
  });

  test('tipo desconhecido aparece como veio', () => {
    assert.equal(phaseLabel({ matchType: 'Exhibition' }), 'Exhibition');
  });
});

describe('formatLabel', () => {
  test('descreve o chaveamento e o formato de sets', () => {
    assert.equal(formatLabel({ bestOf: 1, scoringProfile: { setTarget: 21 } }, 'double_elimination'),
      'Dupla eliminação · set único de 21 pontos');
    assert.equal(formatLabel({ bestOf: 3, scoringProfile: { setTarget: 21, decidingSetTarget: 15 } }, 'double_elimination'),
      'Dupla eliminação · melhor de 3 sets (21/21/15)');
  });

  test('sem chaveamento conhecido mostra só os sets', () => {
    assert.equal(formatLabel({ bestOf: 1 }, undefined), 'set único de 21 pontos');
  });
});

describe('setTimesFromEvents', () => {
  const events = [
    { type: 'point', setIndex: 0, scoreA: 1, scoreB: 0, seq: 1, ts: '2026-10-31T20:05:30.000Z' },
    { type: 'point', setIndex: 0, scoreA: 2, scoreB: 0, seq: 2, ts: '2026-10-31T20:06:00.000Z' },
    { type: 'undo-point', setIndex: 0, scoreA: 1, scoreB: 0, seq: 3, ts: '2026-10-31T20:06:10.000Z' },
    { type: 'point', setIndex: 0, scoreA: 1, scoreB: 1, seq: 4, ts: '2026-10-31T20:06:40.000Z' },
  ];

  test('fim do set é o ponto que fechou o placar final, ignorando desfazer', () => {
    const [set] = setTimesFromEvents([{ a: 1, b: 1, startedAt: '2026-10-31T20:05:00.000Z' }], events);
    assert.deepEqual(set, { a: 1, b: 1, startedAt: '2026-10-31T20:05:00.000Z', endedAt: '2026-10-31T20:06:40.000Z' });
  });

  test('sem startedAt usa o 1º ponto; sem eventos deixa os horários vazios', () => {
    const [first, second] = setTimesFromEvents([{ a: 1, b: 1 }, { a: 21, b: 19 }], events);
    assert.equal(first.startedAt, '2026-10-31T20:05:30.000Z');
    assert.equal(second.startedAt, null);
    assert.equal(second.endedAt, null);
  });

  test('ignora set sem placar numérico', () => {
    assert.equal(setTimesFromEvents([{ a: null, b: 3 }], []).length, 0);
  });
});

describe('buildSheetContext', () => {
  test('monta cabeçalho, totais e vencedor do ponto de vista do vencedor', () => {
    const ctx = buildSheetContext(match(), sheetOptions);
    assert.equal(ctx.phase, 'Chave principal – rodada 2');
    assert.equal(ctx.local, 'Arena Teste · Quadra 1');
    assert.equal(ctx.date, '31/10/2026');
    assert.equal(ctx.hour, '17:00');
    assert.equal(ctx.origins, 'Venc. jogo 3 / Perd. jogo 4');
    assert.deepEqual(ctx.totals, { setsA: 1, setsB: 2, pointsA: 50, pointsB: 54, minutes: 51 });
    assert.equal(ctx.winnerNames, 'Cris / Duda');
    assert.equal(ctx.winnerScore, '2 x 1');
    assert.equal(ctx.sheet, 'Folha 3 de 10');
    assert.equal(ctx.walkover, false);
  });

  test('W.O. não tem sets, marca o placar e explica nas observações', () => {
    const ctx = buildSheetContext(match({ sets: [], resultA: 'W.O.', resultB: '0', winnerId: 'tA', scheduleTime: null,
      matchEndedAt: '2026-11-01T11:50:00.000Z' }), sheetOptions);
    assert.equal(ctx.walkover, true);
    assert.equal(ctx.winnerScore, 'W.O.');
    assert.equal(ctx.observation, 'Vitória por W.O. de Ana / Bia sobre Cris / Duda.');
    assert.equal(ctx.date, '01/11/2026');
    assert.equal(ctx.hour, '');
  });

  test('jogo ainda não encerrado sai sem placar nem vencedor, para preencher à mão', () => {
    const ctx = buildSheetContext(match({ status: 'Scheduled', winnerId: null }), sheetOptions);
    assert.equal(ctx.finished, false);
    assert.deepEqual(ctx.sets, []);
    assert.equal(ctx.winnerNames, '');
    assert.equal(ctx.winnerScore, '');
    const html = renderDocument([ctx], { title: 'Teste', entity: 'ASAME' });
    assert.ok(!html.includes('Set não disputado'));
    assert.ok(html.includes('____:____'));
  });

  test('sem horário de algum set a duração total fica em branco', () => {
    const sets = [{ a: 21, b: 10, startedAt: null, endedAt: null }];
    assert.equal(buildSheetContext(match({ sets, bestOf: 1 }), sheetOptions).totals.minutes, null);
  });
});

describe('orderMatches', () => {
  test('segue a ordem das categorias do torneio e depois o número do jogo', () => {
    const ordered = orderMatches([
      { categoryId: 'f', matchNumber: 1 }, { categoryId: 'm', matchNumber: 2 }, { categoryId: 'm', matchNumber: 1 },
    ], ['m', 'f']);
    assert.deepEqual(ordered.map((m) => `${m.categoryId}${m.matchNumber}`), ['m1', 'm2', 'f1']);
  });
});

describe('renderDocument', () => {
  test('uma página por súmula, com nomes escapados e sets não jogados marcados', () => {
    const one = buildSheetContext(match({ sets: match().sets.slice(0, 1), bestOf: 1 }), {
      ...sheetOptions, playersA: [{ short: '<Ana>', full: 'Ana <b>' }, playersA[1]],
    });
    const two = buildSheetContext(match(), sheetOptions);
    const html = renderDocument([one, two], { title: 'Teste', entity: 'ASAME' });
    assert.equal(html.match(/<section class="page">/g).length, 2);
    assert.ok(html.includes('&lt;Ana&gt;'));
    assert.ok(!html.includes('<Ana>'));
    assert.equal(html.match(/Set não disputado/g).length, 2);
    assert.ok(html.includes('ASAME'));
  });
});
