import { Timestamp, type QueryDocumentSnapshot } from 'firebase/firestore';
import { courtSportLabel } from '@nexago/arena-discovery';

/** Espelha `nexago_app/.../arena/domain/arena_manager_booking.dart` — schema de `arenaBookings`
 *  (coleção top-level, uma reserva de quadra por documento). */

export type ArenaBookingViewMode = 'today' | 'tomorrow' | 'upcoming' | 'past';

export const BOOKING_VIEW_MODE_LABEL: Record<ArenaBookingViewMode, string> = {
  today: 'Hoje',
  tomorrow: 'Amanhã',
  upcoming: 'Futuras',
  past: 'Passadas',
};

export type ArenaBookingAttendanceStatus = 'pending' | 'confirmed' | 'checked_in' | 'no_show' | string;

/** Tipo do vínculo professor ↔ arena carimbado na reserva (`professorRelationshipType`). */
export type ProfessorBookingType = 'ARENA_STAFF' | 'INDEPENDENT';

export interface ArenaBooking {
  id: string;
  arenaId: string;
  athleteId: string;
  courtId: string;
  courtName: string;
  /** Esporte que o atleta escolheu ao reservar (`sport`), já como rótulo — `null` em reserva
   *  antiga, manual, de aula ou de horário fixo. */
  sportLabel: string | null;
  /** `YYYY-MM-DD` */
  dateKey: string;
  startTime: string;
  endTime: string;
  status: string;
  attendanceStatus: ArenaBookingAttendanceStatus;
  customerName: string | null;
  isRecurring: boolean;
  recurringBookingId: string | null;
  /** Bloqueio de quadra de uma aula (módulo Aulas) — id da aula em `arenaClassSessions`. */
  classSessionId: string | null;
  /** Código do esporte da reserva (`sport`, ex. `beachTennis`) — filtra as quadras na troca de quadra. */
  sportCode: string | null;
  /** Ocorrência de clubinho / plano de horário: a série manda nas travas, troca de quadra é pela tela dela. */
  clubSessionId: string | null;
  scheduleSubscriptionId: string | null;
  /** Arena "a arena define a quadra": `unassigned` = quadra provisória, a recepção define na
   *  chegada. `null` em arena no modo de sempre. */
  allocationStatus: 'unassigned' | 'assigned' | null;
  amountReais: number | null;
  paymentChannel: string | null;
  paymentStatus: string | null;
  confirmedParticipants: number;
  canceledAt: Date | null;
  cancelReason: string | null;
  createdAt: Date | null;
  couponCode: string | null;
  couponDiscountReais: number | null;
  /** Reserva feita como professor (`bookedAs: "professor"`): `createArenaBooking` carimba quando o
   *  vínculo com a arena libera "Reservar quadras" e o professor escolhe reservar assim. O
   *  carimbo é o fato da hora da reserva — suspender o vínculo depois não o apaga. */
  bookedAsProfessor: boolean;
  /** Tipo do vínculo naquele momento — `null` em reserva de atleta (ou carimbo sem tipo). */
  professorRelationshipType: ProfessorBookingType | null;
  /** Desconto do professor no aluguel (% do vínculo) — só gravado quando venceu a promoção/cupom;
   *  0 sem desconto ou em reserva de atleta. */
  professorDiscountPercent: number;
  professorDiscountReais: number | null;
  /** Preço por perfil (aluno/professor validado pela arena) — nome do perfil quando venceu
   *  promoção/cupom; `null` no preço avulso. */
  athletePricingLabel?: string | null;
  athletePricingDiscountReais?: number | null;
  /** Mensalista: minutos que saíram do banco de horas do contrato (0 = não usou). */
  memberHoursMinutes?: number;
  memberHoursDiscountReais?: number | null;
  /** Quem joga além do dono (`participants`, gravado só pelo servidor ao aceitar convite). */
  participants?: BookingParticipant[];
  /** Quem está no placar do pós-jogo (`resultPlayers`, espelho gravado só pelo servidor ao salvar o
   *  placar). Não inclui o dono; pode repetir quem entrou por convite (a tela não duplica). */
  resultPlayers?: BookingResultPlayer[];
  /** Trocas de quadra (`courtHistory`, as últimas que o servidor guarda), da mais antiga à mais nova. */
  courtHistory?: BookingCourtChange[];
  /** Hora do check-in (`checkedInAt`) — pelo QR da quadra ou pela recepção. */
  checkedInAt?: Date | null;
  /** Minutos que vieram do plano de horário no modo livre (`scheduleFlexMinutes`): não remarca. */
  scheduleFlexMinutes?: number;
  /** A arena liberou o horário por chuva e o atleta ainda não escolheu (`weatherRelease.status`). */
  weatherPendingChoice?: boolean;
}

export interface BookingParticipant {
  uid: string;
  name: string;
  avatarUrl: string | null;
  /** `link` = entrou pelo link compartilhado; `direct` = convite direto do dono. */
  via: 'link' | 'direct';
  joinedAt: Date | null;
}

export interface BookingResultPlayer {
  uid: string;
  name: string;
  avatarUrl: string | null;
}

export interface BookingCourtChange {
  fromCourtName: string;
  toCourtName: string;
  at: Date | null;
  reason: string | null;
}

function participantsFrom(raw: unknown): BookingParticipant[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: BookingParticipant[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    const uid = optionalTrimmed(item['uid']);
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    out.push({
      uid,
      name: optionalTrimmed(item['name']) ?? 'Atleta',
      avatarUrl: optionalTrimmed(item['avatarUrl']),
      via: item['via'] === 'link' ? 'link' : 'direct',
      joinedAt: toDate(item['joinedAt']),
    });
  }
  return out;
}

function resultPlayersFrom(raw: unknown): BookingResultPlayer[] {
  return participantsFrom(raw).map(({ uid, name, avatarUrl }) => ({ uid, name, avatarUrl }));
}

function courtHistoryFrom(raw: unknown): BookingCourtChange[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
    .map((e) => ({
      fromCourtName: optionalTrimmed(e['fromCourtName']) ?? optionalTrimmed(e['fromCourtId']) ?? 'Quadra',
      toCourtName: optionalTrimmed(e['toCourtName']) ?? optionalTrimmed(e['toCourtId']) ?? 'Quadra',
      at: toDate(e['at']),
      reason: optionalTrimmed(e['reason']),
    }));
}

function timeStr(v: unknown): string {
  if (typeof v !== 'string') return '--:--';
  const t = v.trim();
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function toDate(v: unknown): Date | null {
  return v instanceof Timestamp ? v.toDate() : null;
}

function dateKeyFromDynamic(v: unknown): string {
  if (typeof v === 'string') return v.length >= 10 ? v.slice(0, 10) : v;
  if (v instanceof Timestamp) return v.toDate().toISOString().slice(0, 10);
  return '';
}

function optionalTrimmed(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

export function arenaBookingFromDoc(doc: QueryDocumentSnapshot): ArenaBooking {
  const d = doc.data() as Record<string, unknown>;
  const courtId = optionalTrimmed(d['courtId']) ?? '';
  const courtNameLabel = optionalTrimmed(d['courtName']) ?? optionalTrimmed(d['court']);
  const amount = d['amountReais'] ?? d['priceReais'] ?? d['price'];

  return {
    id: doc.id,
    arenaId: typeof d['arenaId'] === 'string' ? d['arenaId'] : '',
    athleteId: optionalTrimmed(d['athleteId']) ?? optionalTrimmed(d['bookingAthleteId']) ?? '',
    courtId,
    courtName: courtNameLabel && courtNameLabel !== courtId ? courtNameLabel : 'Quadra',
    sportLabel: courtSportLabel(optionalTrimmed(d['sport'])) || null,
    dateKey: dateKeyFromDynamic(d['date']),
    startTime: timeStr(d['startTime']),
    endTime: timeStr(d['endTime']),
    status: typeof d['status'] === 'string' ? d['status'] : 'active',
    attendanceStatus: (typeof d['attendanceStatus'] === 'string' ? d['attendanceStatus'].trim().toLowerCase() : '') || 'pending',
    customerName: optionalTrimmed(d['customerName']),
    isRecurring: d['isRecurring'] === true || optionalTrimmed(d['recurringBookingId']) != null,
    recurringBookingId: optionalTrimmed(d['recurringBookingId']),
    classSessionId: d['isClassSession'] === true ? optionalTrimmed(d['classSessionId']) ?? doc.id : null,
    sportCode: optionalTrimmed(d['sport']),
    clubSessionId: optionalTrimmed(d['clubSessionId']),
    scheduleSubscriptionId: optionalTrimmed(d['scheduleSubscriptionId']),
    allocationStatus: d['allocationStatus'] === 'unassigned' ? 'unassigned' : d['allocationStatus'] === 'assigned' ? 'assigned' : null,
    amountReais: typeof amount === 'number' ? amount : null,
    paymentChannel: optionalTrimmed(d['paymentChannel']),
    paymentStatus: optionalTrimmed(d['paymentStatus']),
    confirmedParticipants: typeof d['confirmedParticipants'] === 'number' ? d['confirmedParticipants'] : 1,
    canceledAt: toDate(d['canceledAt']),
    cancelReason: optionalTrimmed(d['cancelReason']),
    createdAt: toDate(d['createdAt']),
    couponCode: optionalTrimmed(d['couponCode']),
    couponDiscountReais: typeof d['couponDiscountReais'] === 'number' ? d['couponDiscountReais'] : null,
    ...professorBookingFields(d),
    ...athletePricingFields(d),
    ...memberHoursFields(d),
    participants: participantsFrom(d['participants']),
    resultPlayers: resultPlayersFrom(d['resultPlayers']),
    courtHistory: courtHistoryFrom(d['courtHistory']),
    checkedInAt: toDate(d['checkedInAt']),
    scheduleFlexMinutes: typeof d['scheduleFlexMinutes'] === 'number' ? d['scheduleFlexMinutes'] : 0,
    weatherPendingChoice: (d['weatherRelease'] as Record<string, unknown> | undefined)?.['status'] === 'pending_choice',
  };
}

type ProfessorBookingFields = Pick<
  ArenaBooking,
  'bookedAsProfessor' | 'professorRelationshipType' | 'professorDiscountPercent' | 'professorDiscountReais'
>;

export function memberHoursFields(d: Record<string, unknown>): Pick<ArenaBooking, 'memberHoursMinutes' | 'memberHoursDiscountReais'> {
  const minutes = d['memberHoursMinutes'];
  const reais = d['memberHoursDiscountReais'];
  if (typeof minutes !== 'number' || minutes <= 0) return { memberHoursMinutes: 0, memberHoursDiscountReais: null };
  return {
    memberHoursMinutes: Math.round(minutes),
    memberHoursDiscountReais: typeof reais === 'number' && reais > 0 ? reais : null,
  };
}

/** 90 → "1h30", 60 → "1h", 30 → "30min". */
export function formatMemberMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}min`;
  return rest ? `${h}h${String(rest).padStart(2, '0')}` : `${h}h`;
}

function athletePricingFields(d: Record<string, unknown>): Pick<ArenaBooking, 'athletePricingLabel' | 'athletePricingDiscountReais'> {
  const tier = d['athletePricingTier'];
  if (tier !== 'student' && tier !== 'professor') return { athletePricingLabel: null, athletePricingDiscountReais: null };
  const label = d['athletePricingLabel'];
  const reais = d['athletePricingDiscountReais'];
  return {
    athletePricingLabel: typeof label === 'string' && label.trim() ? label.trim() : tier === 'student' ? 'Aluno' : 'Professor',
    athletePricingDiscountReais: typeof reais === 'number' && reais > 0 ? reais : null,
  };
}

function professorBookingFields(d: Record<string, unknown>): ProfessorBookingFields {
  if (d['bookedAs'] !== 'professor') {
    return { bookedAsProfessor: false, professorRelationshipType: null, professorDiscountPercent: 0, professorDiscountReais: null };
  }
  const type = d['professorRelationshipType'];
  const percent = d['professorDiscountPercent'];
  const reais = d['professorDiscountReais'];
  return {
    bookedAsProfessor: true,
    professorRelationshipType: type === 'ARENA_STAFF' || type === 'INDEPENDENT' ? type : null,
    professorDiscountPercent: typeof percent === 'number' && percent > 0 ? Math.round(percent) : 0,
    professorDiscountReais: typeof reais === 'number' && reais > 0 ? reais : null,
  };
}

/** "−20%" no detalhe da reserva de professor com desconto; `null` sem desconto. */
export function professorDiscountLabel(booking: Pick<ArenaBooking, 'bookedAsProfessor' | 'professorDiscountPercent'>): string | null {
  return booking.bookedAsProfessor && booking.professorDiscountPercent > 0 ? `−${booking.professorDiscountPercent}%` : null;
}

/** Selo curto da reserva de professor na agenda e na lista. */
export const PROFESSOR_BOOKING_TAG = 'Professor';
/** Na grade da semana a coluna é estreita demais para "Professor". */
export const PROFESSOR_BOOKING_TAG_SHORT = 'Prof';

/** "Professor · equipe da arena" / "Professor · independente" (mesmo texto do app,
 *  `arenaBookingProfessorLabel`). `null` na reserva de atleta, que é tudo o que existia antes. */
export function professorBookingLabel(
  booking: Pick<ArenaBooking, 'bookedAsProfessor' | 'professorRelationshipType'>,
): string | null {
  if (!booking.bookedAsProfessor) return null;
  switch (booking.professorRelationshipType) {
    case 'ARENA_STAFF':
      return 'Professor · equipe da arena';
    case 'INDEPENDENT':
      return 'Professor · independente';
    default:
      return 'Professor';
  }
}

/** Quadra como a equipe vê: a provisória da reserva sem quadra definida vem marcada. */
export function bookingCourtLabel(booking: Pick<ArenaBooking, 'courtName' | 'allocationStatus'>): string {
  return booking.allocationStatus === 'unassigned' ? `${booking.courtName} (provisória)` : booking.courtName;
}

export function enrichCourtName(booking: ArenaBooking, namesByCourtId: ReadonlyMap<string, string>): ArenaBooking {
  const resolved = namesByCourtId.get(booking.courtId)?.trim();
  if (!resolved || resolved === booking.courtName) return booking;
  return { ...booking, courtName: resolved };
}

function isCancelStatus(status: string): boolean {
  const s = status.toLowerCase().trim();
  return s === 'canceled' || s === 'cancelled';
}

export function bookingIsActive(booking: Pick<ArenaBooking, 'status'>): boolean {
  return !isCancelStatus(booking.status);
}

export function bookingCanCancel(booking: Pick<ArenaBooking, 'status'> & Partial<Pick<ArenaBooking, 'classSessionId'>>): boolean {
  // Bloqueio de aula só se cancela pela própria aula (a rule recusa o resto).
  if (booking.classSessionId != null) return false;
  const s = booking.status.toLowerCase().trim();
  return s !== 'canceled' && s !== 'cancelled' && s !== 'completed';
}

/** Espelha `arenaBookingShowsCheckInAction` (Flutter) — mesmas condições de visibilidade. */
export function bookingShowsCheckInAction(booking: Pick<ArenaBooking, 'status' | 'attendanceStatus'>): boolean {
  if (!bookingCanCancel(booking)) return false;
  return booking.attendanceStatus !== 'checked_in' && booking.attendanceStatus !== 'no_show';
}

export const ATTENDANCE_LABEL: Record<string, string> = {
  checked_in: 'Check-in feito',
  confirmed: 'Confirmado',
  no_show: 'No-show',
  pending: 'Pendente',
  canceled: 'Cancelado',
};

export function attendanceLabel(status: string): string {
  return ATTENDANCE_LABEL[status] ?? 'Pendente';
}

export function bookingStatusLabel(status: string): string {
  const s = status.toLowerCase().trim();
  if (s === 'cancelled' || s === 'canceled') return 'Cancelada';
  if (s === 'completed') return 'Concluída';
  if (s === 'pending_payment') return 'Aguardando pagamento';
  return 'Ativa';
}

export function displayBookingCode(id: string): string {
  const trimmed = id.trim();
  const tail = trimmed.length <= 5 ? trimmed : trimmed.slice(-5);
  return `#NXG-${tail}`.toUpperCase();
}

export function formatBRL(value: number | null): string {
  if (value == null) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const WEEKDAY_FORMAT = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' });
const DAY_MONTH_FORMAT = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long' });

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

function parseDateKey(dateKey: string): Date | null {
  if (dateKey.length < 10) return null;
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function sectionTitleForDateKey(dateKey: string, reference = new Date()): string {
  const d = parseDateKey(dateKey);
  if (!d) return dateKey;
  const todayKey = dateKeyOf(reference);
  const tomorrowKey = dateKeyOf(new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() + 1));
  const weekdayLong = capitalize(WEEKDAY_FORMAT.format(d));
  const dayMonth = capitalize(DAY_MONTH_FORMAT.format(d));
  if (dateKey === todayKey) return `Hoje · ${weekdayLong}`;
  if (dateKey === tomorrowKey) return `Amanhã · ${weekdayLong}`;
  return `${weekdayLong} · ${dayMonth}`;
}

export function dateKeyOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
