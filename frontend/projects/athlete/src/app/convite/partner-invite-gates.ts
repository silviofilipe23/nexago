import type { ExternalPartnerInvite, PartnerInviteOnLink } from '../data/tournament-registrations-repository';

/** Estado da página `/convite-dupla/:id` (convite por link, parceiro que ainda não tinha conta).
 *  `claimedByMe` não tem tela: a página segue direto para o convite de verdade. */
export type ExternalInviteGate =
  | { kind: 'own' }
  | { kind: 'cancelled' }
  | { kind: 'expired' }
  | { kind: 'usedByOther' }
  | { kind: 'claimedByMe'; inviteId: string }
  | { kind: 'open' };

/** Mesma ordem de recusa do `claimExternalPartnerInvite` — a tela não oferece "Entrar na dupla"
 *  para um resgate que a callable negaria. */
export function resolveExternalInviteGate(
  invite: ExternalPartnerInvite,
  viewerUid: string | null,
  now = Date.now(),
): ExternalInviteGate {
  if (viewerUid != null && invite.inviterUid === viewerUid) return { kind: 'own' };
  if (invite.status === 'cancelled') return { kind: 'cancelled' };
  if (invite.expiresAt != null && invite.expiresAt.getTime() <= now) return { kind: 'expired' };
  const mine = viewerUid != null && invite.claimedByUid === viewerUid;
  if (invite.status === 'claimed') {
    return mine && invite.inviteId ? { kind: 'claimedByMe', inviteId: invite.inviteId } : { kind: 'usedByOther' };
  }
  if (invite.status === 'claiming' && !mine) return { kind: 'usedByOther' };
  return { kind: 'open' };
}

/** Estado da página `/torneios-convite/:id` (convite já criado). */
export type PartnerInviteGate = 'inviter' | 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired' | 'stale';

export function resolvePartnerInviteGate(invite: PartnerInviteOnLink, viewerUid: string | null): PartnerInviteGate {
  if (viewerUid != null && invite.inviterUid === viewerUid) return 'inviter';
  return invite.status;
}
