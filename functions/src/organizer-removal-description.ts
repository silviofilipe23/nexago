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
 * Telefone em dígitos (`5511988887777`) no formato que o atleta lê. Fora do
 * padrão brasileiro, devolve o que veio — melhor um número estranho do que
 * nenhum.
 */
export function formatPhoneForReading(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const local = digits.startsWith("55") ? digits.slice(2) : digits;
  if (local.length !== 10 && local.length !== 11) return phone;

  const ddd = local.slice(0, 2);
  const rest = local.slice(2);
  const cut = rest.length - 4;
  return `(${ddd}) ${rest.slice(0, cut)}-${rest.slice(cut)}`;
}

/**
 * Corpo da notificação: o motivo do organizador, o aviso de reembolso quando
 * havia pagamento e com quem falar. A plataforma não estorna — quem devolve é o
 * organizador —, e a inscrição já foi deletada, então o canal de contato tem
 * que vir junto: sem ele o atleta lê o motivo e não tem a quem responder.
 */
export function buildRemovalNotificationBody(params: {
  description: string;
  wasPaid: boolean;
  refundAmount: number;
  organizerPhone?: string;
}): string {
  const parts = [params.description];

  if (params.wasPaid) {
    parts.push(
      params.refundAmount > 0
        ? `Reembolso de R$ ${params.refundAmount.toFixed(2).replace(".", ",")} ` +
          "será tratado pelo organizador."
        : "Procure o organizador para tratar do reembolso.",
    );
  }

  const phone = formatPhoneForReading(params.organizerPhone ?? "");
  if (phone) parts.push(`Fale com o organizador: ${phone}.`);

  return parts.join(" ");
}
