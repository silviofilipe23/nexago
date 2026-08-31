/** `requireFormedPair`: torneio sem inscrição individual — a vaga nasce no aceite do convite.
 *  O contrato que importa é a ida e volta do doc `tournaments/{id}`, porque quem decide é a
 *  Cloud Function (`registerSoloTournament`) lendo exatamente este campo. */

import { emptyTournamentDraft } from './tournament-create.model';
import { tournamentDraftFromFirestore, tournamentDraftToFirestore } from './tournament-create-mapper';

function draftWithDates(requireFormedPair: boolean) {
  return {
    ...emptyTournamentDraft(),
    name: 'Copa Teste',
    startAt: new Date(2026, 8, 10),
    endAt: new Date(2026, 8, 11),
    requireFormedPair,
  };
}

describe('requireFormedPair (exigir dupla já formada)', () => {
  it('grava o campo ligado no doc do torneio', () => {
    const map = tournamentDraftToFirestore({
      draft: draftWithDates(true),
      managerId: 'org-1',
      publish: true,
    });
    expect(map['requireFormedPair']).toBe(true);
  });

  it('grava o campo desligado no doc do torneio', () => {
    const map = tournamentDraftToFirestore({
      draft: draftWithDates(false),
      managerId: 'org-1',
      publish: true,
    });
    expect(map['requireFormedPair']).toBe(false);
  });

  it('reidrata o campo ao abrir o torneio para edição', () => {
    const { draft } = tournamentDraftFromFirestore({ requireFormedPair: true }, 't1');
    expect(draft.requireFormedPair).toBe(true);
  });

  it('torneio antigo (campo ausente) continua aceitando inscrição individual', () => {
    const { draft } = tournamentDraftFromFirestore({}, 't1');
    expect(draft.requireFormedPair).toBe(false);
  });

  it('torneio novo nasce aceitando inscrição individual', () => {
    expect(emptyTournamentDraft().requireFormedPair).toBe(false);
  });
});
