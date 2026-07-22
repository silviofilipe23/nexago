import { athleteLevelLabel, buildPublicProfileId, buildSportLevels, initialsOf, joinCityState, nameFromEmail, slugify, splitCityState, titleCase } from './profile-format';

describe('profile-format', () => {
  describe('titleCase', () => {
    it('capitalizes each word and lowercases the rest', () => {
      expect(titleCase('MARINA santos')).toBe('Marina Santos');
    });
  });

  describe('nameFromEmail', () => {
    it('title-cases the local part of the email', () => {
      expect(nameFromEmail('marina.santos@example.com')).toBe('Marina Santos');
    });

    it('falls back to a default name when email is missing', () => {
      expect(nameFromEmail(null)).toBe('Atleta NexaGO');
      expect(nameFromEmail(undefined)).toBe('Atleta NexaGO');
    });
  });

  describe('slugify', () => {
    it('removes accents and non-alphanumeric characters', () => {
      expect(slugify('Aparecida de Goiânia')).toBe('aparecida-de-goiania');
    });

    it('trims to 28 characters', () => {
      expect(slugify('a'.repeat(50)).length).toBe(28);
    });
  });

  describe('buildPublicProfileId', () => {
    it('combines a slugified handle with a short uid suffix', () => {
      expect(buildPublicProfileId('Marina Santos', 'abcd1234efgh')).toBe('marina-santos-abcd1234');
    });

    it('falls back to "atleta" when handle and uid are both empty', () => {
      expect(buildPublicProfileId('', null)).toBe('atleta');
    });
  });

  describe('initialsOf', () => {
    it('takes the first letter of the first and last word', () => {
      expect(initialsOf('Marcelo Antunes')).toBe('MA');
    });

    it('takes a single letter for a one-word name', () => {
      expect(initialsOf('Madonna')).toBe('M');
    });

    it('falls back to AT for an empty name', () => {
      expect(initialsOf('')).toBe('AT');
    });
  });

  describe('splitCityState', () => {
    it('splits on the last comma and uppercases the state', () => {
      expect(splitCityState('Aparecida de Goiânia, GO')).toEqual({ city: 'Aparecida de Goiânia', state: 'GO' });
    });

    it('handles a missing comma by returning the whole string as city', () => {
      expect(splitCityState('Recife')).toEqual({ city: 'Recife', state: '' });
    });

    it('handles an empty string', () => {
      expect(splitCityState('')).toEqual({ city: '', state: '' });
    });

    it('trims whitespace and normalizes state casing', () => {
      expect(splitCityState('Rio de Janeiro,rj')).toEqual({ city: 'Rio de Janeiro', state: 'RJ' });
    });
  });

  describe('athleteLevelLabel', () => {
    it('converts Firestore level codes to display labels', () => {
      expect(athleteLevelLabel('iniciante')).toBe('Iniciante');
      expect(athleteLevelLabel('basico')).toBe('Iniciante');
      expect(athleteLevelLabel('intermediario')).toBe('Intermediário');
      expect(athleteLevelLabel('intermediario_1')).toBe('Intermediário 1');
      expect(athleteLevelLabel('intermediario_2')).toBe('Intermediário 2');
      expect(athleteLevelLabel('open')).toBe('Open');
    });

    it('ignores case and surrounding whitespace', () => {
      expect(athleteLevelLabel(' Iniciante_2 ')).toBe('Iniciante 2');
    });

    it('returns unknown codes unchanged (paridade com o app)', () => {
      expect(athleteLevelLabel('Intermediário')).toBe('Intermediário');
    });

    it('returns an empty string for null, undefined or blank codes', () => {
      expect(athleteLevelLabel(null)).toBe('');
      expect(athleteLevelLabel(undefined)).toBe('');
      expect(athleteLevelLabel('  ')).toBe('');
    });
  });

  describe('joinCityState', () => {
    it('joins city and state with a comma', () => {
      expect(joinCityState('Recife', 'PE')).toBe('Recife, PE');
    });

    it('omits the comma when state is empty', () => {
      expect(joinCityState('Recife', '')).toBe('Recife');
    });

    it('returns an empty string when city is empty', () => {
      expect(joinCityState('', 'GO')).toBe('');
    });
  });

  describe('buildSportLevels', () => {
    it('returns the primary sport with its resolved level', () => {
      const userData = {
        sportOnboarding: {
          primarySportId: 'VOLEI_PRAIA',
          secondarySportIds: [],
          levelsBySport: { VOLEI_PRAIA: 'intermediario_1' },
        },
      };
      expect(buildSportLevels(userData)).toEqual([
        { code: 'VOLEI_PRAIA', sportLabel: 'Vôlei de praia', levelLabel: 'Intermediário 1' },
      ]);
    });

    it('includes secondary sports with their own level, primary first', () => {
      const userData = {
        sportOnboarding: {
          primarySportId: 'VOLEI_PRAIA',
          secondarySportIds: ['BEACH_TENNIS'],
          levelsBySport: { VOLEI_PRAIA: 'open', BEACH_TENNIS: 'iniciante_2' },
        },
      };
      expect(buildSportLevels(userData)).toEqual([
        { code: 'VOLEI_PRAIA', sportLabel: 'Vôlei de praia', levelLabel: 'Open' },
        { code: 'BEACH_TENNIS', sportLabel: 'Beach tennis', levelLabel: 'Iniciante 2' },
      ]);
    });

    it('falls back to the legacy global level for the primary sport when missing from levelsBySport', () => {
      const userData = {
        level: 'intermediario_2',
        sportOnboarding: {
          primarySportId: 'TENIS',
          secondarySportIds: [],
          levelsBySport: {},
        },
      };
      expect(buildSportLevels(userData)).toEqual([
        { code: 'TENIS', sportLabel: 'Tênis', levelLabel: 'Intermediário 2' },
      ]);
    });

    it('does not apply the legacy fallback to secondary sports without a level', () => {
      const userData = {
        level: 'open',
        sportOnboarding: {
          primarySportId: 'VOLEI_PRAIA',
          secondarySportIds: ['TENIS'],
          levelsBySport: { VOLEI_PRAIA: 'iniciante_1' },
        },
      };
      expect(buildSportLevels(userData)).toEqual([
        { code: 'VOLEI_PRAIA', sportLabel: 'Vôlei de praia', levelLabel: 'Iniciante 1' },
        { code: 'TENIS', sportLabel: 'Tênis', levelLabel: '' },
      ]);
    });

    it('returns an empty list when there is no sportOnboarding data', () => {
      expect(buildSportLevels({})).toEqual([]);
      expect(buildSportLevels(null)).toEqual([]);
      expect(buildSportLevels(undefined)).toEqual([]);
    });
  });
});
