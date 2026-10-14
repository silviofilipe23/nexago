export type InviteViewState = 'ready' | 'not-pending' | 'expired' | 'wrong-account';

/** Mesma ordem do backend (`inviteClaimState`): status, depois prazo, depois e-mail. */
export function inviteViewState(
  invite: { status?: unknown; emailLower?: unknown; expiresAtMs?: number | null },
  myEmail: string | null,
  nowMs: number,
): InviteViewState {
  if (invite.status !== 'pending') return 'not-pending';
  if (invite.expiresAtMs != null && invite.expiresAtMs <= nowMs) return 'expired';
  const mine = (myEmail ?? '').trim().toLowerCase();
  if (mine === '' || invite.emailLower !== mine) return 'wrong-account';
  return 'ready';
}
