import { EMPTY_UNIFORM_SLOT, type AthleteTournamentRegistration } from '../../data/tournament-registrations-repository';
import { directPaymentAwaitsAction, resolveDirectPaymentState } from './direct-payment-state';

const ME = 'uid-eu';
const PARTNER = 'uid-parceiro';

function makeRegistration(overrides: Partial<AthleteTournamentRegistration> = {}): AthleteTournamentRegistration {
  return {
    id: 'reg-1',
    tournamentId: 't1',
    categoryId: 'cat-1',
    teamId: 'team-1',
    partnerPending: false,
    isPaid: false,
    waitlist: false,
    cancellationRequest: null,
    sharePaidUids: [],
    declaredPaidAt: null,
    paymentVerifiedByOrganizer: false,
    player1Id: ME,
    participantUids: [ME, PARTNER],
    lgpdAcceptedUids: [],
    uniformPlayer1: EMPTY_UNIFORM_SLOT,
    uniformPlayer2: EMPTY_UNIFORM_SLOT,
    teamName: null,
    teamSize: null,
    captainUid: null,
    uniformByUid: {},
    substitutionHistory: [],
    holdExpiresAt: null,
    ...overrides,
  };
}

describe('resolveDirectPaymentState', () => {
  it('começa em idle quando ninguém declarou', () => {
    expect(resolveDirectPaymentState({ registration: makeRegistration(), myUid: ME })).toBe('idle');
  });

  it('segue em idle quando só o parceiro declarou', () => {
    const registration = makeRegistration({ sharePaidUids: [PARTNER] });
    expect(resolveDirectPaymentState({ registration, myUid: ME })).toBe('idle');
  });

  it('vai pra waitingPartner quando eu declarei e a dupla não fechou', () => {
    const registration = makeRegistration({ sharePaidUids: [ME] });
    expect(resolveDirectPaymentState({ registration, myUid: ME })).toBe('waitingPartner');
  });

  it('vai pra waitingOrganizer quando os dois declararam e ninguém conferiu', () => {
    const registration = makeRegistration({
      sharePaidUids: [ME, PARTNER],
      isPaid: true,
      declaredPaidAt: new Date('2026-08-06T12:00:00Z'),
    });
    expect(resolveDirectPaymentState({ registration, myUid: ME })).toBe('waitingOrganizer');
  });

  it('vai pra confirmed quando o organizador dá baixa no recebimento', () => {
    const registration = makeRegistration({
      sharePaidUids: [ME, PARTNER],
      isPaid: true,
      declaredPaidAt: new Date('2026-08-06T12:00:00Z'),
      paymentVerifiedByOrganizer: true,
    });
    expect(resolveDirectPaymentState({ registration, myUid: ME })).toBe('confirmed');
  });

  // Inscrição direta fechada antes deste fluxo existir: nunca entrou na fila de conferência do
  // organizador, então prometer que alguém vai conferir seria mentira.
  it('trata inscrição paga sem declaredPaidAt como confirmada', () => {
    const registration = makeRegistration({ sharePaidUids: [ME, PARTNER], isPaid: true });
    expect(resolveDirectPaymentState({ registration, myUid: ME })).toBe('confirmed');
  });

  it('não confunde o atleta anônimo com quem declarou', () => {
    const registration = makeRegistration({ sharePaidUids: [PARTNER] });
    expect(resolveDirectPaymentState({ registration, myUid: null })).toBe('idle');
  });
});

describe('directPaymentAwaitsAction', () => {
  it('só pede ação do atleta em idle', () => {
    expect(directPaymentAwaitsAction('idle')).toBe(true);
    expect(directPaymentAwaitsAction('waitingPartner')).toBe(false);
    expect(directPaymentAwaitsAction('waitingOrganizer')).toBe(false);
    expect(directPaymentAwaitsAction('confirmed')).toBe(false);
  });
});
