import type { AthleteTournamentRegistration, SentPartnerInvite } from '../../data/tournament-registrations-repository';
import {
  firstNameOf,
  initialsOf,
  pendingSubstitutionFor,
  substitutionDateLabel,
  substitutionDeadlineLabel,
  substitutionPaymentRule,
  substitutionReminderMessage,
  substitutionSlotRole,
  substitutionSlots,
} from './substitution-view';

function reg(overrides: Partial<AthleteTournamentRegistration> = {}): AthleteTournamentRegistration {
  return {
    id: 'r1',
    tournamentId: 't1',
    categoryId: 'c1',
    teamId: 'team1',
    partnerPending: false,
    isPaid: false,
    waitlist: false,
    cancellationRequest: null,
    sharePaidUids: [],
    declaredPaidAt: null,
    paymentVerifiedByOrganizer: false,
    player1Id: 'eu',
    participantUids: ['eu', 'bia'],
    lgpdAcceptedUids: [],
    uniformPlayer1: { sizeTop: null, sizeShorts: null, jerseyNumber: null, jerseyName: null },
    uniformPlayer2: { sizeTop: null, sizeShorts: null, jerseyNumber: null, jerseyName: null },
    teamName: null,
    teamSize: null,
    captainUid: null,
    uniformByUid: {},
    substitutionHistory: [],
    holdExpiresAt: null,
    ...overrides,
  };
}

function invite(overrides: Partial<SentPartnerInvite> = {}): SentPartnerInvite {
  return {
    id: 'i1',
    inviteeUid: 'ana',
    inviteeName: 'Ana Souza',
    expiresAt: null,
    createdAt: null,
    tournamentId: 't1',
    categoryId: 'c1',
    status: 'pending',
    registrationId: null,
    isTeamInvite: false,
    teamName: null,
    isSubstitutionInvite: true,
    replacedName: 'Bia Lima',
    attachRegistrationId: 'r1',
    ...overrides,
  };
}

describe('substitutionSlots', () => {
  it('dupla: qualquer membro pode trocar qualquer vaga', () => {
    expect(substitutionSlots(reg(), 'bia')).toEqual(['eu', 'bia']);
  });

  it('equipe: só o capitão, e nunca a própria vaga', () => {
    const team = reg({ teamSize: 3, captainUid: 'eu', participantUids: ['eu', 'bia', 'cris'] });
    expect(substitutionSlots(team, 'eu')).toEqual(['bia', 'cris']);
    expect(substitutionSlots(team, 'bia')).toEqual([]);
  });

  it('sem parceiro fechado ou fora da inscrição não há o que trocar', () => {
    expect(substitutionSlots(reg({ partnerPending: true }), 'eu')).toEqual([]);
    expect(substitutionSlots(reg(), 'zed')).toEqual([]);
    expect(substitutionSlots(reg(), null)).toEqual([]);
  });
});

describe('substitutionSlotRole', () => {
  it('a vaga de quem lê é "Sua vaga", a do parceiro é confirmada', () => {
    expect(substitutionSlotRole(reg(), 'eu', 'eu')).toBe('Sua vaga');
    expect(substitutionSlotRole(reg(), 'bia', 'eu')).toBe('Parceiro · confirmado');
  });

  it('em equipe distingue capitão e integrante', () => {
    const team = reg({ teamSize: 3, captainUid: 'cap' });
    expect(substitutionSlotRole(team, 'cap', 'eu')).toBe('Capitão');
    expect(substitutionSlotRole(team, 'bia', 'eu')).toBe('Integrante');
  });
});

describe('substitutionPaymentRule', () => {
  it('sem pagamento nenhum a regra some', () => {
    expect(substitutionPaymentRule(reg(), 'R$ 100,00')).toBeNull();
  });

  it('inscrição paga cita o valor e o acerto da metade (dupla) ou entre a equipe', () => {
    expect(substitutionPaymentRule(reg({ isPaid: true }), 'R$ 100,00')).toBe(
      'Os R$ 100,00 seguem valendo — o acerto da metade é entre vocês',
    );
    expect(substitutionPaymentRule(reg({ isPaid: true, teamSize: 4 }), 'R$ 100,00')).toBe(
      'Os R$ 100,00 seguem valendo — o acerto é entre vocês',
    );
  });

  it('cota parcial paga só avisa que nada é cobrado de novo', () => {
    expect(substitutionPaymentRule(reg({ sharePaidUids: ['eu'] }), 'R$ 100,00')).toBe(
      'Nada é cobrado de novo — o acerto é entre vocês',
    );
  });
});

describe('pendingSubstitutionFor', () => {
  it('acha o convite de substituição pendente ancorado na inscrição', () => {
    expect(pendingSubstitutionFor([invite()], 'r1')?.id).toBe('i1');
  });

  it('ignora convite comum, de outra inscrição ou já encerrado', () => {
    const invites = [
      invite({ id: 'comum', isSubstitutionInvite: false }),
      invite({ id: 'outra', attachRegistrationId: 'r2' }),
      invite({ id: 'aceito', status: 'accepted' }),
      invite({ id: 'vencido', status: 'expired' }),
    ];
    expect(pendingSubstitutionFor(invites, 'r1')).toBeNull();
  });

  it('com duplicata transitória o mais recente ganha', () => {
    const invites = [
      invite({ id: 'velho', createdAt: new Date('2026-09-01T10:00:00Z') }),
      invite({ id: 'novo', createdAt: new Date('2026-09-02T10:00:00Z') }),
    ];
    expect(pendingSubstitutionFor(invites, 'r1')?.id).toBe('novo');
  });
});

describe('substitutionDeadlineLabel', () => {
  const now = new Date('2026-09-02T12:00:00Z');

  it('formata dias, horas e minutos como o app', () => {
    expect(substitutionDeadlineLabel(new Date('2026-09-03T16:30:00Z'), now)).toBe('1d 04h');
    expect(substitutionDeadlineLabel(new Date('2026-09-02T17:12:00Z'), now)).toBe('05h 12min');
    expect(substitutionDeadlineLabel(new Date('2026-09-02T12:12:00Z'), now)).toBe('12min');
  });

  it('vencido ou sem prazo vira null', () => {
    expect(substitutionDeadlineLabel(new Date('2026-09-02T11:59:00Z'), now)).toBeNull();
    expect(substitutionDeadlineLabel(null, now)).toBeNull();
  });
});

describe('copy auxiliar', () => {
  it('lembrete cita quem entra pelo primeiro nome e nunca um telefone', () => {
    const text = substitutionReminderMessage({
      inviteeName: 'Ana Souza',
      replacedName: 'Bia Lima',
      tournamentName: 'Copa VH',
      categoryName: 'Feminino B',
    });
    expect(text).toContain('Oi, Ana!');
    expect(text).toContain('no lugar de Bia Lima na categoria Feminino B do Copa VH');
    expect(text).not.toMatch(/\d{4,}/);
  });

  it('primeiro nome e iniciais toleram nome vazio', () => {
    expect(firstNameOf('  Ana Clara Souza ')).toBe('Ana');
    expect(firstNameOf('')).toBe('Atleta');
    expect(initialsOf('Ana Clara Souza')).toBe('AS');
    expect(initialsOf('Bia')).toBe('B');
    expect(initialsOf('')).toBe('?');
  });

  it('data da troca sai como "em DD/MM"', () => {
    expect(substitutionDateLabel(new Date(2026, 8, 3, 15, 0))).toBe('em 03/09');
    expect(substitutionDateLabel(null)).toBeNull();
  });
});
