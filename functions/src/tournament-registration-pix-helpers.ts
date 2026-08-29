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
 * Crédito a aplicar e se a inscrição fica confirmada após um pagamento.
 * 'full' topa o valor até a taxa cheia e confirma a inscrição;
 * 'share' credita uma parcela — metade da taxa (dupla) ou, quando
 * `shareCreditReais` é informado (categoria de equipe, cota dinâmica), o valor
 * realmente pago, limitado ao que falta.
 */
export function resolveTournamentRegistrationCredit(params: {
  entryFee: number;
  amountType: TournamentChargeAmountType;
  currentPaidAmount: number;
  shareCreditReais?: number;
}): {credit: number; newPaidAmount: number; isPaid: boolean} {
  const entryFee = Math.max(0, Number(params.entryFee) || 0);
  const current = Math.max(0, Number(params.currentPaidAmount) || 0);
  const shareCredit =
    params.shareCreditReais != null && Number.isFinite(params.shareCreditReais)
      ? roundMoney(
          Math.min(
            Math.max(0, params.shareCreditReais),
            Math.max(0, entryFee - current),
          ),
        )
      : computeTournamentShareAmountReais(entryFee);
  const credit = params.amountType === "full" ?
    roundMoney(Math.max(0, entryFee - current)) :
    shareCredit;
  const newPaidAmount = roundMoney(current + credit);
  const isPaid = entryFee > 0 && newPaidAmount >= entryFee - 0.01;
  return {credit, newPaidAmount, isPaid};
}

/**
 * uids dos atletas da inscrição. Usa o time quando existir (dupla / solo
 * legado / equipe nomeada com `memberUids`); senão deriva da própria inscrição
 * (solo novo, sem equipe ainda): `player1Id` + `participantUids`.
 */
export function registrationAthleteUids(
  registration: Record<string, unknown>,
  team: Record<string, unknown> | null | undefined,
): string[] {
  const out = new Set<string>();
  if (team) {
    const memberUids = Array.isArray(team.memberUids) ? team.memberUids : [];
    for (const id of [...memberUids, team.player1Id, team.player2Id]) {
      if (typeof id === "string" && id.trim()) out.add(id.trim());
    }
    return [...out];
  }
  const p1 = registration.player1Id;
  if (typeof p1 === "string" && p1.trim()) out.add(p1.trim());
  const parts = registration.participantUids;
  if (Array.isArray(parts)) {
    for (const p of parts) {
      if (typeof p === "string" && p.trim()) out.add(p.trim());
    }
  }
  return [...out];
}

export function sharePaidUidsFromRegistration(
  data: Record<string, unknown>,
): string[] {
  const raw = data.sharePaidUids;
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
}

/**
 * Inscrição gratuita: confirmada quando o elenco está completo (`expectedSize`
 * atletas — dupla por padrão, 3–5 em categoria de equipe) e todos constam em
 * `sharePaidUids`.
 */
export function isFreeRegistrationFullyConfirmed(
  teamUids: string[],
  sharePaidUids: string[],
  expectedSize: number = TEAM_SIZE,
): boolean {
  const uniqueTeamUids = teamUids
    .map((id) => id.trim())
    .filter((id, idx, arr) => id.length > 0 && arr.indexOf(id) === idx);
  if (uniqueTeamUids.length < Math.max(TEAM_SIZE, expectedSize)) return false;
  return uniqueTeamUids.every((uid) => sharePaidUids.includes(uid));
}

/**
 * Declaração direta ("já paguei ao organizador"): o que marcar conforme o
 * tipo. 'share' marca só o declarante e a inscrição fecha quando o elenco
 * inteiro declarar; 'full' fecha a inscrição na hora — é o caminho do solo
 * garantir a vaga pagando o valor integral (o parceiro que aceitar o convite
 * depois entra sem taxa, herdando `sharePaidUids` no aceite).
 */
export function resolveDirectReservationMarks(params: {
  amountType: TournamentChargeAmountType;
  callerUid: string;
  teamUids: string[];
  sharePaidUids: string[];
  expectedSize: number;
}): {uidsToMark: string[]; registrationClosed: boolean} {
  if (params.amountType === "full") {
    const uids = new Set(
      [...params.teamUids, params.callerUid]
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    );
    return {uidsToMark: [...uids], registrationClosed: true};
  }
  return {
    uidsToMark: [params.callerUid],
    registrationClosed: isFreeRegistrationFullyConfirmed(
      params.teamUids,
      [...params.sharePaidUids, params.callerUid],
      params.expectedSize,
    ),
  };
}

export const TOURNAMENT_PAYMENT_MODE_DIRECT_ORGANIZER = "directWithOrganizer";

export function isDirectWithOrganizerPaymentMode(paymentMode: unknown): boolean {
  return typeof paymentMode === "string" &&
    paymentMode.trim() === TOURNAMENT_PAYMENT_MODE_DIRECT_ORGANIZER;
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
