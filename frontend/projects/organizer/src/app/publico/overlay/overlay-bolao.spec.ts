import type { TournamentMatch } from '../../painel/data/matches-repository';
import { bolaoPercentuais, bolaoViewOf } from './overlay-bolao';
import { overlayViewOf, type OverlayDuelView } from './overlay-selectors';

const NOW = Date.UTC(2026, 9, 7, 18, 0, 0);

function match(over: Partial<TournamentMatch> = {}): TournamentMatch {
  return {
    id: 'm1', tournamentId: 't', categoryId: 'c1', round: 'Semifinal', team1Label: 'Hölting Nilsson / Berger', team2Label: 'Batrane / Tiisaar',
    score: null, winnerSide: null, scheduledAt: new Date(NOW + 209_000), court: 'Quadra 2', status: 'scheduled', teamAId: 'ta', teamBId: 'tb', sets: [],
    courtId: 'q2', scheduleEndAt: null, dayKey: '', bestOf: 3, matchType: 'group', roundNumber: 1, matchNumber: 1, winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null, loserAdvanceMatchNumber: null, liveScore: null, currentSetIndex: null, servingTeamId: '', servingPlayerSlot: 0,
    medicalTimeout: null, matchStartedAt: null, matchEndedAt: null, ...over,
  };
}
const names = { court: 'Quadra 2', category: 'Masculino B' };
const view = (m: TournamentMatch, c = { a: 216, b: 179 }) => bolaoViewOf(m, overlayViewOf(m, 0) as OverlayDuelView, c, NOW, names);

describe('overlay-bolao', () => {
  it('percentuais inteiros somam 100; sem palpites é 50/50', () => {
    expect(bolaoPercentuais(216, 179)).toEqual([55, 45]);
    expect(bolaoPercentuais(1, 2)).toEqual([33, 67]);
    expect(bolaoPercentuais(0, 0)).toEqual([50, 50]);
    expect(bolaoPercentuais(5, 0)).toEqual([100, 0]);
  });

  it('aberto: contagens, total, % e contagem regressiva estimada', () => {
    const v = view(match())!;
    expect(v.fase).toBe('aberto');
    expect([v.a.count, v.b.count, v.total]).toEqual([216, 179, 395]);
    expect([v.a.pct, v.b.pct]).toEqual([55, 45]);
    expect(v.restanteSeg).toBe(209);
    expect(v.court).toBe('Quadra 2');
    expect(v.vencedor).toBeNull();
  });

  it('sem horário previsto: aberto e sem contagem regressiva', () => {
    const v = view(match({ scheduledAt: null }))!;
    expect(v.fase).toBe('aberto');
    expect(v.restanteSeg).toBeNull();
  });

  it('encerra quando a partida começa ou o horário previsto passa', () => {
    expect(view(match({ status: 'in_progress', sets: [{ a: 1, b: 0 }], currentSetIndex: 0 }))!.fase).toBe('encerrado');
    const atrasada = view(match({ scheduledAt: new Date(NOW - 1000) }))!;
    expect(atrasada.fase).toBe('encerrado');
    expect(atrasada.restanteSeg).toBeNull();
  });

  it('resultado: vencedora, quantos palpites e % acertaram', () => {
    const v = view(match({ status: 'completed', winnerSide: 1, sets: [{ a: 21, b: 15 }, { a: 21, b: 18 }] }))!;
    expect(v.fase).toBe('resultado');
    expect(v.vencedor).toBe('A');
    expect(v.acertaram).toEqual({ n: 216, pct: 55 });
    const b = view(match({ status: 'completed', winnerSide: 2, sets: [{ a: 15, b: 21 }, { a: 18, b: 21 }] }))!;
    expect(b.vencedor).toBe('B');
    expect(b.acertaram).toEqual({ n: 179, pct: 45 });
  });

  it('sem partida, cancelada ou sem as duas duplas: nada', () => {
    expect(bolaoViewOf(null, null, { a: 0, b: 0 }, NOW, names)).toBeNull();
    expect(view(match({ status: 'canceled' }))).toBeNull();
    expect(view(match({ teamBId: '' }))).toBeNull();
  });
});
