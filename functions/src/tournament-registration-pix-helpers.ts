import {
  TOURNAMENT_REGISTRATION_PAYMENT_REF_PREFIX,
} from "./arena-booking-payment-constants";
import {roundMoney} from "./mercadopago-arena-helpers";

const TEAM_SIZE = 2;

export type ParsedTournamentRegistrationPaymentRef = {
  registrationId: string;
  payerUid: string;
};

/** Monta `externalReference` Asaas para parcela de inscrição. */
export function buildTournamentRegistrationExternalReference(
  registrationId: string,
  payerUid: string,
): string {
  return `${TOURNAMENT_REGISTRATION_PAYMENT_REF_PREFIX}${registrationId}:${payerUid}`;
}

/** Extrai ids de `tournamentRegistration:{registrationId}:{payerUid}`. */
export function parseTournamentRegistrationExternalReference(
  externalRef: string,
): ParsedTournamentRegistrationPaymentRef | null {
  const trimmed = externalRef.trim();
  if (!trimmed.startsWith(TOURNAMENT_REGISTRATION_PAYMENT_REF_PREFIX)) {
    return null;
  }
  const rest = trimmed.slice(TOURNAMENT_REGISTRATION_PAYMENT_REF_PREFIX.length);
  const colon = rest.indexOf(":");
  if (colon <= 0) return null;
  const registrationId = rest.slice(0, colon).trim();
  const payerUid = rest.slice(colon + 1).trim();
  if (!registrationId || !payerUid) return null;
  return {registrationId, payerUid};
}

/** Parcela por atleta (metade da taxa de inscrição da dupla). */
export function computeTournamentShareAmountReais(entryFee: number): number {
  if (!Number.isFinite(entryFee) || entryFee <= 0) return 0;
  return roundMoney(entryFee / TEAM_SIZE);
}

export type TournamentChargeAmountType = "share" | "full";

/**
 * Valor a cobrar de um atleta conforme o tipo:
 * - "share": parcela (metade da taxa).
 * - "full": a dupla inteira (um atleta paga por ambos).
 */
export function resolveTournamentChargeReais(
  entryFee: number,
  amountType: TournamentChargeAmountType,
): number {
  if (!Number.isFinite(entryFee) || entryFee <= 0) return 0;
  if (amountType === "full") return roundMoney(entryFee);
  return computeTournamentShareAmountReais(entryFee);
}

/**
 * 'full' só é permitido quando ainda não há pagamento parcial, para não cobrar
 * a mais (parceiro já pagou parcela + alguém paga a dupla = cobrança dupla).
 */
export function canChargeTournamentFull(params: {
  paidAmount: number;
  sharePaidUids: string[];
}): boolean {
  return (params.paidAmount || 0) <= 0.001 && params.sharePaidUids.length === 0;
}

/**
 * Crédito a aplicar e se a dupla fica confirmada após um pagamento.
 * 'full' topa o valor até a taxa cheia e confirma a inscrição;
 * 'share' credita uma parcela.
 */
export function resolveTournamentRegistrationCredit(params: {
  entryFee: number;
  amountType: TournamentChargeAmountType;
  currentPaidAmount: number;
}): {credit: number; newPaidAmount: number; isPaid: boolean} {
  const entryFee = Math.max(0, Number(params.entryFee) || 0);
  const current = Math.max(0, Number(params.currentPaidAmount) || 0);
  const credit = params.amountType === "full" ?
    roundMoney(Math.max(0, entryFee - current)) :
    computeTournamentShareAmountReais(entryFee);
  const newPaidAmount = roundMoney(current + credit);
  const isPaid = entryFee > 0 && newPaidAmount >= entryFee - 0.01;
  return {credit, newPaidAmount, isPaid};
}

export function sharePaidUidsFromRegistration(
  data: Record<string, unknown>,
): string[] {
  const raw = data.sharePaidUids;
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
}

/** Inscrição gratuita: dupla confirmada quando os dois atletas constam em sharePaidUids. */
export function isFreeRegistrationFullyConfirmed(
  teamUids: string[],
  sharePaidUids: string[],
): boolean {
  const uniqueTeamUids = teamUids
    .map((id) => id.trim())
    .filter((id, idx, arr) => id.length > 0 && arr.indexOf(id) === idx);
  if (uniqueTeamUids.length < TEAM_SIZE) return false;
  return uniqueTeamUids.every((uid) => sharePaidUids.includes(uid));
}

export type AthleteGenderBucket = "M" | "F";

/** Normaliza `users/{uid}.gender` para comparação da dupla. */
export function normalizeAthleteGenderBucket(
  raw: string | undefined | null,
): AthleteGenderBucket | null {
  const g = (raw ?? "").trim().toLowerCase();
  if (!g) return null;
  if (
    g === "masculino" ||
    g === "m" ||
    g === "male" ||
    g === "homem"
  ) {
    return "M";
  }
  if (
    g === "feminino" ||
    g === "f" ||
    g === "female" ||
    g === "mulher"
  ) {
    return "F";
  }
  return null;
}

/**
 * Gênero da equipe após pagamento completo:
 * dois masculinos → Masculino; duas femininas → Feminino; misto → Misto.
 */
export function computeTeamGenderLabel(
  player1Gender: AthleteGenderBucket | null,
  player2Gender: AthleteGenderBucket | null,
): "Masculino" | "Feminino" | "Misto" | null {
  if (!player1Gender || !player2Gender) return null;
  if (player1Gender === player2Gender) {
    return player1Gender === "M" ? "Masculino" : "Feminino";
  }
  return "Misto";
}
