import {HttpsError} from "firebase-functions/v2/https";
import type {Firestore} from "firebase-admin/firestore";
import {loadUserAccessData, type UserAccessData} from "./athlete-tournament-access";
import {
  normalizeAthleteGenderBucket,
  type AthleteGenderBucket,
} from "./tournament-registration-pix-helpers";
import {isTeamCategory} from "./tournament-team-category";

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
  //
  // O corte é `teamSize >= 3` (o mesmo de `isTeamCategory`), NÃO "tem
  // teamSize": o portal do organizador grava `teamSize: 2` em toda dupla, e
  // desistir ali deixava esta validação morta em todas elas — no dev uma
  // atleta feminina reservou vaga em categoria Masculina e o servidor aceitou.
  if (isTeamCategory(category) || category.genderComposition != null) {
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
  // Valores em inglês são o que o portal do organizador realmente grava
  // (`genderType: "male" | "female" | "mixed"`). Só "female" era reconhecido,
  // por acidente — contém "fem". "male" caía no fallback pelo nome da
  // categoria, que nem sempre diz o gênero. Exato antes do `includes`:
  // "female" contém "male".
  if (lower === "female") return "F";
  if (lower === "male") return "M";
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

/**
 * Dupla que declara MISTO — a única em que o gênero exigido é RELACIONAL: o
 * parceiro tem de ser o oposto de quem já está, e não um valor fixo da
 * categoria. Por isso não cabe em `categoryRequiredGenderBucket`, que responde
 * "a categoria exige X de todo mundo".
 *
 * Só vale para DUPLA: equipe nomeada tem composição própria (`2H + 2M`),
 * validada por buckets em `tournament-team-category.ts`. E só quando o texto
 * DIZ misto: categoria que não fala de gênero nenhum não pode virar 1H+1M por
 * padrão, senão a regra barraria inscrição legítima.
 */
export function categoryIsMixedDuo(
  category: Record<string, unknown> | null | undefined,
): boolean {
  if (!category) return false;
  // Mesmo corte de `categoryRequiredGenderBucket`: dupla grava `teamSize: 2`.
  if (isTeamCategory(category) || category.genderComposition != null) {
    return false;
  }
  if (category.genderFree === true) return false;

  const fromField = genderBucketFromText(category.genderType);
  if (fromField !== undefined) return fromField === null;
  for (const key of ["categoryName", "name"]) {
    const fromName = genderBucketFromText(category[key]);
    if (fromName !== undefined) return fromName === null;
  }
  return false;
}

export type MixedDuoGenderEvaluation = {
  /** Sem gênero utilizável no perfil (vazio ou fora de M/F). */
  missing: string[];
  /** Os dois declararam o MESMO gênero — a dupla mista não fecha. */
  sameGender: string[];
};

/**
 * Avalia um par de dupla mista.
 *
 * Gênero fora de M/F (ex.: "Outro") entra em `missing`, não em `sameGender`:
 * não dá para afirmar que fecha 1H+1M, mas tratá-lo como conflito com qualquer
 * parceiro barraria o atleta em toda dupla mista.
 */
export function evaluateMixedDuoGender(
  athletes: Array<{name: string; gender: unknown}>,
): MixedDuoGenderEvaluation {
  const result: MixedDuoGenderEvaluation = {missing: [], sameGender: []};
  const declared: Array<{name: string; bucket: AthleteGenderBucket}> = [];

  for (const athlete of athletes) {
    const raw = typeof athlete.gender === "string" ? athlete.gender.trim() : "";
    const bucket = raw ? normalizeAthleteGenderBucket(raw) : null;
    if (bucket !== "M" && bucket !== "F") {
      result.missing.push(athlete.name);
      continue;
    }
    declared.push({name: athlete.name, bucket});
  }

  if (declared.length >= 2) {
    const first = declared[0].bucket;
    if (declared.every((a) => a.bucket === first)) {
      result.sameGender = declared.map((a) => a.name);
    }
  }
  return result;
}

/**
 * Bloqueia dupla MISTA formada por dois atletas do mesmo gênero.
 *
 * Mesma política do gênero fixo: conflito DECLARADO bloqueia já no envio do
 * convite; gênero ausente só bloqueia no aceite (`requireDeclared`), porque o
 * convite é o empurrão pro atleta completar o perfil.
 *
 * Inscrições mistas de mesmo gênero criadas ANTES desta regra continuam de pé —
 * a validação só roda em convite/aceite novos.
 */
export async function assertMixedDuoGenderEligibility(params: {
  db: Firestore;
  category: Record<string, unknown> | null | undefined;
  uids: Array<string | undefined | null>;
  requireDeclared: boolean;
}): Promise<void> {
  const {db, category, uids, requireDeclared} = params;
  if (!categoryIsMixedDuo(category)) return;

  const cleanUids = Array.from(
    new Set(
      uids
        .map((uid) => (typeof uid === "string" ? uid.trim() : ""))
        .filter((uid) => uid.length > 0),
    ),
  );
  if (cleanUids.length < 2) return;

  const users = await Promise.all(
    cleanUids.map((uid) => loadUserAccessData(db, uid)),
  );
  const {missing, sameGender} = evaluateMixedDuoGender(
    users.map((u) => ({name: athleteDisplayName(u), gender: u?.gender})),
  );

  const categoryName = categoryDisplayName(category);

  if (sameGender.length > 0) {
    throw new HttpsError(
      "failed-precondition",
      `${formatNames(sameGender)} são do mesmo gênero e a categoria ` +
        `${categoryName} é mista — a dupla precisa de um homem e uma mulher.`,
    );
  }

  if (requireDeclared && missing.length > 0) {
    throw new HttpsError(
      "failed-precondition",
      `Informe o gênero no perfil de ${formatNames(missing)} para disputar ` +
        `a categoria ${categoryName} (Misto).`,
    );
  }
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
