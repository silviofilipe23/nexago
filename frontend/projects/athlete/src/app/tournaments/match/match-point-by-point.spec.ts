import type { LivePointEvent } from '@nexago/live-scoring';
import type { TournamentMatch } from '../../data/matches-repository';
import { defaultSetIndexOf, pointByPointSetsOf, summaryLineOf, type PointByPointSet, type PointRow } from './match-point-by-point';

function match(partial: Partial<TournamentMatch> = {}): TournamentMatch {
  return {
    id: 'm1',
    tournamentId: 't1',
    categoryId: 'c1',
    round: 1,
    matchType: 'group',
    poolId: 'pool-a',
    teamAId: 'A',
    teamBId: 'B',
    teamADescription: null,
    teamBDescription: null,
    status: 'InProgress',
    resultA: null,
    resultB: null,
    sets: [],
    winnerId: null,
    isGroupMatch: true,
    matchNumber: 1,
    winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null,
    scheduleTime: null,
    courtName: null,
    liveScore: null,
    matchStartedAt: null,
    checkIn: { teamA: null, teamB: null },
    queueStatus: null,
    bestOf: 3,
    currentSetIndex: 0,
    ...partial,
  };
}

/** Eventos como a mesa grava: `seq` sequencial, placar ACUMULADO do set depois do ponto. */
function pointEvent(partial: Partial<LivePointEvent> & Pick<LivePointEvent, 'seq'>): LivePointEvent {
  return {
    id: `e${partial.seq}`,
    type: 'point',
    side: 'A',
    setIndex: 0,
    scoreA: 0,
    scoreB: 0,
    ts: null,
    ...partial,
  };
}

/** Sequência de pontos de um set: 'A' e 'B' viram eventos com o placar acumulado. */
function rally(sides: readonly ('A' | 'B')[], setIndex = 0, firstSeq = 1, startAt: Date | null = null): LivePointEvent[] {
  let a = 0;
  let b = 0;
  return sides.map((side, i) => {
    if (side === 'A') a++;
    else b++;
    const ts = startAt ? new Date(startAt.getTime() + i * 60_000) : null;
    return pointEvent({ seq: firstSeq + i, side, setIndex, scoreA: a, scoreB: b, ts });
  });
}

/** Rali completo até um placar: alterna os lados e completa com o que sobrar — serve pra chegar
 *  aos 21×19 de um set fechado sem escrever 40 eventos à mão. */
function rallyTo(targetA: number, targetB: number, setIndex = 0): LivePointEvent[] {
  const sides: ('A' | 'B')[] = [];
  const paired = Math.min(targetA, targetB);
  for (let i = 0; i < paired; i++) sides.push('A', 'B');
  for (let i = paired; i < targetA; i++) sides.push('A');
  for (let i = paired; i < targetB; i++) sides.push('B');
  return rally(sides, setIndex);
}

function rows(set: PointByPointSet): PointRow[] {
  return set.blocks.flatMap((b) => b.points);
}

function scores(set: PointByPointSet): string[] {
  return rows(set).map((p) => `${p.left}-${p.right}`);
}

describe('pointByPointSetsOf', () => {
  it('devolve vazio quando não há evento nem set com ponto', () => {
    expect(pointByPointSetsOf({ match: match(), events: [], mySide: 'A' })).toEqual([]);
  });

  it('monta a timeline do set com o placar de cada ponto', () => {
    const events = rally(['A', 'B', 'A']);
    const [set] = pointByPointSetsOf({ match: match({ sets: [{ a: 2, b: 1 }] }), events, mySide: 'A' });
    expect(scores(set!)).toEqual(['1-0', '1-1', '2-1']);
    expect(rows(set!).map((p) => p.fromLeft)).toEqual([true, false, true]);
  });

  it('ordena por `seq`, não pela ordem de chegada dos eventos', () => {
    const [first, second, third] = rally(['A', 'B', 'A']);
    const events = [third!, first!, second!];
    const [set] = pointByPointSetsOf({ match: match({ sets: [{ a: 2, b: 1 }] }), events, mySide: 'A' });
    expect(scores(set!)).toEqual(['1-0', '1-1', '2-1']);
  });

  it('espelha o placar quando o atleta é o lado B', () => {
    const events = rally(['A', 'B', 'A']);
    const [set] = pointByPointSetsOf({ match: match({ sets: [{ a: 2, b: 1 }] }), events, mySide: 'B' });
    expect(scores(set!)).toEqual(['0-1', '1-1', '1-2']);
    expect(rows(set!).map((p) => p.fromLeft)).toEqual([false, true, false]);
  });

  it('deixa o lado A à esquerda para quem só está assistindo', () => {
    const events = rally(['B', 'B']);
    const [set] = pointByPointSetsOf({ match: match({ sets: [{ a: 0, b: 2 }] }), events, mySide: null });
    expect(scores(set!)).toEqual(['0-1', '0-2']);
    expect(rows(set!).map((p) => p.fromLeft)).toEqual([false, false]);
  });

  it('apaga o último ponto gravado do set ao encontrar um `undo-point`', () => {
    const events = [...rally(['A', 'B', 'A']), pointEvent({ seq: 4, type: 'undo-point', side: 'A', scoreA: 1, scoreB: 1 })];
    const [set] = pointByPointSetsOf({ match: match({ sets: [{ a: 1, b: 1 }] }), events, mySide: 'A' });
    expect(scores(set!)).toEqual(['1-0', '1-1']);
  });

  // Visto em dados reais (dev, partida SGrrDydwtkMxZ9P9zTiC): a mesa gravou `point` com o placar
  // acumulado IGUAL ao do ponto anterior (seqs 102/103 em 8-1 e 138/139 em 12-10). Desenhar o
  // mesmo placar duas vezes lê como bug da tela; recusar a segunda escrita não inventa nada.
  it('recusa o evento de ponto que não avançou o placar', () => {
    const events = [
      pointEvent({ seq: 1, side: 'A', scoreA: 1, scoreB: 0 }),
      pointEvent({ seq: 2, side: 'A', scoreA: 2, scoreB: 0 }),
      pointEvent({ seq: 3, side: 'A', scoreA: 2, scoreB: 0 }),
      pointEvent({ seq: 4, side: 'A', scoreA: 3, scoreB: 0 }),
    ];
    const [set] = pointByPointSetsOf({ match: match({ sets: [{ a: 3, b: 0 }] }), events, mySide: 'A' });
    expect(scores(set!)).toEqual(['1-0', '2-0', '3-0']);
  });

  it('aceita de volta o placar que um `undo-point` tinha desfeito', () => {
    const events = [
      pointEvent({ seq: 1, side: 'A', scoreA: 1, scoreB: 0 }),
      pointEvent({ seq: 2, side: 'A', scoreA: 2, scoreB: 0 }),
      pointEvent({ seq: 3, type: 'undo-point', side: 'A', scoreA: 1, scoreB: 0 }),
      pointEvent({ seq: 4, side: 'A', scoreA: 2, scoreB: 0 }),
    ];
    const [set] = pointByPointSetsOf({ match: match({ sets: [{ a: 2, b: 0 }] }), events, mySide: 'A' });
    expect(scores(set!)).toEqual(['1-0', '2-0']);
  });

  it('separa os sets e numera a partir de 1', () => {
    const events = [...rally(['A', 'A'], 0), ...rally(['B'], 1, 3)];
    const sets = pointByPointSetsOf({
      match: match({ sets: [{ a: 2, b: 0 }, { a: 0, b: 1 }], currentSetIndex: 1 }),
      events,
      mySide: 'A',
    });
    expect(sets.map((s) => s.setNumber)).toEqual([1, 2]);
    expect(sets.map((s) => s.setIndex)).toEqual([0, 1]);
    expect(scores(sets[1]!)).toEqual(['0-1']);
  });
});

describe('pointByPointSetsOf: sequências', () => {
  it('agrupa pontos seguidos do mesmo lado num bloco só', () => {
    const events = rally(['A', 'A', 'A', 'B']);
    const [set] = pointByPointSetsOf({ match: match({ sets: [{ a: 3, b: 1 }] }), events, mySide: 'A' });
    expect(set!.blocks.map((b) => b.points.length)).toEqual([3, 1]);
    expect(set!.blocks.map((b) => b.fromLeft)).toEqual([true, false]);
  });

  it('rotula o bloco pelo tamanho da sequência', () => {
    const events = rally(['A', 'A', 'A', 'B']);
    const [set] = pointByPointSetsOf({ match: match({ sets: [{ a: 3, b: 1 }] }), events, mySide: 'A' });
    expect(set!.blocks.map((b) => b.label)).toEqual(['3 SEGUIDOS', 'PONTO']);
  });

  it('destaca a maior sequência do set', () => {
    const events = rally(['A', 'A', 'A', 'B']);
    const [set] = pointByPointSetsOf({ match: match({ sets: [{ a: 3, b: 1 }] }), events, mySide: 'A' });
    expect(set!.blocks.map((b) => b.longest)).toEqual([true, false]);
  });

  it('não destaca nada quando ninguém emendou dois pontos', () => {
    const events = rally(['A', 'B', 'A', 'B']);
    const [set] = pointByPointSetsOf({ match: match({ sets: [{ a: 2, b: 2 }] }), events, mySide: 'A' });
    expect(set!.blocks.every((b) => !b.longest)).toBe(true);
  });

  it('carimba o bloco com a hora do primeiro ponto dele', () => {
    const events = rally(['A', 'A', 'B'], 0, 1, new Date(2026, 7, 17, 14, 0));
    const [set] = pointByPointSetsOf({ match: match({ sets: [{ a: 2, b: 1 }] }), events, mySide: 'A' });
    expect(set!.blocks.map((b) => b.time)).toEqual(['14:00', '14:02']);
  });
});

describe('pointByPointSetsOf: marcações do ponto', () => {
  it('marca empate no ponto que iguala o placar', () => {
    const events = rally(['A', 'B']);
    const [set] = pointByPointSetsOf({ match: match({ sets: [{ a: 1, b: 1 }] }), events, mySide: 'A' });
    expect(rows(set!).map((p) => p.annotation)).toEqual([null, 'empate']);
  });

  it('marca virada quando a liderança troca de lado', () => {
    const events = rally(['A', 'B', 'B', 'A', 'A']);
    const [set] = pointByPointSetsOf({ match: match({ sets: [{ a: 3, b: 2 }] }), events, mySide: 'A' });
    expect(rows(set!).map((p) => p.annotation)).toEqual([null, 'empate', 'virada', 'empate', 'virada']);
  });

  it('não chama de virada o primeiro ponto do set, que não tira liderança de ninguém', () => {
    const events = rally(['A', 'A']);
    const [set] = pointByPointSetsOf({ match: match({ sets: [{ a: 2, b: 0 }] }), events, mySide: 'A' });
    expect(rows(set!).map((p) => p.annotation)).toEqual([null, null]);
  });

  it('marca o ponto que fechou o set', () => {
    const [set] = pointByPointSetsOf({
      match: match({ sets: [{ a: 21, b: 19 }], status: 'Completed', winnerId: 'A' }),
      events: rallyTo(21, 19),
      mySide: 'A',
    });
    const closing = rows(set!).map((p) => p.closesSet);
    expect(closing[closing.length - 1]).toBe(true);
    expect(closing.filter((c) => c).length).toBe(1);
  });

  it('não marca fechamento enquanto o set está em andamento', () => {
    const [set] = pointByPointSetsOf({
      match: match({ sets: [{ a: 10, b: 8 }] }),
      events: rallyTo(10, 8),
      mySide: 'A',
    });
    expect(rows(set!).every((p) => !p.closesSet)).toBe(true);
  });

  it('usa o alvo de 15 do terceiro set de MD3 para reconhecer o fechamento', () => {
    const sets = pointByPointSetsOf({
      match: match({
        sets: [{ a: 21, b: 15 }, { a: 15, b: 21 }, { a: 15, b: 13 }],
        status: 'Completed',
        winnerId: 'A',
        currentSetIndex: 2,
      }),
      events: rallyTo(15, 13, 2),
      mySide: 'A',
    });
    const third = sets.find((s) => s.setIndex === 2)!;
    expect(rows(third).filter((p) => p.closesSet).length).toBe(1);
  });
});

describe('pointByPointSetsOf: resumo do set', () => {
  it('conta maior sequência, empates e viradas', () => {
    const events = rally(['A', 'B', 'B', 'A', 'A']);
    const [set] = pointByPointSetsOf({ match: match({ sets: [{ a: 3, b: 2 }] }), events, mySide: 'A' });
    expect(set!.summary.longestStreak).toBe(2);
    expect(set!.summary.ties).toBe(2);
    expect(set!.summary.comebacks).toBe(2);
  });

  it('mede a duração do primeiro ao último ponto gravado', () => {
    const events = rally(['A', 'B', 'A'], 0, 1, new Date(2026, 7, 17, 14, 0));
    const [set] = pointByPointSetsOf({ match: match({ sets: [{ a: 2, b: 1 }] }), events, mySide: 'A' });
    expect(set!.summary.durationLabel).toBe('2 min');
  });

  it('não afirma duração sem hora nos eventos', () => {
    const [set] = pointByPointSetsOf({ match: match({ sets: [{ a: 1, b: 0 }] }), events: rally(['A']), mySide: 'A' });
    expect(set!.summary.durationLabel).toBeNull();
  });

  it('não arredonda para 1 min o set gravado dentro do mesmo minuto', () => {
    const at = new Date(2026, 7, 17, 14, 0, 0);
    const events = [
      pointEvent({ seq: 1, side: 'A', scoreA: 1, scoreB: 0, ts: at }),
      pointEvent({ seq: 2, side: 'A', scoreA: 2, scoreB: 0, ts: new Date(at.getTime() + 20_000) }),
    ];
    const [set] = pointByPointSetsOf({ match: match({ sets: [{ a: 2, b: 0 }] }), events, mySide: 'A' });
    expect(set!.summary.durationLabel).toBe('menos de 1 min');
  });
});

describe('pointByPointSetsOf: o que a mesa não gravou', () => {
  it('traz o placar do set já na perspectiva do atleta', () => {
    const [set] = pointByPointSetsOf({
      match: match({ sets: [{ a: 21, b: 19 }], status: 'Completed', winnerId: 'A' }),
      events: rallyTo(21, 19),
      mySide: 'B',
    });
    expect(set!.score).toEqual({ left: 19, right: 21 });
  });

  it('declara os pontos que faltam quando a mesa parou de marcar no meio do set', () => {
    // Placar final 21×15 (36 pontos), mas a mesa marcou só até 12×9 (21 pontos).
    const [set] = pointByPointSetsOf({
      match: match({ sets: [{ a: 21, b: 15 }], status: 'Completed', winnerId: 'A' }),
      events: rallyTo(12, 9),
      mySide: 'A',
    });
    expect(set!.missingCount).toBe(15);
    expect(set!.recordedRange).toEqual({ from: { left: 1, right: 0 }, to: { left: 12, right: 9 } });
  });

  // Caso real (dev, set 3 de SGrrDydwtkMxZ9P9zTiC): os pontos 12×2 e 12×3 existiram no placar, mas
  // os eventos que os marcariam foram desfeitos — a lacuna fica NO MEIO do set, entre dois trechos
  // gravados. Contar só as pontas do trecho registrado esconderia esses dois.
  it('conta a lacuna que ficou no meio do set', () => {
    const events = [
      pointEvent({ seq: 1, side: 'B', scoreA: 0, scoreB: 1 }),
      pointEvent({ seq: 2, side: 'A', scoreA: 1, scoreB: 1 }),
      // 1×2 e 1×3 aconteceram, mas nenhum evento sobrou para eles.
      pointEvent({ seq: 3, side: 'B', scoreA: 1, scoreB: 4 }),
      pointEvent({ seq: 4, side: 'B', scoreA: 1, scoreB: 5 }),
    ];
    const [set] = pointByPointSetsOf({ match: match({ sets: [{ a: 1, b: 5 }] }), events, mySide: 'A' });
    expect(set!.missingCount).toBe(2);
    expect(set!.recordedRange).toEqual({ from: { left: 0, right: 1 }, to: { left: 1, right: 5 } });
  });

  it('conta os pontos que rolaram antes de a mesa começar a marcar', () => {
    // Set 5×3 (8 pontos) com registro só dos dois últimos: 6 pontos aconteceram antes.
    const events = [
      pointEvent({ seq: 1, side: 'A', scoreA: 4, scoreB: 3 }),
      pointEvent({ seq: 2, side: 'A', scoreA: 5, scoreB: 3 }),
    ];
    const [set] = pointByPointSetsOf({ match: match({ sets: [{ a: 5, b: 3 }] }), events, mySide: 'A' });
    expect(set!.missingCount).toBe(6);
    expect(set!.recordedRange).toEqual({ from: { left: 4, right: 3 }, to: { left: 5, right: 3 } });
  });

  it('não declara pendência quando a timeline cobre o set inteiro', () => {
    const [set] = pointByPointSetsOf({
      match: match({ sets: [{ a: 21, b: 19 }], status: 'Completed', winnerId: 'A' }),
      events: rallyTo(21, 19),
      mySide: 'A',
    });
    expect(set!.missingCount).toBe(0);
    expect(set!.recordedRange).toBeNull();
  });

  // A escrita repetida que o replay recusa não é ponto que faltou: o placar não andou, então o
  // set continua coberto de ponta a ponta.
  it('não conta como pendência a escrita repetida que foi recusada', () => {
    const events = [
      pointEvent({ seq: 1, side: 'A', scoreA: 1, scoreB: 0 }),
      pointEvent({ seq: 2, side: 'A', scoreA: 2, scoreB: 0 }),
      pointEvent({ seq: 3, side: 'A', scoreA: 2, scoreB: 0 }),
      pointEvent({ seq: 4, side: 'A', scoreA: 3, scoreB: 0 }),
    ];
    const [set] = pointByPointSetsOf({ match: match({ sets: [{ a: 3, b: 0 }] }), events, mySide: 'A' });
    expect(set!.missingCount).toBe(0);
    expect(set!.recordedRange).toBeNull();
  });

  it('mostra o set sem nenhum evento como placar puro, sem inventar um único ponto', () => {
    const [set] = pointByPointSetsOf({
      match: match({ sets: [{ a: 21, b: 15 }], status: 'Completed', winnerId: 'A' }),
      events: [],
      mySide: 'A',
    });
    expect(set!.blocks).toEqual([]);
    expect(set!.missingCount).toBe(36);
    expect(set!.recordedRange).toBeNull();
    expect(set!.score).toEqual({ left: 21, right: 15 });
  });

  it('não deixa a pendência negativa quando há mais evento do que placar', () => {
    const [set] = pointByPointSetsOf({ match: match({ sets: [{ a: 1, b: 0 }] }), events: rally(['A', 'A', 'A']), mySide: 'A' });
    expect(set!.missingCount).toBe(0);
    expect(set!.recordedRange).toBeNull();
  });

  it('cai no último ponto gravado quando o set nem existe no placar do doc', () => {
    const [set] = pointByPointSetsOf({ match: match({ sets: [] }), events: rally(['A', 'B', 'A']), mySide: 'A' });
    expect(set!.score).toEqual({ left: 2, right: 1 });
    expect(set!.missingCount).toBe(0);
  });
});

describe('defaultSetIndexOf', () => {
  const liveMatch = match({ sets: [{ a: 21, b: 15 }, { a: 4, b: 6 }], status: 'InProgress', currentSetIndex: 1 });
  const doneMatch = match({ sets: [{ a: 21, b: 15 }, { a: 21, b: 18 }], status: 'Completed', winnerId: 'A', currentSetIndex: 1 });

  it('abre no set em andamento enquanto a partida rola', () => {
    const sets = pointByPointSetsOf({ match: liveMatch, events: [...rallyTo(21, 15, 0), ...rally(['A'], 1, 100)], mySide: 'A' });
    expect(defaultSetIndexOf(sets, liveMatch)).toBe(1);
  });

  it('abre no último set com timeline na partida encerrada', () => {
    // Só o set 1 foi marcado ponto a ponto; o set 2 entrou pelo placar final.
    const sets = pointByPointSetsOf({ match: doneMatch, events: rallyTo(21, 15, 0), mySide: 'A' });
    expect(defaultSetIndexOf(sets, doneMatch)).toBe(0);
  });

  it('cai no último set quando nenhum deles tem timeline', () => {
    const sets = pointByPointSetsOf({ match: doneMatch, events: [], mySide: 'A' });
    expect(defaultSetIndexOf(sets, doneMatch)).toBe(1);
  });

  it('devolve null quando não há set nenhum', () => {
    expect(defaultSetIndexOf([], match())).toBeNull();
  });
});

describe('summaryLineOf', () => {
  it('resume numa linha o que aconteceu no set', () => {
    const line = summaryLineOf({ longestStreak: 4, ties: 6, comebacks: 2, durationLabel: '18 min' });
    expect(line).toBe('maior sequência 4 · 6 empates · 2 viradas · 18 min');
  });

  it('usa singular quando foi um só', () => {
    const line = summaryLineOf({ longestStreak: 2, ties: 1, comebacks: 1, durationLabel: null });
    expect(line).toBe('maior sequência 2 · 1 empate · 1 virada');
  });

  it('omite a sequência quando ninguém emendou dois pontos', () => {
    expect(summaryLineOf({ longestStreak: 1, ties: 3, comebacks: 0, durationLabel: null })).toBe('3 empates');
  });

  it('devolve null quando não há nada a dizer', () => {
    expect(summaryLineOf({ longestStreak: 1, ties: 0, comebacks: 0, durationLabel: null })).toBeNull();
  });
});
