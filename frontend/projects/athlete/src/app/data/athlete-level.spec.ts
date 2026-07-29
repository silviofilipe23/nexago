import { levelLabelForRank, levelLabelOf, levelRankOf, type AthleteLevelLabel } from './athlete-level';

describe('athlete-level', () => {
  describe('levelRankOf', () => {
    it('ranks the 5 canonical codes', () => {
      expect(levelRankOf('iniciante_1')).toBe(0);
      expect(levelRankOf('iniciante_2')).toBe(1);
      expect(levelRankOf('intermediario_1')).toBe(2);
      expect(levelRankOf('intermediario_2')).toBe(3);
      expect(levelRankOf('open')).toBe(5);
    });

    it('ranks legacy codes into the ladder', () => {
      expect(levelRankOf('iniciante')).toBe(0);
      expect(levelRankOf('basico')).toBe(0);
      expect(levelRankOf('intermediario')).toBe(2);
      expect(levelRankOf('livre')).toBe(5);
    });

    it('accepts display labels (accents, spaces, case)', () => {
      expect(levelRankOf('Iniciante 1')).toBe(0);
      expect(levelRankOf('Intermediário 2')).toBe(3);
      expect(levelRankOf(' OPEN ')).toBe(5);
    });

    it('returns null for unknown or empty values', () => {
      expect(levelRankOf(null)).toBeNull();
      expect(levelRankOf('')).toBeNull();
      expect(levelRankOf('profissional')).toBeNull();
    });
  });

  describe('levelLabelForRank', () => {
    it('maps each rank to the 5-level ladder', () => {
      expect(levelLabelForRank(0)).toBe('Iniciante 1');
      expect(levelLabelForRank(1)).toBe('Iniciante 2');
      expect(levelLabelForRank(2)).toBe('Intermediário 1');
      expect(levelLabelForRank(3)).toBe('Intermediário 2');
      expect(levelLabelForRank(5)).toBe('Open');
    });

    it('clamps out-of-ladder ranks', () => {
      expect(levelLabelForRank(-1)).toBe('Iniciante 1');
      expect(levelLabelForRank(4)).toBe('Open');
      expect(levelLabelForRank(9)).toBe('Open');
    });
  });

  describe('levelLabelOf', () => {
    it('maps each canonical code to its own tier (regressão do off-by-one)', () => {
      expect(levelLabelOf('iniciante_1')).toBe('Iniciante 1');
      expect(levelLabelOf('iniciante_2')).toBe('Iniciante 2');
      expect(levelLabelOf('intermediario_1')).toBe('Intermediário 1');
      expect(levelLabelOf('intermediario_2')).toBe('Intermediário 2');
      expect(levelLabelOf('open')).toBe('Open');
    });

    it('is idempotent over its own display labels', () => {
      const labels: readonly AthleteLevelLabel[] = ['Iniciante 1', 'Iniciante 2', 'Intermediário 1', 'Intermediário 2', 'Open'];
      for (const label of labels) {
        expect(levelLabelOf(label)).toBe(label);
      }
    });

    it('maps legacy codes into the ladder', () => {
      expect(levelLabelOf('iniciante')).toBe('Iniciante 1');
      expect(levelLabelOf('basico')).toBe('Iniciante 1');
      expect(levelLabelOf('intermediario')).toBe('Intermediário 1');
      expect(levelLabelOf('livre')).toBe('Open');
    });

    it('returns null for unknown or empty values', () => {
      expect(levelLabelOf(null)).toBeNull();
      expect(levelLabelOf('')).toBeNull();
      expect(levelLabelOf('profissional')).toBeNull();
    });
  });
});
