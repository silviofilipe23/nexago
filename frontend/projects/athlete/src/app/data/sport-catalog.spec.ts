import { SPORT_CATALOG, sportLabelForCode } from './sport-catalog';

describe('sport-catalog', () => {
  describe('SPORT_CATALOG', () => {
    it('includes the 9 sports used by onboarding, in a stable order', () => {
      expect(SPORT_CATALOG.map((entry) => entry.code)).toEqual([
        'VOLEI_PRAIA',
        'VOLEI_QUADRA',
        'FUTEVOLEI',
        'FUTEBOL',
        'BASQUETE',
        'TENIS',
        'BEACH_TENNIS',
        'CORRIDA',
        'OUTROS',
      ]);
    });
  });

  describe('sportLabelForCode', () => {
    it('returns the Portuguese label for a known code', () => {
      expect(sportLabelForCode('VOLEI_PRAIA')).toBe('Vôlei de praia');
      expect(sportLabelForCode('BEACH_TENNIS')).toBe('Beach tennis');
    });

    it('falls back to a title-cased version of unknown codes', () => {
      expect(sportLabelForCode('FUTEVOLEI_MISTO')).toBe('Futevolei Misto');
    });

    it('returns an empty string for an empty code', () => {
      expect(sportLabelForCode('')).toBe('');
    });
  });
});
