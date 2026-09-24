/** Lógica pura do formulário de reserva de balcão. Espelha
 *  `validateManualBookingInput` (functions/src/arena-manual-booking.ts): o servidor
 *  segue sendo a autoridade, isto aqui é feedback imediato pro gestor. */

export interface ManualBookingFormState {
  courtId: string;
  dateKey: string;
  startTime: string;
  endTime: string;
  athleteId: string | null;
  customerName: string;
  amountText: string;
  note: string;
}

export interface ManualBookingPayload {
  arenaId: string;
  courtId: string;
  date: string;
  startTime: string;
  endTime: string;
  athleteId?: string;
  customerName?: string;
  amountReais: number;
  note?: string;
}

export type ManualBookingFormResult =
  | { ok: true; payload: ManualBookingPayload }
  | { ok: false; error: string };

function minutesOf(time: string): number | null {
  const m = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

/** Intervalo em minutos, tratando 00:00 como meia-noite do dia seguinte. */
function spanOf(startTime: string, endTime: string): { start: number; end: number } | null {
  const start = minutesOf(startTime);
  const rawEnd = minutesOf(endTime);
  if (start == null || rawEnd == null) return null;
  const end = rawEnd === 0 && start > 0 ? 24 * 60 : rawEnd;
  if (end <= start) return null;
  return { start, end };
}

/** "120,50" e "120.50" viram 120.5; vazio ou texto viram null.
 *  Ponto é separador de milhar quando não há vírgula e o texto termina em grupo(s)
 *  de 3 dígitos — "1.200" é mil e duzentos, não 1,2 (espelha `panel-recurring.component.ts`).
 *  Sem essa distinção "120.50" (2 dígitos, decimal de fato) quebraria. */
export function parseAmountText(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hasComma = trimmed.includes(',');
  const isThousandGrouped = !hasComma && /\.\d{3}(?:\.\d{3})*$/.test(trimmed);
  const normalized = hasComma
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : isThousandGrouped
      ? trimmed.replace(/\./g, '')
      : trimmed;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Identidade da cotação: muda só quando algo que altera o preço muda. Null
 *  enquanto a seleção não estiver completa — aí não vale chamar a callable. */
export function quoteKeyOf(
  state: Pick<ManualBookingFormState, 'courtId' | 'dateKey' | 'startTime' | 'endTime'>,
): string | null {
  if (!state.courtId.trim() || state.dateKey.length < 10) return null;
  if (!spanOf(state.startTime, state.endTime)) return null;
  return `${state.courtId}|${state.dateKey}|${state.startTime}|${state.endTime}`;
}

export function validateManualBookingForm(
  state: ManualBookingFormState,
  arenaId: string,
  todayKey: string,
): ManualBookingFormResult {
  const courtId = state.courtId.trim();
  if (!courtId) return { ok: false, error: 'Escolha a quadra.' };

  if (state.dateKey.length < 10) return { ok: false, error: 'Escolha a data.' };
  if (state.dateKey < todayKey) {
    return { ok: false, error: 'Não dá pra criar reserva em data passada.' };
  }

  if (!spanOf(state.startTime, state.endTime)) {
    return { ok: false, error: 'O horário de fim precisa ser depois do início.' };
  }

  const athleteId = state.athleteId?.trim() || null;
  const customerName = state.customerName.trim();
  if (!athleteId && !customerName) {
    return { ok: false, error: 'Informe o atleta ou o nome do cliente.' };
  }

  const amountReais = parseAmountText(state.amountText);
  if (amountReais == null || amountReais < 0) {
    return { ok: false, error: 'Informe um valor válido.' };
  }

  const note = state.note.trim();

  return {
    ok: true,
    payload: {
      arenaId,
      courtId,
      date: state.dateKey,
      startTime: state.startTime,
      endTime: state.endTime,
      amountReais,
      ...(athleteId ? { athleteId } : {}),
      ...(customerName ? { customerName } : {}),
      ...(note ? { note } : {}),
    },
  };
}
