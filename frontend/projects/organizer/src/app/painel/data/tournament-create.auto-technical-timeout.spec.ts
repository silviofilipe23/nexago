/** `autoTechnicalTimeout`: opção do wizard (só vôlei de praia) que faz a mesa abrir o tempo
 *  técnico sozinha quando a soma do set chega a 21. O contrato é a ida e volta do doc
 *  `tournaments/{id}` — quem lê o campo são as três mesas. Ausente = desligado: o automático
 *  sempre ligado já saiu uma vez, então torneio antigo não pode ganhá-lo de volta sem pedir. */

import { autoTechnicalTimeoutAvailable, emptyTournamentDraft, type TournamentSport } from './tournament-create.model';
import { tournamentDraftFromFirestore, tournamentDraftToFirestore } from './tournament-create-mapper';

function draft(sport: TournamentSport, autoTechnicalTimeout: boolean) {
  return {
    ...emptyTournamentDraft(),
    name: 'Copa Teste',
    startAt: new Date(2026, 8, 10),
    endAt: new Date(2026, 8, 11),
    sport,
    autoTechnicalTimeout,
  };
}

const toDoc = (d: ReturnType<typeof draft>) => tournamentDraftToFirestore({ draft: d, managerId: 'org-1', publish: true });

describe('autoTechnicalTimeout (tempo técnico automático no 21º ponto)', () => {
  it('só o vôlei de praia oferece a opção', () => {
    expect(autoTechnicalTimeoutAvailable({ sport: 'beachVolleyball', sportRaw: null })).toBeTrue();
    expect(autoTechnicalTimeoutAvailable({ sport: 'beachTennis', sportRaw: null })).toBeFalse();
    expect(autoTechnicalTimeoutAvailable({ sport: 'beachVolleyball', sportRaw: 'peteca' })).toBeFalse();
  });

  it('grava ligado no vôlei de praia', () => {
    expect(toDoc(draft('beachVolleyball', true))['autoTechnicalTimeout']).toBe(true);
    expect(toDoc(draft('beachVolleyball', false))['autoTechnicalTimeout']).toBe(false);
  });

  it('trocar o esporte depois de ligar não leva a opção junto', () => {
    expect(toDoc(draft('beachTennis', true))['autoTechnicalTimeout']).toBe(false);
  });

  it('reidrata na edição; campo ausente vale desligado', () => {
    expect(tournamentDraftFromFirestore({ autoTechnicalTimeout: true }, 't1').draft.autoTechnicalTimeout).toBeTrue();
    expect(tournamentDraftFromFirestore({}, 't1').draft.autoTechnicalTimeout).toBeFalse();
  });

  it('torneio novo nasce desligado', () => {
    expect(emptyTournamentDraft().autoTechnicalTimeout).toBeFalse();
  });
});
