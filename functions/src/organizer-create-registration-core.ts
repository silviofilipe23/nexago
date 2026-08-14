/**
 * Lógica pura da inscrição criada PELO ORGANIZADOR (`organizerCreateTeamRegistration`).
 *
 * Existe para os casos em que a dupla não conseguiu se inscrever sozinha: prazo estourado,
 * convite que o parceiro nunca aceitou, pagamento que travou. O organizador escolhe os dois
 * atletas (ambos já cadastrados) e a inscrição nasce igual à do fluxo do atleta — mesma
 * coleção, mesmos campos, mesmo motor de unicidade.
 *
 * O que NÃO está aqui, de propósito:
 * - Aceite do termo de imagem (LGPD): o organizador não consente pelo atleta, então a inscrição
 *   nasce sem aceite e a lista do painel já a mostra como "LGPD pendente".
 * - Uniforme: ninguém escolheu tamanho; o atleta preenche depois pelo portal.
 */

import {HttpsError} from "firebase-functions/v2/https";
import {
  ORGANIZER_DIRECT_PAYMENT_METHOD,
  organizerDirectConfirmPaidAmount,
} from "./organizer-category-ops-payments";

/** Marca de origem gravada na inscrição — separa do que veio do fluxo do atleta. */
export const ORGANIZER_CREATED_VIA = "organizer";

export interface CreateTeamRegistrationInput {
  tournamentId: string;
  categoryId: string;
  /** Exatamente 2 atletas, distintos, ambos com conta. */
  athleteUids: [string, string];
  /** O organizador já recebeu o valor por fora (Pix/dinheiro na mão). */
  markAsPaid: boolean;
}

function requiredText(value: unknown, field: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    throw new HttpsError("invalid-argument", `${field} é obrigatório.`);
  }
  return text;
}

export function parseCreateTeamRegistrationInput(
  data: unknown,
): CreateTeamRegistrationInput {
  const raw = (data ?? {}) as Record<string, unknown>;
  const tournamentId = requiredText(raw.tournamentId, "tournamentId");
  const categoryId = requiredText(raw.categoryId, "categoryId");

  const uids = Array.isArray(raw.athleteUids)
    ? raw.athleteUids
      .map((uid) => (typeof uid === "string" ? uid.trim() : ""))
      .filter((uid) => uid.length > 0)
    : [];

  if (uids.length !== 2) {
    throw new HttpsError(
      "invalid-argument",
      "Informe os dois atletas da dupla.",
    );
  }
  if (uids[0] === uids[1]) {
    throw new HttpsError(
      "invalid-argument",
      "Os dois atletas da dupla precisam ser diferentes.",
    );
  }

  return {
    tournamentId,
    categoryId,
    athleteUids: [uids[0], uids[1]],
    markAsPaid: raw.markAsPaid === true,
  };
}

/**
 * Quem está ENTRANDO numa reserva solo que já existe.
 *
 * A reserva tem dono (`player1`); o outro atleta da dupla é quem entra. Quando o dono não é
 * nenhum dos dois (não deveria acontecer — o plano de fusão só devolve `attach` para reserva
 * de um deles), o primeiro atleta vira o dono e o segundo entra, para nunca gravar uma dupla
 * com o mesmo uid dos dois lados.
 */
export function resolveJoiningUid(
  baseOwnerUid: string,
  uidA: string,
  uidB: string,
): string {
  const owner = baseOwnerUid.trim();
  if (owner === uidA) return uidB;
  if (owner === uidB) return uidA;
  return uidB;
}

export interface OrganizerPaymentFieldsParams {
  /** Taxa da categoria em reais. */
  entryFee: number;
  markAsPaid: boolean;
  /** A inscrição de destino já está paga (fusão com reserva que o atleta pagou). */
  alreadyPaid: boolean;
  organizerUid: string;
  /** `FieldValue.serverTimestamp()` — injetado para esta função continuar pura. */
  timestamp: unknown;
}

/**
 * Campos de pagamento a aplicar, ou `null` quando não há nada a mudar.
 *
 * Três regras que valem a pena ler:
 * - O organizador só LIGA pagamento, nunca desliga: numa fusão a reserva de destino pode já ter
 *   sido paga pelo atleta, e regravar apagaria o canal/valor reais daquele pagamento.
 * - Categoria gratuita já nasce paga, sem canal — não existe dinheiro para atribuir a ninguém.
 * - Quando marca como pago, grava exatamente o mesmo conjunto de
 *   `organizerConfirmRegistrationPayment`, senão a arrecadação por canal deixa de bater.
 */
export function buildOrganizerPaymentFields(
  params: OrganizerPaymentFieldsParams,
): Record<string, unknown> | null {
  const {entryFee, markAsPaid, alreadyPaid, organizerUid, timestamp} = params;

  if (alreadyPaid) return null;
  if (!Number.isFinite(entryFee) || entryFee <= 0) {
    return {isPaid: true, paidAmount: 0};
  }
  if (!markAsPaid) return null;

  return {
    isPaid: true,
    // Confirmar pagamento é o ato que tira o time da fila (mesma regra do painel).
    waitlist: false,
    paidAmount: organizerDirectConfirmPaidAmount(entryFee),
    paymentMethod: ORGANIZER_DIRECT_PAYMENT_METHOD,
    paidAt: timestamp,
    paymentVerifiedByOrganizer: true,
    paymentVerifiedAt: timestamp,
    paymentVerifiedByUid: organizerUid,
  };
}

export interface OrganizerRegistrationDocParams {
  teamId: string;
  tournamentId: string;
  categoryId: string;
  athleteUids: readonly [string, string];
  organizerUid: string;
  /** Categoria lotada com fila ativa. */
  waitlist: boolean;
  timestamp: unknown;
}

/**
 * Procedência do ato do organizador, gravada nos DOIS ramos (dupla nova e dupla fechada sobre
 * uma reserva que o atleta já tinha). Sem isso ninguém consegue distinguir depois o que foi
 * inscrito na mão do que veio do fluxo do atleta.
 *
 * `createdVia` fica de fora daqui de propósito: numa fusão a inscrição foi criada pelo atleta,
 * e sobrescrever isso seria apagar a verdade de quem começou.
 */
export function organizerRegistrationStamp(
  organizerUid: string,
  timestamp: unknown,
): Record<string, unknown> {
  return {
    organizerRegisteredByUid: organizerUid,
    organizerRegisteredAt: timestamp,
  };
}

/**
 * Documento da inscrição nova. Espelha o que `acceptTournamentPartnerInvite` grava ao fechar
 * uma dupla, mais a procedência.
 */
export function buildOrganizerRegistrationDoc(
  params: OrganizerRegistrationDocParams,
): Record<string, unknown> {
  const {teamId, tournamentId, categoryId, athleteUids, organizerUid, waitlist, timestamp} =
    params;

  return {
    teamId,
    tournamentId,
    categoryId,
    participantUids: [athleteUids[0], athleteUids[1]],
    isPaid: false,
    paidAmount: 0,
    createdAt: timestamp,
    createdVia: ORGANIZER_CREATED_VIA,
    ...organizerRegistrationStamp(organizerUid, timestamp),
    ...(waitlist ? {waitlist: true} : {}),
  };
}

/** Aviso enviado aos dois atletas — o par (título, corpo) muda com o estado do pagamento. */
export function organizerRegistrationNotification(params: {
  tournamentName: string;
  categoryName: string;
  isPaid: boolean;
}): {title: string; body: string} {
  const {tournamentName, categoryName, isPaid} = params;
  const where = tournamentName
    ? `${tournamentName}${categoryName ? ` · ${categoryName}` : ""}`
    : categoryName;

  return {
    title: "Inscrição criada pelo organizador",
    body: isPaid
      ? `Sua dupla está inscrita em ${where}. Vaga confirmada.`
      : `Sua dupla está inscrita em ${where}. O pagamento segue pendente.`,
  };
}
