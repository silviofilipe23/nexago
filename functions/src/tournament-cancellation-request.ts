/**
 * Lógica pura do PEDIDO de cancelamento ao organizador — o caminho da inscrição
 * COM pagamento (a sem pagamento o atleta cancela direto, em
 * tournament-registration-cancellation.ts).
 *
 * A plataforma não estorna nada: o pedido só libera a vaga quando aprovado; a
 * devolução do valor é combinada entre atleta e organizador fora da plataforma.
 */
import {sharePaidUidsFromRegistration} from "./tournament-registration-pix-helpers";

export type CancellationRequestStatus = "pending" | "declined";

export type CancellationRequestBlockReason = "notPaid" | "alreadyPending";

export const CANCELLATION_REQUEST_BLOCK_MESSAGES: Record<
  CancellationRequestBlockReason,
  string
> = {
  notPaid:
    "Esta inscrição ainda não tem pagamento — cancele direto, sem precisar do organizador.",
  alreadyPending:
    "Você já tem um pedido de cancelamento aguardando resposta do organizador.",
};

export interface CancellationRequest {
  status: CancellationRequestStatus;
  reason: string;
  requestedBy: string;
  respondedBy: string | null;
  responseNote: string;
}

function isCancellationRequestStatus(
  value: unknown,
): value is CancellationRequestStatus {
  return value === "pending" || value === "declined";
}

/**
 * Lê o mapa `cancellationRequest` do doc. Inscrição antiga (sem o campo), lixo
 * ou status desconhecido contam como "sem pedido" — nunca quebram a leitura.
 */
export function parseCancellationRequest(
  registration: Record<string, unknown>,
): CancellationRequest | null {
  const raw = registration.cancellationRequest;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  if (!isCancellationRequestStatus(data.status)) return null;
  return {
    status: data.status,
    reason: typeof data.reason === "string" ? data.reason : "",
    requestedBy: typeof data.requestedBy === "string" ? data.requestedBy : "",
    respondedBy: typeof data.respondedBy === "string" ? data.respondedBy : null,
    responseNote:
      typeof data.responseNote === "string" ? data.responseNote : "",
  };
}

/** Inscrição paga (ou meio-paga) e sem pedido pendente pode pedir cancelamento. */
export function cancellationRequestBlockReason(
  registration: Record<string, unknown>,
): CancellationRequestBlockReason | null {
  const hasPayment =
    registration.isPaid === true ||
    sharePaidUidsFromRegistration(registration).length > 0 ||
    (Number(registration.paidAmount) || 0) > 0;
  if (!hasPayment) return "notPaid";
  if (parseCancellationRequest(registration)?.status === "pending") {
    return "alreadyPending";
  }
  return null;
}

export function buildCancellationRequest(params: {
  reason: string;
  requestedBy: string;
}): CancellationRequest {
  return {
    status: "pending",
    reason: params.reason.trim(),
    requestedBy: params.requestedBy,
    respondedBy: null,
    responseNote: "",
  };
}

/** Recusa: o pedido original é preservado para o atleta ver o que respondeu. */
export function buildCancellationDecline(params: {
  request: CancellationRequest;
  respondedBy: string;
  note: string;
}): CancellationRequest {
  return {
    ...params.request,
    status: "declined",
    respondedBy: params.respondedBy,
    responseNote: params.note.trim(),
  };
}

/** Telefone BR pronto para `wa.me` (sem inventar DDI em número curto). */
export function normalizePhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55")) return digits;
  if (digits.length >= 10) return `55${digits}`;
  return digits;
}
