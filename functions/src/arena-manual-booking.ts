import {HttpsError} from "firebase-functions/v2/https";
import {isValidDateKey, toMinutes} from "./arena-recurring-booking";

/** Reserva avulsa criada pelo gestor no balcão (sem app do atleta no meio).
 *  Mesma forma de documento do horário fixo — ver
 *  `materializeSeriesOccurrences` em arena-recurring-booking.ts. */

export interface ManualBookingInput {
  arenaId?: string;
  courtId?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  athleteId?: string | null;
  customerName?: string | null;
  amountReais?: number;
  note?: string | null;
}

export interface ValidManualBooking {
  arenaId: string;
  courtId: string;
  dateKey: string;
  startTime: string;
  endTime: string;
  athleteId: string | null;
  customerName: string | null;
  amountReais: number;
  note: string | null;
}

/** "9:00" → "09:00"; "10:00:00" → "10:00"; lixo → null. */
function normalizeTime(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1] ?? "", 10);
  const min = parseInt(m[2] ?? "", 10);
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  if (h > 24 || min > 59) return null;
  if (h === 24 && min !== 0) return null;
  return `${h.toString().padStart(2, "0")}:${m[2]}`;
}

function trimmedOrNull(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

/**
 * Valida e normaliza o payload da reserva de balcão.
 *
 * Sobre a data: **dia passado é recusado** — registro retroativo criaria lock e
 * presença para horário vencido, e não é o problema desta entrega. Mas **hora
 * passada no dia de hoje é aceita**: o cliente que chega 19h05 e paga o horário
 * das 19h é o caso comum do balcão.
 */
export function validateManualBookingInput(
  input: ManualBookingInput,
  todayKey: string,
): ValidManualBooking {
  const arenaId = input.arenaId?.trim() ?? "";
  const courtId = input.courtId?.trim() ?? "";
  if (!arenaId || !courtId) {
    throw new HttpsError("invalid-argument", "Dados da reserva inválidos.");
  }

  const dateKey = (input.date ?? "").trim().substring(0, 10);
  if (!isValidDateKey(dateKey)) {
    throw new HttpsError("invalid-argument", "Dados da reserva inválidos.");
  }
  if (dateKey < todayKey) {
    throw new HttpsError(
      "invalid-argument",
      "Não dá pra criar reserva em data passada.",
    );
  }

  const startTime = normalizeTime(input.startTime);
  const endTime = normalizeTime(input.endTime);
  if (!startTime || !endTime) {
    throw new HttpsError("invalid-argument", "Intervalo de horário inválido.");
  }
  const startMin = toMinutes(startTime);
  let endMin = toMinutes(endTime);
  if (endMin === 0 && startMin > 0) endMin = 24 * 60;
  if (endMin <= startMin) {
    throw new HttpsError("invalid-argument", "Intervalo de horário inválido.");
  }

  const athleteId = trimmedOrNull(input.athleteId);
  const customerName = trimmedOrNull(input.customerName);
  if (!athleteId && !customerName) {
    throw new HttpsError(
      "invalid-argument",
      "Informe o atleta ou o nome do cliente.",
    );
  }

  const amountReais = Number(input.amountReais);
  if (!Number.isFinite(amountReais) || amountReais < 0) {
    throw new HttpsError("invalid-argument", "Valor inválido.");
  }

  return {
    arenaId,
    courtId,
    dateKey,
    startTime,
    endTime,
    athleteId,
    customerName,
    amountReais,
    note: trimmedOrNull(input.note),
  };
}
