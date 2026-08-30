/**
 * Regras do anúncio automático de convite (o modal que abre ao entrar no portal).
 *
 * Tudo aqui é puro/testável de propósito: o container só orquestra store, callables
 * e navegação — quem decide O QUE anunciar e QUANDO parar de anunciar é este arquivo.
 */

import type { PendingPartnerInvite } from '../../data/partner-invites.service';
import type { TournamentCategoryOffer } from '../../data/tournaments-repository';

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

/** Título do modal: "Bia te chamou pra dupla" / "…pra equipe Areia Quente" / "…como substituto". */
export function inviteAnnouncementTitle(item: PendingPartnerInvite): string {
  if (item.invite.isSubstitutionInvite) {
    return `${item.invite.inviterName} te chamou como substituto`;
  }
  const teamName = item.invite.isTeamInvite ? item.invite.teamName?.trim() : null;
  if (teamName) return `${item.invite.inviterName} te chamou pra equipe ${teamName}`;
  return `${item.invite.inviterName} te chamou pra ${item.invite.isTeamInvite ? 'equipe' : 'dupla'}`;
}

/**
 * Linha de apoio.
 *
 * O protótipo dizia "Ele já confirmou a parte dele" — o dado não sustenta isso:
 * `sendTournamentPartnerInvite` grava `attachRegistrationId` só quando quem convida JÁ tem
 * inscrição na categoria, e mesmo aí pagamento é outra história (`sharePaidUids`). Convite
 * existir não prova nem inscrição nem pagamento do parceiro, então a frase afirma só o que
 * é sempre verdade: falta a resposta de quem está lendo.
 */
export function inviteAnnouncementSubtitle(item: PendingPartnerInvite): string {
  const tournamentName = item.tournament?.name ?? 'Torneio';
  if (item.invite.isSubstitutionInvite) {
    const alvo = item.invite.replacedName ?? 'um atleta';
    return `Ele te chamou pra entrar no lugar de ${alvo} no ${tournamentName}. A vaga passa a ser sua ao aceitar.`;
  }
  const closes = item.invite.isTeamInvite ? 'equipe estar completa' : 'dupla estar fechada';
  return `Ele te chamou pro ${tournamentName}. Falta só você aceitar pra ${closes}.`;
}

/** Iniciais do avatar. Duas letras sempre que dá: com nome único o chip do shell mostraria
 *  uma letra só, e num avatar de 62px isso fica órfão — "Luquinhas" vira `LU`, não `L`. */
export function inviteInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'AT';
  const first = parts[0]!;
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : (first[1] ?? '');
  return (first[0] + second).toUpperCase();
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Idade do convite, no canto do cabeçalho: `AGORA`, `HÁ 12 MIN`, `HÁ 2 H`, `HÁ 3 D`. */
export function inviteAgeLabel(createdAt: Date | null, now = Date.now()): string | null {
  if (createdAt == null) return null;
  const elapsed = now - createdAt.getTime();
  if (elapsed < MINUTE) return 'AGORA';
  if (elapsed < HOUR) return `HÁ ${Math.floor(elapsed / MINUTE)} MIN`;
  if (elapsed < DAY) return `HÁ ${Math.floor(elapsed / HOUR)} H`;
  return `HÁ ${Math.floor(elapsed / DAY)} D`;
}

export interface InviteDeadline {
  label: string;
  /** Quanto do prazo já passou, 0–100 — a barra enche conforme o tempo corre. */
  elapsedPct: number;
}

/**
 * Prazo do convite. `null` quando o convite não tem `expiresAt` — sem data não há contagem, e
 * inventar prazo é pior que não mostrar nenhum.
 *
 * A frase para em "o convite expira": o que acontece com a vaga depois disso é decisão do
 * organizador (categoria pode estar lotada, aberta ou encerrada), não consequência do convite.
 */
export function inviteDeadline(
  createdAt: Date | null,
  expiresAt: Date | null,
  now = Date.now(),
): InviteDeadline | null {
  if (expiresAt == null) return null;
  const remaining = expiresAt.getTime() - now;
  if (remaining <= 0) return null;

  const label =
    remaining >= DAY
      ? `Restam ${Math.floor(remaining / DAY)} dia${Math.floor(remaining / DAY) > 1 ? 's' : ''} pra responder — depois o convite expira.`
      : remaining >= HOUR
        ? `Restam ${Math.floor(remaining / HOUR)} h pra responder — depois o convite expira.`
        : `Restam ${Math.max(1, Math.floor(remaining / MINUTE))} min pra responder — depois o convite expira.`;

  const startedAt = createdAt?.getTime() ?? null;
  const total = startedAt == null ? null : expiresAt.getTime() - startedAt;
  const elapsedPct =
    total == null || total <= 0 ? 0 : Math.min(100, Math.max(0, ((now - startedAt!) / total) * 100));

  return { label, elapsedPct };
}

function categoryOf(item: PendingPartnerInvite): TournamentCategoryOffer | null {
  return item.tournament?.categories?.find((c) => c.id === item.invite.categoryId) ?? null;
}

export function inviteCategoryLabel(item: PendingPartnerInvite): string | null {
  return categoryOf(item)?.categoryName ?? null;
}

/** `sáb · 20 jun · 08h` — sem minutos quando é hora cheia. */
export function inviteWhenLabel(startAt: Date | null): string | null {
  if (startAt == null) return null;
  const strip = (s: string) => s.replace(/\.$/, '');
  const weekday = strip(startAt.toLocaleDateString('pt-BR', { weekday: 'short' }));
  const month = strip(startAt.toLocaleDateString('pt-BR', { month: 'short' }));
  const minutes = startAt.getMinutes();
  const time = `${String(startAt.getHours()).padStart(2, '0')}h${minutes === 0 ? '' : String(minutes).padStart(2, '0')}`;
  return `${weekday} · ${startAt.getDate()} ${month} · ${time}`;
}

/** `Arena CFC · Aparecida` — cai pro que existir; `null` quando não há nem local nem cidade. */
export function inviteWhereLabel(item: PendingPartnerInvite): string | null {
  const parts = [item.tournament?.location, item.tournament?.city]
    .map((p) => p?.trim())
    .filter((p): p is string => !!p);
  return parts.length > 0 ? [...new Set(parts)].join(' · ') : null;
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
}

/**
 * "Sua parte": a taxa dividida pelo elenco, igual ao botão de cota do pagamento
 * (`amountDueReais`). É estimativa de tela — a cota exata, com resto de centavos, é do servidor.
 * Categoria não resolvida devolve `null`: R$ 0 inventado é pior que linha ausente.
 */
export function inviteShareLabel(item: PendingPartnerInvite): string | null {
  const category = categoryOf(item);
  if (category == null) return null;
  if (category.entryFee <= 0) return 'Grátis';
  return formatBRL(category.entryFee / (category.teamSize ?? 2));
}

/** Sub-rótulo do botão principal — em torneio pago por fora não existe "etapa seguinte" no app. */
export function inviteCtaHint(item: PendingPartnerInvite): string | null {
  const category = categoryOf(item);
  if (category != null && category.entryFee <= 0) return null;
  return item.tournament?.paymentMode === 'directWithOrganizer'
    ? 'O pagamento é direto com o organizador'
    : 'Você paga sua parte na etapa seguinte';
}
