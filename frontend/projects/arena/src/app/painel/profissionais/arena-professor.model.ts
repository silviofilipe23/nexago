import { Timestamp, type DocumentSnapshot, type QueryDocumentSnapshot } from 'firebase/firestore';

/** Vínculos professor ↔ arena, lado da arena (spec
 *  `docs/superpowers/specs/2026-10-20-vinculos-professor-arena-design.md`).
 *
 *  Um doc por par: `arenaProfessors/{arenaId}_{professorUserId}`. Leitura direta (rules:
 *  dono/gestor pela área `perfil`); escrita só pelos callables de
 *  `functions/src/arena-professor-links.ts`. Tudo aqui é puro: rótulos, agrupamentos e datas
 *  que a tela mostra — a autoridade das transições é o servidor. */

export type ProfessorLinkType = 'ARENA_STAFF' | 'INDEPENDENT';

export type ProfessorLinkStatus =
  | 'INVITED'
  | 'PENDING'
  | 'ACTIVE'
  | 'REJECTED'
  | 'SUSPENDED'
  | 'ENDED'
  | 'CANCELED'
  | 'EXPIRED';

export type ProfessorLinkSide = 'ARENA' | 'PROFESSOR';

export type ProfessorEventType =
  | 'INVITED'
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'APPROVED'
  | 'SUSPENDED'
  | 'REACTIVATED'
  | 'ENDED'
  | 'PERMISSIONS_CHANGED'
  | 'COURT_DISCOUNT_CHANGED'
  | 'CANCELED'
  | 'EXPIRED';

export const PROFESSOR_PERMISSION_KEYS = [
  'canManageOwnLessons',
  'canBookCourts',
  'canAppearInArenaProfile',
  'canEnrollStudents',
  'canScheduleLessons',
  'canCancelLessons',
  'canBookRecurring',
] as const;
export type ProfessorPermissionKey = (typeof PROFESSOR_PERMISSION_KEYS)[number];
export type ProfessorPermissions = Record<ProfessorPermissionKey, boolean>;

/** Agir nas Aulas da arena em nome dela (matricular, encaixar/agendar, cancelar): só o professor
 *  da EQUIPE, e só quando a arena liga — desligadas por padrão, inclusive em vínculo antigo sem a
 *  chave. Espelho de `ARENA_STAFF_ONLY_PERMISSION_KEYS` no servidor (spec
 *  `docs/superpowers/specs/2026-10-20-professor-app-alunos-fase-2-design.md`). */
export const ARENA_STAFF_ONLY_PERMISSION_KEYS: readonly ProfessorPermissionKey[] = [
  'canEnrollStudents',
  'canScheduleLessons',
  'canCancelLessons',
];

export function isStaffOnlyPermission(key: ProfessorPermissionKey): boolean {
  return ARENA_STAFF_ONLY_PERMISSION_KEYS.includes(key);
}

/** Horário fixo de quadra para a turma própria: só o professor INDEPENDENTE, desligada por
 *  padrão. Espelho de `INDEPENDENT_ONLY_PERMISSION_KEYS` no servidor — que recusa a chave ligada
 *  num vínculo de equipe. */
export const INDEPENDENT_ONLY_PERMISSION_KEYS: readonly ProfessorPermissionKey[] = ['canBookRecurring'];

export function isIndependentOnlyPermission(key: ProfessorPermissionKey): boolean {
  return INDEPENDENT_ONLY_PERMISSION_KEYS.includes(key);
}

/** Chave que só vale num tipo de vínculo: só `true` explícito liga (ausente/legado = false). */
function isTypeRestrictedPermission(key: ProfessorPermissionKey): boolean {
  return isStaffOnlyPermission(key) || isIndependentOnlyPermission(key);
}

export interface ArenaProfessorLink {
  id: string;
  arenaId: string;
  professorUserId: string;
  relationshipType: ProfessorLinkType;
  status: ProfessorLinkStatus;
  initiatedBy: ProfessorLinkSide;
  /** Configuradas — só valem com `ACTIVE` (ver `effectivePermissions`). */
  permissions: ProfessorPermissions;
  /** Desconto (% inteiro, 0 = sem) no aluguel de quadra reservado "como professor". */
  courtDiscountPercent: number;
  message: string | null;
  cycle: number;
  professorName: string;
  professorPhotoUrl: string | null;
  professorModalities: string[];
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

export interface ArenaProfessorEvent {
  id: string;
  eventType: ProfessorEventType;
  actorName: string;
  actorRole: ProfessorLinkSide | 'ADMIN' | 'SYSTEM';
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date | null;
}

// ── Rótulos e cores (protótipo `vc-atoms.jsx`) ─────────────────────────────────

export const PROFESSOR_TYPE_META: Record<ProfessorLinkType, { label: string; sub: string; color: string; bg: string }> = {
  ARENA_STAFF: {
    label: 'Equipe da arena',
    sub: 'Integra a rede de professores da arena',
    color: '#FF8A4A',
    bg: 'rgba(255,106,26,0.12)',
  },
  INDEPENDENT: {
    label: 'Independente',
    sub: 'Autônomo, usa a estrutura para os próprios alunos',
    color: '#5B9BFF',
    bg: 'rgba(91,155,255,0.12)',
  },
};

const CLOSED_COLOR = 'rgba(244,244,245,0.5)';

export const PROFESSOR_STATUS_META: Record<ProfessorLinkStatus, { label: string; color: string }> = {
  INVITED: { label: 'Convite enviado', color: '#5B9BFF' },
  PENDING: { label: 'Aguardando aprovação', color: '#F4C543' },
  ACTIVE: { label: 'Ativo', color: '#2BD17E' },
  REJECTED: { label: 'Recusado', color: CLOSED_COLOR },
  SUSPENDED: { label: 'Suspenso', color: '#FF3B30' },
  ENDED: { label: 'Encerrado', color: CLOSED_COLOR },
  CANCELED: { label: 'Cancelado', color: CLOSED_COLOR },
  EXPIRED: { label: 'Convite expirado', color: CLOSED_COLOR },
};

export interface ProfessorPermissionMeta {
  key: ProfessorPermissionKey;
  title: string;
  sub: string;
  short: string;
}

/** As três de qualquer vínculo. */
export const PROFESSOR_BASE_PERMISSION_META: readonly ProfessorPermissionMeta[] = [
  {
    key: 'canManageOwnLessons',
    title: 'Gerenciar as próprias aulas',
    sub: 'Criar aulas e turmas, fazer chamada dos seus alunos',
    short: 'Aulas',
  },
  {
    key: 'canBookCourts',
    title: 'Reservar quadras',
    sub: 'Reservar horários conforme regras e preços da arena',
    short: 'Quadras',
  },
  {
    key: 'canAppearInArenaProfile',
    title: 'Aparecer no perfil da arena',
    sub: 'Listado em “Professores” na página pública',
    short: 'Perfil',
  },
];

/** Grupo "Aulas da arena": só para professor da equipe (`ARENA_STAFF_ONLY_PERMISSION_KEYS`). */
export const PROFESSOR_ARENA_LESSONS_GROUP_TITLE = 'Aulas da arena';
export const PROFESSOR_STAFF_ONLY_NOTE = 'Só para professor da equipe';

export const PROFESSOR_ARENA_LESSONS_PERMISSION_META: readonly ProfessorPermissionMeta[] = [
  {
    key: 'canEnrollStudents',
    title: 'Matricular alunos',
    sub: 'Matricular nas turmas dele com o plano da tabela, mover de turma e lista de espera',
    short: 'Matrículas',
  },
  {
    key: 'canScheduleLessons',
    title: 'Agendar aulas e encaixes',
    sub: 'Reposição, experimental e aula avulsa na quadra que a arena escolher, usando o pacote do aluno',
    short: 'Agenda',
  },
  {
    key: 'canCancelLessons',
    title: 'Cancelar aulas e avisar alunos',
    sub: 'Cancelar aulas das turmas dele; os alunos recebem o aviso',
    short: 'Cancelar',
  },
];

/** Grupo "Turma própria": só para professor independente (`INDEPENDENT_ONLY_PERMISSION_KEYS`). */
export const PROFESSOR_OWN_CLASS_GROUP_TITLE = 'Turma própria';
export const PROFESSOR_INDEPENDENT_ONLY_NOTE = 'Só para professor independente';

export const PROFESSOR_OWN_CLASS_PERMISSION_META: readonly ProfessorPermissionMeta[] = [
  {
    key: 'canBookRecurring',
    title: 'Horário fixo (turma própria)',
    sub: 'Pode reservar a quadra toda semana para uma turma dele. A reserva aparece nos horários fixos da arena.',
    short: 'Horário fixo',
  },
];

export const PROFESSOR_PERMISSION_META: readonly ProfessorPermissionMeta[] = [
  ...PROFESSOR_BASE_PERMISSION_META,
  ...PROFESSOR_ARENA_LESSONS_PERMISSION_META,
  ...PROFESSOR_OWN_CLASS_PERMISSION_META,
];

/** Motivos da suspensão (protótipo A5). Vão como `reason` — o servidor exige um. */
export const SUSPENSION_REASONS: readonly string[] = [
  'Pendência de pagamento',
  'Descumprimento de regras',
  'Pedido do professor',
  'Outro',
];

/** Mesmo prazo do servidor (`PROFESSOR_INVITE_TTL_MS`). Só para o texto da tela. */
export const PROFESSOR_INVITE_TTL_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

// ── Regras ────────────────────────────────────────────────────────────────────

/** Equipe da arena: as três de base. Independente: aulas e quadras, fora da página pública. As
 *  ações nas Aulas da arena começam desligadas nos dois (espelho de
 *  `defaultArenaProfessorPermissions` no servidor). */
export function defaultProfessorPermissions(type: ProfessorLinkType): ProfessorPermissions {
  return {
    canManageOwnLessons: true,
    canBookCourts: true,
    canAppearInArenaProfile: type === 'ARENA_STAFF',
    canEnrollStudents: false,
    canScheduleLessons: false,
    canCancelLessons: false,
    canBookRecurring: false,
  };
}

/** O que vai para o servidor: nenhum tipo leva `true` numa chave do outro (as da equipe no
 *  independente, o horário fixo na equipe) — o callable recusaria (`invalid-argument`) o
 *  convite/aprovação inteiro. */
export function permissionsForType(permissions: ProfessorPermissions, type: ProfessorLinkType): ProfessorPermissions {
  const out = { ...permissions };
  const foreign = type === 'ARENA_STAFF' ? INDEPENDENT_ONLY_PERMISSION_KEYS : ARENA_STAFF_ONLY_PERMISSION_KEYS;
  for (const key of foreign) out[key] = false;
  return out;
}

/** Toggle que a arena pode mexer neste tipo de vínculo (as das Aulas da arena só na equipe; o
 *  horário fixo só no independente). */
export function permissionAllowedForType(key: ProfessorPermissionKey, type: ProfessorLinkType): boolean {
  if (isStaffOnlyPermission(key)) return type === 'ARENA_STAFF';
  if (isIndependentOnlyPermission(key)) return type === 'INDEPENDENT';
  return true;
}

export interface ProfessorPermissionGroup {
  title: string | null;
  /** Para quem o grupo vale (ex.: "Só para professor da equipe"). */
  note: string | null;
  items: readonly ProfessorPermissionMeta[];
}

/** Itens da lista de permissões para o tipo: as de base sempre; o grupo "Aulas da arena" só na
 *  equipe; o "Turma própria" só no independente. */
export function permissionGroupsFor(type: ProfessorLinkType): readonly ProfessorPermissionGroup[] {
  const groups: ProfessorPermissionGroup[] = [{ title: null, note: null, items: PROFESSOR_BASE_PERMISSION_META }];
  if (type === 'ARENA_STAFF') {
    groups.push({ title: PROFESSOR_ARENA_LESSONS_GROUP_TITLE, note: PROFESSOR_STAFF_ONLY_NOTE, items: PROFESSOR_ARENA_LESSONS_PERMISSION_META });
  } else {
    groups.push({ title: PROFESSOR_OWN_CLASS_GROUP_TITLE, note: PROFESSOR_INDEPENDENT_ONLY_NOTE, items: PROFESSOR_OWN_CLASS_PERMISSION_META });
  }
  return groups;
}

/** O servidor só grava `EXPIRED` quando alguém toca no vínculo; até lá a tela decide pela data. */
export function isInviteExpired(link: Pick<ArenaProfessorLink, 'status' | 'expiresAt'>, nowMs: number): boolean {
  return link.status === 'INVITED' && link.expiresAt != null && link.expiresAt.getTime() <= nowMs;
}

/** Status que a tela mostra: convite vencido aparece como expirado mesmo antes do servidor marcar. */
export function displayStatus(link: Pick<ArenaProfessorLink, 'status' | 'expiresAt'>, nowMs: number): ProfessorLinkStatus {
  return isInviteExpired(link, nowMs) ? 'EXPIRED' : link.status;
}

export function isClosedStatus(status: ProfessorLinkStatus): boolean {
  return status === 'REJECTED' || status === 'ENDED' || status === 'CANCELED' || status === 'EXPIRED';
}

/** O que o professor pode de fato fazer agora: nada fora de `ACTIVE`; as das Aulas da arena só
 *  na equipe (independente nunca, mesmo com a chave gravada); o horário fixo só no independente.
 *  Espelho de
 *  `effectiveArenaProfessorPermissions` no servidor. */
export function effectivePermissions(link: Pick<ArenaProfessorLink, 'status' | 'permissions' | 'relationshipType'>): ProfessorPermissions {
  const active = link.status === 'ACTIVE';
  const staff = active && link.relationshipType === 'ARENA_STAFF';
  const p = link.permissions;
  return {
    canManageOwnLessons: active && p.canManageOwnLessons === true,
    canBookCourts: active && p.canBookCourts === true,
    canAppearInArenaProfile: active && p.canAppearInArenaProfile === true,
    canEnrollStudents: staff && p.canEnrollStudents === true,
    canScheduleLessons: staff && p.canScheduleLessons === true,
    canCancelLessons: staff && p.canCancelLessons === true,
    canBookRecurring: active && link.relationshipType === 'INDEPENDENT' && p.canBookRecurring === true,
  };
}

/** Só vínculo ativo ou suspenso tem permissões ajustáveis (`updateArenaProfessorPermissions`). */
export function permissionsEditable(status: ProfessorLinkStatus): boolean {
  return status === 'ACTIVE' || status === 'SUSPENDED';
}

/** Teto do desconto no aluguel — espelho de `MAX_COURT_DISCOUNT_PERCENT` no servidor. */
export const MAX_COURT_DISCOUNT_PERCENT = 90;

/** `20%` ou `Sem desconto`. */
export function courtDiscountLabel(percent: number): string {
  return percent > 0 ? `${percent}%` : 'Sem desconto';
}

/** Valor digitado no campo do desconto: inteiro de 0 a 90 (vazio = 0); `null` quando inválido. */
export function parseCourtDiscountInput(raw: string): number | null {
  const text = raw.trim().replace(/%$/, '').trim();
  if (text === '') return 0;
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return value <= MAX_COURT_DISCOUNT_PERCENT ? value : null;
}

/** Coluna "Permissões" da lista: pílulas só com vínculo ativo; antes do aceite, nada vale. */
export type PermissionsCell =
  | { kind: 'pills'; items: ReadonlyArray<{ key: ProfessorPermissionKey; label: string; on: boolean }> }
  | { kind: 'text'; text: string };

/** As pílulas são só as três de base — as das Aulas da arena ficam no detalhe, para a coluna
 *  não crescer. */
export function permissionsCell(
  link: Pick<ArenaProfessorLink, 'status' | 'expiresAt' | 'permissions' | 'relationshipType'>,
  nowMs: number,
): PermissionsCell {
  const status = displayStatus(link, nowMs);
  if (status === 'ACTIVE') {
    const effective = effectivePermissions(link);
    return {
      kind: 'pills',
      items: PROFESSOR_BASE_PERMISSION_META.map((p) => ({ key: p.key, label: p.short, on: effective[p.key] })),
    };
  }
  if (status === 'INVITED') return { kind: 'text', text: 'após o aceite' };
  if (status === 'PENDING') return { kind: 'text', text: 'após a aprovação' };
  return { kind: 'text', text: 'revogadas' };
}

// ── Datas ─────────────────────────────────────────────────────────────────────

const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** `18 out` — com o ano só quando não é o ano corrente (`18 out 2025`). */
export function dayMonthLabel(date: Date, nowMs: number): string {
  const base = `${String(date.getDate()).padStart(2, '0')} ${MONTH_SHORT[date.getMonth()]}`;
  return date.getFullYear() === new Date(nowMs).getFullYear() ? base : `${base} ${date.getFullYear()}`;
}

/** `mar 2025`. */
export function monthYearLabel(date: Date): string {
  return `${MONTH_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

/** `12 set 2026`. */
export function fullDateLabel(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')} ${MONTH_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

/** `21:14`. */
export function timeLabel(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Dias inteiros até vencer o convite, arredondando para cima (nunca menos que 1). */
export function inviteDaysLeft(expiresAt: Date, nowMs: number): number {
  return Math.max(1, Math.ceil((expiresAt.getTime() - nowMs) / DAY_MS));
}

function plural(n: number, singular: string, pluralForm: string): string {
  return n === 1 ? singular : pluralForm;
}

/** Linha de data sob o status na lista (`desde mar 2025`, `convite 18 out`, `pedido 19 out`…). */
export function statusDateLine(link: ArenaProfessorLink, nowMs: number): string {
  const status = displayStatus(link, nowMs);
  const day = (date: Date | null, prefix: string) => (date ? `${prefix} ${dayMonthLabel(date, nowMs)}` : '');
  switch (status) {
    case 'ACTIVE': {
      const since = link.approvedAt ?? link.respondedAt ?? link.updatedAt;
      return since ? `desde ${monthYearLabel(since)}` : '';
    }
    case 'INVITED':
      return day(link.invitedAt, 'convite');
    case 'EXPIRED':
      return day(link.expiresAt, 'expirou');
    case 'PENDING':
      return day(link.requestedAt, 'pedido');
    case 'SUSPENDED':
      return day(link.suspendedAt, 'suspenso');
    case 'ENDED':
      return link.endedAt ? `encerrado ${monthYearLabel(link.endedAt)}` : '';
    case 'REJECTED':
      return day(link.respondedAt, 'recusado');
    case 'CANCELED':
      return day(link.canceledAt, 'cancelado');
  }
}

/** Subtítulo do detalhe (A4): "Vínculo desde 04 ago 2025" ou o estado atual. */
export function detailSubtitle(link: ArenaProfessorLink, nowMs: number): string {
  const status = displayStatus(link, nowMs);
  const on = (prefix: string, date: Date | null) => (date ? `${prefix} ${fullDateLabel(date)}` : prefix);
  switch (status) {
    case 'ACTIVE':
      return on('Vínculo desde', link.approvedAt ?? link.respondedAt);
    case 'SUSPENDED':
      return on('Suspenso desde', link.suspendedAt);
    case 'INVITED': {
      const sent = on('Convite enviado em', link.invitedAt);
      if (!link.expiresAt) return sent;
      const days = inviteDaysLeft(link.expiresAt, nowMs);
      return `${sent} · expira em ${days} ${plural(days, 'dia', 'dias')}`;
    }
    case 'EXPIRED':
      return on('Convite expirou em', link.expiresAt);
    case 'PENDING':
      return on('Pedido em', link.requestedAt);
    case 'ENDED':
      return on('Encerrado em', link.endedAt);
    case 'REJECTED':
      return on('Recusado em', link.respondedAt);
    case 'CANCELED':
      return on('Cancelado em', link.canceledAt);
  }
}

// ── Lista: KPIs, filtros, ordem ───────────────────────────────────────────────

export interface ProfessorKpis {
  staffActive: number;
  staffSuspended: number;
  independentActive: number;
  independentSuspended: number;
  pending: number;
  invitesOpen: number;
  /** Prazo do convite em aberto que vence primeiro; `null` sem convite em aberto. */
  nextInviteDaysLeft: number | null;
}

export function professorKpis(links: readonly ArenaProfessorLink[], nowMs: number): ProfessorKpis {
  const kpis: ProfessorKpis = {
    staffActive: 0,
    staffSuspended: 0,
    independentActive: 0,
    independentSuspended: 0,
    pending: 0,
    invitesOpen: 0,
    nextInviteDaysLeft: null,
  };
  let soonest: number | null = null;
  for (const link of links) {
    const status = displayStatus(link, nowMs);
    const staff = link.relationshipType === 'ARENA_STAFF';
    if (status === 'ACTIVE') {
      if (staff) kpis.staffActive += 1;
      else kpis.independentActive += 1;
    } else if (status === 'SUSPENDED') {
      if (staff) kpis.staffSuspended += 1;
      else kpis.independentSuspended += 1;
    } else if (status === 'PENDING') {
      kpis.pending += 1;
    } else if (status === 'INVITED') {
      kpis.invitesOpen += 1;
      const expires = link.expiresAt?.getTime();
      if (expires != null && (soonest == null || expires < soonest)) soonest = expires;
    }
  }
  kpis.nextInviteDaysLeft = soonest == null ? null : inviteDaysLeft(new Date(soonest), nowMs);
  return kpis;
}

/** `ativos` / `ativo · 1 suspenso` (protótipo A1). */
export function activeKpiSub(active: number, suspended: number): string {
  const base = plural(active, 'ativo', 'ativos');
  return suspended > 0 ? `${base} · ${suspended} ${plural(suspended, 'suspenso', 'suspensos')}` : base;
}

export function inviteKpiSub(kpis: Pick<ProfessorKpis, 'invitesOpen' | 'nextInviteDaysLeft'>): string {
  if (kpis.invitesOpen === 0 || kpis.nextInviteDaysLeft == null) return 'nenhum em aberto';
  const days = `${kpis.nextInviteDaysLeft} ${plural(kpis.nextInviteDaysLeft, 'dia', 'dias')}`;
  return kpis.invitesOpen === 1 ? `expira em ${days}` : `o próximo expira em ${days}`;
}

export type ProfessorTypeFilter = 'all' | ProfessorLinkType;
export type ProfessorStatusGroup = 'active' | 'invites' | 'suspended' | 'closed';
export type ProfessorStatusFilter = 'all' | ProfessorStatusGroup;

export const PROFESSOR_STATUS_FILTERS: ReadonlyArray<{ id: ProfessorStatusGroup; label: string }> = [
  { id: 'active', label: 'Ativos' },
  { id: 'invites', label: 'Convites' },
  { id: 'suspended', label: 'Suspensos' },
  { id: 'closed', label: 'Encerrados' },
];

/** Grupo do filtro de status. Pedido (`PENDING`) não entra na tabela — tem o card próprio. */
export function statusGroupOf(status: ProfessorLinkStatus): ProfessorStatusGroup | 'pending' {
  switch (status) {
    case 'PENDING':
      return 'pending';
    case 'ACTIVE':
      return 'active';
    case 'INVITED':
      return 'invites';
    case 'SUSPENDED':
      return 'suspended';
    default:
      return 'closed';
  }
}

export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

const STATUS_ORDER: Record<ProfessorStatusGroup | 'pending', number> = {
  pending: 0,
  active: 1,
  invites: 2,
  suspended: 3,
  closed: 4,
};

/** Pedidos primeiro, depois ativos, convites, suspensos e fechados; empate pelo nome. */
export function sortProfessorLinks(links: readonly ArenaProfessorLink[], nowMs: number): ArenaProfessorLink[] {
  return [...links].sort((a, b) => {
    const byStatus = STATUS_ORDER[statusGroupOf(displayStatus(a, nowMs))] - STATUS_ORDER[statusGroupOf(displayStatus(b, nowMs))];
    return byStatus !== 0 ? byStatus : a.professorName.localeCompare(b.professorName, 'pt-BR');
  });
}

/** Linhas da tabela (A1): sem os pedidos, filtradas por tipo, grupo de status e nome. */
export function filterProfessorRows(
  links: readonly ArenaProfessorLink[],
  filter: { type: ProfessorTypeFilter; status: ProfessorStatusFilter; term: string },
  nowMs: number,
): ArenaProfessorLink[] {
  const term = normalizeSearch(filter.term);
  return sortProfessorLinks(links, nowMs).filter((link) => {
    const group = statusGroupOf(displayStatus(link, nowMs));
    if (group === 'pending') return false;
    if (filter.type !== 'all' && link.relationshipType !== filter.type) return false;
    if (filter.status !== 'all' && group !== filter.status) return false;
    return !term || normalizeSearch(link.professorName).includes(term);
  });
}

/** Pedidos aguardando decisão, mais antigos primeiro (card lateral de A1). */
export function pendingRequests(links: readonly ArenaProfessorLink[]): ArenaProfessorLink[] {
  return links
    .filter((link) => link.status === 'PENDING')
    .sort((a, b) => (a.requestedAt?.getTime() ?? 0) - (b.requestedAt?.getTime() ?? 0));
}

// ── Convite: situação de cada conta encontrada ────────────────────────────────

export type AccountLinkState = 'available' | 'invited' | 'requested' | 'linked';

export const ACCOUNT_LINK_STATE_LABEL: Record<Exclude<AccountLinkState, 'available'>, string> = {
  invited: 'Já convidado · aguardando resposta',
  requested: 'Pediu vínculo · analise',
  linked: 'Já vinculado',
};

/** Cruza a busca com a lista carregada: vínculo em aberto bloqueia um convite novo; vínculo
 *  fechado (ou convite vencido) permite convidar de novo — o servidor reabre o mesmo doc. */
export function accountLinkState(links: readonly ArenaProfessorLink[], userId: string, nowMs: number): AccountLinkState {
  const link = links.find((l) => l.professorUserId === userId);
  if (!link) return 'available';
  const status = displayStatus(link, nowMs);
  if (status === 'INVITED') return 'invited';
  if (status === 'PENDING') return 'requested';
  if (status === 'ACTIVE' || status === 'SUSPENDED') return 'linked';
  return 'available';
}

// ── Detalhe: ações por estado ─────────────────────────────────────────────────

export type ProfessorLinkAction = 'analyze' | 'suspend' | 'reactivate' | 'end' | 'cancelInvite' | 'resendInvite';

export function linkActions(link: Pick<ArenaProfessorLink, 'status' | 'expiresAt' | 'initiatedBy'>, nowMs: number): ProfessorLinkAction[] {
  switch (link.status) {
    case 'ACTIVE':
      return ['suspend', 'end'];
    case 'SUSPENDED':
      return ['reactivate', 'end'];
    case 'PENDING':
      return ['analyze'];
    case 'INVITED':
      return isInviteExpired(link, nowMs) ? ['resendInvite', 'cancelInvite'] : ['cancelInvite'];
    case 'EXPIRED':
      return link.initiatedBy === 'ARENA' ? ['resendInvite'] : [];
    default:
      return [];
  }
}

/** Aviso do card de permissões quando elas não estão valendo. */
export function permissionsStateNote(link: Pick<ArenaProfessorLink, 'status' | 'expiresAt'>, nowMs: number): string | null {
  switch (displayStatus(link, nowMs)) {
    case 'ACTIVE':
      return null;
    case 'SUSPENDED':
      return 'Vínculo suspenso: nada vale até reativar. O que você ajustar agora passa a valer na reativação.';
    case 'INVITED':
      return 'Proposta do convite — só passa a valer quando o professor aceitar.';
    case 'PENDING':
      return 'Você define as permissões ao aprovar a solicitação.';
    default:
      return 'Vínculo fechado — permissões revogadas.';
  }
}

// ── Histórico ─────────────────────────────────────────────────────────────────

function typeLabelOf(raw: unknown, fallback: ProfessorLinkType): string {
  const type = raw === 'ARENA_STAFF' || raw === 'INDEPENDENT' ? raw : fallback;
  return PROFESSOR_TYPE_META[type].label;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function permissionTitle(key: string): string {
  return PROFESSOR_PERMISSION_META.find((p) => p.key === key)?.title ?? key;
}

function discountMeta(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
}

/** Linha principal do evento (tabela da spec). */
export function eventTitle(event: ArenaProfessorEvent, link: Pick<ArenaProfessorLink, 'relationshipType' | 'professorName'>): string {
  const meta = event.metadata;
  const withReason = (text: string) => (event.reason ? `${text} · ${event.reason}` : text);
  switch (event.eventType) {
    case 'INVITED':
      return `Convite enviado · ${typeLabelOf(meta['relationshipType'], link.relationshipType)}`;
    case 'REQUESTED':
      return `${firstName(event.actorName || link.professorName)} solicitou vínculo · ${typeLabelOf(meta['relationshipType'], link.relationshipType)}`;
    case 'ACCEPTED':
      return 'Convite aceito';
    case 'REJECTED':
      return withReason('Recusado');
    case 'APPROVED':
      return `Solicitação aprovada como ${typeLabelOf(meta['relationshipType'], link.relationshipType)}`;
    case 'SUSPENDED':
      return withReason('Vínculo suspenso');
    case 'REACTIVATED':
      return 'Vínculo reativado';
    case 'ENDED':
      return withReason('Vínculo encerrado');
    case 'CANCELED':
      return meta['side'] === 'PROFESSOR' ? 'Pedido cancelado' : 'Convite cancelado';
    case 'EXPIRED':
      return 'Convite expirou';
    case 'COURT_DISCOUNT_CHANGED': {
      const before = discountMeta(meta['before']);
      const after = discountMeta(meta['after']);
      if (after === 0) return 'Desconto no aluguel removido';
      return before > 0 ? `Desconto no aluguel: ${before}% → ${after}%` : `Desconto no aluguel: ${after}%`;
    }
    case 'PERMISSIONS_CHANGED': {
      const changed = Array.isArray(meta['changed']) ? (meta['changed'] as unknown[]).filter((k): k is string => typeof k === 'string') : [];
      const after = (meta['after'] ?? {}) as Record<string, unknown>;
      const parts = changed.map((key) => `“${permissionTitle(key)}” ${after[key] === true ? 'ligada' : 'removida'}`);
      if (parts.length === 0) return 'Permissões alteradas';
      return parts.length === 1 ? `Permissão ${parts[0]}` : `Permissões alteradas · ${parts.join(' · ')}`;
    }
  }
}

/** Linha de baixo: `{eventType} · {actorName} · {data}`. */
export function eventMetaLine(event: ArenaProfessorEvent): string {
  const actor =
    event.actorRole === 'SYSTEM' ? 'Sistema' : event.actorRole === 'ADMIN' ? `${event.actorName || 'NexaGO'} · suporte` : event.actorName || '—';
  const parts: string[] = [event.eventType, actor];
  if (event.createdAt) parts.push(fullDateLabel(event.createdAt));
  return parts.join(' · ');
}

export function sortEventsDesc(events: readonly ArenaProfessorEvent[]): ArenaProfessorEvent[] {
  return [...events].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}

// ── Diversos ──────────────────────────────────────────────────────────────────

/** "Reenviar convite" = convidar de novo com o mesmo professor, tipo, permissões e mensagem;
 *  o servidor marca o convite vencido como `EXPIRED` e reabre o doc (`cycle` + 1). */
export function resendInviteInput(link: ArenaProfessorLink): {
  arenaId: string;
  professorUserId: string;
  relationshipType: ProfessorLinkType;
  permissions: ProfessorPermissions;
  message: string | null;
} {
  return {
    arenaId: link.arenaId,
    professorUserId: link.professorUserId,
    relationshipType: link.relationshipType,
    permissions: permissionsForType(link.permissions, link.relationshipType),
    message: link.message,
  };
}

/** Página da arena no portal do atleta (`/reservar/{arenaId}`): é lá (e na página da arena no
 *  app) que fica o "Você é professor?" para quem não foi convidado pedir o vínculo. A página do
 *  site (`nexago.com.br/arena/{id}`) não tem esse pedido. */
export function arenaProfessorRequestUrl(athleteAppUrl: string, arenaId: string): string {
  return `${athleteAppUrl.replace(/\/+$/, '')}/reservar/${encodeURIComponent(arenaId)}`;
}

function normalizedCode(text: string): string {
  return text.toLowerCase().replace(/[\s_-]/g, '');
}

/** Mensagem do callable para a tela. A copy do servidor já é em português; quando o SDK
 *  preenche a mensagem com o próprio código ("not-found", "INTERNAL" — callable não deployada,
 *  rede), cai no texto genérico em vez de mostrar infraestrutura. */
export function callableErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error) || !err.message) return fallback;
  const code = (err as { code?: unknown }).code;
  const rawCode = typeof code === 'string' ? code.replace(/^functions\//, '') : '';
  const message = err.message.trim();
  if (!message) return fallback;
  if (rawCode && normalizedCode(message) === normalizedCode(rawCode)) return fallback;
  if (normalizedCode(message) === 'internal') return fallback;
  return message;
}

// ── Parse ─────────────────────────────────────────────────────────────────────

function toDate(v: unknown): Date | null {
  return v instanceof Timestamp ? v.toDate() : null;
}

function optStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

const STATUSES: readonly ProfessorLinkStatus[] = ['INVITED', 'PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED', 'ENDED', 'CANCELED', 'EXPIRED'];
const EVENT_TYPES: readonly ProfessorEventType[] = [
  'INVITED',
  'REQUESTED',
  'ACCEPTED',
  'REJECTED',
  'APPROVED',
  'SUSPENDED',
  'REACTIVATED',
  'ENDED',
  'PERMISSIONS_CHANGED',
  'COURT_DISCOUNT_CHANGED',
  'CANCELED',
  'EXPIRED',
];

function permissionsFromRaw(raw: unknown, type: ProfessorLinkType): ProfessorPermissions {
  const out = defaultProfessorPermissions(type);
  if (raw == null || typeof raw !== 'object') return out;
  const record = raw as Record<string, unknown>;
  for (const key of PROFESSOR_PERMISSION_KEYS) {
    if (typeof record[key] !== 'boolean') continue;
    // Chaves de um só tipo: só `true` explícito liga (ausente/legado = false, já no padrão).
    out[key] = isTypeRestrictedPermission(key) ? record[key] === true : (record[key] as boolean);
  }
  return out;
}

/** Espelho de `storedCourtDiscountPercent`: ausente (vínculo antigo) ou fora da faixa = 0. */
function courtDiscountFromRaw(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return 0;
  return raw >= 0 && raw <= MAX_COURT_DISCOUNT_PERCENT ? raw : 0;
}

export function arenaProfessorLinkFromDoc(doc: QueryDocumentSnapshot | DocumentSnapshot): ArenaProfessorLink {
  const d = (doc.data() ?? {}) as Record<string, unknown>;
  const relationshipType = oneOf<ProfessorLinkType>(d['relationshipType'], ['ARENA_STAFF', 'INDEPENDENT'], 'INDEPENDENT');
  const modalities = Array.isArray(d['professorModalities'])
    ? (d['professorModalities'] as unknown[]).filter((m): m is string => typeof m === 'string' && m.trim() !== '')
    : [];
  return {
    id: doc.id,
    arenaId: optStr(d['arenaId']) ?? '',
    professorUserId: optStr(d['professorUserId']) ?? '',
    relationshipType,
    status: oneOf(d['status'], STATUSES, 'PENDING'),
    initiatedBy: oneOf<ProfessorLinkSide>(d['initiatedBy'], ['ARENA', 'PROFESSOR'], 'PROFESSOR'),
    permissions: permissionsFromRaw(d['permissions'], relationshipType),
    courtDiscountPercent: courtDiscountFromRaw(d['courtDiscountPercent']),
    message: optStr(d['message']),
    cycle: typeof d['cycle'] === 'number' ? d['cycle'] : 1,
    professorName: optStr(d['professorName']) ?? 'Professor',
    professorPhotoUrl: optStr(d['professorPhotoUrl']),
    professorModalities: modalities,
    createdAt: toDate(d['createdAt']),
    updatedAt: toDate(d['updatedAt']),
    invitedAt: toDate(d['invitedAt']),
    requestedAt: toDate(d['requestedAt']),
    expiresAt: toDate(d['expiresAt']),
    respondedAt: toDate(d['respondedAt']),
    approvedAt: toDate(d['approvedAt']),
    suspendedAt: toDate(d['suspendedAt']),
    endedAt: toDate(d['endedAt']),
    canceledAt: toDate(d['canceledAt']),
    invitedByName: optStr(d['invitedByName']),
    approvedByName: optStr(d['approvedByName']),
    endedBySide: d['endedBySide'] === 'ARENA' || d['endedBySide'] === 'PROFESSOR' ? d['endedBySide'] : null,
    rejectionReason: optStr(d['rejectionReason']),
    suspensionReason: optStr(d['suspensionReason']),
    suspensionDetails: optStr(d['suspensionDetails']),
    endedReason: optStr(d['endedReason']),
  };
}

/** `null` para tipo de evento desconhecido (servidor mais novo que a tela): fica fora da linha do tempo. */
export function arenaProfessorEventFromDoc(doc: QueryDocumentSnapshot | DocumentSnapshot): ArenaProfessorEvent | null {
  const d = (doc.data() ?? {}) as Record<string, unknown>;
  const eventType = d['eventType'];
  if (typeof eventType !== 'string' || !(EVENT_TYPES as readonly string[]).includes(eventType)) return null;
  const metadata = d['metadata'];
  return {
    id: doc.id,
    eventType: eventType as ProfessorEventType,
    actorName: optStr(d['actorName']) ?? '',
    actorRole: oneOf(d['actorRole'], ['ARENA', 'PROFESSOR', 'ADMIN', 'SYSTEM'] as const, 'SYSTEM'),
    reason: optStr(d['reason']),
    metadata: metadata != null && typeof metadata === 'object' && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : {},
    createdAt: toDate(d['createdAt']),
  };
}
