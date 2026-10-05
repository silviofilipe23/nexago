import { sportLabelOf as tournamentSportLabelOf } from './tournaments-repository';
import { sportLabelOf as leagueSportLabelOf } from './leagues-repository';

describe('arena · rótulo de esporte vem do catálogo', () => {
  it('torneio e liga', () => {
    expect(tournamentSportLabelOf('beachTennis')).toBe('Beach tennis');
    expect(leagueSportLabelOf('beach_tennis')).toBe('Beach tennis');
    expect(tournamentSportLabelOf('padel')).toBe('Padel');
    expect(tournamentSportLabelOf(null)).toBe('Esporte');
  });
});
