import { leagueFromDoc, type League } from '@nexago/leagues';
import { EMPTY_TOURNAMENT_COLLECTED } from '../data/tournament-collected';
import type { OrganizerTournament } from '../data/tournament.model';
import { buildLigaEtapaRows, ligaEtapaStatusOf, nextLigaEtapa } from './liga-stages';

/** O `status` gravado dentro de `stages[]` é do rascunho do wizard ('planned'/'defined'), não
 *  do dia de jogo — quem manda no estado da etapa é o torneio referenciado. */
describe('liga-stages', () => {
  function tournament(over: Partial<OrganizerTournament> & { id: string }): OrganizerTournament {
    return {
      name: 'Etapa',
      managerId: 'uid',
      sportLabel: 'Vôlei de praia',
      sportId: 'beachVolleyball',
      coverUrl: null,
      status: 'inscricoes',
      visibility: 'publicListing',
      paymentMode: 'appPixCard',
      collected: EMPTY_TOURNAMENT_COLLECTED,
      startAt: null,
      endAt: null,
      city: null,
      location: null,
      categories: [],
      capacity: null,
      waitlistEnabled: true,
      leagueId: 'liga-1',
      courts: [],
      courtsCount: 4,
      matchOps: { dayStart: '07:00', dayEnd: '24:00', defaultMatchDurationMin: 40, minRestBetweenMatchesMin: 20, dynamicRescheduleEnabled: false },
      bigScreen: null,
      uniformRequired: false,
      uniformNumberOnShirt: false,
      uniformNameOnShirt: false,
      ...over,
    };
  }

  function league(stages: Record<string, unknown>[], extra: Record<string, unknown> = {}): League {
    return leagueFromDoc('liga-1', { name: 'Liga', city: 'Goiânia', stages, ...extra });
  }

  describe('ligaEtapaStatusOf', () => {
    it('etapa sem torneio publicado é só planejada', () => {
      expect(ligaEtapaStatusOf(undefined)).toBe('planejada');
      expect(ligaEtapaStatusOf(null)).toBe('planejada');
    });

    it('deriva o estado do torneio da etapa', () => {
      expect(ligaEtapaStatusOf(tournament({ id: 't', status: 'inscricoes' }))).toBe('inscricoes');
      expect(ligaEtapaStatusOf(tournament({ id: 't', status: 'andamento' }))).toBe('andamento');
      expect(ligaEtapaStatusOf(tournament({ id: 't', status: 'concluido' }))).toBe('concluida');
      expect(ligaEtapaStatusOf(tournament({ id: 't', status: 'cancelado' }))).toBe('cancelada');
    });
  });

  describe('buildLigaEtapaRows', () => {
    it('cruza plano da temporada com torneios publicados e inscritos', () => {
      const rows = buildLigaEtapaRows({
        league: league([
          { id: 's1', name: 'Etapa 1', order: 1, tournamentIds: ['t1'] },
          { id: 's2', name: 'Etapa 2', order: 2, tournamentIds: [] },
        ]),
        tournamentsById: new Map([
          ['t1', tournament({ id: 't1', status: 'andamento', city: 'Aparecida', location: 'Arena Sul', capacity: 32 })],
        ]),
        inscritosByTournament: new Map([['t1', 24]]),
      });

      expect(rows.length).toBe(2);
      expect(rows[0]).toEqual(
        jasmine.objectContaining({ status: 'andamento', tournamentId: 't1', inscritos: 24, vagas: 32 }),
      );
      expect(rows[0]?.local).toBe('Arena Sul · Aparecida');
      expect(rows[1]).toEqual(jasmine.objectContaining({ status: 'planejada', tournamentId: null, inscritos: null }));
    });

    it('etapa planejada herda a cidade da liga quando não tem a sua', () => {
      const rows = buildLigaEtapaRows({
        league: league([{ id: 's1', order: 1, tournamentIds: [] }]),
        tournamentsById: new Map(),
      });
      expect(rows[0]?.local).toBe('Goiânia');
    });

    it('sem data em lugar nenhum, mostra data a definir', () => {
      const rows = buildLigaEtapaRows({
        league: league([{ id: 's1', order: 1, tournamentIds: [] }]),
        tournamentsById: new Map(),
      });
      expect(rows[0]?.dateLabel).toBe('Data a definir');
    });

    it('dateLabel gravado na etapa tem prioridade sobre as datas do torneio', () => {
      const rows = buildLigaEtapaRows({
        league: league([{ id: 's1', order: 1, dateLabel: '14 e 15 de março', tournamentIds: ['t1'] }]),
        tournamentsById: new Map([['t1', tournament({ id: 't1', startAt: new Date(2026, 2, 14) })]]),
      });
      expect(rows[0]?.dateLabel).toBe('14 e 15 de março');
    });
  });

  describe('nextLigaEtapa', () => {
    const base = { statusLabel: '', statusTone: 'dim' as const, local: '', dateLabel: '', isGrandFinal: false, inscritos: null, vagas: null };

    it('escolhe a etapa em aberto com a data mais próxima', () => {
      const next = nextLigaEtapa([
        { ...base, stageId: 's1', order: 1, name: 'E1', status: 'concluida', startAt: new Date(2026, 0, 10), tournamentId: 't1' },
        { ...base, stageId: 's3', order: 3, name: 'E3', status: 'inscricoes', startAt: new Date(2026, 4, 10), tournamentId: 't3' },
        { ...base, stageId: 's2', order: 2, name: 'E2', status: 'inscricoes', startAt: new Date(2026, 2, 10), tournamentId: 't2' },
      ]);
      expect(next?.stageId).toBe('s2');
    });

    it('ignora etapas canceladas e encerradas', () => {
      const next = nextLigaEtapa([
        { ...base, stageId: 's1', order: 1, name: 'E1', status: 'cancelada', startAt: new Date(2026, 0, 1), tournamentId: 't1' },
        { ...base, stageId: 's2', order: 2, name: 'E2', status: 'concluida', startAt: new Date(2026, 1, 1), tournamentId: 't2' },
      ]);
      expect(next).toBeNull();
    });

    it('sem datas, cai na primeira em aberto pela ordem do plano', () => {
      const next = nextLigaEtapa([
        { ...base, stageId: 's2', order: 2, name: 'E2', status: 'planejada', startAt: null, tournamentId: null },
        { ...base, stageId: 's1', order: 1, name: 'E1', status: 'planejada', startAt: null, tournamentId: null },
      ]);
      expect(next?.stageId).toBe('s1');
    });

    it('lista vazia não tem próxima etapa', () => {
      expect(nextLigaEtapa([])).toBeNull();
    });
  });
});
