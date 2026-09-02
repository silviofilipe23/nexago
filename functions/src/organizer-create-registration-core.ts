/**
 * Lógica pura da inscrição criada PELO ORGANIZADOR (`organizerCreateTeamRegistration`).
 *
 * Existe para os casos em que a dupla/equipe não conseguiu se inscrever sozinha: prazo
 * estourado, convite que o parceiro nunca aceitou, pagamento que travou. O organizador
 * escolhe o elenco completo (todos já cadastrados) e a inscrição nasce igual à do fluxo
 * do atleta — mesma coleção, mesmos campos.
 *
 * O que NÃO está aqui, de propósito:
 * - Aceite do termo de imagem (LGPD): o organizador não consente pelo atleta, então a inscrição
 *   nasce sem aceite e a lista do painel já a mostra como "LGPD pendente".
 */

import {HttpsError} from "firebase-functions/v2/https";
import {
  ORGANIZER_DIRECT_PAYMENT_METHOD,
  organizerDirectConfirmPaidAmount,
} from "./organizer-category-ops-payments";
import {parseUniformPayload} from "./tournament-partner-invite";
import type {TournamentCategory, UniformPayload} from "./tournament-partner-invite";
import {
  DUPLA_TEAM_SIZE,
  MAX_TEAM_CATEGORY_SIZE,
  MIN_TEAM_CATEGORY_SIZE,
} from "./tournament-team-category";

/** Marca de origem gravada na inscrição — separa do que veio do fluxo do atleta. */
export const ORGANIZER_CREATED_VIA = "organizer";

export interface CreateTeamRegistrationInput {
  tournamentId: string;
  categoryId: string;
  /**
   * Elenco completo e distinto. A Cloud Function confere se o tamanho bate com a
   * categoria (2 na dupla, 3–5 na equipe) — o parse só garante faixa e unicidade.
   */
  athleteUids: string[];
  /** O organizador já recebeu o valor por fora (Pix/dinheiro na mão). */
  markAsPaid: boolean;
  /**
   * Uniforme por atleta, indexado pelo uid. Vem cru: a exigência e os tamanhos válidos
   * dependem da categoria, então quem valida é a Cloud Function com
   * `validateUniformPayload` — a mesma do fluxo do atleta.
   */
  uniforms: Record<string, UniformPayload>;
  /**
   * Nome da equipe (trio+). Vazio na dupla. Quando a categoria é de equipe e o
   * organizador não manda nome, a CF gera um a partir dos atletas.
   */
  teamName: string | null;
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

  if (uids.length < DUPLA_TEAM_SIZE || uids.length > MAX_TEAM_CATEGORY_SIZE) {
    throw new HttpsError(
      "invalid-argument",
      `Informe de ${DUPLA_TEAM_SIZE} a ${MAX_TEAM_CATEGORY_SIZE} atletas.`,
    );
  }
  if (new Set(uids).size !== uids.length) {
    throw new HttpsError(
      "invalid-argument",
      "Os atletas da inscrição precisam ser diferentes.",
    );
  }

  const uniformsRaw =
    raw.uniforms && typeof raw.uniforms === "object" ?
      (raw.uniforms as Record<string, unknown>) :
      {};
  const uniforms: Record<string, UniformPayload> = {};
  for (const uid of uids) {
    const payload = parseUniformPayload(uniformsRaw[uid]);
    if (payload) uniforms[uid] = payload;
  }

  const teamNameRaw =
    typeof raw.teamName === "string" ? raw.teamName.trim() : "";

  return {
    tournamentId,
    categoryId,
    athleteUids: uids,
    markAsPaid: raw.markAsPaid === true,
    uniforms,
    teamName: teamNameRaw.length > 0 ? teamNameRaw : null,
  };
}

/**
 * Confere que o elenco enviado tem exatamente o tamanho da categoria.
 * Separado do parse porque o tamanho certo só existe depois de ler o torneio.
 */
export function assertAthleteUidsMatchCategorySize(
  athleteUids: readonly string[],
  expectedSize: number,
): void {
  if (athleteUids.length === expectedSize) return;
  const unit = expectedSize >= MIN_TEAM_CATEGORY_SIZE ? "equipe" : "dupla";
  throw new HttpsError(
    "invalid-argument",
    `Esta ${unit} precisa de ${expectedSize} atletas. Você informou ${athleteUids.length}.`,
  );
}

/**
 * Categoria com a herança do torneio já resolvida, para validar uniforme.
 *
 * Categoria sem exigência própria em torneio com `uniformRequired` conta como `top_only`, com as
 * flags de número/nome da RAIZ — é o que o portal do atleta, o app e a tela de Uniformes já
 * fazem. `categoryRequiresUniform` sozinha ignora essa herança; passar a categoria efetiva
 * reusa `validateUniformPayload` sem que servidor e tela discordem sobre o que é obrigatório.
 */
export function effectiveUniformCategory(
  tournament: Record<string, unknown>,
  category: TournamentCategory,
): TournamentCategory {
  const ownType = String(category.uniformType ?? "none").trim();
  const hasOwnRequirement =
    ownType === "top_only" || ownType === "top" || ownType === "full";
  if (hasOwnRequirement || tournament.uniformRequired !== true) return category;

  return {
    ...category,
    uniformType: "top_only",
    uniformNumberOnShirt: tournament.uniformNumberOnShirt === true,
    uniformNameOnShirt: tournament.uniformNameOnShirt === true,
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
  athleteUids: readonly string[];
  organizerUid: string;
  /** Categoria lotada com fila ativa. */
  waitlist: boolean;
  timestamp: unknown;
  /** 3–5 em categoria de equipe; omitido/2 = dupla clássica. */
  teamSize?: number;
  /** Nome da equipe nomeada (trio+). */
  teamName?: string | null;
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
 * Documento da inscrição nova. Espelha o que o fluxo do atleta grava ao fechar
 * a vaga, mais a procedência do organizador.
 */
export function buildOrganizerRegistrationDoc(
  params: OrganizerRegistrationDocParams,
): Record<string, unknown> {
  const {
    teamId,
    tournamentId,
    categoryId,
    athleteUids,
    organizerUid,
    waitlist,
    timestamp,
    teamSize,
    teamName,
  } = params;
  const captainUid = athleteUids[0] ?? "";
  const isTeam =
    teamSize != null && teamSize >= MIN_TEAM_CATEGORY_SIZE;

  return {
    teamId,
    tournamentId,
    categoryId,
    participantUids: [...athleteUids],
    isPaid: false,
    paidAmount: 0,
    createdAt: timestamp,
    createdVia: ORGANIZER_CREATED_VIA,
    ...organizerRegistrationStamp(organizerUid, timestamp),
    ...(waitlist ? {waitlist: true} : {}),
    // Dupla mantém o shape legado (sem player1Id / partnerPending na inscrição).
    // Equipe espelha o fluxo do capitão, com elenco já completo.
    ...(isTeam
      ? {
          teamSize,
          captainUid,
          player1Id: captainUid,
          partnerPending: false,
          ...(teamName?.trim() ? {teamName: teamName.trim()} : {}),
        }
      : {}),
  };
}

/** Doc da coleção `teams` para equipe nomeada criada pelo organizador (elenco completo). */
export function buildOrganizerNamedTeamDoc(params: {
  tournamentId: string;
  categoryId: string;
  athleteUids: readonly string[];
  teamSize: number;
  teamName: string;
  timestamp: unknown;
}): Record<string, unknown> {
  const {tournamentId, categoryId, athleteUids, teamSize, teamName, timestamp} =
    params;
  const captainUid = athleteUids[0] ?? "";
  return {
    teamName,
    captainUid,
    memberUids: [...athleteUids],
    teamSize,
    player1Id: captainUid,
    player2Id: athleteUids[1] ?? "",
    tournamentId,
    categoryId,
    createdAt: timestamp,
  };
}

/**
 * Nome padrão quando o organizador não informou um: primeiros nomes unidos.
 * Garante pelo menos 3 caracteres (mínimo da regra de nome de equipe).
 */
export function defaultOrganizerTeamName(athleteNames: readonly string[]): string {
  const firsts = athleteNames
    .map((n) => n.trim().split(/\s+/)[0] ?? "")
    .filter((n) => n.length > 0);
  const joined = firsts.slice(0, 3).join(" / ");
  if (joined.length >= 3) return joined.slice(0, 30);
  return "Equipe";
}

/** Aviso enviado aos atletas — o par (título, corpo) muda com o estado do pagamento. */
export function organizerRegistrationNotification(params: {
  tournamentName: string;
  categoryName: string;
  isPaid: boolean;
  /** `true` = trio+; copy fala em equipe. */
  isTeam?: boolean;
}): {title: string; body: string} {
  const {tournamentName, categoryName, isPaid, isTeam = false} = params;
  const where = tournamentName
    ? `${tournamentName}${categoryName ? ` · ${categoryName}` : ""}`
    : categoryName;
  const unit = isTeam ? "equipe" : "dupla";

  return {
    title: "Inscrição criada pelo organizador",
    body: isPaid
      ? `Sua ${unit} está inscrita em ${where}. Vaga confirmada.`
      : `Sua ${unit} está inscrita em ${where}. O pagamento segue pendente.`,
  };
}
