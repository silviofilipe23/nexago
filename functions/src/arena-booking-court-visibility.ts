/**
 * Quando o atleta vê a quadra da reserva (arena "a arena define a quadra",
 * `docs/product/reservas-por-capacidade.md`). Puro e sem dependências pesadas: usado por push,
 * lembretes, convites e cobrança — tudo que escreve o nome da quadra para o atleta.
 */
import {arenaBookingStartAt} from "./arena-booking-start-at";
import {parseDateKeyFromBooking} from "./slot-vacancy-alerts";

/** Texto no lugar da quadra enquanto ela não aparece para o atleta. */
export const COURT_ON_ARRIVAL_LABEL = "Quadra definida na chegada";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * O atleta pode ver a quadra da reserva? Mesma regra do app e do portal do atleta.
 * - Sem quadra definida (`unassigned`): não — a provisória pode mudar.
 * - Definida pela recepção antes da chegada, numa arena que não mostra a quadra antes
 *   (`revealCourtBeforeArrival: false`, copiado na criação): só a partir do início da reserva.
 * - O resto (legado, escolhida pelo atleta, lida no QR): sim. Puro.
 */
export function athleteSeesBookingCourt(booking: Record<string, unknown>, nowMs: number): boolean {
  if (booking["allocationStatus"] === "unassigned") return false;
  if (booking["revealCourtBeforeArrival"] !== false) return true;
  if (booking["allocationSource"] !== "staff") return true;
  const dateKey = parseDateKeyFromBooking(booking["date"]);
  const startTime = str(booking["startTime"]);
  if (!dateKey || startTime.length < 4) return true;
  return nowMs >= arenaBookingStartAt(dateKey, startTime).getTime();
}

/** Nome da quadra para textos ao atleta: o nome, ou [COURT_ON_ARRIVAL_LABEL] se ainda não aparece. */
export function athleteCourtLabel(
  booking: Record<string, unknown>,
  nowMs: number,
  fallback = "Quadra",
): string {
  if (!athleteSeesBookingCourt(booking, nowMs)) return COURT_ON_ARRIVAL_LABEL;
  return str(booking["courtName"]) || str(booking["court"]) || fallback;
}
