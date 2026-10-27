import type { ExternalPartnerInvite, PartnerInviteOnLink } from '../data/tournament-registrations-repository';
import { resolveExternalInviteGate, resolvePartnerInviteGate } from './partner-invite-gates';

const NOW = Date.UTC(2026, 9, 27, 12);

function external(overrides: Partial<ExternalPartnerInvite> = {}): ExternalPartnerInvite {
  return {
    id: 'ext-1',
    tournamentId: 't-1',
    categoryId: 'c-1',
    inviterUid: 'ana',
    inviterName: 'Ana',
    status: 'pending',
    expiresAt: new Date(NOW + 60_000),
    claimedByUid: null,
    inviteId: null,
    ...overrides,
  };
}

function onLink(overrides: Partial<PartnerInviteOnLink> = {}): PartnerInviteOnLink {
  return {
    id: 'inv-1',
    inviteeUid: 'bia',
    inviteeName: 'Bia',
    expiresAt: null,
    createdAt: null,
    tournamentId: 't-1',
    categoryId: 'c-1',
    status: 'pending',
    registrationId: null,
    isTeamInvite: false,
    teamName: null,
    isSubstitutionInvite: false,
    replacedName: null,
    attachRegistrationId: null,
    inviterUid: 'ana',
    inviterName: 'Ana',
    ...overrides,
  };
}

describe('resolveExternalInviteGate', () => {
  it('link aberto para quem não convidou', () => {
    expect(resolveExternalInviteGate(external(), 'bia', NOW)).toEqual({ kind: 'open' });
  });

  it('quem convidou abrindo o próprio link não resgata', () => {
    expect(resolveExternalInviteGate(external(), 'ana', NOW)).toEqual({ kind: 'own' });
  });

  it('cancelado vence o prazo', () => {
    const invite = external({ status: 'cancelled', expiresAt: new Date(NOW - 1) });
    expect(resolveExternalInviteGate(invite, 'bia', NOW)).toEqual({ kind: 'cancelled' });
  });

  it('prazo vencido', () => {
    expect(resolveExternalInviteGate(external({ expiresAt: new Date(NOW) }), 'bia', NOW)).toEqual({ kind: 'expired' });
  });

  it('resgatado por mim segue para o convite de verdade', () => {
    const invite = external({ status: 'claimed', claimedByUid: 'bia', inviteId: 'inv-9' });
    expect(resolveExternalInviteGate(invite, 'bia', NOW)).toEqual({ kind: 'claimedByMe', inviteId: 'inv-9' });
  });

  it('resgatado ou em resgate por outro atleta', () => {
    const claimed = external({ status: 'claimed', claimedByUid: 'caio', inviteId: 'inv-9' });
    const claiming = external({ status: 'claiming', claimedByUid: 'caio' });
    expect(resolveExternalInviteGate(claimed, 'bia', NOW)).toEqual({ kind: 'usedByOther' });
    expect(resolveExternalInviteGate(claiming, 'bia', NOW)).toEqual({ kind: 'usedByOther' });
  });

  it('meu resgate que ficou no meio do caminho pode ser refeito', () => {
    const invite = external({ status: 'claiming', claimedByUid: 'bia' });
    expect(resolveExternalInviteGate(invite, 'bia', NOW)).toEqual({ kind: 'open' });
  });
});

describe('resolvePartnerInviteGate', () => {
  it('quem convidou vê o próprio convite como dele, em qualquer desfecho', () => {
    expect(resolvePartnerInviteGate(onLink(), 'ana')).toBe('inviter');
    expect(resolvePartnerInviteGate(onLink({ status: 'accepted' }), 'ana')).toBe('inviter');
  });

  it('o convidado vê o desfecho', () => {
    expect(resolvePartnerInviteGate(onLink(), 'bia')).toBe('pending');
    expect(resolvePartnerInviteGate(onLink({ status: 'accepted' }), 'bia')).toBe('accepted');
    expect(resolvePartnerInviteGate(onLink({ status: 'expired' }), 'bia')).toBe('expired');
  });
});
