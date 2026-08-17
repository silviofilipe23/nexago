import { levelLabelForRank, levelLabelOf, levelRankOf, type AthleteLevelLabel } from './athlete-level';

describe('athlete-level', () => {
  describe('levelRankOf', () => {
    it('ranks the 7 canonical codes', () => {
      expect(levelRankOf('iniciante_1')).toBe(0);
      expect(levelRankOf('iniciante_2')).toBe(1);
      expect(levelRankOf('intermediario_1')).toBe(2);
      expect(levelRankOf('intermediario_2')).toBe(3);
      expect(levelRankOf('avancado_1')).toBe(4);
      expect(levelRankOf('avancado_2')).toBe(5);
      expect(levelRankOf('open')).toBe(6);
    });

    it('ranks legacy codes into the ladder', () => {
      expect(levelRankOf('iniciante')).toBe(0);
      expect(levelRankOf('basico')).toBe(0);
      expect(levelRankOf('intermediario')).toBe(2);
      expect(levelRankOf('livre')).toBe(6);
      expect(levelRankOf('Open / federado')).toBe(6);
    });

    it('accepts display labels (accents, spaces, case)', () => {
      expect(levelRankOf('Iniciante 1')).toBe(0);
      expect(levelRankOf('Intermediário 2')).toBe(3);
      expect(levelRankOf('Avançado 1')).toBe(4);
      expect(levelRankOf('Avançado 2')).toBe(5);
      expect(levelRankOf(' OPEN ')).toBe(6);
    });

    it('returns null for unknown or empty values', () => {
      expect(levelRankOf(null)).toBeNull();
      expect(levelRankOf('')).toBeNull();
      expect(levelRankOf('profissional')).toBeNull();
    });
  });

  it('escada de 7 no espelho local', () => {
    expect(levelRankOf('avancado_1')).toBe(4);
    expect(levelRankOf('Avançado 2')).toBe(5);
    expect(levelRankOf('open')).toBe(6);
    expect(levelLabelForRank(4)).toBe('Avançado 1');
    expect(levelLabelForRank(5)).toBe('Avançado 2');
    expect(levelLabelForRank(6)).toBe('Open');
  });

  describe('levelLabelForRank', () => {
    it('maps each rank to the 7-level ladder', () => {
      expect(levelLabelForRank(0)).toBe('Iniciante 1');
      expect(levelLabelForRank(1)).toBe('Iniciante 2');
      expect(levelLabelForRank(2)).toBe('Intermediário 1');
      expect(levelLabelForRank(3)).toBe('Intermediário 2');
      expect(levelLabelForRank(4)).toBe('Avançado 1');
      expect(levelLabelForRank(5)).toBe('Avançado 2');
      expect(levelLabelForRank(6)).toBe('Open');
    });

    it('clamps out-of-ladder ranks', () => {
      expect(levelLabelForRank(-1)).toBe('Iniciante 1');
      expect(levelLabelForRank(7)).toBe('Open');
      expect(levelLabelForRank(9)).toBe('Open');
    });
  });

  describe('levelLabelOf', () => {
    it('maps each canonical code to its own tier (regressão do off-by-one)', () => {
      expect(levelLabelOf('iniciante_1')).toBe('Iniciante 1');
      expect(levelLabelOf('iniciante_2')).toBe('Iniciante 2');
      expect(levelLabelOf('intermediario_1')).toBe('Intermediário 1');
      expect(levelLabelOf('intermediario_2')).toBe('Intermediário 2');
      expect(levelLabelOf('avancado_1')).toBe('Avançado 1');
      expect(levelLabelOf('avancado_2')).toBe('Avançado 2');
      expect(levelLabelOf('open')).toBe('Open');
    });

    it('is idempotent over its own display labels', () => {
      const labels: readonly AthleteLevelLabel[] = [
        'Iniciante 1',
        'Iniciante 2',
        'Intermediário 1',
        'Intermediário 2',
        'Avançado 1',
        'Avançado 2',
        'Open',
      ];
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
