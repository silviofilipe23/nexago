import { httpsCallable, type Functions } from 'firebase/functions';
import type { ArenaOccupancyReport } from './occupancy-report.model';

export interface GetArenaOccupancyReportInput {
  arenaId: string;
  dateFrom: string;
  dateTo: string;
}

const GENERIC_MESSAGE = 'Não foi possível carregar o relatório de ocupação. Tente novamente.';

/** Códigos cuja mensagem do servidor já é um texto amigável em PT-BR (gate de plano, período
 *  inválido) — vale mostrar direto. Qualquer outro código (rede, internal, unauthenticated etc.)
 *  cai na mensagem genérica, pra nunca expor erro cru de Firebase pro gestor. */
const SERVER_MESSAGE_CODES = new Set(['functions/failed-precondition', 'functions/invalid-argument']);

/** `isPlanGate` distingue o `failed-precondition` de "arena não é Pro/Parceiro" (mensagem do
 *  servidor é exibida como CTA de upgrade) de qualquer outro erro. */
export class ArenaOccupancyReportError extends Error {
  constructor(
    message: string,
    readonly isPlanGate: boolean,
  ) {
    super(message);
  }
}

function mapError(err: unknown): ArenaOccupancyReportError {
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
  const isPlanGate = code === 'functions/failed-precondition';
  const useServerMessage = SERVER_MESSAGE_CODES.has(code);
  const message = useServerMessage && err instanceof Error && err.message ? err.message : GENERIC_MESSAGE;
  return new ArenaOccupancyReportError(message, isPlanGate);
}

/** Chama `getArenaOccupancyReport` — 100% agregação server-side (Admin SDK varre `arenaBookings`),
 *  não existe leitura direta equivalente no cliente. */
export async function fetchArenaOccupancyReport(functions: Functions, input: GetArenaOccupancyReportInput): Promise<ArenaOccupancyReport> {
  const call = httpsCallable<GetArenaOccupancyReportInput, ArenaOccupancyReport>(functions, 'getArenaOccupancyReport');
  try {
    const result = await call(input);
    return result.data;
  } catch (err) {
    throw mapError(err);
  }
}
