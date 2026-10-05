import type { TournamentMatch } from '../data/matches-repository';
import { buildMesaRows, categoryFilterOptions, mesaScoreLabel, rowsOfSection } from './mesa-matches.selectors';

function match(partial: Partial<TournamentMatch> & Pick<TournamentMatch, 'id'>): TournamentMatch {
  return {
    tournamentId: 't1',
    categoryId: 'c1',
    round: 1,
    matchType: 'group',
    poolId: 'pool-a',
    teamAId: 'A',
    teamBId: 'B',
    teamADescription: null,
    teamBDescription: null,
    status: 'Scheduled',
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
    currentSetIndex: null,
    ...partial,
  };
}

/** 29/08/2026 em São Paulo (UTC-3). */
function spTime(hour: number, minute = 0): Date {
  return new Date(Date.UTC(2026, 7, 29, hour + 3, minute));
}

const labels = (m: TournamentMatch) => ({ teamA: `A:${m.teamAId}`, teamB: `B:${m.teamBId}`, category: `cat:${m.categoryId}` });

describe('mesa-matches.selectors', () => {
  describe('buildMesaRows', () => {
    it('separa ao vivo, a seguir e encerradas', () => {
      const rows = buildMesaRows(
        [
          match({ id: 'agendada' }),
          match({ id: 'ao-vivo', status: 'In Progress' }),
          match({ id: 'encerrada', status: 'Completed' }),
          match({ id: 'cancelada', status: 'Canceled' }),
        ],
        labels,
      );
      expect(rowsOfSection(rows, 'live').map((r) => r.id)).toEqual(['ao-vivo']);
      expect(rowsOfSection(rows, 'upcoming').map((r) => r.id)).toEqual(['agendada']);
      expect(rowsOfSection(rows, 'finished').map((r) => r.id)).toEqual(['encerrada', 'cancelada']);
    });

    it('ao vivo vem antes de tudo, e as próximas em ordem de horário', () => {
      const rows = buildMesaRows(
        [
          match({ id: 'tarde', scheduleTime: spTime(16) }),
          match({ id: 'cedo', scheduleTime: spTime(9) }),
          match({ id: 'rolando', status: 'In Progress', scheduleTime: spTime(15) }),
        ],
        labels,
      );
      expect(rows.map((r) => r.id)).toEqual(['rolando', 'cedo', 'tarde']);
    });

    it('encerradas listam as mais recentes primeiro', () => {
      const rows = buildMesaRows(
        [
          match({ id: 'manha', status: 'Completed', scheduleTime: spTime(9) }),
          match({ id: 'noite', status: 'Completed', scheduleTime: spTime(20) }),
        ],
        labels,
      );
      expect(rows.map((r) => r.id)).toEqual(['noite', 'manha']);
    });

    it('sem horário cai na ordem da planta (matchNumber) e vai depois de quem tem hora', () => {
      const rows = buildMesaRows(
        [
          match({ id: 'j7', matchNumber: 7 }),
          match({ id: 'j3', matchNumber: 3 }),
          match({ id: 'marcada', matchNumber: 99, scheduleTime: spTime(10) }),
        ],
        labels,
      );
      expect(rows.map((r) => r.id)).toEqual(['marcada', 'j3', 'j7']);
    });

    it('marca como não pronta a partida sem os dois lados definidos', () => {
      const rows = buildMesaRows([match({ id: 'aguardando', teamBId: '', teamBDescription: 'Vencedor J5' })], labels);
      expect(rows[0]!.ready).toBeFalse();
      expect(rows[0]!.teamBLabel).toBe('B:');
    });

    it('meta junta quadra e horário, normalizando o nome da quadra', () => {
      const [comNumero, comNome] = buildMesaRows(
        [
          match({ id: 'a', courtName: '2', scheduleTime: spTime(14, 30), matchNumber: 1 }),
          match({ id: 'b', courtName: 'Quadra Central', matchNumber: 2 }),
        ],
        labels,
      );
      expect(comNumero!.metaLabel).toBe('Quadra 2 · 14:30');
      expect(comNome!.metaLabel).toBe('Quadra Central');
    });
  });

  describe('mesaScoreLabel', () => {
    it('agendada não mostra placar', () => {
      expect(mesaScoreLabel(match({ id: 'm' }))).toBe('');
    });

    it('ao vivo mostra sets e o set em andamento', () => {
      const m = match({
        id: 'm',
        status: 'In Progress',
        sets: [
          { a: 21, b: 15 },
          { a: 14, b: 12 },
        ],
        currentSetIndex: 1,
      });
      expect(mesaScoreLabel(m)).toBe('1×0 · 14-12');
    });

    it('encerrada mostra só os sets', () => {
      const m = match({
        id: 'm',
        status: 'Completed',
        sets: [
          { a: 21, b: 15 },
          { a: 18, b: 21 },
          { a: 15, b: 12 },
        ],
      });
      expect(mesaScoreLabel(m)).toBe('2×1');
    });
  });

  describe('categoryFilterOptions', () => {
    it('lista cada categoria uma vez, na ordem em que aparece', () => {
      const rows = buildMesaRows(
        [
          match({ id: '1', categoryId: 'fem-a', status: 'In Progress' }),
          match({ id: '2', categoryId: 'masc-b' }),
          match({ id: '3', categoryId: 'fem-a' }),
        ],
        labels,
      );
      expect(categoryFilterOptions(rows)).toEqual([
        { id: 'fem-a', label: 'cat:fem-a' },
        { id: 'masc-b', label: 'cat:masc-b' },
      ]);
    });
  });
});
