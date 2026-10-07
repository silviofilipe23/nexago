import type { TournamentMatch } from '../../painel/data/matches-repository';
import {
  DECISIVO_INICIAL,
  DECISIVO_SALVO_MS,
  DECISIVO_TB_MS,
  decisivoNext,
  decisivoSituacaoOf,
  decisivoViewOf,
  type DecisivoEntrada,
  type DecisivoSituacao,
  type DecisivoState,
} from './overlay-decisivo';
import { overlayViewOf, type OverlayDuelView } from './overlay-selectors';

const NOW = 1_000_000;

function match(over: Partial<TournamentMatch> = {}): TournamentMatch {
  return {
    id: 'm1', tournamentId: 't', categoryId: 'c1', round: 'Semifinal', team1Label: 'Hölting Nilsson / Berger', team2Label: 'Batrane / Tiisaar',
    score: null, winnerSide: null, scheduledAt: null, court: 'Quadra 2', status: 'in_progress', teamAId: 'ta', teamBId: 'tb', sets: [{ a: 10, b: 8 }],
    courtId: 'q2', scheduleEndAt: null, dayKey: '', bestOf: 3, matchType: 'group', roundNumber: 1, matchNumber: 1, winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null, loserAdvanceMatchNumber: null, liveScore: null, currentSetIndex: 0, servingTeamId: '', servingPlayerSlot: 0,
    medicalTimeout: null, matchStartedAt: null, matchEndedAt: null, ...over,
  };
}
const sit = (m: TournamentMatch) => decisivoSituacaoOf(m, overlayViewOf(m, 0) as OverlayDuelView);

describe('overlay-decisivo — situação', () => {
  it('set point: o lado que fecha o set com o próximo ponto', () => {
    expect(sit(match({ sets: [{ a: 20, b: 18 }] }))).toEqual(jasmine.objectContaining({ kind: 'sp', side: 'A', setNumber: 1 }));
    expect(sit(match({ sets: [{ a: 18, b: 20 }] }))).toEqual(jasmine.objectContaining({ kind: 'sp', side: 'B' }));
    expect(sit(match({ sets: [{ a: 10, b: 8 }] }))).toBeNull();
  });

  it('match point: o set point que fecha a partida (2º set, 1×0)', () => {
    const m = match({ sets: [{ a: 21, b: 15 }, { a: 20, b: 17 }], currentSetIndex: 1 });
    expect(sit(m)).toEqual(jasmine.objectContaining({ kind: 'mp', side: 'A', setNumber: 2 }));
  });

  it('tie-break: o set decisivo (3º) até 15, sem set point', () => {
    const m = match({ sets: [{ a: 21, b: 15 }, { a: 15, b: 21 }, { a: 4, b: 3 }], currentSetIndex: 2 });
    expect(sit(m)).toEqual({ kind: 'tb', side: null, setNumber: 3, limite: 15 });
    // set point tem prioridade sobre o tie-break
    const sp = match({ sets: [{ a: 21, b: 15 }, { a: 15, b: 21 }, { a: 14, b: 12 }], currentSetIndex: 2 });
    expect(sit(sp)).toEqual(jasmine.objectContaining({ kind: 'mp', side: 'A' }));
  });

  it('fora do ao vivo ou set único sem chance: nada', () => {
    expect(sit(match({ status: 'scheduled', sets: [] }))).toBeNull();
    expect(sit(match({ bestOf: 1, sets: [{ a: 5, b: 3 }] }))).toBeNull();
  });
});

describe('overlay-decisivo — games', () => {
  it('a view carrega o ponto do game (0/15/30/40/AD) junto dos games do set', () => {
    const beach = { kind: 'sets_games', bestOf: 3, gamesPerSet: 6, winByGames: 2, tiebreakAtGames: 6, tiebreakTo: 7, noAd: true, decisivoSet: 0, decidingSet: 'super_tiebreak', superTiebreakTo: 10 } as never;
    const m = match({ scoringProfile: beach, sets: [{ a: 6, b: 4 }, { a: 5, b: 3 }], currentSetIndex: 1, currentGame: { a: 3, b: 1 }, servingTeamId: 'ta' });
    const v = overlayViewOf(m, 0) as OverlayDuelView;
    const s = decisivoSituacaoOf(m, v)!;
    expect(s).toEqual(jasmine.objectContaining({ kind: 'mp', side: 'A' }));
    const st = decisivoNext(DECISIVO_INICIAL, { matchId: 'm1', sit: s, sets: [1, 0], encerrada: false, nowMs: NOW });
    const view = decisivoViewOf(st, m, v, { court: null, category: null })!;
    expect([view.a.score, view.b.score]).toEqual([5, 3]);
    expect([view.a.ponto, view.b.ponto]).toEqual(['40', '15']);
  });
});

describe('overlay-decisivo — máquina', () => {
  const entrada = (s: DecisivoSituacao | null, over: Partial<DecisivoEntrada> = {}): DecisivoEntrada => ({ matchId: 'm1', sit: s, sets: [0, 0], encerrada: false, nowMs: NOW, ...over });
  const mp = (side: 'A' | 'B' = 'A'): DecisivoSituacao => ({ kind: 'mp', side, setNumber: 2, limite: null });
  const tb: DecisivoSituacao = { kind: 'tb', side: null, setNumber: 3, limite: 15 };

  it('abre com o match point (1º) e fica enquanto a chance existe', () => {
    const a = decisivoNext(DECISIVO_INICIAL, entrada(mp()));
    expect(a).toEqual(jasmine.objectContaining({ phase: 'ativo', kind: 'mp', side: 'A', n: 1 }));
    expect(decisivoNext(a, entrada(mp(), { nowMs: NOW + 5000 }))).toBe(a);
  });

  it('o adversário salva: vira "Salvo", some em ~3 s e a próxima vez é o 2º match point', () => {
    const a = decisivoNext(DECISIVO_INICIAL, entrada(mp(), { sets: [1, 0] }));
    const salvo = decisivoNext(a, entrada(null, { sets: [1, 0], nowMs: NOW + 1000 }));
    expect(salvo.phase).toBe('salvo');
    expect(decisivoNext(salvo, entrada(null, { sets: [1, 0], nowMs: NOW + 1000 + DECISIVO_SALVO_MS - 1 })).phase).toBe('salvo');
    const idle = decisivoNext(salvo, entrada(null, { sets: [1, 0], nowMs: NOW + 1000 + DECISIVO_SALVO_MS }));
    expect(idle.phase).toBe('idle');
    const outra = decisivoNext(idle, entrada(mp(), { sets: [1, 0], nowMs: NOW + 9000 }));
    expect(outra).toEqual(jasmine.objectContaining({ phase: 'ativo', n: 2 }));
  });

  it('nova chance durante o "Salvo" entra na hora', () => {
    const a = decisivoNext(DECISIVO_INICIAL, entrada(mp(), { sets: [1, 0] }));
    const salvo = decisivoNext(a, entrada(null, { sets: [1, 0] }));
    expect(decisivoNext(salvo, entrada(mp(), { sets: [1, 0] }))).toEqual(jasmine.objectContaining({ phase: 'ativo', n: 2 }));
  });

  it('quem tem a chance converte o set/partida: o alerta acaba sem "Salvo"', () => {
    const a = decisivoNext(DECISIVO_INICIAL, entrada(mp(), { sets: [1, 0] }));
    expect(decisivoNext(a, entrada(null, { sets: [2, 0], encerrada: true })).phase).toBe('idle');
    const sp = decisivoNext(DECISIVO_INICIAL, entrada({ kind: 'sp', side: 'A', setNumber: 1, limite: null }, { sets: [0, 0] }));
    expect(decisivoNext(sp, entrada(null, { sets: [1, 0] })).phase).toBe('idle');
  });

  it('o outro lado ganha a chance: nova chance, contagem própria', () => {
    const a = decisivoNext(DECISIVO_INICIAL, entrada(mp('A')));
    const b = decisivoNext(a, entrada(mp('B')));
    expect(b).toEqual(jasmine.objectContaining({ phase: 'ativo', side: 'B', n: 1 }));
  });

  it('tie-break: avisa uma vez por set, libera o placar em 8 s e não volta', () => {
    const a = decisivoNext(DECISIVO_INICIAL, entrada(tb));
    expect(a).toEqual(jasmine.objectContaining({ phase: 'ativo', kind: 'tb', side: null }));
    const fim = decisivoNext(a, entrada(tb, { nowMs: NOW + DECISIVO_TB_MS }));
    expect(fim.phase).toBe('idle');
    expect(decisivoNext(fim, entrada(tb, { nowMs: NOW + DECISIVO_TB_MS + 1000 })).phase).toBe('idle');
  });

  it('set point durante o aviso de tie-break assume; outra partida zera tudo', () => {
    const t = decisivoNext(DECISIVO_INICIAL, entrada(tb));
    expect(decisivoNext(t, entrada({ kind: 'sp', side: 'B', setNumber: 3, limite: null })).kind).toBe('sp');
    const ativo: DecisivoState = decisivoNext(DECISIVO_INICIAL, entrada(mp()));
    const outra = decisivoNext(ativo, { ...entrada(null), matchId: 'm2' });
    expect(outra.phase).toBe('idle');
    expect(outra.counts).toEqual({});
  });

  it('a view traz placar do set, sets e quadra', () => {
    const m = match({ sets: [{ a: 14, b: 12 }], currentSetIndex: 0 });
    const v = overlayViewOf(m, 0) as OverlayDuelView;
    const st = decisivoNext(DECISIVO_INICIAL, entrada({ kind: 'sp', side: 'A', setNumber: 1, limite: null }));
    const view = decisivoViewOf(st, m, v, { court: 'Quadra 2', category: 'Masculino B' })!;
    expect(view).toEqual(jasmine.objectContaining({ kind: 'sp', salvo: false, side: 'A', n: 1, setNumber: 1, court: 'Quadra 2', category: 'Masculino B' }));
    expect([view.a.score, view.b.score]).toEqual([14, 12]);
    expect([view.a.ponto, view.b.ponto]).toEqual([null, null]); // vôlei: sem ponto do game
    expect(decisivoViewOf(DECISIVO_INICIAL, m, v, { court: null, category: null })).toBeNull();
  });
});
