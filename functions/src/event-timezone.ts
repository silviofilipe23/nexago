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

/** `HH:mm` na parede de São Paulo (nunca usar `Date.getHours` cru — vira UTC). */
export function eventTimeLabel(d: Date): string {
  return d.toLocaleTimeString("pt-BR", {
    timeZone: EVENT_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Data civil (`YYYY-MM-DD`) de campo gravado como DATA, como `startAt`/`endAt` de torneio. Os
 * wizards gravam a meia-noite do aparelho de quem criou: 03:00Z num aparelho no Brasil, 00:00Z num
 * aparelho em UTC (emulador, organizador fora do país) e no legado. Meia-noite UTC exata vale pela
 * data UTC; o resto, pelo calendário de São Paulo. Mesma regra de `tournamentEventDateLocal` no app.
 */
export function dayKeyFromStoredEventDate(d: Date): string {
  const utcMidnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
  return utcMidnight ? d.toISOString().slice(0, 10) : dayKeyFromEventDate(d);
}
