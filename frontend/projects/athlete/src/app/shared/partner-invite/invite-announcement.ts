/**
 * Regras do anúncio automático de convite (o modal que abre ao entrar no portal).
 *
 * Tudo aqui é puro/testável de propósito: o container só orquestra store, callables
 * e navegação — quem decide O QUE anunciar e QUANDO parar de anunciar é este arquivo.
 */

import type { PendingPartnerInvite } from '../../data/partner-invites.service';

/** `sessionStorage`, não `localStorage`: "uma vez por sessão" é por aba/login. Chaveado por
 *  uid porque trocar de conta na mesma aba é uma sessão nova para quem entrou. */
export const ANNOUNCED_KEY_PREFIX = 'nexago-athlete-invite-announced';

export function announcedStorageKey(uid: string): string {
  return `${ANNOUNCED_KEY_PREFIX}:${uid}`;
}

export function readAnnouncedInviteIds(uid: string): ReadonlySet<string> {
  try {
    const raw = sessionStorage.getItem(announcedStorageKey(uid));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    // Modo privado, quota ou conteúdo corrompido: reanunciar é o pior caso aceitável;
    // deixar a tela quebrar não é.
    return new Set();
  }
}

export function rememberAnnouncedInvite(uid: string, inviteId: string): void {
  try {
    const ids = new Set(readAnnouncedInviteIds(uid));
    ids.add(inviteId);
    sessionStorage.setItem(announcedStorageKey(uid), JSON.stringify([...ids]));
  } catch {
    /* modo privado / quota — o convite continua no badge e no card do painel */
  }
}

function createdAtMs(item: PendingPartnerInvite): number {
  return item.invite.createdAt?.getTime() ?? 0;
}

/**
 * Próximo convite a anunciar, ou `null`.
 *
 * Dois cortes, e cada um responde a uma pergunta diferente:
 *
 * - `announced` é o "uma vez por sessão" — respondeu ou adiou, não volta a abrir nesta aba.
 * - `sessionStartedAt` restringe o anúncio ao que o atleta já tinha ao ENTRAR. O listener é
 *   ao vivo desde o PR #214, então sem esse corte um convite que chegasse no meio de um
 *   pagamento abriria um modal por cima dele. Convite novo acende o badge e o card; o modal
 *   dele é na próxima entrada.
 *
 * `createdAt` ausente conta como antigo: doc sem o campo não é convite recém-criado.
 */
export function nextInviteToAnnounce(
  pending: readonly PendingPartnerInvite[],
  announced: ReadonlySet<string>,
  sessionStartedAt: number,
): PendingPartnerInvite | null {
  return (
    pending
      .filter((item) => !announced.has(item.invite.id))
      .filter((item) => createdAtMs(item) <= sessionStartedAt)
      // O mais antigo primeiro: é o que está mais perto de expirar.
      .sort((a, b) => createdAtMs(a) - createdAtMs(b))[0] ?? null
  );
}

/** Frase do modal. Categoria de equipe nomeada (trio+) fala da equipe, não de dupla. */
export function inviteAnnouncementHeadline(item: PendingPartnerInvite): string {
  const tournamentName = item.tournament?.name ?? 'Torneio';
  const teamName = item.invite.isTeamInvite ? item.invite.teamName?.trim() : null;
  if (teamName) {
    return `${item.invite.inviterName} te chamou pra jogar pela equipe ${teamName} no ${tournamentName}.`;
  }
  return `${item.invite.inviterName} te chamou pra formar dupla no ${tournamentName}.`;
}
