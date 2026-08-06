/**
 * Motivo que o organizador escreve ao remover um atleta da categoria.
 *
 * A remoção DELETA a inscrição, então o texto não tem onde morar do lado do
 * atleta: ele viaja na notificação (`users/{uid}/notifications`, que persiste) e
 * fica no doc de auditoria. Por isso é obrigatório — remover em silêncio é a
 * pior experiência possível pra quem perde a vaga.
 */

export const MIN_REMOVAL_DESCRIPTION_LENGTH = 10;
export const MAX_REMOVAL_DESCRIPTION_LENGTH = 500;

export type RemovalDescriptionResult =
  | {ok: true; value: string}
  | {ok: false; message: string};

export function parseRemovalDescription(
  raw: unknown,
): RemovalDescriptionResult {
  const value = typeof raw === "string" ? raw.trim() : "";

  if (value.length < MIN_REMOVAL_DESCRIPTION_LENGTH) {
    return {
      ok: false,
      message:
        "Escreva o motivo da remoção para o atleta " +
        `(mínimo ${MIN_REMOVAL_DESCRIPTION_LENGTH} caracteres).`,
    };
  }
  if (value.length > MAX_REMOVAL_DESCRIPTION_LENGTH) {
    return {
      ok: false,
      message:
        `O motivo deve ter no máximo ${MAX_REMOVAL_DESCRIPTION_LENGTH} caracteres.`,
    };
  }
  return {ok: true, value};
}

/**
 * Corpo da notificação: o motivo do organizador e, quando havia pagamento, o
 * aviso de reembolso. A plataforma não estorna — quem devolve é o organizador.
 */
export function buildRemovalNotificationBody(params: {
  description: string;
  wasPaid: boolean;
  refundAmount: number;
}): string {
  if (!params.wasPaid) return params.description;

  const refund = params.refundAmount > 0
    ? `Reembolso de R$ ${params.refundAmount.toFixed(2).replace(".", ",")} ` +
      "será tratado pelo organizador."
    : "Procure o organizador para tratar do reembolso.";

  return `${params.description} ${refund}`;
}
