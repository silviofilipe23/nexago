import { emptyTournamentDraft, parseTournamentSport, sportFirestoreValue } from './tournament-create.model';
import { tournamentDraftFromFirestore, tournamentDraftToFirestore } from './tournament-create-mapper';

describe('esporte desconhecido no wizard de torneio', () => {
  it('parseTournamentSport reconhece os 3 esportes do enum', () => {
    expect(parseTournamentSport('footvolley')).toEqual({ sport: 'footvolley', sportRaw: null });
  });

  it('parseTournamentSport guarda o valor cru quando não reconhece', () => {
    expect(parseTournamentSport('beachTennis')).toEqual({ sport: 'beachVolleyball', sportRaw: 'beachTennis' });
    expect(parseTournamentSport(' beach_tennis ')).toEqual({ sport: 'beachVolleyball', sportRaw: 'beach_tennis' });
  });

  it('doc sem sport não é esporte desconhecido', () => {
    expect(parseTournamentSport(undefined)).toEqual({ sport: 'beachVolleyball', sportRaw: null });
    expect(parseTournamentSport('')).toEqual({ sport: 'beachVolleyball', sportRaw: null });
  });

  it('torneio gravado com beachTennis carrega travado e salva beachTennis de volta', () => {
    const { draft } = tournamentDraftFromFirestore({ name: 'Copa BT', sport: 'beachTennis' }, 'torneio-bt');
    expect(draft.sport).toBe('beachVolleyball');
    expect(draft.sportRaw).toBe('beachTennis');

    const map = tournamentDraftToFirestore({
      draft: { ...draft, startAt: new Date(2026, 2, 28), endAt: new Date(2026, 2, 30) },
      managerId: 'm1',
      publish: false,
      isUpdate: true,
      existingListingStatus: 'draft',
    });
    expect(map['sport']).toBe('beachTennis');
  });

  it('draft novo nasce sem sportRaw e grava o enum', () => {
    const draft = emptyTournamentDraft();
    expect(draft.sportRaw).toBeNull();
    expect(sportFirestoreValue(draft)).toBe('beachVolleyball');
  });
});
