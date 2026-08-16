import {HttpsError} from "firebase-functions/v2/https";
import type {Firestore} from "firebase-admin/firestore";
import {loadUserAccessData, type UserAccessData} from "./athlete-tournament-access";
import {
  normalizeAthleteGenderBucket,
  type AthleteGenderBucket,
} from "./tournament-registration-pix-helpers";

/**
 * Elegibilidade de gênero para categorias de DUPLA com gênero fixo
 * (Masculina/Feminina). Espelha `category-level-eligibility.ts` /
 * `category-age-eligibility.ts`.
 *
 * Antes desta validação o filtro era só client-side (busca de parceiro): o
 * servidor aceitava qualquer convite/aceite. Categorias de EQUIPE (trio+) não
 * passam por aqui — a composição de gênero delas já é validada por buckets em
 * `tournament-team-category.ts`.
 *
 * Política (consistente com o restante do produto — pendência informa, não
 * bloqueia): gênero DECLARADO incompatível bloqueia já no envio do convite;
 * gênero AUSENTE só bloqueia no aceite — o convite é o empurrão pro atleta
 * completar o perfil, e a resposta do envio avisa o convidante.
 */

/** Gênero exigido pela categoria (`genderType`, fallback no nome — paridade com
 *  o app). Misto/livre/equipe ou valor irreconhecível → sem exigência (`null`);
 *  NUNCA assume Masculino por padrão: exigir gênero de categoria que não o
 *  declarou bloquearia inscrições legítimas. */
export function categoryRequiredGenderBucket(
  category: Record<string, unknown> | null | undefined,
): AthleteGenderBucket | null {
  if (!category) return null;
  // Equipe nomeada (trio+): composição valida, não o gênero individual.
  if (category.teamSize != null || category.genderComposition != null) {
    return null;
  }
  if (category.genderFree === true) return null;

  const fromField = genderBucketFromText(category.genderType);
  if (fromField !== undefined) return fromField;
  for (const key of ["categoryName", "name"]) {
    const fromName = genderBucketFromText(category[key]);
    if (fromName !== undefined) return fromName;
  }
  return null;
}

/** `undefined` = texto não fala de gênero; `null` = fala e é Misto. */
function genderBucketFromText(
  raw: unknown,
): AthleteGenderBucket | null | undefined {
  if (typeof raw !== "string") return undefined;
  const lower = raw.trim().toLowerCase();
  if (!lower) return undefined;
  // Misto vem antes: "Dupla Mista" não pode casar com nada de masc/fem.
  if (lower.includes("mist") || lower.includes("mix")) return null;
  if (lower === "f" || lower.includes("fem")) return "F";
  if (lower === "m" || lower.includes("masc")) return "M";
  return undefined;
}

export interface TeamGenderEvaluation {
  /** Nomes sem gênero no perfil (campo vazio). */
  missing: string[];
  /** Nomes com gênero declarado que não casa com a categoria (inclui "Outro"). */
  conflicts: string[];
}

/** Separa pendência (gênero vazio) de conflito (declarado incompatível). */
export function evaluateTeamGenderEligibility(params: {
  requiredBucket: AthleteGenderBucket | null;
  athletes: Array<{name: string; gender: unknown}>;
}): TeamGenderEvaluation {
  const {requiredBucket, athletes} = params;
  const result: TeamGenderEvaluation = {missing: [], conflicts: []};
  if (requiredBucket == null) return result;

  for (const athlete of athletes) {
    const raw = typeof athlete.gender === "string" ? athlete.gender.trim() : "";
    if (!raw) {
      result.missing.push(athlete.name);
      continue;
    }
    if (normalizeAthleteGenderBucket(raw) !== requiredBucket) {
      result.conflicts.push(athlete.name);
    }
  }
  return result;
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
  for (const key of ["categoryName", "name"]) {
    const value = category?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "categoria";
}

function genderCategoryLabel(bucket: AthleteGenderBucket): string {
  return bucket === "F" ? "Feminina" : "Masculina";
}

function formatNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

/**
 * Bloqueia quando algum atleta não casa com o gênero fixo da categoria de
 * dupla. `requireDeclared` liga o bloqueio por gênero AUSENTE (usado no
 * aceite); no envio fica desligado e a pendência viaja na resposta.
 */
export async function assertTeamGenderEligibility(params: {
  db: Firestore;
  category: Record<string, unknown> | null | undefined;
  uids: Array<string | undefined | null>;
  requireDeclared: boolean;
}): Promise<void> {
  const {db, category, uids, requireDeclared} = params;

  const requiredBucket = categoryRequiredGenderBucket(category);
  if (requiredBucket == null) return;

  const cleanUids = Array.from(
    new Set(
      uids
        .map((uid) => (typeof uid === "string" ? uid.trim() : ""))
        .filter((uid) => uid.length > 0),
    ),
  );
  if (cleanUids.length === 0) return;

  const users = await Promise.all(
    cleanUids.map((uid) => loadUserAccessData(db, uid)),
  );
  const {missing, conflicts} = evaluateTeamGenderEligibility({
    requiredBucket,
    athletes: users.map((u) => ({
      name: athleteDisplayName(u),
      gender: u?.gender,
    })),
  });

  const categoryName = categoryDisplayName(category);
  const label = genderCategoryLabel(requiredBucket);

  if (conflicts.length > 0) {
    const verb = conflicts.length === 1 ? "não pode" : "não podem";
    throw new HttpsError(
      "failed-precondition",
      `${formatNames(conflicts)} ${verb} disputar a categoria ` +
        `${categoryName} (${label}) — o gênero no perfil não corresponde.`,
    );
  }

  if (requireDeclared && missing.length > 0) {
    throw new HttpsError(
      "failed-precondition",
      `Informe o gênero no perfil de ${formatNames(missing)} para disputar ` +
        `a categoria ${categoryName} (${label}).`,
    );
  }
}
