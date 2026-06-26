export const EVENT_TIME_ZONE = "America/Sao_Paulo";

/** `YYYY-MM-DD` no calendário de São Paulo. */
export function dayKeyFromEventDate(d: Date): string {
  return d.toLocaleDateString("en-CA", {timeZone: EVENT_TIME_ZONE});
}

/** Parede SP (dayKey + hora) → instante UTC. */
export function eventDateFromDayKeyAndTime(
  dayKey: string,
  hour: number,
  minute: number,
): Date {
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return new Date(`${dayKey}T${hh}:${mm}:00-03:00`);
}
