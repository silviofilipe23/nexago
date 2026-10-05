import { SPORT_CATALOG } from '@nexago/sports';
import { KNOWN_TOURNAMENT_SPORTS, SPORT_LABEL } from './tournament-create.model';
import { sportLabelOf } from './tournaments-repository';

describe('wizard de torneio × catálogo de esportes', () => {
  it('os esportes do wizard são exatamente os de suporte competition do catálogo', () => {
    expect<string[]>([...KNOWN_TOURNAMENT_SPORTS]).toEqual(
      SPORT_CATALOG.filter((s) => s.support === 'competition').map((s) => s.code),
    );
  });

  it('rótulos do wizard vêm do catálogo', () => {
    for (const s of KNOWN_TOURNAMENT_SPORTS) {
      expect(SPORT_LABEL[s]).toBe(SPORT_CATALOG.find((e) => e.code === s)!.label);
    }
  });

  it('listagem de eventos: conhecido, legado, desconhecido e vazio', () => {
    expect(sportLabelOf('beachTennis')).toBe('Beach tennis');
    expect(sportLabelOf('beach_tennis')).toBe('Beach tennis');
    expect(sportLabelOf('padel')).toBe('Padel');
    expect(sportLabelOf(null)).toBe('Esporte');
  });
});
