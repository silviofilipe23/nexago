import {HttpsError} from "firebase-functions/v2/https";
import type {Firestore} from "firebase-admin/firestore";
import {Timestamp} from "firebase-admin/firestore";
import {loadUserAccessData, type UserAccessData} from "./athlete-tournament-access";

/**
 * Elegibilidade de categoria por faixa etária (restrição configurável por
 * categoria). Espelha `category-level-eligibility.ts`.
 *
 * Restrição (`categories[].ageRestriction`):
 *   { mode: 'none'|'min'|'max'|'range', minAge?, maxAge?,
 *     reference: 'tournamentStart'|'yearEnd'|'registration' }
 *
 * Fallback legado: deriva de `categories[].ageBand` (subN→max N, +N→min N,
 * open→none), referência `tournamentStart`.
 */

export type AgeMode = "none" | "min" | "max" | "range";
export type AgeReference = "tournamentStart" | "yearEnd" | "registration";

export interface AgeRestriction {
  mode: AgeMode;
  minAge: number | null;
  maxAge: number | null;
  reference: AgeReference;
}

const NO_RESTRICTION: AgeRestriction = {
  mode: "none",
  minAge: null,
  maxAge: null,
  reference: "tournamentStart",
};

function toInt(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function parseReference(raw: unknown): AgeReference {
  return raw === "yearEnd" || raw === "registration" ? raw : "tournamentStart";
}

/** Deriva restrição do preset `ageBand` (Sub-N→max, +N→min, Livre→none). */
function fromAgeBand(rawAgeBand: unknown): AgeRestriction {
  const band = typeof rawAgeBand === "string" ? rawAgeBand.trim().toLowerCase() : "";
  if (!band || band === "open") return NO_RESTRICTION;
  const subMatch = /^sub(\d{2})$/.exec(band);
  if (subMatch) {
    return {mode: "max", minAge: null, maxAge: Number(subMatch[1]), reference: "tournamentStart"};
  }
  const plusMatch = /^plus(\d{2})$/.exec(band);
  if (plusMatch) {
    return {mode: "min", minAge: Number(plusMatch[1]), maxAge: null, reference: "tournamentStart"};
  }
  return NO_RESTRICTION;
}

export function parseAgeRestriction(
  category: Record<string, unknown> | null | undefined,
): AgeRestriction {
  if (!category) return NO_RESTRICTION;

  const raw = category.ageRestriction;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const mode = obj.mode;
    if (mode === "none" || mode === "min" || mode === "max" || mode === "range") {
      return {
        mode,
        minAge: toInt(obj.minAge),
        maxAge: toInt(obj.maxAge),
        reference: parseReference(obj.reference),
      };
    }
  }

  return fromAgeBand(category.ageBand);
}

export function restrictionHasLimit(r: AgeRestriction): boolean {
  if (r.mode === "min") return r.minAge != null;
  if (r.mode === "max") return r.maxAge != null;
  if (r.mode === "range") return r.minAge != null || r.maxAge != null;
  return false;
}

function parseBirthDate(raw: unknown): Date | null {
  if (raw instanceof Timestamp) return raw.toDate();
  if (raw instanceof Date) return raw;
  if (typeof raw === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}

/** Idade conforme a referência da restrição. */
export function computeAge(params: {
  birthDate: Date;
  reference: AgeReference;
  tournamentStart: Date | null;
  now: Date;
}): number {
  const {birthDate, reference, tournamentStart, now} = params;
  if (reference === "yearEnd") {
    const refYear = (tournamentStart ?? now).getFullYear();
    return refYear - birthDate.getFullYear();
  }
  const ref = reference === "registration" ? now : (tournamentStart ?? now);
  let age = ref.getFullYear() - birthDate.getFullYear();
  const beforeBirthday =
    ref.getMonth() < birthDate.getMonth() ||
    (ref.getMonth() === birthDate.getMonth() && ref.getDate() < birthDate.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function isAgeEligible(restriction: AgeRestriction, age: number): boolean {
  switch (restriction.mode) {
    case "min":
      return restriction.minAge == null || age >= restriction.minAge;
    case "max":
      return restriction.maxAge == null || age <= restriction.maxAge;
    case "range":
      return (
        (restriction.minAge == null || age >= restriction.minAge) &&
        (restriction.maxAge == null || age <= restriction.maxAge)
      );
    default:
      return true;
  }
}

export function ageRestrictionLabel(r: AgeRestriction): string {
  switch (r.mode) {
    case "min":
      return r.minAge != null ? `${r.minAge}+ anos` : "idade mínima";
    case "max":
      return r.maxAge != null ? `até ${r.maxAge} anos` : "idade máxima";
    case "range":
      if (r.minAge != null && r.maxAge != null) return `${r.minAge}–${r.maxAge} anos`;
      if (r.minAge != null) return `${r.minAge}+ anos`;
      if (r.maxAge != null) return `até ${r.maxAge} anos`;
      return "faixa etária";
    default:
      return "livre";
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
    const value = category[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "categoria";
}

function tournamentStartDate(tournament: Record<string, unknown>): Date | null {
  const raw = tournament.startAt ?? tournament.startDate;
  return parseBirthDate(raw);
}

/**
 * Bloqueia a inscrição quando algum atleta está fora da faixa etária da
 * categoria, ou quando falta a data de nascimento. Cada atleta é validado
 * individualmente; a mensagem nomeia quem está fora.
 */
export async function assertTeamAgeEligibility(params: {
  db: Firestore;
  tournament: Record<string, unknown>;
  category: Record<string, unknown> | null | undefined;
  uids: Array<string | undefined | null>;
  now?: Date;
}): Promise<void> {
  const {db, tournament, category, uids} = params;
  const now = params.now ?? new Date();

  const restriction = parseAgeRestriction(category);
  if (!restrictionHasLimit(restriction)) return;

  const cleanUids = Array.from(
    new Set(
      uids
        .map((uid) => (typeof uid === "string" ? uid.trim() : ""))
        .filter((uid) => uid.length > 0),
    ),
  );
  if (cleanUids.length === 0) return;

  const tournamentStart = tournamentStartDate(tournament);
  const users = await Promise.all(
    cleanUids.map((uid) => loadUserAccessData(db, uid)),
  );

  // 1) Sem data de nascimento → bloqueia pedindo completar o perfil.
  const missing = users.filter(
    (u) => parseBirthDate(u?.birthDate) == null,
  );
  if (missing.length > 0) {
    const names = missing.map(athleteDisplayName);
    throw new HttpsError(
      "failed-precondition",
      `Informe a data de nascimento no perfil de ${formatNames(names)} ` +
        "para se inscrever em uma categoria com restrição de idade.",
    );
  }

  // 2) Fora da faixa.
  const categoryName = categoryDisplayName(category);
  const label = ageRestrictionLabel(restriction);
  const offenders: string[] = [];
  for (const u of users) {
    const birthDate = parseBirthDate(u?.birthDate)!;
    const age = computeAge({
      birthDate,
      reference: restriction.reference,
      tournamentStart,
      now,
    });
    if (!isAgeEligible(restriction, age)) {
      offenders.push(`${athleteDisplayName(u)} (${age} anos)`);
    }
  }
  if (offenders.length === 0) return;

  const verb = offenders.length === 1 ? "não atende" : "não atendem";
  throw new HttpsError(
    "failed-precondition",
    `${formatNames(offenders)} ${verb} a restrição de idade da categoria ` +
      `${categoryName} (${label}).`,
  );
}

function formatNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}
