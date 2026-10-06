import type { TournamentMatch } from '../../painel/data/matches-repository';
import type { OrganizerTournamentCourt } from '../../painel/data/tournament.model';
import { gradeDayOf, gradeViewOf } from './overlay-grade';

const at = (h: number, m: number, day = 6) => new Date(2026, 9, day, h, m);
const NOW = at(13, 10).getTime();

function match(over: Partial<TournamentMatch> = {}): TournamentMatch {
  return {
    id: 'm', tournamentId: 't', categoryId: 'c1', round: 'Oitavas', team1Label: 'A1 / A2', team2Label: 'B1 / B2', score: null,
    winnerSide: null, scheduledAt: at(11, 20), court: null, status: 'scheduled', teamAId: 'ta', teamBId: 'tb', sets: [], courtId: 'q1',
    scheduleEndAt: null, dayKey: '', bestOf: 3, matchType: 'group', roundNumber: 1, matchNumber: 1, winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null, loserAdvanceMatchNumber: null, liveScore: null, currentSetIndex: null, servingTeamId: '', servingPlayerSlot: 0,
    medicalTimeout: null, matchStartedAt: null, matchEndedAt: null, ...over,
  };
}
const courts: OrganizerTournamentCourt[] = [
  { id: 'q1', name: 'Quadra 1', order: 0 },
  { id: 'q2', name: 'Quadra 2', order: 1 },
];

describe('overlay-grade', () => {
  it('dia: hoje se tiver jogo; senão o próximo; senão o último', () => {
    const ms = [match({ id: 'a', scheduledAt: at(10, 0, 5) }), match({ id: 'b', scheduledAt: at(10, 0, 8) })];
    expect(gradeDayOf(ms, NOW)).toBe('2026-10-08');
    expect(gradeDayOf([...ms, match({ id: 'c', scheduledAt: at(9, 0, 6) })], NOW)).toBe('2026-10-06');
    expect(gradeDayOf([ms[0]!], NOW)).toBe('2026-10-05');
    expect(gradeDayOf([], NOW)).toBeNull();
  });

  it('blocos de 40 min a partir do 1º jogo, um jogo por quadra/horário', () => {
    const ms = [
      match({ id: 'a', scheduledAt: at(11, 20), courtId: 'q1' }),
      match({ id: 'b', scheduledAt: at(11, 20), courtId: 'q2' }),
      match({ id: 'c', scheduledAt: at(12, 40), courtId: 'q1' }),
    ];
    const v = gradeViewOf(ms, courts, NOW)!;
    expect(v.rows.map((r) => r.label)).toEqual(['11:20', '12:00', '12:40']);
    expect(v.rows[0]!.cells.map((c) => c.length)).toEqual([1, 1]);
    expect(v.rows[1]!.cells.map((c) => c.length)).toEqual([0, 0]);
    expect(v.rows[2]!.cells[0]![0]!.matchId).toBe('c');
  });

  it('estados: final com placar e vencedor, ao vivo, próximo (1º futuro por quadra) e agendado', () => {
    const ms = [
      match({ id: 'f', scheduledAt: at(11, 20), status: 'completed', winnerSide: 1, sets: [{ a: 21, b: 15 }, { a: 21, b: 19 }] }),
      match({ id: 'l', scheduledAt: at(12, 40), status: 'in_progress', sets: [{ a: 3, b: 2 }] }),
      match({ id: 'n', scheduledAt: at(13, 20) }),
      match({ id: 's', scheduledAt: at(14, 0) }),
    ];
    const v = gradeViewOf(ms, courts, NOW)!;
    const cell = (id: string) => v.rows.flatMap((r) => r.cells.flat()).find((c) => c.matchId === id)!;
    expect(cell('f').state).toBe('final');
    expect(cell('f').score).toBe('2–0');
    expect(cell('f').winner).toBe('A');
    expect(cell('l').state).toBe('live');
    expect(cell('n').state).toBe('next');
    expect(cell('s').state).toBe('scheduled');
  });

  it('agora: linha, fração dentro do bloco e rolagem 2 linhas antes (limitada ao fim)', () => {
    const ms = Array.from({ length: 12 }, (_, i) => match({ id: `m${i}`, scheduledAt: new Date(at(8, 0).getTime() + i * 40 * 60_000) }));
    const v = gradeViewOf(ms, courts, at(9, 30).getTime())!;
    expect(v.now?.row).toBe(2);
    expect(v.now?.label).toBe('09:30');
    // 09:30 − 08:00 = 90 min → bloco 3 (80–120 min), 10 min dentro dele = 0,25.
    expect(v.now!.frac).toBeCloseTo(0.25, 5);
    expect(v.firstVisible).toBe(0);
    const late = gradeViewOf(ms, courts, at(14, 0).getTime())!;
    expect(late.firstVisible).toBe(4);
    expect(gradeViewOf(ms, courts, at(7, 0).getTime())!.now).toBeNull();
  });

  it('KOTC e quadra fora da lista ficam de fora; sem jogos válidos = null', () => {
    expect(gradeViewOf([match({ courtId: 'qx' })], courts, NOW)).toBeNull();
  });
});
