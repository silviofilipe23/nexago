import { minutesToTime, timeToMinutes, WEEK_ORDER, WEEKDAY_SHORT, type Weekday } from './dates';
import type { CenterLocation, ContractWindow } from './models';

/** Link "Abrir no mapa" (sem mapa embutido: endereço é o que o centro cadastra). */
export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
}

/** "Ter, Qui · 18:00–22:00" (uma linha por janela). */
export function windowLabel(windows: readonly ContractWindow[]): string {
  if (windows.length === 0) return 'Sem janela contratada';
  return windows
    .map((w) => `${WEEK_ORDER.filter((d) => w.weekdays.includes(d)).map((d) => WEEKDAY_SHORT[d]).join(', ')} · ${w.start}–${w.end}`)
    .join(' / ');
}

/** "Sede Barra · Quadra 2" — o lugar como o aluno e a agenda mostram. */
export function placeLabel(p: { locationName: string; courtName: string }): string {
  return [p.locationName, p.courtName].filter(Boolean).join(' · ') || 'Local a definir';
}

/**
 * Dias em que o horário NÃO cabe na janela contratada do parceiro. Local próprio/avulso não tem
 * janela (sempre cabe); parceiro sem janela cadastrada também não restringe.
 */
export function daysOutsideWindow(
  location: Pick<CenterLocation, 'type' | 'windows'> | undefined,
  weekdays: readonly Weekday[],
  start: string,
  durationMin: number,
): Weekday[] {
  if (!location || location.type !== 'partner' || location.windows.length === 0) return [];
  const s = timeToMinutes(start);
  const e = s + durationMin;
  return weekdays.filter(
    (d) => !location.windows.some((w) => w.weekdays.includes(d) && timeToMinutes(w.start) <= s && e <= timeToMinutes(w.end)),
  );
}

/** Lê "18:00–22:00" (aceita "-" ou "–"). */
export function parseWindowTimes(raw: string): { start: string; end: string } | null {
  const m = raw.trim().match(/^([01]\d|2[0-3]):([0-5]\d)\s*[–-]\s*([01]\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  const start = `${m[1]}:${m[2]}`;
  const end = `${m[3]}:${m[4]}`;
  return timeToMinutes(end) > timeToMinutes(start) ? { start, end } : null;
}

export interface PlaceCheck {
  label: string;
  ok: boolean;
  detail: string;
}

interface DaySession {
  id: string;
  date: string;
  startTime: string;
  durationMin: number;
  coachUid: string;
  courtId: string;
  locationId: string;
  status: string;
  className: string;
}

/**
 * L3 — mudar o local de UMA aula: janela do parceiro, quadra livre (local próprio), agenda do
 * professor e deslocamento até/desde as aulas vizinhas dele em outro local.
 */
export function sessionMoveChecks(
  session: DaySession,
  target: { location: CenterLocation; courtId: string; courtName: string },
  sameDay: readonly DaySession[],
  travelBufferMin: number,
): PlaceCheck[] {
  const out: PlaceCheck[] = [];
  const { location } = target;
  const wd = new Date(`${session.date}T12:00:00Z`).getUTCDay() as Weekday;
  if (location.type === 'partner') {
    const outside = daysOutsideWindow(location, [wd], session.startTime, session.durationMin);
    out.push({
      label: `Janela contratada em ${location.name}`,
      ok: outside.length === 0,
      detail: outside.length === 0 ? `${windowLabel(location.windows)} · dentro` : `fora de ${windowLabel(location.windows)}`,
    });
  }
  const s0 = timeToMinutes(session.startTime);
  const s1 = s0 + session.durationMin;
  const others = sameDay.filter((o) => o.id !== session.id && o.date === session.date && o.status !== 'cancelled');
  if (location.type === 'own' && target.courtId) {
    const clash = others.find((o) => o.courtId === target.courtId && timeToMinutes(o.startTime) < s1 && s0 < timeToMinutes(o.startTime) + o.durationMin);
    out.push({
      label: `${target.courtName || 'Quadra'} livre`,
      ok: !clash,
      detail: clash ? `ocupada por ${clash.className} ${clash.startTime}` : 'livre no horário',
    });
  }
  const mine = others.filter((o) => o.coachUid && o.coachUid === session.coachUid);
  const overlap = mine.find((o) => timeToMinutes(o.startTime) < s1 && s0 < timeToMinutes(o.startTime) + o.durationMin);
  out.push({
    label: 'Agenda do professor',
    ok: !overlap,
    detail: overlap ? `dá ${overlap.className} ${overlap.startTime}` : `livre ${session.startTime}–${minutesToTime(s1)}`,
  });
  const tight = mine.find((o) => {
    if (o.locationId === location.id || !o.locationId) return false;
    const o0 = timeToMinutes(o.startTime);
    const o1 = o0 + o.durationMin;
    const gap = o1 <= s0 ? s0 - o1 : s1 <= o0 ? o0 - s1 : -1;
    return gap >= 0 && gap < travelBufferMin;
  });
  out.push({
    label: 'Deslocamento do professor',
    ok: !tight,
    detail: tight ? `${tight.className} ${tight.startTime} em outro local · menos de ${travelBufferMin} min` : `folga de ${travelBufferMin} min respeitada`,
  });
  return out;
}
