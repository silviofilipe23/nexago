import { emptyTournamentDraft, parseTournamentSport, sportFirestoreValue } from './tournament-create.model';
import { tournamentDraftFromFirestore, tournamentDraftToFirestore } from './tournament-create-mapper';

describe('esporte desconhecido no wizard de torneio', () => {
  it('parseTournamentSport reconhece os esportes do enum', () => {
    expect(parseTournamentSport('footvolley')).toEqual({ sport: 'footvolley', sportRaw: null });
  });

  it('parseTournamentSport guarda o valor cru quando não reconhece', () => {
    expect(parseTournamentSport('football')).toEqual({ sport: 'beachVolleyball', sportRaw: 'football' });
    expect(parseTournamentSport(' beach_tennis ')).toEqual({ sport: 'beachVolleyball', sportRaw: 'beach_tennis' });
  });

  it('doc sem sport não é esporte desconhecido', () => {
    expect(parseTournamentSport(undefined)).toEqual({ sport: 'beachVolleyball', sportRaw: null });
    expect(parseTournamentSport('')).toEqual({ sport: 'beachVolleyball', sportRaw: null });
  });

  it('torneio gravado com football carrega travado e salva football de volta', () => {
    const { draft } = tournamentDraftFromFirestore({ name: 'Copa Futebol', sport: 'football' }, 'torneio-football');
    expect(draft.sport).toBe('beachVolleyball');
    expect(draft.sportRaw).toBe('football');

    const map = tournamentDraftToFirestore({
      draft: { ...draft, startAt: new Date(2026, 2, 28), endAt: new Date(2026, 2, 30) },
      managerId: 'm1',
      publish: false,
      isUpdate: true,
      existingListingStatus: 'draft',
    });
    expect(map['sport']).toBe('football');
  });

  it('draft novo nasce sem sportRaw e grava o enum', () => {
    const draft = emptyTournamentDraft();
    expect(draft.sportRaw).toBeNull();
    expect(sportFirestoreValue(draft)).toBe('beachVolleyball');
  });
});
