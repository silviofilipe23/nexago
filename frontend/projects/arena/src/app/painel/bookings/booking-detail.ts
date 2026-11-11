import type { PillTone } from '../ui/pill.component';
import { formatBRL, type ArenaBooking } from './arena-booking.model';

/** Detalhe da reserva (canvas "Reserva · detalhe completo"): tudo puro, a tela e os testes usam direto. */

/** Lotação da reserva com convite: o dono + 3 (`arena-booking-invite.ts`). */
export const BOOKING_MAX_PLAYERS = 4;

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function minutesOf(time: string): number | null {
  const [h, m] = time.split(':').map(Number);
  if (h == null || Number.isNaN(h) || m == null || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function dateOf(dateKey: string): Date | null {
  const [y, m, d] = dateKey.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

/** Início e fim reais; fim "00:00" (ou antes do início) é a virada da meia-noite. */
export function bookingWindow(b: Pick<ArenaBooking, 'dateKey' | 'startTime' | 'endTime'>): { start: Date; end: Date } | null {
  const day = dateOf(b.dateKey);
  const s = minutesOf(b.startTime);
  let e = minutesOf(b.endTime);
  if (!day || s == null || e == null) return null;
  if (e <= s) e += 24 * 60;
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, s);
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, e);
  return { start, end };
}

/** "Quarta · 18 de novembro de 2026". */
export function longDateLabel(dateKey: string): string {
  const d = dateOf(dateKey);
  if (!d) return dateKey;
  return `${WEEKDAYS[d.getDay()]} · ${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
}

/** "1h30", "1h", "45 min". */
export function durationLabel(startTime: string, endTime: string): string {
  const s = minutesOf(startTime);
  let e = minutesOf(endTime);
  if (s == null || e == null) return '';
  if (e <= s) e += 24 * 60;
  const total = e - s;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

/** "25 min", "3h", "3h20". */
function spanLabel(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

export interface BookingLiveState {
  headline: string;
  detail: string;
  /** 0–1 enquanto o horário corre; `null` antes ou depois. */
  progress: number | null;
  tone: 'upcoming' | 'live' | 'done' | 'canceled';
}

function isCanceled(status: string): boolean {
  const s = status.toLowerCase().trim();
  return s === 'canceled' || s === 'cancelled';
}

/** O que a recepção precisa saber agora: falta quanto, está rolando, já acabou. */
export function bookingLiveState(b: Pick<ArenaBooking, 'dateKey' | 'startTime' | 'endTime' | 'status' | 'attendanceStatus'>, now: Date): BookingLiveState {
  if (isCanceled(b.status)) {
    return { headline: 'Cancelada', detail: 'O horário voltou a ficar disponível na agenda.', progress: null, tone: 'canceled' };
  }
  const w = bookingWindow(b);
  if (!w) return { headline: '—', detail: 'Reserva sem horário válido.', progress: null, tone: 'done' };
  const t = now.getTime();
  if (t < w.start.getTime()) {
    const left = w.start.getTime() - t;
    const days = Math.floor((w.start.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000);
    const headline = days >= 2 ? `Daqui a ${days} dias` : days === 1 && left > 6 * 3_600_000 ? 'Amanhã' : `Começa em ${spanLabel(left)}`;
    const detail =
      left <= 20 * 60_000 ? 'A janela de check-in da recepção já está aberta.' : 'O check-in da recepção abre 20 min antes do início.';
    return { headline, detail, progress: null, tone: 'upcoming' };
  }
  if (t < w.end.getTime()) {
    const progress = (t - w.start.getTime()) / (w.end.getTime() - w.start.getTime());
    const detail =
      b.attendanceStatus === 'checked_in' ? `Termina em ${spanLabel(w.end.getTime() - t)}.` : `Termina em ${spanLabel(w.end.getTime() - t)} · ainda sem check-in.`;
    return { headline: 'Em andamento', detail, progress, tone: 'live' };
  }
  const detail = b.attendanceStatus === 'no_show' ? 'Marcada como falta.' : b.attendanceStatus === 'checked_in' ? 'Jogo encerrado, com check-in.' : 'Jogo encerrado.';
  return { headline: 'Encerrada', detail, progress: null, tone: 'done' };
}

/** Situação do pagamento em português, com o tom da pill. `none` no local = paga na recepção. */
export function paymentStatusView(status: string | null, channel: string | null): { label: string; tone: PillTone } {
  switch (status) {
    case 'paid':
      return { label: 'Pago', tone: 'green' };
    case 'pending':
      return { label: 'Pagamento pendente', tone: 'yellow' };
    case 'split_pending':
      return { label: 'Divisão pendente', tone: 'yellow' };
    case 'partial':
      return { label: 'Pago em parte', tone: 'yellow' };
    case 'refunded':
      return { label: 'Estornado', tone: 'dim' };
    default:
      return channel === 'onsite' ? { label: 'Paga no local', tone: 'orange' } : { label: 'Sem cobrança', tone: 'dim' };
  }
}

/** Tipo da reserva numa palavra — o mesmo critério das travas de troca de quadra. */
export function bookingKindLabel(b: Pick<ArenaBooking, 'classSessionId' | 'clubSessionId' | 'scheduleSubscriptionId' | 'isRecurring'>): string {
  if (b.classSessionId) return 'Aula';
  if (b.clubSessionId) return 'Clubinho';
  if (b.scheduleSubscriptionId) return 'Plano de horário';
  if (b.isRecurring) return 'Horário fixo';
  return 'Avulsa';
}

/** Reserva que aceita convidados (dono atleta, avulsa): mostra as vagas livres até lotar. */
export function bookingTakesGuests(b: Pick<ArenaBooking, 'athleteId' | 'classSessionId' | 'clubSessionId' | 'scheduleSubscriptionId' | 'status'>): boolean {
  if (!b.athleteId || b.classSessionId || b.clubSessionId || b.scheduleSubscriptionId) return false;
  const s = b.status.toLowerCase().trim();
  return s !== 'pending_payment' && !isCanceled(s);
}

/** Valor por jogador, quando faz sentido dividir (valor > 0 e mais de um confirmado). */
export function perPlayerLabel(amountReais: number | null, players: number): string | null {
  if (amountReais == null || amountReais <= 0 || players < 2) return null;
  return formatBRL(Math.round((amountReais / players) * 100) / 100);
}

export interface TimelineEvent {
  at: Date;
  title: string;
  detail: string | null;
  tone: 'orange' | 'green' | 'yellow' | 'red' | 'dim';
}

/** Linha do tempo com o que o doc registra, da mais antiga à mais nova. Evento sem hora fica de fora. */
export function bookingTimeline(b: ArenaBooking, ownerName: string): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  if (b.createdAt) {
    events.push({ at: b.createdAt, title: 'Reserva criada', detail: b.athleteId ? ownerName : b.customerName ? `Na recepção · ${b.customerName}` : null, tone: 'orange' });
  }
  for (const p of b.participants ?? []) {
    if (!p.joinedAt) continue;
    events.push({ at: p.joinedAt, title: `${p.name} entrou`, detail: p.via === 'link' ? 'Pelo link da reserva' : 'Por convite do responsável', tone: 'dim' });
  }
  for (const c of b.courtHistory ?? []) {
    if (!c.at) continue;
    events.push({ at: c.at, title: `Quadra trocada: ${c.fromCourtName} → ${c.toCourtName}`, detail: c.reason ? `Motivo: ${c.reason}` : null, tone: 'yellow' });
  }
  if (b.checkedInAt && b.attendanceStatus === 'checked_in') {
    events.push({ at: b.checkedInAt, title: 'Check-in feito', detail: null, tone: 'green' });
  }
  if (b.canceledAt && isCanceled(b.status)) {
    events.push({ at: b.canceledAt, title: 'Reserva cancelada', detail: b.cancelReason ? `Motivo: ${b.cancelReason}` : null, tone: 'red' });
  }
  return events.sort((x, y) => x.at.getTime() - y.at.getTime());
}

/** "09/11 · 18:02". */
export function timelineWhen(at: Date): string {
  const dd = String(at.getDate()).padStart(2, '0');
  const mm = String(at.getMonth() + 1).padStart(2, '0');
  const hh = String(at.getHours()).padStart(2, '0');
  const mi = String(at.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} · ${hh}:${mi}`;
}
