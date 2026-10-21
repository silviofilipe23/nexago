import { Timestamp, type DocumentSnapshot } from 'firebase/firestore';
import { dayMonthLabel, timeLabel, type ArenaProfessorLink, type ProfessorLinkStatus } from './arena-professor.model';

/** Canal arena ↔ professor (canvas D4) e comunicados da arena para os professores (F6), lado
 *  da arena. Backend: `functions/src/arena-professor-channel.ts` + `kind: "arena"` em
 *  `functions/src/professor-messages.ts`.
 *
 *  - Canal: `conversations/a_{arenaId}_{professorUid}`, mensagens em `messages`. Membros leem;
 *    ninguém grava direto — abrir/enviar/marcar lido só pelos callables.
 *  - Comunicados: `arenaProfessorNotices/{id}`; leitura por quem lê a área `perfil`.
 *
 *  Tudo aqui é puro (parse, rótulos, validação) para a tela ser testável sem Firebase. */

export const CHANNEL_MAX_TEXT = 2000;
export const NOTICE_MAX_TITLE = 80;
export const NOTICE_MAX_BODY = 2000;

/** Espelho de `arenaChannelConversationId` no servidor. */
export function arenaChannelConversationId(arenaId: string, professorUid: string): string {
  return `a_${arenaId}_${professorUid}`;
}

/** Espelho de `arenaProfessorLinkId` no servidor (`{arenaId}_{professorUid}`). */
export function arenaProfessorLinkIdOf(arenaId: string, professorUid: string): string {
  return `${arenaId}_${professorUid}`;
}

// ── Canal ─────────────────────────────────────────────────────────────────────

export interface ChannelMessage {
  id: string;
  senderUid: string;
  senderName: string;
  text: string;
  createdAt: Date | null;
  /** Resposta automática do professor (fora do horário de atendimento). */
  auto: boolean;
}

export interface ArenaChannel {
  id: string;
  arenaId: string;
  professorUid: string;
  linkId: string;
  memberIds: string[];
  memberNames: Record<string, string>;
  closed: boolean;
  lastAt: Date | null;
  lastMessage: { text: string; senderUid: string; senderName: string } | null;
  /** Contador de não lidas por membro. */
  unread: Record<string, number>;
}

/** O que a tela de mensagens pode fazer agora. */
export type ChannelState =
  /** Sem escrita em `perfil`: não é membro do canal. */
  | 'no-access'
  /** Vínculo não ativo e sem histórico para mostrar. */
  | 'inactive'
  /** Vínculo acabou (ou o canal foi fechado pelo servidor): histórico só leitura. */
  | 'closed'
  | 'open';

export function channelState(input: {
  canWrite: boolean;
  linkStatus: ProfessorLinkStatus;
  channel: ArenaChannel | null;
}): ChannelState {
  if (!input.canWrite) return 'no-access';
  if (input.linkStatus !== 'ACTIVE') return input.channel ? 'closed' : 'inactive';
  if (input.channel?.closed) return 'closed';
  return 'open';
}

/** Texto explicativo do estado (null quando o canal está aberto). */
export function channelStateNote(state: ChannelState, linkStatus: ProfessorLinkStatus, professorName: string): string | null {
  const first = professorName.trim().split(/\s+/)[0] || 'o professor';
  switch (state) {
    case 'no-access':
      return 'O canal com o professor é da gestão da arena: só quem pode editar Perfil conversa por aqui.';
    case 'inactive':
      return linkStatus === 'SUSPENDED'
        ? `O vínculo está suspenso. O canal com ${first} volta a funcionar quando ele for reativado.`
        : `O canal com ${first} abre quando o vínculo estiver ativo.`;
    case 'closed':
      return linkStatus === 'SUSPENDED'
        ? 'Vínculo suspenso: o canal está fechado. O histórico fica guardado e volta a valer na reativação.'
        : 'Canal encerrado: o vínculo acabou. O histórico fica guardado, mas ninguém escreve mais.';
    case 'open':
      return null;
  }
}

export function channelMessageFromDoc(snap: Pick<DocumentSnapshot, 'id' | 'data'>): ChannelMessage | null {
  const d = snap.data() ?? {};
  const text = str(d['text']);
  if (!text) return null;
  return {
    id: snap.id,
    senderUid: str(d['senderUid']),
    senderName: str(d['senderName']) || 'Participante',
    text,
    createdAt: toDate(d['createdAt']),
    auto: d['auto'] === true,
  };
}

export function arenaChannelFromDoc(snap: Pick<DocumentSnapshot, 'id' | 'data'>): ArenaChannel | null {
  const d = snap.data();
  if (!d || d['kind'] !== 'arena') return null;
  const arenaId = str(d['arenaId']);
  const professorUid = str(d['professorUid']);
  const last = d['lastMessage'];
  return {
    id: snap.id,
    arenaId,
    professorUid,
    linkId: str(d['linkId']) || arenaProfessorLinkIdOf(arenaId, professorUid),
    memberIds: Array.isArray(d['memberIds']) ? d['memberIds'].filter((m): m is string => typeof m === 'string') : [],
    memberNames: stringRecord(d['memberNames']),
    closed: d['closed'] === true,
    lastAt: toDate(d['lastAt']),
    lastMessage:
      last && typeof last === 'object' && str((last as Record<string, unknown>)['text'])
        ? {
            text: str((last as Record<string, unknown>)['text']),
            senderUid: str((last as Record<string, unknown>)['senderUid']),
            senderName: str((last as Record<string, unknown>)['senderName']),
          }
        : null,
    unread: numberRecord(d['unread']),
  };
}

export function unreadFor(channel: ArenaChannel | null, uid: string | null): number {
  if (!channel || !uid) return 0;
  return Math.max(0, channel.unread[uid] ?? 0);
}

/** Não lidas por vínculo (badge da lista de profissionais). Só entra quem tem algo pendente. */
export function unreadByLinkId(channels: readonly ArenaChannel[], uid: string | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of channels) {
    const n = unreadFor(c, uid);
    if (n > 0) out[c.linkId] = n;
  }
  return out;
}

/** `9+` acima de nove, como os badges do app. */
export function unreadBadge(n: number): string {
  return n > 9 ? '9+' : String(n);
}

export function sortMessagesAsc(messages: readonly ChannelMessage[]): ChannelMessage[] {
  // Sem `createdAt` (escrita pendente) vai pro fim: é a mais recente.
  return [...messages].sort((a, b) => (a.createdAt?.getTime() ?? Infinity) - (b.createdAt?.getTime() ?? Infinity));
}

export interface MessageDayGroup {
  key: string;
  label: string;
  messages: ChannelMessage[];
}

/** `HOJE`, `ONTEM` ou `18 out` — divisor entre os dias da conversa. */
export function messageDayLabel(date: Date, nowMs: number): string {
  const today = new Date(nowMs);
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diff = Math.round((startToday - startDay) / 86_400_000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  return dayMonthLabel(date, nowMs);
}

/** Mensagens em ordem cronológica, agrupadas por dia local. */
export function groupMessagesByDay(messages: readonly ChannelMessage[], nowMs: number): MessageDayGroup[] {
  const groups: MessageDayGroup[] = [];
  for (const m of sortMessagesAsc(messages)) {
    const at = m.createdAt ?? new Date(nowMs);
    const key = `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.messages.push(m);
    else groups.push({ key, label: messageDayLabel(at, nowMs), messages: [m] });
  }
  return groups;
}

export function messageTimeLabel(m: ChannelMessage): string {
  return m.createdAt ? timeLabel(m.createdAt) : 'enviando…';
}

/** Mostra o nome acima do balão quando muda o remetente (as minhas não levam nome). */
export function showSenderName(messages: readonly ChannelMessage[], index: number, myUid: string | null): boolean {
  const m = messages[index];
  if (!m || m.senderUid === myUid) return false;
  return index === 0 || messages[index - 1]!.senderUid !== m.senderUid;
}

/** Texto pronto para enviar, ou null se vazio/longo demais. */
export function composerText(raw: string): string | null {
  const text = raw.trim();
  return text && text.length <= CHANNEL_MAX_TEXT ? text : null;
}

// ── Comunicados ───────────────────────────────────────────────────────────────

export type ArenaNoticeKind = 'aviso' | 'agenda' | 'evento';

export const ARENA_NOTICE_KINDS: ReadonlyArray<{ id: ArenaNoticeKind; label: string; color: string }> = [
  { id: 'aviso', label: 'Aviso', color: '#F4C543' },
  { id: 'agenda', label: 'Agenda', color: '#5B9BFF' },
  { id: 'evento', label: 'Evento', color: '#2BD17E' },
];

export function noticeKindMeta(kind: ArenaNoticeKind): { id: ArenaNoticeKind; label: string; color: string } {
  return ARENA_NOTICE_KINDS.find((k) => k.id === kind) ?? ARENA_NOTICE_KINDS[0]!;
}

export interface ArenaProfessorNotice {
  id: string;
  arenaId: string;
  authorName: string;
  kind: ArenaNoticeKind;
  title: string;
  body: string;
  recipientIds: string[];
  recipientCount: number;
  readCount: number;
  sentAt: Date | null;
}

export function arenaProfessorNoticeFromDoc(snap: Pick<DocumentSnapshot, 'id' | 'data'>): ArenaProfessorNotice {
  const d = snap.data() ?? {};
  const recipientIds = Array.isArray(d['recipientIds']) ? d['recipientIds'].filter((r): r is string => typeof r === 'string') : [];
  const kind = str(d['kind']);
  return {
    id: snap.id,
    arenaId: str(d['arenaId']),
    authorName: str(d['authorName']) || 'Gestão',
    kind: (ARENA_NOTICE_KINDS.some((k) => k.id === kind) ? kind : 'aviso') as ArenaNoticeKind,
    title: str(d['title']),
    body: str(d['body']),
    recipientIds,
    recipientCount: num(d['recipientCount']) ?? recipientIds.length,
    readCount: num(d['readCount']) ?? 0,
    sentAt: toDate(d['sentAt']),
  };
}

/** `lidos 3 de 5` (nunca mais lidos que destinatários). */
export function noticeReadLabel(notice: Pick<ArenaProfessorNotice, 'readCount' | 'recipientCount'>): string {
  const total = Math.max(0, notice.recipientCount);
  return `lidos ${Math.min(Math.max(0, notice.readCount), total)} de ${total}`;
}

/** `21 out · 14:05`. */
export function noticeSentLabel(notice: Pick<ArenaProfessorNotice, 'sentAt'>, nowMs: number): string {
  return notice.sentAt ? `${dayMonthLabel(notice.sentAt, nowMs)} · ${timeLabel(notice.sentAt)}` : 'enviando…';
}

export interface NoticeRecipientOption {
  uid: string;
  name: string;
  photoUrl: string | null;
}

/** Quem pode receber: professores com vínculo ATIVO (a mesma régua do servidor), por nome. */
export function noticeRecipientOptions(links: readonly ArenaProfessorLink[]): NoticeRecipientOption[] {
  const seen = new Set<string>();
  const out: NoticeRecipientOption[] = [];
  for (const l of links) {
    if (l.status !== 'ACTIVE' || !l.professorUserId || seen.has(l.professorUserId)) continue;
    seen.add(l.professorUserId);
    out.push({ uid: l.professorUserId, name: l.professorName, photoUrl: l.professorPhotoUrl });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export interface NoticeDraft {
  kind: ArenaNoticeKind;
  title: string;
  body: string;
  /** `all` = todos os ativos (o servidor resolve); `pick` = só `picked`. */
  audience: 'all' | 'pick';
  picked: readonly string[];
}

export interface NoticeInput {
  arenaId: string;
  kind: ArenaNoticeKind;
  title: string;
  body: string;
  professorUids?: string[];
}

/** Erro de validação do rascunho (mesmas regras de `parseArenaNotice`), ou null. */
export function noticeDraftError(draft: NoticeDraft, activeCount: number): string | null {
  const title = draft.title.trim();
  const body = draft.body.trim();
  if (!title) return 'Dê um título ao comunicado.';
  if (title.length > NOTICE_MAX_TITLE) return `Título de até ${NOTICE_MAX_TITLE} caracteres.`;
  if (!body) return 'Escreva a mensagem.';
  if (body.length > NOTICE_MAX_BODY) return `Mensagem de até ${NOTICE_MAX_BODY} caracteres.`;
  if (activeCount === 0) return 'Nenhum professor com vínculo ativo para receber.';
  if (draft.audience === 'pick' && draft.picked.length === 0) return 'Escolha ao menos um professor.';
  return null;
}

/** Payload do callable `sendArenaProfessorNotice` — sem `professorUids` quando é para todos. */
export function noticeInput(arenaId: string, draft: NoticeDraft): NoticeInput {
  const input: NoticeInput = { arenaId, kind: draft.kind, title: draft.title.trim(), body: draft.body.trim() };
  if (draft.audience === 'pick') input.professorUids = [...new Set(draft.picked)];
  return input;
}

/** Quantos vão receber, para o botão e o resumo antes de enviar. */
export function noticeAudienceCount(draft: Pick<NoticeDraft, 'audience' | 'picked'>, activeCount: number): number {
  return draft.audience === 'all' ? activeCount : new Set(draft.picked).size;
}

// ── Parse ─────────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function toDate(v: unknown): Date | null {
  return v instanceof Timestamp ? v.toDate() : null;
}

function stringRecord(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object') return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x === 'string')) as Record<string, string>;
}

function numberRecord(v: unknown): Record<string, number> {
  if (!v || typeof v !== 'object') return {};
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x === 'number' && Number.isFinite(x)),
  ) as Record<string, number>;
}
