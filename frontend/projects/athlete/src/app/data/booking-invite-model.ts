/** Convite para jogar numa reserva de quadra — regras puras, sem Firestore.
 *
 *  Espelha `nexago_app/lib/features/athlete/domain/booking_invite_status.dart` e
 *  `booking_invite_links.dart`; o servidor (`functions/src/arena-booking-invite.ts`) é a
 *  autoridade e revalida tudo na callable. Desenho em
 *  `docs/superpowers/specs/2026-10-19-convite-jogadores-reserva-design.md`. */

/** Dono + 3 — o mesmo `BOOKING_MAX_PLAYERS` (functions) e `kBookingMaxPlayers` (app). */
export const BOOKING_MAX_PLAYERS = 4;

/** O link vai para o portal: o Android abre o app (App Link) e o iOS também, com o
 *  `/convite/*` no `apple-app-site-association`. Fixo, como no app: o link sai do portal
 *  de produção mesmo quando quem compartilha está no localhost. */
const ATHLETE_PORTAL_URL = 'https://atleta.nexago.com.br';

/** `bookingInvites/{id}`, gravado só pelas callables.
 *  - `{bookingId}_{uid}`: convite de UM atleta (direto, ou a entrada dele pelo link);
 *  - `link_{bookingId}`: link multiuso (`kind: 'link'`, `status: 'open'`, sem `inviteeUid`).
 *  Docs do app 1.0.1 não têm `kind` nem `inviteeUid`. */
export interface BookingInvite {
  id: string;
  bookingId: string;
  arenaId: string;
  arenaName: string;
  courtName: string;
  /** `YYYY-MM-DD` */
  date: string;
  startTime: string;
  endTime: string;
  invitedByUid: string;
  invitedByName: string;
  /** `pending` | `accepted` | `declined` | `canceled` | `left` | `removed`; `open` no link. */
  status: string;
  /** `direct` | `link` — canal do último convite/entrada. */
  kind: string;
  inviteeUid: string | null;
  inviteeName: string | null;
  inviteeAvatarUrl: string | null;
  createdAt: Date | null;
  /** Fim do horário da reserva (convites novos) ou criação + 48h (legado). */
  expiresAt: Date | null;
}

/** Quem entrou no jogo — `arenaBookings/{id}.participants`, gravado só pelo servidor. */
export interface BookingParticipant {
  uid: string;
  name: string;
  avatarUrl: string | null;
  via: 'direct' | 'link';
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toDate(value: unknown): Date | null {
  const t = value as { toDate?: () => Date } | null | undefined;
  return typeof t?.toDate === 'function' ? t.toDate() : null;
}

export function bookingInviteFromDoc(id: string, data: Record<string, unknown>): BookingInvite {
  const createdAt = toDate(data['createdAt']);
  return {
    id,
    bookingId: text(data['bookingId']) ?? '',
    arenaId: text(data['arenaId']) ?? '',
    arenaName: text(data['arenaName']) ?? '',
    courtName: text(data['courtName']) ?? '',
    date: (text(data['date']) ?? '').slice(0, 10),
    startTime: (text(data['startTime']) ?? '').slice(0, 5),
    endTime: (text(data['endTime']) ?? '').slice(0, 5),
    invitedByUid: text(data['invitedByUid']) ?? '',
    invitedByName: text(data['invitedByName']) ?? '',
    status: text(data['status']) ?? 'pending',
    kind: text(data['kind']) ?? 'direct',
    inviteeUid: text(data['inviteeUid']),
    inviteeName: text(data['inviteeName']),
    inviteeAvatarUrl: text(data['inviteeAvatarUrl']),
    createdAt,
    expiresAt:
      toDate(data['expiresAt']) ?? (createdAt ? new Date(createdAt.getTime() + 48 * 3_600_000) : null),
  };
}

/** Link multiuso da reserva (não é de um atleta específico). */
export function bookingInviteIsShareLink(invite: Pick<BookingInvite, 'kind' | 'inviteeUid'>): boolean {
  return invite.kind === 'link' && !invite.inviteeUid;
}

/** Lista de quem joga, sem repetir uid (entradas sem `uid` ficam de fora, como no servidor). */
export function bookingParticipantsOf(raw: unknown): BookingParticipant[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: BookingParticipant[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    const uid = text(item['uid']);
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    out.push({
      uid,
      name: text(item['name']) ?? 'Atleta',
      avatarUrl: text(item['avatarUrl']),
      via: item['via'] === 'link' ? 'link' : 'direct',
    });
  }
  return out;
}

/** O que `/convite/:inviteId` mostra para quem abriu. */
export type BookingInviteGate =
  /** Sem sessão: pede login para responder (a rota tem `authGuard`, então só por segurança). */
  | 'signIn'
  /** Quem abriu é o dono da reserva (abriu o próprio link). */
  | 'owner'
  /** Já está na lista do jogo. */
  | 'joined'
  /** Pode aceitar (e recusar, se o convite é direto). */
  | 'respond'
  /** Não dá mais — `message` explica. */
  | 'blocked';

export interface BookingInviteGateResult {
  gate: BookingInviteGate;
  message: string | null;
}

/** Campos da reserva que a regra lê (o doc cru, como o app passa). */
export interface BookingInviteGateBooking {
  status: string;
  ownerUid: string | null;
  participantUids: readonly string[];
}

const BLOCKED_BY_STATUS: Record<string, string> = {
  accepted: 'Este convite já foi aceito.',
  declined: 'Você recusou este convite.',
  canceled: 'Este convite foi cancelado.',
  left: 'Você saiu deste jogo.',
  removed: 'Você não está mais neste jogo.',
};

function blocked(message: string): BookingInviteGateResult {
  return { gate: 'blocked', message };
}

function bookingIsCanceled(status: string): boolean {
  const s = status.trim().toLowerCase();
  return s === 'canceled' || s === 'cancelled';
}

/** Estado da tela do convite — mesma ordem de `resolveBookingInviteGate` do app.
 *  `booking` null = a reserva não existe mais; `viewerUid` null = sem sessão. Bloqueios que
 *  valem para qualquer um (reserva cancelada, convite encerrado) vêm antes de pedir login. */
export function resolveBookingInviteGate(params: {
  invite: BookingInvite;
  booking: BookingInviteGateBooking | null;
  viewerUid: string | null;
  now?: Date;
}): BookingInviteGateResult {
  const { invite, booking } = params;
  if (!booking || bookingIsCanceled(booking.status)) return blocked('Esta reserva foi cancelada.');

  const viewer = params.viewerUid?.trim() ?? '';
  if (viewer) {
    if (viewer === booking.ownerUid) return { gate: 'owner', message: null };
    if (booking.participantUids.includes(viewer)) return { gate: 'joined', message: null };
  }

  const now = params.now ?? new Date();
  if (invite.expiresAt && now.getTime() > invite.expiresAt.getTime()) return blocked('Este convite expirou.');
  if (invite.status !== 'pending' && invite.status !== 'open') {
    return blocked(BLOCKED_BY_STATUS[invite.status] ?? 'Este convite não está mais disponível.');
  }

  if (viewer && !bookingInviteIsShareLink(invite) && invite.inviteeUid && invite.inviteeUid !== viewer) {
    return blocked('Este convite é para outro atleta.');
  }
  if (booking.participantUids.length + 1 >= BOOKING_MAX_PLAYERS) return blocked('A quadra já está completa.');
  if (!viewer) return { gate: 'signIn', message: null };
  return { gate: 'respond', message: null };
}

export function bookingInviteUrl(inviteId: string): string {
  return `${ATHLETE_PORTAL_URL}/convite/${encodeURIComponent(inviteId)}`;
}

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'] as const;

/** "sábado, 24/10 às 19:00" a partir de `YYYY-MM-DD` + `HH:MM` (horário de parede da reserva,
 *  sem passar por fuso). Sem data legível, só o horário. */
export function bookingInviteWhenLabel(date: string, startTime: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim().slice(0, 10));
  const start = startTime.trim().slice(0, 5);
  if (!match) return start;
  const [, y, m, d] = match;
  const weekday = WEEKDAYS[new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))).getUTCDay()];
  return /^\d{2}:\d{2}$/.test(start) ? `${weekday}, ${d}/${m} às ${start}` : `${weekday}, ${d}/${m}`;
}

/** Texto do link compartilhado (WhatsApp etc.) — o mesmo `bookingInviteShareMessage` do app. */
export function bookingInviteShareMessage(params: {
  arenaName: string;
  date: string;
  startTime: string;
  inviteId: string;
  openSlots?: number;
}): string {
  const arena = params.arenaName.trim() ? `na ${params.arenaName.trim()}` : 'na arena';
  const open = params.openSlots ?? 0;
  const slots = open <= 0 ? '' : open === 1 ? ' Falta 1 pra fechar o jogo.' : ` Faltam ${open} pra fechar o jogo.`;
  return (
    `Bora jogar? Tenho quadra ${arena}, ${bookingInviteWhenLabel(params.date, params.startTime)}.` +
    `${slots} Confirma sua vaga pelo nexaGO: ${bookingInviteUrl(params.inviteId)}`
  );
}
