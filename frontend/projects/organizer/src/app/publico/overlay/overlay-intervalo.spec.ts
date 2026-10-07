import type { TournamentMatch } from '../../painel/data/matches-repository';
import type { OrganizerTournamentCourt } from '../../painel/data/tournament.model';
import { categoryShortOf, intervaloRestanteSeg, intervaloViewOf, phaseShortOf } from './overlay-intervalo';

const at = (h: number, m: number) => new Date(2026, 9, 6, h, m);
const NOW = at(15, 0).getTime();

function match(over: Partial<TournamentMatch> = {}): TournamentMatch {
  return {
    id: 'm', tournamentId: 't', categoryId: 'c1', round: 'Semifinal', team1Label: 'A1 / A2', team2Label: 'B1 / B2', score: null,
    winnerSide: null, scheduledAt: at(15, 40), court: null, status: 'scheduled', teamAId: 'ta', teamBId: 'tb', sets: [], courtId: 'q1',
    scheduleEndAt: null, dayKey: '', bestOf: 3, matchType: 'group', roundNumber: 1, matchNumber: 1, winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null, loserAdvanceMatchNumber: null, liveScore: null, currentSetIndex: null, servingTeamId: '', servingPlayerSlot: 0,
    medicalTimeout: null, matchStartedAt: null, matchEndedAt: null, ...over,
  };
}
const courts: OrganizerTournamentCourt[] = [{ id: 'q1', name: 'Quadra 1', order: 0 }];
const cat = () => 'Masculino B';

describe('overlay-intervalo', () => {
  it('abreviações de categoria e fase', () => {
    expect(categoryShortOf('Masculino B')).toBe('Masc. B');
    expect(categoryShortOf('Feminino A')).toBe('Fem. A');
    expect(categoryShortOf('Misto')).toBe('Misto');
    expect(['Quartas de final', 'Semifinal', 'Oitavas', 'Final'].map(phaseShortOf)).toEqual(['QF', 'SF', 'OF', 'F']);
  });

  it('a seguir + 3 seguintes por horário (ignora encerrados, ao vivo e muito antigos)', () => {
    const ms = [
      match({ id: 'a', scheduledAt: at(15, 40), matchNumber: 1 }),
      match({ id: 'b', scheduledAt: at(16, 20) }),
      match({ id: 'c', scheduledAt: at(17, 0) }),
      match({ id: 'd', scheduledAt: at(17, 40) }),
      match({ id: 'e', scheduledAt: at(18, 20) }),
      match({ id: 'live', status: 'in_progress', scheduledAt: at(14, 50) }),
      match({ id: 'velho', scheduledAt: at(10, 0) }),
    ];
    const v = intervaloViewOf(ms, courts, cat, NOW);
    expect(v.next?.matchId).toBe('a');
    expect(v.next).toEqual(jasmine.objectContaining({ time: '15:40', category: 'Masculino B', phase: 'Semifinal', court: 1 }));
    expect(v.following.map((g) => g.matchId)).toEqual(['b', 'c', 'd']);
  });

  it('sem jogos por vir: nada a seguir', () => {
    const v = intervaloViewOf([], courts, cat, NOW);
    expect(v.next).toBeNull();
    expect(v.following).toEqual([]);
    expect(v.results).toEqual([]);
  });

  it('resultados recentes: vencedor, placar do ponto de vista dele e tag abreviada', () => {
    const ms = [
      match({ id: 'r1', status: 'completed', winnerSide: 2, round: 'Quartas de final', sets: [{ a: 15, b: 21 }, { a: 21, b: 18 }, { a: 12, b: 15 }], matchEndedAt: at(14, 0) }),
      match({ id: 'r2', status: 'completed', winnerSide: 1, round: 'Semifinal', sets: [{ a: 21, b: 10 }, { a: 21, b: 12 }], matchEndedAt: at(14, 30) }),
    ];
    const v = intervaloViewOf(ms, courts, cat, NOW);
    expect(v.results.map((r) => r.matchId)).toEqual(['r2', 'r1']);
    expect(v.results[0]).toEqual(jasmine.objectContaining({ tag: 'Masc. B · SF', score: '2–0' }));
    expect(v.results[1]!.winner.label).toBe('B1 / B2');
    expect(v.results[1]!.score).toBe('2–1');
  });

  it('contagem: arredonda pra cima, zera sem passar de 0 e some sem início/duração', () => {
    const start = new Date(NOW);
    expect(intervaloRestanteSeg(start, 300, NOW)).toBe(300);
    expect(intervaloRestanteSeg(start, 300, NOW + 6_000)).toBe(294);
    expect(intervaloRestanteSeg(start, 300, NOW + 400_000)).toBe(0);
    expect(intervaloRestanteSeg(null, 300, NOW)).toBeNull();
    expect(intervaloRestanteSeg(start, 0, NOW)).toBeNull();
  });
});
