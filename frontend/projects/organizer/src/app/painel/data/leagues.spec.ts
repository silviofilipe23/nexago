import {
  canCancelLeague,
  canCloseLeagueSeason,
  effectivePointsForMode,
  leagueFromDoc,
  leagueGendersOf,
  leagueListingStatusOf,
  leagueRankingEntryFromDoc,
  leagueStatusTransitionAllowed,
  rankLeagueRows,
} from '@nexago/leagues';

/** Espelha `league_ranking_logic.dart` (pontos efetivos), `_updateLeagueListingStatus`
 *  (`organizer_leagues_repository.dart`) e `leagueListingStatusTransitionAllowed`
 *  (`firestore.rules`) — se qualquer um dos três mudar, estes testes têm que mudar junto. */
describe('@nexago/leagues', () => {
  const ts = (d: Date) => ({ toDate: () => d });

  describe('effectivePointsForMode', () => {
    it('soma os 4 melhores no modo padrão (best_4_of_6)', () => {
      expect(effectivePointsForMode([100, 80, 60, 40, 20, 10], 'best_4_of_6')).toBe(280);
    });

    it('soma os 3 melhores no best_3_of_5', () => {
      expect(effectivePointsForMode([100, 80, 60, 40, 20], 'best_3_of_5')).toBe(240);
    });

    it('soma tudo no all_stages', () => {
      expect(effectivePointsForMode([100, 80, 60, 40, 20, 10], 'all_stages')).toBe(310);
    });

    it('não depende da ordem de entrada', () => {
      expect(effectivePointsForMode([20, 100, 40, 80, 60], 'best_4_of_6')).toBe(280);
    });

    it('com menos etapas do que o corte, soma o que tem', () => {
      expect(effectivePointsForMode([100, 50], 'best_4_of_6')).toBe(150);
      expect(effectivePointsForMode([], 'all_stages')).toBe(0);
    });
  });

  describe('leagueRankingEntryFromDoc', () => {
    it('usa effectivePoints do doc quando a Cloud Function já calculou', () => {
      const row = leagueRankingEntryFromDoc(
        'doc-1',
        {
          teamId: 'time-1',
          categoryId: 'cat-1',
          effectivePoints: 999,
          stageResults: [{ tournamentId: 't1', points: 100, place: 1 }],
        },
        'teamId',
        'best_4_of_6',
      );
      expect(row.effectivePoints).toBe(999);
      expect(row.refId).toBe('time-1');
      expect(row.categoryId).toBe('cat-1');
      expect(row.stagesPlayed).toBe(1);
    });

    it('recalcula quando o doc antigo não tem effectivePoints', () => {
      const row = leagueRankingEntryFromDoc(
        'doc-2',
        {
          teamId: 'time-2',
          stageResults: [
            { tournamentId: 't1', points: 100 },
            { tournamentId: 't2', points: 80 },
            { tournamentId: 't3', points: 60 },
            { tournamentId: 't4', points: 40 },
            { tournamentId: 't5', points: 20 },
          ],
        },
        'teamId',
        'best_4_of_6',
      );
      expect(row.effectivePoints).toBe(280);
      expect(row.rawPoints).toBe(300);
    });

    it('descarta resultado de etapa sem tournamentId', () => {
      const row = leagueRankingEntryFromDoc(
        'doc-3',
        { teamId: 't', stageResults: [{ points: 50 }, { tournamentId: 't1', points: 30 }] },
        'teamId',
        'all_stages',
      );
      expect(row.stagesPlayed).toBe(1);
      expect(row.effectivePoints).toBe(30);
    });
  });

  describe('rankLeagueRows', () => {
    const entry = (refId: string, points: number, categoryId: string | null = 'cat-1') => ({
      id: refId,
      refId,
      categoryId,
      effectivePoints: points,
      rawPoints: points,
      stagesPlayed: 1,
      stageResults: [],
    });

    it('ordena por pontos efetivos e numera as posições', () => {
      const ranked = rankLeagueRows([entry('a', 80), entry('b', 150)]);
      expect(ranked.map((r) => r.refId)).toEqual(['b', 'a']);
      expect(ranked.map((r) => r.rank)).toEqual([1, 2]);
    });

    it('empate desempata de forma estável pelo refId', () => {
      const ranked = rankLeagueRows([entry('zeta', 100), entry('alfa', 100)]);
      expect(ranked.map((r) => r.refId)).toEqual(['alfa', 'zeta']);
    });

    it('recorta pela categoria pedida e renumera dentro dela', () => {
      const ranked = rankLeagueRows(
        [entry('a', 300, 'cat-2'), entry('b', 150, 'cat-1'), entry('c', 80, 'cat-1')],
        'cat-1',
      );
      expect(ranked.map((r) => r.refId)).toEqual(['b', 'c']);
      expect(ranked.map((r) => r.rank)).toEqual([1, 2]);
    });

    it('sem categoria, mantém todas as pontuações', () => {
      expect(rankLeagueRows([entry('a', 300, 'cat-2'), entry('b', 150, 'cat-1')]).length).toBe(2);
    });

    it('categoria sem pontuação devolve lista vazia', () => {
      expect(rankLeagueRows([entry('a', 300, 'cat-2')], 'cat-9')).toEqual([]);
    });
  });

  describe('leagueListingStatusOf', () => {
    it('lê listingStatus quando presente', () => {
      expect(leagueListingStatusOf({ listingStatus: 'open', status: 'draft' })).toBe('open');
    });

    it('cai pro status quando não há listingStatus (docs antigos)', () => {
      expect(leagueListingStatusOf({ status: 'closed' })).toBe('closed');
    });

    it('trata rascunho e valores desconhecidos como draft', () => {
      expect(leagueListingStatusOf({ listingStatus: 'rascunho' })).toBe('draft');
      expect(leagueListingStatusOf({})).toBe('draft');
    });

    it('normaliza cancelado escrito de outras formas', () => {
      expect(leagueListingStatusOf({ listingStatus: 'canceled' })).toBe('cancelled');
    });
  });

  describe('leagueFromDoc', () => {
    it('mapeia os campos da liga publicada', () => {
      const league = leagueFromDoc('liga-1', {
        name: 'Copa Goiás Beach',
        managerId: 'uid-1',
        sport: 'beachVolleyball',
        seasonLabel: '2026',
        city: 'Goiânia',
        listingStatus: 'open',
        countingStagesMode: 'best_3_of_5',
        grandFinalEnabled: true,
        grandFinalSpots: 8,
        plannedStagesCount: 5,
        categories: [{ id: 'cat-1', categoryName: 'Feminino B', genderType: 'female' }],
        stages: [
          { id: 's2', name: 'Etapa 2', order: 2, tournamentIds: ['t2'] },
          { id: 's1', name: 'Etapa 1', order: 1, tournamentIds: ['t1'] },
        ],
      });

      expect(league.sportLabel).toBe('Vôlei de praia');
      expect(league.listingStatus).toBe('open');
      expect(league.countingStagesMode).toBe('best_3_of_5');
      expect(league.grandFinalSpots).toBe(8);
      expect(league.categories[0]?.genderType).toBe('F');
      // Etapas saem ordenadas por `order`, independentemente da ordem gravada.
      expect(league.stages.map((s) => s.id)).toEqual(['s1', 's2']);
      expect(league.stages[0]?.tournamentId).toBe('t1');
    });

    it('usa imageUrl como capa quando não há coverUrl', () => {
      expect(leagueFromDoc('l', { imageUrl: 'https://x/y.jpg' }).coverUrl).toBe('https://x/y.jpg');
      expect(leagueFromDoc('l', { coverUrl: 'https://a/b.jpg', imageUrl: 'https://x/y.jpg' }).coverUrl).toBe('https://a/b.jpg');
    });

    it('etapa sem torneio publicado fica com tournamentId nulo', () => {
      const league = leagueFromDoc('l', { stages: [{ id: 's1', order: 1, tournamentIds: [] }] });
      expect(league.stages[0]?.tournamentId).toBeNull();
    });

    it('lê datas de Timestamp do Firestore', () => {
      const start = new Date(2026, 2, 1);
      const league = leagueFromDoc('l', { seasonStartAt: ts(start) });
      expect(league.seasonStartAt?.getTime()).toBe(start.getTime());
    });

    it('modo de contagem desconhecido cai no padrão best_4_of_6', () => {
      expect(leagueFromDoc('l', { countingStagesMode: 'coisa_nova' }).countingStagesMode).toBe('best_4_of_6');
    });
  });

  describe('leagueGendersOf', () => {
    it('lista os gêneros presentes na ordem M → F → Mix', () => {
      const genders = leagueGendersOf([
        { id: '1', categoryName: 'Misto A', genderType: 'Mix' },
        { id: '2', categoryName: 'Fem B', genderType: 'F' },
        { id: '3', categoryName: 'Masc B', genderType: 'M' },
      ]);
      expect(genders).toEqual(['M', 'F', 'Mix']);
    });

    it('não repete gênero e ignora os ausentes', () => {
      expect(leagueGendersOf([{ id: '1', categoryName: 'Fem A', genderType: 'F' }])).toEqual(['F']);
      expect(leagueGendersOf([])).toEqual([]);
    });
  });

  describe('transições de listingStatus', () => {
    it('permite exatamente as transições das rules', () => {
      expect(leagueStatusTransitionAllowed('draft', 'open')).toBeTrue();
      expect(leagueStatusTransitionAllowed('draft', 'cancelled')).toBeTrue();
      expect(leagueStatusTransitionAllowed('open', 'closed')).toBeTrue();
      expect(leagueStatusTransitionAllowed('open', 'cancelled')).toBeTrue();
      expect(leagueStatusTransitionAllowed('open', 'open')).toBeTrue();
    });

    it('bloqueia reabrir, reviver cancelada e pular pra encerrada', () => {
      expect(leagueStatusTransitionAllowed('closed', 'open')).toBeFalse();
      expect(leagueStatusTransitionAllowed('cancelled', 'open')).toBeFalse();
      expect(leagueStatusTransitionAllowed('draft', 'closed')).toBeFalse();
    });

    it('só liga publicada pode encerrar a temporada', () => {
      expect(canCloseLeagueSeason('open')).toBeTrue();
      expect(canCloseLeagueSeason('draft')).toBeFalse();
      expect(canCloseLeagueSeason('closed')).toBeFalse();
      expect(canCloseLeagueSeason('cancelled')).toBeFalse();
    });

    it('cancelar vale pra rascunho e publicada, não pra já cancelada/encerrada', () => {
      expect(canCancelLeague('draft')).toBeTrue();
      expect(canCancelLeague('open')).toBeTrue();
      expect(canCancelLeague('closed')).toBeFalse();
      expect(canCancelLeague('cancelled')).toBeFalse();
    });
  });
});
