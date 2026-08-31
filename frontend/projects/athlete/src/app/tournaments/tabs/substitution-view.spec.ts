import { substitutionSlots } from './substitution-view';
import type { AthleteTournamentRegistration } from '../../data/tournament-registrations-repository';

function reg(over: Partial<AthleteTournamentRegistration>): AthleteTournamentRegistration {
  return {
    id: 'r1', tournamentId: 't1', categoryId: 'c1', teamId: 'team-1',
    partnerPending: false, isPaid: false, waitlist: false, cancellationRequest: null,
    sharePaidUids: [], declaredPaidAt: null, paymentVerifiedByOrganizer: false,
    player1Id: 'a', participantUids: ['a', 'b'], lgpdAcceptedUids: [],
    uniformPlayer1: { sizeTop: null, sizeShorts: null, jerseyNumber: null, jerseyName: null },
    uniformPlayer2: { sizeTop: null, sizeShorts: null, jerseyNumber: null, jerseyName: null },
    teamName: null, teamSize: null, captainUid: null, uniformByUid: {},
    substitutionHistory: [],
    ...over,
  };
}

describe('substitutionSlots', () => {
  it('dupla: membro pode trocar qualquer vaga', () => {
    expect(substitutionSlots(reg({}), 'a')).toEqual(['a', 'b']);
  });

  it('quem não é da inscrição, elenco incompleto: nada', () => {
    expect(substitutionSlots(reg({}), 'x')).toEqual([]);
    expect(substitutionSlots(reg({ partnerPending: true, participantUids: ['a'] }), 'a')).toEqual([]);
  });

  it('equipe: só o capitão, nunca a própria vaga', () => {
    const equipe = reg({ teamSize: 3, captainUid: 'cap', participantUids: ['cap', 'm1', 'm2'] });
    expect(substitutionSlots(equipe, 'm1')).toEqual([]);
    expect(substitutionSlots(equipe, 'cap')).toEqual(['m1', 'm2']);
  });
});
