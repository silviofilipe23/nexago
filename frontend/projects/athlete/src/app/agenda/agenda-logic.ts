import type { AgendaDayGroup, AgendaEvent } from './athlete-agenda.models';

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function addDays(base: Date, delta: number): Date {
  const x = new Date(base);
  x.setDate(x.getDate() + delta);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function dateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function shortWeekday(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(d).replace('.', '');
}

export function dayGroupLabel(day: Date, today: Date): string {
  const key = isoDate(day);
  const dm = `${pad2(day.getDate())}/${pad2(day.getMonth() + 1)}`;
  const weekdayLower = shortWeekday(day).toLowerCase();
  if (key === isoDate(today)) return `Hoje · ${weekdayLower} ${dm}`;
  if (key === isoDate(addDays(today, 1))) return `Amanhã · ${weekdayLower} ${dm}`;
  const weekdayCap = weekdayLower.charAt(0).toUpperCase() + weekdayLower.slice(1);
  return `${weekdayCap} · ${dm}`;
}

export function eventCountLabel(n: number): string {
  return `${n} evento${n === 1 ? '' : 's'}`;
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'agora';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `próximo em ${m} min`;
  return `próximo em ${h}h ${pad2(m)}min`;
}

export function groupEventsByDay(events: readonly AgendaEvent[], today: Date): AgendaDayGroup[] {
  const byKey = new Map<string, AgendaEvent[]>();
  for (const ev of [...events].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())) {
    const key = isoDate(ev.startsAt);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(ev);
    else byKey.set(key, [ev]);
  }
  return [...byKey.entries()].map(([key, dayEvents]) => ({
    key,
    label: dayGroupLabel(dayEvents[0]!.startsAt, today),
    events: dayEvents,
  }));
}

function icsDate(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  );
}

function icsEscape(text: string): string {
  return text.replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
}

export function buildIcsCalendar(events: readonly AgendaEvent[]): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//nexaGO//Agenda//PT-BR'];
  const stamp = icsDate(new Date());
  for (const ev of events) {
    const end = new Date(ev.startsAt.getTime() + ev.durationMin * 60000);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.id}@nexago.app`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(ev.startsAt)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsEscape(ev.title)}`,
      `DESCRIPTION:${icsEscape(ev.subtitle)}`,
      `LOCATION:${icsEscape(ev.location)}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

// --- Reserva (arenaBookings) → evento de agenda ---

export interface BookingRaw {
  id: string;
  arenaName: string | null;
  courtName: string | null;
  dateKey: string;
  startTime: string;
  endTime: string;
  status: string;
  paymentStatus: string;
  amountReais: number;
}

function isCanceled(status: string): boolean {
  return status === 'canceled' || status === 'cancelled';
}

function minutesOfDay(time: string): number {
  const [h, m] = time.split(':').map((n) => Number(n) || 0);
  return (h ?? 0) * 60 + (m ?? 0);
}

function dateFromKeyAndTime(dateKey: string, time: string): Date | null {
  const [y, mo, d] = dateKey.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  if (!y || !mo || !d) return null;
  return new Date(y, mo - 1, d, h || 0, mi || 0, 0, 0);
}

/** Reservas canceladas somem da agenda. Pura — sem Firestore. */
export function buildBookingEvent(booking: BookingRaw, now: Date = new Date()): AgendaEvent | null {
  if (isCanceled(booking.status)) return null;

  const startsAt = dateFromKeyAndTime(booking.dateKey, booking.startTime);
  if (!startsAt) return null;

  const durationMin = Math.max(0, minutesOfDay(booking.endTime) - minutesOfDay(booking.startTime));
  const endsAt = new Date(startsAt.getTime() + durationMin * 60000);

  const isPendingPayment = booking.paymentStatus === 'pending' || booking.paymentStatus === 'partial';
  const isHappeningNow = now.getTime() >= startsAt.getTime() && now.getTime() < endsAt.getTime();

  const statusTone: AgendaEvent['statusTone'] = isHappeningNow ? 'live' : isPendingPayment ? 'warning' : 'confirmed';
  const statusLabel = isHappeningNow ? 'Agora' : isPendingPayment ? 'Pagamento pendente' : 'Confirmada';

  return {
    id: booking.id,
    startsAt,
    durationMin,
    title: `${booking.arenaName ?? 'Arena'} · ${booking.courtName ?? 'Quadra'}`,
    subtitle: booking.arenaName ?? 'Arena',
    location: booking.arenaName ?? 'Arena',
    statusLabel,
    statusTone,
  };
}
