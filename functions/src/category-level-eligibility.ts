import {HttpsError} from "firebase-functions/v2/https";
import type {Firestore} from "firebase-admin/firestore";
import {loadUserAccessData, type UserAccessData} from "./athlete-tournament-access";

/**
 * Elegibilidade de categoria por nível do atleta (anti-sandbagging).
 *
 * Regra: um atleta pode disputar a sua própria categoria ou categorias ACIMA do
 * seu nível, nunca ABAIXO. Para duplas, vale o atleta de MAIOR nível.
 *
 * Ranks unificados (escada de 7 degraus para TODOS os esportes, contígua 0–6):
 *
 *   iniciante_1 (0) < iniciante_2 (1) < intermediario_1 (2)
 *     < intermediario_2 (3) < avancado_1 (4) < avancado_2 (5) < open (6)
 *
 * Renumeração única de `open` 5→6 em 15/08/2026 com a base vazia (pré-primeiro-torneio);
 * a partir daqui a numeração volta a ser fixa.
 *
 * Legados (aliasing — docs não migrados se comportam como o degrau inferior
 * do split): iniciante→0, intermediario→2, open→6.
 *
 * As chaves incluem código (`intermediario_1`) E label normalizado
 * (`intermediario1`), porque `categories[].level` guarda o LABEL
 * ("Intermediário 1") e `sportOnboarding.levelsBySport` guarda o CÓDIGO —
 * [normalizeLevelKey] tira acento/espaço mas preserva underscore.
 */

/** Códigos canônicos dos 7 níveis, em ordem crescente de força. */
export const LEVEL_CODES = [
  "iniciante_1",
  "iniciante_2",
  "intermediario_1",
  "intermediario_2",
  "avancado_1",
  "avancado_2",
  "open",
] as const;

/** Nível padrão de um esporte recém-adicionado ao perfil. */
export const DEFAULT_LEVEL_CODE = "iniciante_1";

/**
 * Códigos de esporte do perfil do atleta (chaves de
 * `sportOnboarding.levelsBySport`). Espelha `AthleteFirestoreCodes` no app e a
 * enumeração de `athleteLevelsNotDowngraded()` nas rules.
 */
export const ATHLETE_SPORT_CODES = [
  "VOLEI_PRAIA",
  "VOLEI_QUADRA",
  "BEACH_TENNIS",
  "FUTEVOLEI",
  "FUTEBOL",
  "BASQUETE",
  "TENIS",
  "CORRIDA",
  "OUTROS",
] as const;

export const LEVEL_RANK: Record<string, number> = {
  // Códigos novos (levelsBySport) e labels normalizados (categoria).
  iniciante_1: 0,
  iniciante1: 0,
  iniciante_2: 1,
  iniciante2: 1,
  intermediario_1: 2,
  intermediario1: 2,
  intermediario_2: 3,
  intermediario2: 3,
  avancado_1: 4,
  avancado1: 4,
  avancado_2: 5,
  avancado2: 5,
  open: 6,
  // Legados (escada de 3 níveis) — degrau inferior do split.
  iniciante: 0,
  intermediario: 2,
};

const HIGHEST_RANK = 6;

/** Normaliza acentos/caixa para casar códigos e labels do nível. */
function normalizeLevelKey(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");
}

/**
 * Rank do nível a partir de código (`iniciante`) ou label (`Intermediário`).
 * Inclui legados: `basico` → iniciante. Retorna `null` quando desconhecido/ausente.
 */
export function levelRank(raw: unknown): number | null {
  const key = normalizeLevelKey(raw);
  if (!key) return null;
  if (key in LEVEL_RANK) return LEVEL_RANK[key];
  // Legados conhecidos.
  if (key === "basico") return LEVEL_RANK.iniciante;
  if (key === "livre") return LEVEL_RANK.open;
  return null;
}

/**
 * Label canônico (PT-BR) de um código/label de nível, SEM renumerar legados:
 * `intermediario` continua "Intermediário" (não vira "Intermediário 1").
 * `null` quando desconhecido.
 */
export function levelDisplayLabel(raw: unknown): string | null {
  switch (normalizeLevelKey(raw)) {
    case "iniciante":
    case "basico":
      return "Iniciante";
    case "intermediario":
      return "Intermediário";
    case "open":
    case "livre":
      return "Open";
    case "iniciante_1":
    case "iniciante1":
      return "Iniciante 1";
    case "iniciante_2":
    case "iniciante2":
      return "Iniciante 2";
    case "intermediario_1":
    case "intermediario1":
      return "Intermediário 1";
    case "intermediario_2":
    case "intermediario2":
      return "Intermediário 2";
    case "avancado_1":
    case "avancado1":
      return "Avançado 1";
    case "avancado_2":
    case "avancado2":
      return "Avançado 2";
    default:
      return null;
  }
}

/**
 * Código canônico para um rank (0..5 → degrau, demais → open). Usado pela
 * migração para normalizar qualquer formato legado (código ou label) via
 * [levelRank] sem perder o degrau.
 */
export function levelCodeForRank(rank: number): string {
  switch (rank) {
    case 0:
      return "iniciante_1";
    case 1:
      return "iniciante_2";
    case 2:
      return "intermediario_1";
    case 3:
      return "intermediario_2";
    case 4:
      return "avancado_1";
    case 5:
      return "avancado_2";
    default:
      return "open";
  }
}

/** Label amigável (PT-BR) para um rank de nível (escada do vôlei). */
export function levelLabelForRank(rank: number): string {
  switch (rank) {
    case 0:
      return "Iniciante 1";
    case 1:
      return "Iniciante 2";
    case 2:
      return "Intermediário 1";
    case 3:
      return "Intermediário 2";
    case 4:
      return "Avançado 1";
    case 5:
      return "Avançado 2";
    default:
      return "Open";
  }
}

/**
 * Esporte do torneio (`tournaments/{id}.sport`, nome do enum) → código de esporte
 * do perfil do atleta (chave de `sportOnboarding.levelsBySport`). `null` quando
 * não há equivalente (esporte desconhecido cai no nível global).
 */
export function tournamentSportToLevelSportCode(sport: unknown): string | null {
  const key = normalizeLevelKey(sport);
  switch (key) {
    case "beachvolleyball":
      return "VOLEI_PRAIA";
    case "indoorvolleyball":
      return "VOLEI_QUADRA";
    case "footvolley":
      return "FUTEVOLEI";
    case "beachtennis":
      return "BEACH_TENNIS";
    default:
      return null;
  }
}

/**
 * Mapa nível-por-esporte do doc `users/{uid}` — `sportOnboarding.levelsBySport`
 * é a ÚNICA fonte de escrita do nível declarado (app, web e rating engine).
 */
function levelsBySportOf(
  userData: UserAccessData,
): Record<string, unknown> | null {
  const onboarding = userData.sportOnboarding;
  if (onboarding != null && typeof onboarding === "object") {
    const bySport = (onboarding as Record<string, unknown>).levelsBySport;
    if (bySport != null && typeof bySport === "object") {
      return bySport as Record<string, unknown>;
    }
  }
  return null;
}

/**
 * Rank do nível do atleta para o esporte informado.
 * Per-sport (`sportOnboarding.levelsBySport[sportCode]`) → `level` global → 0
 * (mais permissivo).
 */
export function resolveAthleteLevelRank(
  userData: UserAccessData | null,
  sportCode: string | null,
): number {
  if (!userData) return 0;

  if (sportCode) {
    const bySport = levelsBySportOf(userData);
    if (bySport) {
      const rank = levelRank(bySport[sportCode]);
      if (rank != null) return rank;
    }
  }

  const globalRank = levelRank(userData.level);
  return globalRank ?? 0;
}

/**
 * Rank do nível da categoria (`categories[].level`, label ou código).
 * Categoria sem nível definido → Open (aceita todos).
 */
export function categoryLevelRank(
  category: Record<string, unknown> | null | undefined,
): number {
  if (!category) return HIGHEST_RANK;
  const rank = levelRank(category.level);
  return rank ?? HIGHEST_RANK;
}

/**
 * Rank do PISO da categoria (`categories[].minLevel`, label ou código).
 * Ausente/desconhecido → 0 (sem piso — todo doc antigo se comporta como hoje).
 */
export function categoryMinLevelRank(
  category: Record<string, unknown> | null | undefined,
): number {
  if (!category) return 0;
  return levelRank(category.minLevel) ?? 0;
}

/** Dupla elegível sse TODOS os integrantes cabem na faixa [minRank, categoryRank]. */
export function isTeamEligible(params: {
  categoryRank: number;
  athleteRanks: number[];
  categoryMinRank?: number;
}): boolean {
  const {categoryRank, athleteRanks} = params;
  const minRank = params.categoryMinRank ?? 0;
  if (athleteRanks.length === 0) return true;
  return athleteRanks.every((rank) => rank >= minRank && rank <= categoryRank);
}

function athleteDisplayName(userData: UserAccessData | null): string {
  if (!userData) return "Atleta";
  for (const key of ["name", "displayName", "fullName", "firstName"]) {
    const value = userData[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "Atleta";
}

function categoryDisplayName(
  category: Record<string, unknown> | null | undefined,
): string {
  if (!category) return "categoria";
  for (const key of ["categoryName", "name", "level"]) {
    const value = category[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "categoria";
}

/**
 * Bloqueia a inscrição quando algum atleta da dupla excede o nível da categoria
 * ou fica abaixo do piso (minLevel) da categoria.
 * Lança `HttpsError("failed-precondition")` nomeando o atleta que causa o bloqueio.
 *
 * Carrega os docs dos usuários informados (reusa [loadUserAccessData]). uids
 * vazios/duplicados são ignorados; o conjunto vazio é sempre elegível.
 */
export async function assertTeamLevelEligibility(params: {
  db: Firestore;
  tournament: Record<string, unknown>;
  category: Record<string, unknown> | null | undefined;
  uids: Array<string | undefined | null>;
}): Promise<void> {
  const {db, tournament, category, uids} = params;

  const cleanUids = Array.from(
    new Set(
      uids
        .map((uid) => (typeof uid === "string" ? uid.trim() : ""))
        .filter((uid) => uid.length > 0),
    ),
  );
  if (cleanUids.length === 0) return;

  const categoryRank = categoryLevelRank(category);
  const minRank = categoryMinLevelRank(category);
  // Categoria totalmente aberta (teto Open, sem piso) comporta qualquer nível —
  // evita carregar usuários à toa. Com piso, os docs SÃO necessários.
  if (categoryRank >= HIGHEST_RANK && minRank <= 0) return;

  const sportCode = tournamentSportToLevelSportCode(tournament.sport);

  const users = await Promise.all(
    cleanUids.map((uid) => loadUserAccessData(db, uid)),
  );

  const categoryName = categoryDisplayName(category);
  const nameWithLevel = (userData: UserAccessData | null): string => {
    const rank = resolveAthleteLevelRank(userData, sportCode);
    return `${athleteDisplayName(userData)} (${levelLabelForRank(rank)})`;
  };
  const joined = (names: string[]): string =>
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;

  // Teto (anti-sandbagging) tem precedência — mensagem idêntica à de hoje.
  const tooStrong = users.filter(
    (userData) => resolveAthleteLevelRank(userData, sportCode) > categoryRank,
  );
  if (tooStrong.length > 0) {
    const subject = joined(tooStrong.map(nameWithLevel));
    const verb = tooStrong.length === 1 ? "não pode" : "não podem";
    throw new HttpsError(
      "failed-precondition",
      `${subject} ${verb} disputar a categoria ${categoryName}, ` +
        "abaixo do nível do atleta. Escolha uma categoria igual ou superior.",
    );
  }

  // Piso: barra o integrante mais fraco — ninguém entra carregado pelo parceiro.
  if (minRank > 0) {
    const tooWeak = users.filter(
      (userData) => resolveAthleteLevelRank(userData, sportCode) < minRank,
    );
    if (tooWeak.length > 0) {
      const subject = joined(tooWeak.map(nameWithLevel));
      const verb = tooWeak.length === 1 ? "não atinge" : "não atingem";
      throw new HttpsError(
        "failed-precondition",
        `${subject} ${verb} o nível mínimo da categoria ${categoryName} ` +
          `(${levelLabelForRank(minRank)}).`,
      );
    }
  }
}
