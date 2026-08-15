import {
  compareTeamLevelDesc,
  levelPointsOf,
  teamLevelScore,
  teamLevelsSummary,
  teamScoreLabel,
  type AthleteLevelSource,
  type AthleteRatingLite,
} from './team-level-score';

function athlete(levelsBySport: Record<string, string>, legacyLevel: string | null = null): AthleteLevelSource {
  return { levelsBySport, legacyLevel };
}

function rating(value: number, ratedMatches = 20): AthleteRatingLite {
  return { rating: value, ratedMatches };
}

describe('team-level-score', () => {
  describe('levelPointsOf', () => {
    it('pontos 1–7 na escada de 7 (dupla 2–14)', () => {
      expect(levelPointsOf('avancado_1')).toBe(5);
      expect(levelPointsOf('avancado_2')).toBe(6);
      expect(levelPointsOf('open')).toBe(7);
      expect(levelPointsOf('intermediario_2')).toBe(4);
    });
  });

  describe('teamLevelScore', () => {
    it('soma os degraus da escada dos dois atletas (Open = 7, Intermediário 1 = 3)', () => {
      const score = teamLevelScore(
        [athlete({ VOLEI_PRAIA: 'open' }), athlete({ VOLEI_PRAIA: 'intermediario_1' })],
        'VOLEI_PRAIA',
      );

      expect(score.points).toBe(10);
      expect(teamLevelsSummary(score)).toBe('Open + Interm. 1');
    });

    it('usa o nível do esporte do torneio, não o de outro esporte do perfil', () => {
      const score = teamLevelScore(
        [
          athlete({ VOLEI_PRAIA: 'iniciante_1', BEACH_TENNIS: 'open' }),
          athlete({ VOLEI_PRAIA: 'iniciante_1', BEACH_TENNIS: 'open' }),
        ],
        'BEACH_TENNIS',
      );

      expect(score.points).toBe(14);
    });

    it('cai no nível global legado quando falta o do esporte', () => {
      const score = teamLevelScore([athlete({}, 'Intermediário 2'), athlete({}, 'iniciante')], 'VOLEI_PRAIA');

      expect(score.points).toBe(5); // 4 + 1
      // Legado sem sufixo aparece como está — `levelDisplayLabel` não renumera degrau antigo.
      expect(teamLevelsSummary(score)).toBe('Interm. 2 + Iniciante');
    });

    it('não pontua a dupla quando algum atleta não tem nível', () => {
      const score = teamLevelScore([athlete({ VOLEI_PRAIA: 'open' }), athlete({})], 'VOLEI_PRAIA');

      expect(score.points).toBeNull();
      expect(teamScoreLabel(score)).toBe('—');
      expect(teamLevelsSummary(score)).toBe('Open');
    });

    it('pontua inscrição solo com o único atleta', () => {
      expect(teamLevelScore([athlete({ VOLEI_PRAIA: 'intermediario_2' })], 'VOLEI_PRAIA').points).toBe(4);
    });

    it('não pontua dupla sem atletas resolvidos', () => {
      const score = teamLevelScore([], 'VOLEI_PRAIA');

      expect(score.points).toBeNull();
      expect(teamLevelsSummary(score)).toBe('Nível não informado');
    });

    it('compõe o rating pela média quando os dois atletas saíram do provisional', () => {
      const score = teamLevelScore(
        [athlete({ VOLEI_PRAIA: 'open' }), athlete({ VOLEI_PRAIA: 'open' })],
        'VOLEI_PRAIA',
        [rating(1800), rating(1700)],
      );

      expect(score.rating).toBe(1750);
      expect(teamScoreLabel(score)).toBe('14 pts · 1750');
    });

    it('não mostra rating quando algum atleta ainda é provisional ou não tem doc', () => {
      const members = [athlete({ VOLEI_PRAIA: 'open' }), athlete({ VOLEI_PRAIA: 'open' })];

      expect(teamLevelScore(members, 'VOLEI_PRAIA', [rating(1800), rating(1700, 9)]).rating).toBeNull();
      expect(teamLevelScore(members, 'VOLEI_PRAIA', [rating(1800), undefined]).rating).toBeNull();
      expect(teamLevelScore(members, 'VOLEI_PRAIA', []).rating).toBeNull();
    });
  });

  describe('compareTeamLevelDesc', () => {
    const strong = teamLevelScore([athlete({ X: 'open' }), athlete({ X: 'open' })], 'X');
    const weak = teamLevelScore([athlete({ X: 'iniciante_1' }), athlete({ X: 'iniciante_1' })], 'X');
    const unknown = teamLevelScore([athlete({}), athlete({})], 'X');

    it('ordena da maior para a menor pontuação', () => {
      expect(compareTeamLevelDesc(strong, weak)).toBeLessThan(0);
      expect(compareTeamLevelDesc(weak, strong)).toBeGreaterThan(0);
    });

    it('desempata pelo rating composto', () => {
      const a = teamLevelScore([athlete({ X: 'open' }), athlete({ X: 'open' })], 'X', [rating(1900), rating(1900)]);
      const b = teamLevelScore([athlete({ X: 'open' }), athlete({ X: 'open' })], 'X', [rating(1700), rating(1700)]);

      expect(compareTeamLevelDesc(a, b)).toBeLessThan(0);
      expect(compareTeamLevelDesc(a, strong)).toBeLessThan(0); // com rating na frente de sem rating
    });

    it('mantém a ordem atual entre duplas totalmente empatadas', () => {
      expect(compareTeamLevelDesc(strong, strong)).toBe(0);
    });

    it('joga duplas sem nível para o fim', () => {
      expect(compareTeamLevelDesc(unknown, weak)).toBeGreaterThan(0);
      expect(compareTeamLevelDesc(weak, unknown)).toBeLessThan(0);
    });
  });
});
