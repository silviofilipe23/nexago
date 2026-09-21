/** `enrolledTeamsVisible`: o organizador decide se o atleta vê a lista de equipes inscritas.
 *
 *  O contrato que importa é a ida e volta do doc `tournaments/{id}`, porque quem lê o campo são
 *  as duas superfícies do atleta (app e portal). Campo AUSENTE tem de significar VISÍVEL: todo
 *  torneio já criado mostra a lista hoje, e a flag não pode apagá-la retroativamente. */

import { emptyTournamentDraft } from './tournament-create.model';
import { tournamentDraftFromFirestore, tournamentDraftToFirestore } from './tournament-create-mapper';

function draftWithDates(enrolledTeamsVisible: boolean) {
  return {
    ...emptyTournamentDraft(),
    name: 'Copa Teste',
    startAt: new Date(2026, 8, 10),
    endAt: new Date(2026, 8, 11),
    enrolledTeamsVisible,
  };
}

describe('enrolledTeamsVisible (mostrar equipes inscritas)', () => {
  it('grava o campo ligado no doc do torneio', () => {
    const map = tournamentDraftToFirestore({
      draft: draftWithDates(true),
      managerId: 'org-1',
      publish: true,
    });
    expect(map['enrolledTeamsVisible']).toBe(true);
  });

  it('grava o campo desligado no doc do torneio', () => {
    const map = tournamentDraftToFirestore({
      draft: draftWithDates(false),
      managerId: 'org-1',
      publish: true,
    });
    expect(map['enrolledTeamsVisible']).toBe(false);
  });

  it('reidrata o campo desligado ao abrir o torneio para edição', () => {
    const { draft } = tournamentDraftFromFirestore({ enrolledTeamsVisible: false }, 't1');
    expect(draft.enrolledTeamsVisible).toBe(false);
  });

  it('torneio antigo (campo ausente) continua mostrando as equipes inscritas', () => {
    const { draft } = tournamentDraftFromFirestore({}, 't1');
    expect(draft.enrolledTeamsVisible).toBe(true);
  });

  it('torneio novo nasce mostrando as equipes inscritas', () => {
    expect(emptyTournamentDraft().enrolledTeamsVisible).toBe(true);
  });
});
