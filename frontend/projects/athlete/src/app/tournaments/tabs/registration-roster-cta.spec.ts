import { registrationRosterView, type RosterViewRegistration } from './registration-roster-cta';

function teamReg(overrides: Partial<RosterViewRegistration> = {}): RosterViewRegistration {
  return {
    teamSize: 4,
    partnerPending: true,
    captainUid: 'cap',
    player1Id: 'cap',
    participantUids: ['cap', 'ana'],
    ...overrides,
  };
}

function duoReg(overrides: Partial<RosterViewRegistration> = {}): RosterViewRegistration {
  return {
    teamSize: null,
    partnerPending: true,
    captainUid: null,
    player1Id: 'eu',
    participantUids: ['eu'],
    ...overrides,
  };
}

describe('registrationRosterView', () => {
  it('capitão de equipe incompleta pode convidar e vê o elenco parcial', () => {
    const view = registrationRosterView(teamReg(), 'cap');
    expect(view.teamLabel).toBe('Equipe');
    expect(view.rosterFlag).toBe('Elenco 2/4');
    expect(view.inviteLabel).toBe('Convidar atletas');
    expect(view.captainOnlyHint).toBeNull();
  });

  it('sem captainUid, o capitão é resolvido por player1Id (fallback do backend)', () => {
    const view = registrationRosterView(teamReg({ captainUid: null }), 'cap');
    expect(view.inviteLabel).toBe('Convidar atletas');
  });

  it('sem captainUid e player1Id, o capitão é o primeiro participante', () => {
    const view = registrationRosterView(teamReg({ captainUid: null, player1Id: null }), 'cap');
    expect(view.inviteLabel).toBe('Convidar atletas');
  });

  it('integrante (não capitão) não convida — só o hint de que o capitão convida', () => {
    const view = registrationRosterView(teamReg(), 'ana');
    expect(view.inviteLabel).toBeNull();
    expect(view.captainOnlyHint).toBe('O capitão convida os atletas que faltam.');
    expect(view.rosterFlag).toBe('Elenco 2/4');
  });

  it('equipe completa não mostra flag, CTA nem hint', () => {
    const view = registrationRosterView(
      teamReg({ partnerPending: false, participantUids: ['cap', 'ana', 'bia', 'clara'] }),
      'cap',
    );
    expect(view.teamLabel).toBe('Equipe');
    expect(view.rosterFlag).toBeNull();
    expect(view.inviteLabel).toBeNull();
    expect(view.captainOnlyHint).toBeNull();
  });

  it('uid nulo não convida em equipe (não dá pra saber se é o capitão)', () => {
    const view = registrationRosterView(teamReg(), null);
    expect(view.inviteLabel).toBeNull();
    expect(view.captainOnlyHint).toBeNull();
  });

  it('dupla aguardando parceiro mantém o flag e convida', () => {
    const view = registrationRosterView(duoReg(), 'eu');
    expect(view.teamLabel).toBe('Dupla');
    expect(view.rosterFlag).toBe('convite pendente');
    expect(view.inviteLabel).toBe('Convidar parceiro');
    expect(view.captainOnlyHint).toBeNull();
  });

  it('dupla formada não mostra flag nem CTA', () => {
    const view = registrationRosterView(
      duoReg({ partnerPending: false, participantUids: ['eu', 'ana'] }),
      'eu',
    );
    expect(view.rosterFlag).toBeNull();
    expect(view.inviteLabel).toBeNull();
  });
});
