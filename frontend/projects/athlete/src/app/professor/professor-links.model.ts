/**
 * Vínculos professor ↔ arena, vistos pelo PROFESSOR (portal do atleta — é a conta global; não
 * existe portal do professor). Regras puras: rótulos, datas, quais ações cada estado oferece e a
 * leitura dos erros das callables. Fonte do contrato: `functions/src/arena-professor-links.ts` e
 * `docs/superpowers/specs/2026-10-20-vinculos-professor-arena-design.md`.
 *
 * Sem import de Firebase de propósito: os specs exercitam tudo daqui sem SDK.
 */

export type ProfessorLinkStatus =
  | 'INVITED'
  | 'PENDING'
  | 'ACTIVE'
  | 'REJECTED'
  | 'SUSPENDED'
  | 'ENDED'
  | 'CANCELED'
  | 'EXPIRED';

export type ProfessorLinkType = 'ARENA_STAFF' | 'INDEPENDENT';
export type ProfessorLinkSide = 'ARENA' | 'PROFESSOR';
export type ProfessorActorRole = ProfessorLinkSide | 'ADMIN' | 'SYSTEM';

export type ProfessorLinkEventType =
  | 'INVITED'
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'APPROVED'
  | 'SUSPENDED'
  | 'REACTIVATED'
  | 'ENDED'
  | 'PERMISSIONS_CHANGED'
  | 'CANCELED'
  | 'EXPIRED';

export const PROFESSOR_PERMISSION_KEYS = ['canManageOwnLessons', 'canBookCourts', 'canAppearInArenaProfile'] as const;
export type ProfessorPermissionKey = (typeof PROFESSOR_PERMISSION_KEYS)[number];
export type ProfessorPermissions = Record<ProfessorPermissionKey, boolean>;

export const NO_PERMISSIONS: ProfessorPermissions = {
  canManageOwnLessons: false,
  canBookCourts: false,
  canAppearInArenaProfile: false,
};

/** Mensagem do pedido (`requestArenaProfessorLink`): o servidor corta em 500. */
export const PROFESSOR_MESSAGE_MAX = 500;
/** Motivo de recusa/encerramento: o servidor corta em 300. */
export const PROFESSOR_REASON_MAX = 300;

/** `arenaProfessors/{arenaId}_{professorUserId}`. */
export interface ProfessorLink {
  id: string;
  arenaId: string;
  professorUserId: string;
  relationshipType: ProfessorLinkType;
  status: ProfessorLinkStatus;
  initiatedBy: ProfessorLinkSide;
  /** Configuradas pela arena — só valem com `ACTIVE` (ver `effectivePermissions`). */
  permissions: ProfessorPermissions;
  message: string | null;
  cycle: number;
  arenaName: string;
  arenaLogoUrl: string | null;
  arenaCity: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  invitedAt: Date | null;
  requestedAt: Date | null;
  expiresAt: Date | null;
  respondedAt: Date | null;
  approvedAt: Date | null;
  suspendedAt: Date | null;
  endedAt: Date | null;
  canceledAt: Date | null;
  invitedByName: string | null;
  approvedByName: string | null;
  endedBySide: ProfessorLinkSide | null;
  rejectionReason: string | null;
  suspensionReason: string | null;
  suspensionDetails: string | null;
  endedReason: string | null;
}

/** `arenaProfessors/{linkId}/events/{eventId}` — imutável. */
export interface ProfessorLinkEvent {
  id: string;
  eventType: ProfessorLinkEventType;
  actorUserId: string;
  actorName: string;
  actorRole: ProfessorActorRole;
  cycle: number;
  fromStatus: ProfessorLinkStatus | null;
  toStatus: ProfessorLinkStatus | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date | null;
}

/** Arena que pode receber um pedido (seletor do "Solicitar vínculo"). */
export interface ProfessorArenaOption {
  id: string;
  name: string;
  city: string | null;
  logoUrl: string | null;
}

/** Resposta de toda callable do vínculo. */
export interface ProfessorLinkResult {
  linkId: string;
  status: ProfessorLinkStatus;
}

// ---------------------------------------------------------------------------
// Rótulos e cores (protótipo `vc-atoms.jsx`)
// ---------------------------------------------------------------------------

export interface ProfessorTypeCopy {
  label: string;
  description: string;
  color: string;
  background: string;
}

export const PROFESSOR_TYPE_COPY: Record<ProfessorLinkType, ProfessorTypeCopy> = {
  ARENA_STAFF: {
    label: 'Equipe da arena',
    description: 'Integra a rede de professores da arena',
    color: '#FF8A4A',
    background: 'rgba(255,106,26,0.12)',
  },
  INDEPENDENT: {
    label: 'Independente',
    description: 'Autônomo, usa a estrutura para os próprios alunos',
    color: '#5B9BFF',
    background: 'rgba(91,155,255,0.12)',
  },
};

export const PROFESSOR_TYPES: readonly ProfessorLinkType[] = ['ARENA_STAFF', 'INDEPENDENT'];

export interface ProfessorPermissionCopy {
  key: ProfessorPermissionKey;
  label: string;
  description: string;
  short: string;
}

export const PROFESSOR_PERMISSION_COPY: readonly ProfessorPermissionCopy[] = [
  {
    key: 'canManageOwnLessons',
    label: 'Gerenciar as próprias aulas',
    description: 'Criar aulas e turmas, fazer chamada dos seus alunos',
    short: 'Aulas',
  },
  {
    key: 'canBookCourts',
    label: 'Reservar quadras',
    description: 'Reservar horários conforme regras e preços da arena',
    short: 'Quadras',
  },
  {
    key: 'canAppearInArenaProfile',
    label: 'Aparecer no perfil da arena',
    description: 'Listado em “Professores” na página pública',
    short: 'Perfil',
  },
];

const STATUS_LABEL: Record<ProfessorLinkStatus, string> = {
  INVITED: 'Convite recebido',
  PENDING: 'Aguardando a arena',
  ACTIVE: 'Ativo',
  REJECTED: 'Recusado',
  SUSPENDED: 'Suspenso',
  ENDED: 'Encerrado',
  CANCELED: 'Cancelado',
  EXPIRED: 'Convite expirado',
};

const DIM = 'rgba(244,244,245,0.5)';
const STATUS_COLOR: Record<ProfessorLinkStatus, string> = {
  INVITED: '#5B9BFF',
  PENDING: '#F4C543',
  ACTIVE: '#2BD17E',
  REJECTED: DIM,
  SUSPENDED: '#FF3B30',
  ENDED: DIM,
  CANCELED: DIM,
  EXPIRED: DIM,
};

export function professorStatusLabel(status: ProfessorLinkStatus): string {
  return STATUS_LABEL[status];
}

export function professorStatusColor(status: ProfessorLinkStatus): string {
  return STATUS_COLOR[status];
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

const OPEN_STATUSES: ReadonlySet<ProfessorLinkStatus> = new Set(['INVITED', 'PENDING', 'ACTIVE', 'SUSPENDED']);

export function isOpenProfessorStatus(status: unknown): status is ProfessorLinkStatus {
  return OPEN_STATUSES.has(status as ProfessorLinkStatus);
}

/** O servidor só grava `EXPIRED` quando alguém toca no vínculo: a tela decide pelo `expiresAt`. */
export function isInviteExpired(link: Pick<ProfessorLink, 'status' | 'expiresAt'>, nowMs: number): boolean {
  if (link.status !== 'INVITED') return false;
  const expires = link.expiresAt?.getTime();
  return expires != null && expires <= nowMs;
}

/** Estado que a tela mostra: convite vencido já aparece como "Convite expirado". */
export function displayStatus(link: Pick<ProfessorLink, 'status' | 'expiresAt'>, nowMs: number): ProfessorLinkStatus {
  return isInviteExpired(link, nowMs) ? 'EXPIRED' : link.status;
}

/** Aberto de verdade agora (bloqueia novo pedido para a mesma arena). */
export function isLinkOpen(link: Pick<ProfessorLink, 'status' | 'expiresAt'>, nowMs: number): boolean {
  return isOpenProfessorStatus(displayStatus(link, nowMs));
}

export function isOpenInvite(link: Pick<ProfessorLink, 'status' | 'expiresAt'>, nowMs: number): boolean {
  return displayStatus(link, nowMs) === 'INVITED';
}

export function openInvites(links: readonly ProfessorLink[], nowMs: number): ProfessorLink[] {
  return links
    .filter((l) => isOpenInvite(l, nowMs))
    .sort((a, b) => (b.invitedAt?.getTime() ?? 0) - (a.invitedAt?.getTime() ?? 0));
}

/** Vínculo em aberto com esta arena, se houver — o "Solicitar vínculo" checa antes de chamar. */
export function openLinkForArena(
  links: readonly ProfessorLink[],
  arenaId: string,
  nowMs: number,
): ProfessorLink | null {
  return links.find((l) => l.arenaId === arenaId && isLinkOpen(l, nowMs)) ?? null;
}

/** O que o professor pode de fato fazer agora: nada fora de `ACTIVE`. */
export function effectivePermissions(link: Pick<ProfessorLink, 'status' | 'permissions'>): ProfessorPermissions {
  const active = link.status === 'ACTIVE';
  return {
    canManageOwnLessons: active && link.permissions.canManageOwnLessons === true,
    canBookCourts: active && link.permissions.canBookCourts === true,
    canAppearInArenaProfile: active && link.permissions.canAppearInArenaProfile === true,
  };
}

/** Legenda de "Suas permissões aqui" fora do `ACTIVE` (spec: revogadas / após o aceite / após a aprovação). */
export function permissionsCaption(link: ProfessorLink, nowMs: number): string {
  switch (displayStatus(link, nowMs)) {
    case 'ACTIVE':
      return 'Definidas pela arena';
    case 'SUSPENDED':
      return 'Revogadas enquanto o vínculo estiver suspenso';
    case 'INVITED':
      return 'Propostas pela arena · valem após o aceite';
    case 'PENDING':
      return 'Valem após a aprovação · a arena define ao aprovar';
    default:
      return 'Sem permissões · vínculo encerrado';
  }
}

/** No convite aberto a arena já propôs as permissões — mostrar o que ela oferece. Nos outros
 *  estados vale só o efetivo. */
export function permissionsToShow(link: ProfessorLink, nowMs: number): ProfessorPermissions {
  return isOpenInvite(link, nowMs) ? { ...link.permissions } : effectivePermissions(link);
}

// ---------------------------------------------------------------------------
// Ações por estado
// ---------------------------------------------------------------------------

export type ProfessorLinkAction =
  | 'accept'
  | 'decline'
  | 'details'
  | 'end'
  | 'viewRequest'
  | 'cancelRequest'
  | 'requestAgain'
  | 'history';

export function linkActions(link: Pick<ProfessorLink, 'status' | 'expiresAt'>, nowMs: number): ProfessorLinkAction[] {
  switch (displayStatus(link, nowMs)) {
    case 'INVITED':
      return ['accept', 'decline'];
    case 'ACTIVE':
    case 'SUSPENDED':
      return ['details', 'end'];
    case 'PENDING':
      return ['viewRequest', 'cancelRequest'];
    default:
      return ['requestAgain', 'history'];
  }
}

export const PROFESSOR_ACTION_LABEL: Record<ProfessorLinkAction, string> = {
  accept: 'Aceitar convite',
  decline: 'Recusar',
  details: 'Ver detalhes',
  end: 'Encerrar vínculo',
  viewRequest: 'Ver pedido',
  cancelRequest: 'Cancelar pedido',
  requestAgain: 'Solicitar novo vínculo',
  history: 'Histórico',
};

/** Botão de aceitar do convite: na equipe, entra-se na equipe; independente só aceita. */
export function acceptInviteLabel(type: ProfessorLinkType): string {
  return type === 'ARENA_STAFF' ? 'Aceitar e entrar na equipe' : 'Aceitar convite';
}

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

/** Abreviado como o protótipo ("20 out", "mar 2025") — sem o ponto do `Intl` (`out.`). */
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** "20 out" no ano corrente; "20 out 2025" fora dele. */
export function formatDayMonth(date: Date, now: Date): string {
  const base = `${pad2(date.getDate())} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? base : `${base} ${date.getFullYear()}`;
}

/** "mar 2025". */
export function formatMonthYear(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** "06 mai 2026". */
export function formatFullDate(date: Date): string {
  return `${pad2(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "hoje, 10:42" / "ontem, 10:42" / "20 out, 10:42". */
export function formatRelativeDayTime(date: Date, now: Date): string {
  const time = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  if (sameDay(date, now)) return `hoje, ${time}`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(date, yesterday)) return `ontem, ${time}`;
  return `${formatDayMonth(date, now)}, ${time}`;
}

/** "expira em 7 dias" / "expira em 1 dia" / "expira em 5 horas". `null` quando já venceu. */
export function inviteExpiryLabel(link: Pick<ProfessorLink, 'expiresAt'>, nowMs: number): string | null {
  const expires = link.expiresAt?.getTime();
  if (expires == null) return null;
  const left = expires - nowMs;
  if (left <= 0) return null;
  if (left < DAY_MS) {
    const hours = Math.max(1, Math.ceil(left / HOUR_MS));
    return hours === 1 ? 'expira em 1 hora' : `expira em ${hours} horas`;
  }
  const days = Math.ceil(left / DAY_MS);
  return days === 1 ? 'expira em 1 dia' : `expira em ${days} dias`;
}

/** Linha de data do card ("Convite em 20 out", "Desde mar 2025", "Pedido em 17 out"…). */
export function linkDateLine(link: ProfessorLink, nowMs: number): string {
  const now = new Date(nowMs);
  const day = (d: Date | null) => (d ? formatDayMonth(d, now) : null);
  const month = (d: Date | null) => (d ? formatMonthYear(d) : null);
  const or = (value: string | null, prefix: string) => (value ? `${prefix} ${value}` : '');
  switch (displayStatus(link, nowMs)) {
    case 'INVITED':
      return or(day(link.invitedAt ?? link.updatedAt), 'Convite em');
    case 'EXPIRED':
      return or(day(link.expiresAt ?? link.updatedAt), 'Convite expirou em');
    case 'PENDING':
      return or(day(link.requestedAt ?? link.updatedAt), 'Pedido em');
    case 'ACTIVE':
      return or(month(link.approvedAt ?? link.updatedAt), 'Desde');
    case 'SUSPENDED':
      return or(day(link.suspendedAt ?? link.updatedAt), 'Suspenso em');
    case 'ENDED':
      return or(month(link.endedAt ?? link.updatedAt), 'Encerrado em');
    case 'REJECTED':
      return or(day(link.respondedAt ?? link.updatedAt), 'Recusado em');
    case 'CANCELED':
      return or(day(link.canceledAt ?? link.updatedAt), 'Cancelado em');
  }
}

/** Subtítulo da página de detalhe. */
export function linkDetailSubtitle(link: ProfessorLink, nowMs: number): string {
  const full = (d: Date | null) => (d ? formatFullDate(d) : null);
  const status = displayStatus(link, nowMs);
  switch (status) {
    case 'ACTIVE': {
      const since = full(link.approvedAt);
      return since ? `Vínculo ativo desde ${since}` : 'Vínculo ativo';
    }
    case 'SUSPENDED': {
      const since = full(link.suspendedAt);
      return since ? `Vínculo suspenso desde ${since}` : 'Vínculo suspenso';
    }
    case 'PENDING': {
      const at = full(link.requestedAt);
      return at ? `Pedido enviado em ${at} · aguardando a arena` : 'Pedido aguardando a arena';
    }
    case 'INVITED': {
      const at = full(link.invitedAt);
      const expiry = inviteExpiryLabel(link, nowMs);
      return [at ? `Convite recebido em ${at}` : 'Convite recebido', expiry].filter(Boolean).join(' · ');
    }
    case 'EXPIRED': {
      const at = full(link.expiresAt);
      return at ? `Convite expirado em ${at}` : 'Convite expirado';
    }
    case 'ENDED': {
      const at = full(link.endedAt);
      return at ? `Vínculo encerrado em ${at}` : 'Vínculo encerrado';
    }
    case 'REJECTED': {
      const at = full(link.respondedAt);
      const what = link.initiatedBy === 'ARENA' ? 'Convite recusado' : 'Pedido não aprovado';
      return at ? `${what} em ${at}` : what;
    }
    case 'CANCELED': {
      const at = full(link.canceledAt);
      const what = link.initiatedBy === 'ARENA' ? 'Convite cancelado pela arena' : 'Pedido cancelado';
      return at ? `${what} em ${at}` : what;
    }
  }
}

/** Motivo que acompanha o estado (suspensão sempre tem; recusa e encerramento, às vezes). */
export function linkReasonLine(link: ProfessorLink, nowMs: number): string | null {
  switch (displayStatus(link, nowMs)) {
    case 'SUSPENDED': {
      const reason = [link.suspensionReason, link.suspensionDetails].filter(Boolean).join(' — ');
      return reason ? `Motivo da suspensão: ${reason}` : null;
    }
    case 'REJECTED':
      return link.rejectionReason ? `Motivo: ${link.rejectionReason}` : null;
    case 'ENDED':
      return link.endedReason ? `Motivo: ${link.endedReason}` : null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Página "Minhas arenas"
// ---------------------------------------------------------------------------

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "5 vínculos · 2 ativos · mesma conta em todas". */
export function linksSubtitle(links: readonly ProfessorLink[]): string {
  if (links.length === 0) return 'Dê aulas em quantas arenas quiser · mesma conta em todas';
  const active = links.filter((l) => l.status === 'ACTIVE').length;
  return `${plural(links.length, 'vínculo', 'vínculos')} · ${plural(active, 'ativo', 'ativos')} · mesma conta em todas`;
}

const LIST_ORDER: Record<ProfessorLinkStatus, number> = {
  INVITED: 0,
  ACTIVE: 1,
  SUSPENDED: 2,
  PENDING: 3,
  REJECTED: 4,
  ENDED: 4,
  CANCELED: 4,
  EXPIRED: 4,
};

/** Grade de cards: abertos primeiro (ativo, suspenso, pedido), fechados no fim; mais recente antes. */
export function sortLinksForList(links: readonly ProfessorLink[], nowMs: number): ProfessorLink[] {
  return [...links].sort((a, b) => {
    const byStatus = LIST_ORDER[displayStatus(a, nowMs)] - LIST_ORDER[displayStatus(b, nowMs)];
    if (byStatus !== 0) return byStatus;
    return (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0);
  });
}

/** Banner do convite: "A Arena Sul convidou você para a equipe" / "… como independente". */
export function inviteBannerTitle(link: Pick<ProfessorLink, 'arenaName' | 'relationshipType'>): string {
  return link.relationshipType === 'ARENA_STAFF'
    ? `A ${link.arenaName} convidou você para a equipe`
    : `A ${link.arenaName} convidou você como independente`;
}

/** "Ricardo Prado · expira em 7 dias". */
export function inviteBannerSubtitle(link: ProfessorLink, nowMs: number): string {
  return [link.invitedByName, inviteExpiryLabel(link, nowMs)].filter(Boolean).join(' · ');
}

/** "Enviado por Ricardo Prado · hoje, 10:42". */
export function inviteSentLine(link: ProfessorLink, nowMs: number): string {
  const when = link.invitedAt ? formatRelativeDayTime(link.invitedAt, new Date(nowMs)) : null;
  const who = link.invitedByName ? `Enviado por ${link.invitedByName}` : 'Convite enviado';
  return [who, when].filter(Boolean).join(' · ');
}

/** Nota do convite. Na equipe: não é vínculo empregatício. Cita as outras arenas em que o
 *  professor está, como o protótipo ("Seus vínculos com Arena CFC e Arena Norte continuam iguais"). */
export function inviteNote(link: ProfessorLink, links: readonly ProfessorLink[]): string {
  const lead =
    link.relationshipType === 'ARENA_STAFF'
      ? 'Ser da equipe não é vínculo empregatício nem exclusividade, e não dá acesso à administração da arena.'
      : 'Ser independente não é vínculo empregatício nem exclusividade, e não dá acesso à administração da arena.';
  const others = links
    .filter((l) => l.id !== link.id && (l.status === 'ACTIVE' || l.status === 'SUSPENDED'))
    .map((l) => l.arenaName);
  return `${lead} ${otherArenasSentence(others)}`;
}

export function otherArenasSentence(names: readonly string[]): string {
  if (names.length === 0) return 'Seus vínculos com outras arenas continuam iguais.';
  if (names.length > 3) return 'Seus vínculos com as outras arenas continuam iguais.';
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
  return `Seus vínculos com ${list} continuam iguais.`;
}

/** Marca da arena sem logo, como no protótipo: sigla própria quando o nome tem uma ("Arena CFC"
 *  → CFC), senão as iniciais das duas primeiras palavras ("Arena Sul" → AS, "Lagoa Beach Club" → LB). */
export function arenaInitials(name: string): string {
  const words = name.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (words.length === 0) return 'AR';
  const acronym = words.find((w) => /^[\p{Lu}\p{N}]{2,4}$/u.test(w));
  if (acronym) return acronym;
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return words
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

// ---------------------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------------------

export function sortEventsDesc(events: readonly ProfessorLinkEvent[]): ProfessorLinkEvent[] {
  return [...events].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}

function typeLabelOf(raw: unknown, fallback: ProfessorLinkType): string {
  const type = raw === 'ARENA_STAFF' || raw === 'INDEPENDENT' ? raw : fallback;
  return PROFESSOR_TYPE_COPY[type].label;
}

function withReason(title: string, reason: string | null): string {
  return reason ? `${title} · ${reason}` : title;
}

function permissionChangeTitle(metadata: Record<string, unknown>): string {
  const changed = Array.isArray(metadata['changed']) ? (metadata['changed'] as unknown[]) : [];
  const after = (metadata['after'] ?? {}) as Record<string, unknown>;
  const parts = PROFESSOR_PERMISSION_COPY.filter((p) => changed.includes(p.key)).map(
    (p) => `Permissão “${p.label}” ${after[p.key] === true ? 'ligada' : 'removida'}`,
  );
  return parts.length > 0 ? parts.join(' · ') : 'Permissões atualizadas';
}

/** Linha de cima do histórico, do ponto de vista do professor. */
export function eventTitle(event: ProfessorLinkEvent, link: Pick<ProfessorLink, 'relationshipType'>): string {
  const type = typeLabelOf(event.metadata['relationshipType'], link.relationshipType);
  const mine = event.actorRole === 'PROFESSOR';
  switch (event.eventType) {
    case 'INVITED':
      return `Convite recebido · ${type}`;
    case 'REQUESTED':
      return mine ? `Você solicitou vínculo · ${type}` : `${event.actorName} solicitou vínculo · ${type}`;
    case 'ACCEPTED':
      return 'Convite aceito';
    case 'REJECTED':
      return withReason(mine ? 'Você recusou o convite' : 'Solicitação não aprovada', event.reason);
    case 'APPROVED':
      return `Solicitação aprovada como ${type}`;
    case 'SUSPENDED':
      return withReason('Vínculo suspenso', event.reason);
    case 'REACTIVATED':
      return 'Vínculo reativado';
    case 'ENDED': {
      const side = event.metadata['side'];
      const byMe = side === 'PROFESSOR' || (side == null && mine);
      return withReason(byMe ? 'Você encerrou o vínculo' : 'Vínculo encerrado pela arena', event.reason);
    }
    case 'PERMISSIONS_CHANGED':
      return permissionChangeTitle(event.metadata);
    case 'CANCELED':
      return event.metadata['side'] === 'ARENA' ? 'Convite cancelado' : 'Pedido cancelado';
    case 'EXPIRED':
      return 'Convite expirou';
  }
}

/** Linha de baixo: `{eventType} · {actorName} · {data}` (spec). */
export function eventMetaLine(event: ProfessorLinkEvent): string {
  return [event.eventType, event.actorName || null, event.createdAt ? formatFullDate(event.createdAt) : null]
    .filter(Boolean)
    .join(' · ');
}

// ---------------------------------------------------------------------------
// Leitura do Firestore (dados crus → modelo)
// ---------------------------------------------------------------------------

type Raw = Record<string, unknown>;

/** Timestamp do SDK, Date ou millis. */
export function toDateOrNull(raw: unknown): Date | null {
  if (raw == null) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === 'number') return Number.isFinite(raw) ? new Date(raw) : null;
  const maybe = raw as { toDate?: () => Date };
  if (typeof maybe.toDate === 'function') {
    const d = maybe.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  return null;
}

function str(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

const STATUSES: ReadonlySet<string> = new Set([
  'INVITED',
  'PENDING',
  'ACTIVE',
  'REJECTED',
  'SUSPENDED',
  'ENDED',
  'CANCELED',
  'EXPIRED',
]);

const EVENT_TYPES: ReadonlySet<string> = new Set([
  'INVITED',
  'REQUESTED',
  'ACCEPTED',
  'REJECTED',
  'APPROVED',
  'SUSPENDED',
  'REACTIVATED',
  'ENDED',
  'PERMISSIONS_CHANGED',
  'CANCELED',
  'EXPIRED',
]);

function statusOrNull(raw: unknown): ProfessorLinkStatus | null {
  return typeof raw === 'string' && STATUSES.has(raw) ? (raw as ProfessorLinkStatus) : null;
}

function sideOrNull(raw: unknown): ProfessorLinkSide | null {
  return raw === 'ARENA' || raw === 'PROFESSOR' ? raw : null;
}

export function parseProfessorLink(id: string, data: Raw | undefined): ProfessorLink | null {
  if (!data) return null;
  const status = statusOrNull(data['status']);
  const arenaId = str(data['arenaId']);
  if (!status || !arenaId) return null;
  const perms = (data['permissions'] ?? {}) as Raw;
  return {
    id,
    arenaId,
    professorUserId: str(data['professorUserId']) ?? '',
    relationshipType: data['relationshipType'] === 'ARENA_STAFF' ? 'ARENA_STAFF' : 'INDEPENDENT',
    status,
    initiatedBy: sideOrNull(data['initiatedBy']) ?? 'PROFESSOR',
    permissions: {
      canManageOwnLessons: perms['canManageOwnLessons'] === true,
      canBookCourts: perms['canBookCourts'] === true,
      canAppearInArenaProfile: perms['canAppearInArenaProfile'] === true,
    },
    message: str(data['message']),
    cycle: typeof data['cycle'] === 'number' ? data['cycle'] : 1,
    arenaName: str(data['arenaName']) ?? 'Arena',
    arenaLogoUrl: str(data['arenaLogoUrl']),
    arenaCity: str(data['arenaCity']),
    createdAt: toDateOrNull(data['createdAt']),
    updatedAt: toDateOrNull(data['updatedAt']),
    invitedAt: toDateOrNull(data['invitedAt']),
    requestedAt: toDateOrNull(data['requestedAt']),
    expiresAt: toDateOrNull(data['expiresAt']),
    respondedAt: toDateOrNull(data['respondedAt']),
    approvedAt: toDateOrNull(data['approvedAt']),
    suspendedAt: toDateOrNull(data['suspendedAt']),
    endedAt: toDateOrNull(data['endedAt']),
    canceledAt: toDateOrNull(data['canceledAt']),
    invitedByName: str(data['invitedByName']),
    approvedByName: str(data['approvedByName']),
    endedBySide: sideOrNull(data['endedBySide']),
    rejectionReason: str(data['rejectionReason']),
    suspensionReason: str(data['suspensionReason']),
    suspensionDetails: str(data['suspensionDetails']),
    endedReason: str(data['endedReason']),
  };
}

export function parseProfessorLinkEvent(id: string, data: Raw | undefined): ProfessorLinkEvent | null {
  if (!data) return null;
  const eventType = typeof data['eventType'] === 'string' && EVENT_TYPES.has(data['eventType']) ? data['eventType'] : null;
  if (!eventType) return null;
  const role = data['actorRole'];
  const metadata = data['metadata'];
  return {
    id,
    eventType: eventType as ProfessorLinkEventType,
    actorUserId: str(data['actorUserId']) ?? '',
    actorName: str(data['actorName']) ?? '',
    actorRole: role === 'ARENA' || role === 'PROFESSOR' || role === 'ADMIN' || role === 'SYSTEM' ? role : 'SYSTEM',
    cycle: typeof data['cycle'] === 'number' ? data['cycle'] : 1,
    fromStatus: statusOrNull(data['fromStatus']),
    toStatus: statusOrNull(data['toStatus']),
    reason: str(data['reason']),
    metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? (metadata as Raw) : {},
    createdAt: toDateOrNull(data['createdAt']),
  };
}

/** Cidade do seletor de arena no mesmo formato que o servidor copia para o vínculo ("Goiânia · GO"). */
export function arenaOptionCity(city: string | null, state: string | null): string | null {
  return [city, state].filter((v) => v && v.trim()).join(' · ') || null;
}

// ---------------------------------------------------------------------------
// Busca de arenas (seletor do pedido)
// ---------------------------------------------------------------------------

export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Por nome (e cidade), sem acento. Termo vazio não lista nada — a coleção inteira não é lista. */
export function filterArenaOptions(
  options: readonly ProfessorArenaOption[],
  term: string,
  limit = 8,
): ProfessorArenaOption[] {
  const q = normalizeSearch(term);
  if (q.length < 2) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  return options
    .filter((o) => {
      const hay = normalizeSearch(`${o.name} ${o.city ?? ''}`);
      return tokens.every((t) => hay.includes(t));
    })
    .sort((a, b) => {
      const an = normalizeSearch(a.name).startsWith(q) ? 0 : 1;
      const bn = normalizeSearch(b.name).startsWith(q) ? 0 : 1;
      return an - bn || a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
    })
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Erros das callables
// ---------------------------------------------------------------------------

export interface ProfessorDuplicate {
  linkId: string;
  status: ProfessorLinkStatus;
  initiatedBy: ProfessorLinkSide;
}

function errorCode(err: unknown): string {
  const raw = (err as { code?: unknown } | null)?.code;
  return typeof raw === 'string' ? raw.replace(/^functions\//, '') : '';
}

function errorText(err: unknown): string {
  const raw = (err as { message?: unknown } | null)?.message;
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/^Firebase:\s*/i, '')
    .replace(/\s*\(functions\/[^)]+\)\.?\s*$/i, '')
    .trim();
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

/** Pedido duplicado (`already-exists`/`failed-precondition` com `details`): a tela mostra o
 *  "Você já tem um pedido aqui" (M5) em vez de um erro solto. */
export function duplicateFromError(err: unknown): ProfessorDuplicate | null {
  const code = errorCode(err);
  if (code !== 'already-exists' && code !== 'failed-precondition') return null;
  const details = (err as { details?: unknown } | null)?.details as Raw | null | undefined;
  if (!details || typeof details !== 'object') return null;
  const linkId = str(details['linkId']);
  const status = details['status'];
  if (!linkId || !isOpenProfessorStatus(status)) return null;
  return { linkId, status, initiatedBy: sideOrNull(details['initiatedBy']) ?? 'PROFESSOR' };
}

/** Mesma tela do duplicado quando o vínculo aberto já está na lista local (sem ida ao servidor). */
export function duplicateFromLink(link: ProfessorLink): ProfessorDuplicate {
  return { linkId: link.id, status: link.status, initiatedBy: link.initiatedBy };
}

export interface ProfessorDuplicateCopy {
  heading: string;
  body: string;
  actionLabel: string;
}

export function duplicateCopy(status: ProfessorLinkStatus): ProfessorDuplicateCopy {
  switch (status) {
    case 'INVITED':
      return {
        heading: 'A arena já convidou você',
        body: 'Só é possível ter um vínculo em aberto por arena. Responda o convite atual antes de pedir outro.',
        actionLabel: 'Ver convite',
      };
    case 'ACTIVE':
    case 'SUSPENDED':
      return {
        heading: 'Você já tem vínculo com esta arena',
        body: 'Só é possível ter um vínculo em aberto por arena. Para mudar o tipo, encerre o vínculo atual e peça de novo.',
        actionLabel: 'Ver vínculo',
      };
    default:
      return {
        heading: 'Você já tem um pedido aqui',
        body: 'Só é possível ter um vínculo em aberto por arena. Aguarde a resposta ou cancele o pedido atual para enviar outro.',
        actionLabel: 'Ver pedido atual',
      };
  }
}

/** Convite vencido ao responder (`details.status = 'EXPIRED'`). */
export function isExpiredInviteError(err: unknown): boolean {
  const details = (err as { details?: unknown } | null)?.details as Raw | null | undefined;
  return errorCode(err) === 'failed-precondition' && details?.['status'] === 'EXPIRED';
}

/** Mensagem do servidor (já em português) ou a genérica. Mensagem que é só o código
 *  ("not-found", "NOT FOUND") é a callable não publicada, não regra de negócio. */
export function professorErrorMessage(err: unknown, fallback: string): string {
  const code = errorCode(err);
  const text = errorText(err);
  if (code === 'unauthenticated') return 'Sua sessão expirou. Entre de novo para continuar.';
  if (!text || squash(text) === squash(code)) return fallback;
  switch (code) {
    case 'invalid-argument':
    case 'failed-precondition':
    case 'already-exists':
    case 'permission-denied':
    case 'not-found':
      return text;
    default:
      return fallback;
  }
}
