import { MIN_TEAMS_FOR_BRACKET, countBracketEligible, isBracketEligible } from './bracket-eligibility';
import { EMPTY_INSCRIPTION_UNIFORM, type TournamentInscription } from './inscriptions-repository';

/** A regra tem de bater com `paidTeamIds` em `functions/src/organizer-category-ops.ts`: se a tela
 *  contar uma dupla a mais que o servidor, o organizador chega em "Gerar chave" e leva um erro
 *  de `failed-precondition` na cara. */
function inscription(overrides: Partial<TournamentInscription> = {}): TournamentInscription {
  return {
    id: 'i1',
    tournamentId: 't1',
    categoryId: 'c1',
    teamId: 'team-1',
    teamName: 'Ana / Bia',
    participants: [],
    participantNames: [],
    paymentStatus: 'paid',
    paid: true,
    paidByOrganizer: false,
    needsVerification: false,
    sharePaidCount: 0,
    sharePaidUids: [],
    organizerConfirmedShareUids: [],
    partnerPending: false,
    lgpdAcceptedUids: [],
    uniformPlayer1: EMPTY_INSCRIPTION_UNIFORM,
    uniformPlayer2: EMPTY_INSCRIPTION_UNIFORM,
    uniformByUid: {},
    teamSize: null,
    captainUid: null,
    cancellationRequest: null,
    createdAt: null,
    ...overrides,
  };
}

describe('isBracketEligible', () => {
  it('aceita a dupla paga, fora da espera e completa', () => {
    expect(isBracketEligible(inscription())).toBe(true);
  });

  it('recusa inscrição não paga', () => {
    expect(isBracketEligible(inscription({ paid: false, paymentStatus: 'pending' }))).toBe(false);
  });

  it('recusa quem está na fila de espera, mesmo já tendo pago', () => {
    expect(isBracketEligible(inscription({ paymentStatus: 'waitlist' }))).toBe(false);
  });

  it('recusa inscrição solo aguardando parceiro', () => {
    expect(isBracketEligible(inscription({ partnerPending: true }))).toBe(false);
  });

  it('recusa inscrição sem teamId — não há seed pra mandar ao servidor', () => {
    expect(isBracketEligible(inscription({ teamId: null }))).toBe(false);
  });
});

describe('countBracketEligible', () => {
  it('conta só as confirmadas', () => {
    const lista = [
      inscription({ id: 'a' }),
      inscription({ id: 'b' }),
      inscription({ id: 'c', paid: false }),
      inscription({ id: 'd', paymentStatus: 'waitlist' }),
      inscription({ id: 'e', partnerPending: true }),
    ];
    expect(countBracketEligible(lista)).toBe(2);
  });

  it('uma dupla confirmada ainda não fecha o mínimo do servidor', () => {
    expect(countBracketEligible([inscription()])).toBeLessThan(MIN_TEAMS_FOR_BRACKET);
  });

  it('lista vazia conta zero', () => {
    expect(countBracketEligible([])).toBe(0);
  });
});
