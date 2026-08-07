import {
  DEFAULT_LEAGUE_RANKING_POINTS,
  effectiveRankingPoints,
  emptyLeagueDraft,
  isCustomRankingTable,
  reviewRankingSummary,
  sanitizeRankingPointsValue,
  withRankingPoint,
} from './league-create.model';

/** Espelha o contrato lido pela CF `league-ranking.ts` (`rankingPointsByPlace`) e o clamp
 *  do app (`getPointsForPlaceFromLeagueConfig`): chaves 1–4/quarters/groups, 0..999999. */
describe('league-create · tabela de pontos do ranking', () => {
  describe('effectiveRankingPoints', () => {
    it('draft vazio usa o padrão nexaGO', () => {
      expect(effectiveRankingPoints(emptyLeagueDraft())).toEqual(DEFAULT_LEAGUE_RANKING_POINTS);
    });

    it('tabela custom do draft prevalece sobre o padrão', () => {
      const draft = { ...emptyLeagueDraft(), rankingPointsByPlace: { '1': 1000 } };
      expect(effectiveRankingPoints(draft)).toEqual({ '1': 1000 });
    });
  });

  describe('sanitizeRankingPointsValue', () => {
    it('aceita inteiro e arredonda decimal', () => {
      expect(sanitizeRankingPointsValue('120')).toBe(120);
      expect(sanitizeRankingPointsValue('120.6')).toBe(121);
    });

    it('vazio, NaN e negativo viram 0', () => {
      expect(sanitizeRankingPointsValue('')).toBe(0);
      expect(sanitizeRankingPointsValue('abc')).toBe(0);
      expect(sanitizeRankingPointsValue('-5')).toBe(0);
    });

    it('limita ao teto de 999999 (mesmo clamp do app)', () => {
      expect(sanitizeRankingPointsValue('1000000')).toBe(999999);
    });
  });

  describe('withRankingPoint', () => {
    it('primeira edição parte da tabela padrão completa', () => {
      expect(withRankingPoint(emptyLeagueDraft(), '1', '500')).toEqual({
        ...DEFAULT_LEAGUE_RANKING_POINTS,
        '1': 500,
      });
    });

    it('preserva edições anteriores do draft', () => {
      const draft = { ...emptyLeagueDraft(), rankingPointsByPlace: { ...DEFAULT_LEAGUE_RANKING_POINTS, '2': 300 } };
      expect(withRankingPoint(draft, 'groups', '55')).toEqual({
        ...DEFAULT_LEAGUE_RANKING_POINTS,
        '2': 300,
        groups: 55,
      });
    });
  });

  describe('isCustomRankingTable', () => {
    it('draft vazio não é custom', () => {
      expect(isCustomRankingTable(emptyLeagueDraft())).toBeFalse();
    });

    it('valores iguais ao padrão não são custom (mesmo depois de editar)', () => {
      const draft = { ...emptyLeagueDraft(), rankingPointsByPlace: { ...DEFAULT_LEAGUE_RANKING_POINTS } };
      expect(isCustomRankingTable(draft)).toBeFalse();
    });

    it('um valor diferente do padrão é custom', () => {
      const draft = { ...emptyLeagueDraft(), rankingPointsByPlace: withRankingPoint(emptyLeagueDraft(), 'quarters', '90') };
      expect(isCustomRankingTable(draft)).toBeTrue();
    });
  });

  describe('reviewRankingSummary', () => {
    it('padrão: modo de contagem + tabela padrão nexaGO', () => {
      expect(reviewRankingSummary(emptyLeagueDraft())).toBe('4 melhores de 6 etapas · tabela padrão nexaGO');
    });

    it('custom: modo de contagem + tabela personalizada', () => {
      const draft = {
        ...emptyLeagueDraft(),
        countingStagesMode: 'allStages' as const,
        rankingPointsByPlace: withRankingPoint(emptyLeagueDraft(), '1', '600'),
      };
      expect(reviewRankingSummary(draft)).toBe('Todas as etapas contam · tabela personalizada');
    });
  });
});
