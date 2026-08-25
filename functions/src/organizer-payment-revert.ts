/**
 * Reverter a baixa manual de pagamento (`organizerConfirmRegistrationPayment`).
 *
 * O caso real: o organizador confirma o pagamento na dupla errada e precisa
 * voltar atrás. Só a baixa MANUAL é reversível — quando o dinheiro entrou pela
 * plataforma (Pix do app, webhook do Asaas) o doc registra um valor que existe
 * numa conta, e marcá-lo como não pago derrubaria a arrecadação do torneio sem
 * estorno nenhum do outro lado.
 *
 * Reverter devolve a inscrição ao estado ANTERIOR à confirmação, e não a um
 * "pendente" genérico: no modo direto o atleta declara o pagamento antes
 * (`declaredPaidAt`), e é a declaração que garante a vaga dele. Por isso a
 * confirmação guarda um retrato do estado (`paymentBeforeConfirm`) — sem ele,
 * reverter apagaria uma parcela já paga pelo app (`paidAmount`) e devolveria
 * como "pendente" quem estava na lista de espera.
 */
import {ORGANIZER_DIRECT_PAYMENT_METHOD} from "./organizer-category-ops-payments";

/** Campo do doc de inscrição onde o retrato do "antes" é guardado. */
export const PAYMENT_SNAPSHOT_FIELD = "paymentBeforeConfirm";

/** Estado do pagamento imediatamente antes da baixa manual. */
export interface PaymentSnapshot {
  isPaid: boolean;
  waitlist: boolean;
  /** `null` = campo ausente no doc. Zero é valor gravado (categoria gratuita). */
  paidAmount: number | null;
  paymentMethod: string | null;
  paymentVerifiedByOrganizer: boolean;
}

function methodOf(registration: Record<string, unknown>): string {
  return String(registration["paymentMethod"] ?? "").trim().toLowerCase();
}

export function paymentSnapshotOf(
  registration: Record<string, unknown>,
): PaymentSnapshot {
  const paidAmount = registration["paidAmount"];
  const method = typeof registration["paymentMethod"] === "string" ?
    registration["paymentMethod"].trim() :
    "";
  return {
    isPaid: registration["isPaid"] === true,
    waitlist: registration["waitlist"] === true,
    paidAmount: typeof paidAmount === "number" && Number.isFinite(paidAmount) ?
      paidAmount :
      null,
    paymentMethod: method || null,
    paymentVerifiedByOrganizer:
      registration["paymentVerifiedByOrganizer"] === true,
  };
}

/**
 * Confirmar de novo o que já está confirmado NÃO pode regravar o retrato: o
 * "antes" viraria o próprio pago, e a reversão não voltaria nada. Nesse caso o
 * retrato antigo (o do primeiro clique) é o que vale.
 */
export function shouldCapturePaymentSnapshot(
  registration: Record<string, unknown>,
): boolean {
  return !(
    registration["isPaid"] === true &&
    methodOf(registration) === ORGANIZER_DIRECT_PAYMENT_METHOD
  );
}

export type PaymentRevertBlock = "notPaid" | "notOrganizerPayment";

export const PAYMENT_REVERT_BLOCK_MESSAGE: Record<PaymentRevertBlock, string> = {
  notPaid: "Esta inscrição não está marcada como paga.",
  notOrganizerPayment:
    "Só a baixa manual do organizador pode ser revertida. Este pagamento " +
    "entrou por outro caminho (Pix pelo app ou categoria gratuita) — se " +
    "houver devolução, combine direto com o atleta.",
};

/** `null` = pode reverter. */
export function paymentRevertBlock(
  registration: Record<string, unknown>,
): PaymentRevertBlock | null {
  if (registration["isPaid"] !== true) return "notPaid";
  if (methodOf(registration) !== ORGANIZER_DIRECT_PAYMENT_METHOD) {
    return "notOrganizerPayment";
  }
  return null;
}

/** Situação em que a inscrição fica depois de reverter. */
export type PaymentRevertOutcome = "pending" | "toVerify" | "waitlist" | "paid";

export interface PaymentRevertPlan {
  /** Campos com valor novo. */
  set: Record<string, unknown>;
  /** Campos a apagar do doc (`FieldValue.delete()` de quem grava). */
  clear: string[];
  outcome: PaymentRevertOutcome;
}

/** O que a baixa manual escreveu e não guarda estado anterior nenhum. */
const ALWAYS_CLEARED = [
  "paidAt",
  "paymentVerifiedAt",
  "paymentVerifiedByUid",
  PAYMENT_SNAPSHOT_FIELD,
];

function snapshotFromField(value: unknown): PaymentSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return paymentSnapshotOf(value as Record<string, unknown>);
}

function outcomeOf(
  target: PaymentSnapshot,
  declared: boolean,
): PaymentRevertOutcome {
  // Declarado e sem baixa é exatamente o selo "A conferir": a vaga vale, mas
  // ninguém viu o dinheiro. É para cá que volta a confirmação do modo direto.
  if (target.isPaid) {
    return declared && !target.paymentVerifiedByOrganizer ? "toVerify" : "paid";
  }
  return target.waitlist ? "waitlist" : "pending";
}

export function buildPaymentRevertPlan(
  registration: Record<string, unknown>,
): PaymentRevertPlan {
  const declared = registration["declaredPaidAt"] != null;
  // Sem retrato (baixa anterior a este fluxo, ou inscrição que o organizador já
  // criou paga): a declaração do atleta é o único estado anterior conhecido —
  // ela mantém a vaga e devolve a inscrição para a fila de conferência.
  const target: PaymentSnapshot =
    snapshotFromField(registration[PAYMENT_SNAPSHOT_FIELD]) ?? {
      isPaid: declared,
      waitlist: registration["waitlist"] === true,
      paidAmount: null,
      paymentMethod: null,
      paymentVerifiedByOrganizer: false,
    };

  const set: Record<string, unknown> = {
    isPaid: target.isPaid,
    waitlist: target.waitlist,
    paymentVerifiedByOrganizer: target.paymentVerifiedByOrganizer,
  };
  const clear = [...ALWAYS_CLEARED];

  if (target.paidAmount == null) clear.push("paidAmount");
  else set["paidAmount"] = target.paidAmount;

  if (target.paymentMethod == null) clear.push("paymentMethod");
  else set["paymentMethod"] = target.paymentMethod;

  return {set, clear, outcome: outcomeOf(target, declared)};
}

/** Corpo da notificação que o atleta recebe — o organizador não escreve nada. */
export function buildPaymentRevertNotificationBody(params: {
  tournamentName: string;
  outcome: PaymentRevertOutcome;
}): string {
  const where = params.tournamentName.trim() ?
    ` em ${params.tournamentName.trim()}` :
    "";
  if (params.outcome === "toVerify") {
    return `O organizador desfez a confirmação do pagamento da sua inscrição${where}. ` +
      "A vaga continua sua e o pagamento voltou para conferência.";
  }
  return `O organizador desfez a confirmação do pagamento da sua inscrição${where}. ` +
    "A inscrição voltou a constar como não paga — fale com ele se isso não bate.";
}
