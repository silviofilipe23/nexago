/**
 * Categorias de equipe (trio/quarteto/quinteto) — lógica pura.
 *
 * Modelo: a categoria ganha `teamSize` (3–5; ausente = dupla) e opcionalmente
 * uma composição exata de gênero (`genderComposition: {men, women}` com soma
 * igual a `teamSize`; `genderMode: "free"` = sem restrição). A equipe é criada
 * pelo CAPITÃO junto com a inscrição — nomeada, com `memberUids` (capitão
 * primeiro) — e os demais atletas entram por convite. `player1Id`/`player2Id`
 * continuam preenchidos com os dois primeiros membros para leitores legados.
 *
 * `partnerPending` mantém o significado histórico "elenco incompleto": só vira
 * `false` quando `memberUids` atinge `teamSize` — é o que mantém equipes
 * incompletas fora do chaveamento sem mudar a geração de chaves.
 */

import {roundMoney} from "./mercadopago-arena-helpers";
import type {AthleteGenderBucket} from "./tournament-registration-pix-helpers";

export const DUPLA_TEAM_SIZE = 2;
export const MIN_TEAM_CATEGORY_SIZE = 3;
export const MAX_TEAM_CATEGORY_SIZE = 5;

export const TEAM_NAME_MIN_LENGTH = 3;
export const TEAM_NAME_MAX_LENGTH = 30;

/** Clientes antigos (app) não sabem inscrever equipe — copy única do bloqueio. */
export const TEAM_CATEGORY_REQUIRES_TEAM_FLOW_MESSAGE =
  "Esta categoria é por equipe (trio, quarteto ou quinteto). " +
  "Crie sua equipe e convide os atletas pelo portal nexaGO.";

export type GenderComposition = {men: number; women: number};

const DISPUTE_TEAM_SIZE: Record<string, number> = {
  individual: 1,
  dupla: 2,
  trio: 3,
  quarteto: 4,
  quinteto: 5,
};

function toCount(raw: unknown): number | null {
  const n =
    typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

/**
 * Tamanho da equipe da categoria. `teamSize` explícito vence; senão deriva do
 * `disputeType` ("trio" → 3…); categoria legada sem nada = dupla.
 */
export function resolveCategoryTeamSize(
  category: Record<string, unknown> | null | undefined,
): number {
  if (!category) return DUPLA_TEAM_SIZE;
  const explicit = toCount(category.teamSize);
  if (
    explicit != null &&
    explicit >= DUPLA_TEAM_SIZE &&
    explicit <= MAX_TEAM_CATEGORY_SIZE
  ) {
    return explicit;
  }
  const dispute = String(category.disputeType ?? category.dispute ?? "")
    .trim()
    .toLowerCase();
  const fromDispute = DISPUTE_TEAM_SIZE[dispute];
  return fromDispute != null && fromDispute >= DUPLA_TEAM_SIZE
    ? fromDispute
    : DUPLA_TEAM_SIZE;
}

/** Categoria de equipe nomeada (trio+) — dupla segue o fluxo clássico. */
export function isTeamCategory(
  category: Record<string, unknown> | null | undefined,
): boolean {
  return resolveCategoryTeamSize(category) >= MIN_TEAM_CATEGORY_SIZE;
}

/**
 * Tamanho da equipe de uma inscrição. O `teamSize` gravado na criação vence
 * (a categoria pode ser editada depois sem quebrar inscrições existentes).
 */
export function registrationTeamSize(
  registration: Record<string, unknown> | null | undefined,
  category: Record<string, unknown> | null | undefined,
): number {
  const fromRegistration = toCount(registration?.teamSize);
  if (
    fromRegistration != null &&
    fromRegistration >= DUPLA_TEAM_SIZE &&
    fromRegistration <= MAX_TEAM_CATEGORY_SIZE
  ) {
    return fromRegistration;
  }
  return resolveCategoryTeamSize(category);
}

/**
 * Composição exata de gênero da categoria, ou `null` quando livre/inválida.
 * Só vale quando a soma bate com `teamSize` — categoria editada com composição
 * órfã degrada para "livre" em vez de travar inscrições com contas erradas.
 */
export function parseGenderComposition(
  category: Record<string, unknown> | null | undefined,
  teamSize: number,
): GenderComposition | null {
  if (!category) return null;
  const mode = String(category.genderMode ?? "").trim().toLowerCase();
  if (mode === "free") return null;
  const raw = category.genderComposition;
  if (!raw || typeof raw !== "object") return null;
  const men = toCount((raw as Record<string, unknown>).men);
  const women = toCount((raw as Record<string, unknown>).women);
  if (men == null || women == null) return null;
  if (men + women !== teamSize) return null;
  return {men, women};
}

// ---------------------------------------------------------------------------
// Nome da equipe
// ---------------------------------------------------------------------------

/** Espaços colapsados e aparados — forma canônica gravada no doc. */
export function normalizeTeamName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim();
}

/** Mensagem de erro do nome, ou `null` quando válido. */
export function teamNameValidationError(raw: unknown): string | null {
  const name = normalizeTeamName(raw);
  if (name.length < TEAM_NAME_MIN_LENGTH) {
    return `O nome da equipe precisa ter pelo menos ${TEAM_NAME_MIN_LENGTH} caracteres.`;
  }
  if (name.length > TEAM_NAME_MAX_LENGTH) {
    return `O nome da equipe pode ter no máximo ${TEAM_NAME_MAX_LENGTH} caracteres.`;
  }
  return null;
}

/** Chave de unicidade do nome na categoria: sem acentos, caixa ou espaços extras. */
export function teamNameKey(raw: unknown): string {
  return normalizeTeamName(raw)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// ---------------------------------------------------------------------------
// Elenco e composição
// ---------------------------------------------------------------------------

/** uids dos membros da equipe — `memberUids` vence; legado cai em player1/2. */
export function extractTeamMemberUids(
  team: Record<string, unknown> | null | undefined,
): string[] {
  if (!team) return [];
  const out: string[] = [];
  const push = (raw: unknown) => {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (id && !out.includes(id)) out.push(id);
  };
  if (Array.isArray(team.memberUids)) {
    for (const raw of team.memberUids) push(raw);
    if (out.length > 0) return out;
  }
  push(team.player1Id);
  push(team.player2Id);
  return out;
}

export function isTeamRosterComplete(
  memberCount: number,
  teamSize: number,
): boolean {
  return memberCount >= teamSize;
}

export type TeamJoinDenialReason =
  | "roster_full"
  | "men_full"
  | "women_full"
  | "missing_gender";

export type TeamJoinEvaluation =
  | {ok: true}
  | {ok: false; reason: TeamJoinDenialReason};

/**
 * Um atleta pode ocupar uma vaga da equipe? `currentBuckets` são os gêneros de
 * quem já ocupa vaga (membros e, no envio de convite, convites pendentes —
 * convite pendente é vaga prometida). Sem composição, só o total conta.
 * Membros sem gênero conhecido não consomem cota de composição (permissivo por
 * design: nunca travar uma equipe válida por dado ausente de terceiros).
 */
export function evaluateTeamJoin(params: {
  teamSize: number;
  composition: GenderComposition | null;
  currentBuckets: Array<AthleteGenderBucket | null>;
  joiningBucket: AthleteGenderBucket | null;
}): TeamJoinEvaluation {
  const {teamSize, composition, currentBuckets, joiningBucket} = params;
  if (currentBuckets.length >= teamSize) {
    return {ok: false, reason: "roster_full"};
  }
  if (!composition) return {ok: true};
  if (!joiningBucket) return {ok: false, reason: "missing_gender"};
  const menUsed = currentBuckets.filter((b) => b === "M").length;
  const womenUsed = currentBuckets.filter((b) => b === "F").length;
  if (joiningBucket === "M" && menUsed >= composition.men) {
    return {ok: false, reason: "men_full"};
  }
  if (joiningBucket === "F" && womenUsed >= composition.women) {
    return {ok: false, reason: "women_full"};
  }
  return {ok: true};
}

/** Copy única das negativas de vaga (backend é a fonte da verdade). */
export function teamJoinDenialMessage(
  reason: TeamJoinDenialReason,
  context: "self" | "invitee" = "invitee",
): string {
  switch (reason) {
  case "roster_full":
    return "A equipe já está completa.";
  case "men_full":
    return context === "self"
      ? "As vagas masculinas desta categoria já estão preenchidas na sua equipe."
      : "As vagas masculinas da equipe já estão preenchidas ou reservadas por convites pendentes.";
  case "women_full":
    return context === "self"
      ? "As vagas femininas desta categoria já estão preenchidas na sua equipe."
      : "As vagas femininas da equipe já estão preenchidas ou reservadas por convites pendentes.";
  case "missing_gender":
    return context === "self"
      ? "Defina seu gênero no perfil para se inscrever nesta categoria."
      : "O atleta convidado precisa definir o gênero no perfil para entrar nesta categoria.";
  }
}

// ---------------------------------------------------------------------------
// Gênero da equipe
// ---------------------------------------------------------------------------

/**
 * Rótulo de gênero da equipe com N membros (generaliza
 * `computeTeamGenderLabel` da dupla). `null` enquanto algum membro não tem
 * gênero conhecido.
 */
export function teamGenderLabelForBuckets(
  buckets: Array<AthleteGenderBucket | null>,
): "Masculino" | "Feminino" | "Misto" | null {
  if (buckets.length === 0) return null;
  if (buckets.some((b) => b !== "M" && b !== "F")) return null;
  const hasMen = buckets.includes("M");
  const hasWomen = buckets.includes("F");
  if (hasMen && hasWomen) return "Misto";
  return hasMen ? "Masculino" : "Feminino";
}

// ---------------------------------------------------------------------------
// Pagamento
// ---------------------------------------------------------------------------

/**
 * Cota do próximo pagador: o RESTANTE dividido pelos pagadores que faltam.
 * Elimina o problema de centavos (R$100 num trio: 33,33 + 33,34 + 33,33) e
 * absorve pagamentos "full" anteriores. Nunca negativa.
 */
export function computeTeamMemberShareReais(params: {
  entryFee: number;
  paidAmount: number;
  confirmedCount: number;
  teamSize: number;
}): number {
  const entryFee = Number.isFinite(params.entryFee)
    ? Math.max(0, params.entryFee)
    : 0;
  if (entryFee <= 0) return 0;
  const paid = Number.isFinite(params.paidAmount)
    ? Math.max(0, params.paidAmount)
    : 0;
  const remaining = Math.max(0, entryFee - paid);
  if (remaining <= 0) return 0;
  const remainingPayers = Math.max(
    1,
    params.teamSize - Math.max(0, params.confirmedCount),
  );
  return roundMoney(remaining / remainingPayers);
}
