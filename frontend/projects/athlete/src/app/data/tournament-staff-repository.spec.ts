import type { TournamentSummary } from './tournaments-repository';
import {
  filterOngoingStaffTournaments,
  sortStaffTournaments,
  staffRoleForTournament,
  staffRoleLabel,
  staffRoleOf,
  staffTournamentFromDoc,
  type MyStaffTournament,
} from './tournament-staff-repository';

function ts(date: Date): { toDate: () => Date } {
  return { toDate: () => date };
}

/** Espelho `users/{uid}/tournamentStaff` — mesmo contrato do `MyTournamentStaffEntry` do app
 *  (`my_tournament_staff_providers.dart`): papel desconhecido é gestor, `status` default
 *  'active' e ordenação por `startAt` desc com os sem data no fim. */
describe('tournament-staff-repository', () => {
  describe('staffRoleOf', () => {
    it('só reconhece scorer; qualquer outro valor é gestor', () => {
      expect(staffRoleOf('scorer')).toBe('scorer');
      expect(staffRoleOf('manager')).toBe('manager');
      expect(staffRoleOf(undefined)).toBe('manager');
      expect(staffRoleOf('referee')).toBe('manager');
    });

    it('rotula em pt-BR', () => {
      expect(staffRoleLabel('scorer')).toBe('Mesário');
      expect(staffRoleLabel('manager')).toBe('Gestor');
    });
  });

  describe('staffTournamentFromDoc', () => {
    it('lê os campos gravados por buildStaffMirrorData', () => {
      const startAt = new Date('2026-08-20T13:00:00Z');
      const entry = staffTournamentFromDoc('t1', {
        role: 'scorer',
        status: 'active',
        tournamentName: 'Copa Verão',
        startAt: ts(startAt),
        endAt: null,
      });
      expect(entry).toEqual({
        tournamentId: 't1',
        role: 'scorer',
        status: 'active',
        tournamentName: 'Copa Verão',
        startAt,
        endAt: null,
      });
    });

    it('doc incompleto não quebra a lista', () => {
      const entry = staffTournamentFromDoc('t2', {});
      expect(entry.role).toBe('manager');
      expect(entry.status).toBe('active');
      expect(entry.tournamentName).toBe('');
      expect(entry.startAt).toBeNull();
    });
  });

  describe('sortStaffTournaments', () => {
    it('mais recente primeiro; sem data vai pro fim', () => {
      const entries = [
        { tournamentId: 'sem-data', startAt: null },
        { tournamentId: 'agosto', startAt: new Date('2026-08-01T12:00:00Z') },
        { tournamentId: 'setembro', startAt: new Date('2026-09-01T12:00:00Z') },
      ] as MyStaffTournament[];
      expect(sortStaffTournaments(entries).map((e) => e.tournamentId)).toEqual(['setembro', 'agosto', 'sem-data']);
    });

    it('não muta a lista recebida', () => {
      const entries = [
        { tournamentId: 'a', startAt: new Date('2026-08-01T12:00:00Z') },
        { tournamentId: 'b', startAt: new Date('2026-09-01T12:00:00Z') },
      ] as MyStaffTournament[];
      sortStaffTournaments(entries);
      expect(entries.map((e) => e.tournamentId)).toEqual(['a', 'b']);
    });
  });

  describe('filterOngoingStaffTournaments', () => {
    const entries = [
      { tournamentId: 'rolando' },
      { tournamentId: 'finalizado' },
      { tournamentId: 'cancelado' },
      { tournamentId: 'sem-doc' },
    ] as MyStaffTournament[];

    type Status = Pick<TournamentSummary, 'rawStatus' | 'isCancelled'>;
    const tournaments = new Map<string, Status>([
      ['rolando', { rawStatus: 'live', isCancelled: false }],
      ['finalizado', { rawStatus: 'completed', isCancelled: false }],
      ['cancelado', { rawStatus: 'ended', isCancelled: true }],
    ]);

    it('esconde o que já finalizou ou foi cancelado', () => {
      const ids = filterOngoingStaffTournaments(entries, tournaments).map((e) => e.tournamentId);
      expect(ids).not.toContain('finalizado');
      expect(ids).not.toContain('cancelado');
    });

    it('mantém o torneio em andamento e o que não deu pra ler', () => {
      // Leitura falha/doc ausente não pode esvaziar a mesa no dia do evento.
      const ids = filterOngoingStaffTournaments(entries, tournaments).map((e) => e.tournamentId);
      expect(ids).toEqual(['rolando', 'sem-doc']);
    });

    it('sem status nenhum, devolve tudo', () => {
      expect(filterOngoingStaffTournaments(entries, new Map()).length).toBe(entries.length);
    });
  });

  describe('staffRoleForTournament', () => {
    const entries = [
      { tournamentId: 't1', role: 'scorer' },
      { tournamentId: 't2', role: 'manager' },
    ] as MyStaffTournament[];

    it('devolve o papel do torneio pedido', () => {
      expect(staffRoleForTournament(entries, 't1')).toBe('scorer');
      expect(staffRoleForTournament(entries, ' t2 ')).toBe('manager');
    });

    it('null quando o usuário não é da equipe', () => {
      expect(staffRoleForTournament(entries, 't3')).toBeNull();
    });
  });
});
