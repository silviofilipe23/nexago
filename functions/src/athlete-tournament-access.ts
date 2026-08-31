import {HttpsError} from "firebase-functions/v2/https";
import type {Firestore} from "firebase-admin/firestore";

export type UserAccessData = Record<string, unknown>;

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Parse legado `"Aparecida de Goiânia · GO"` ou `"Goiânia GO"`. */
function parseLegacyLocation(raw: string): {city: string; state: string} {
  const trimmed = raw.trim();
  if (!trimmed) return {city: "", state: ""};

  const parts = trimmed.split("·");
  if (parts.length >= 2) {
    const city = parts[0].trim();
    const state = parts[parts.length - 1].trim().toUpperCase();
    if (state.length === 2) return {city, state};
  }

  const match = /\s+([A-Z]{2})\s*$/.exec(trimmed);
  if (match) {
    const state = match[1];
    const city = trimmed.slice(0, match.index).trim();
    return {city, state};
  }

  return {city: trimmed, state: ""};
}

function resolveCity(data: UserAccessData): string {
  const cityField = trimString(data.city);
  if (!cityField) return "";
  const stateField = trimString(data.state);
  if (stateField && !cityField.includes("·")) return cityField;
  const idx = cityField.indexOf("·");
  if (idx > 0) return cityField.slice(0, idx).trim();
  return parseLegacyLocation(cityField).city;
}

export function isOnboardingCompleted(data: UserAccessData): boolean {
  if (data.isProfileComplete === true) return true;
  if (data.onboardingCompleted === true) return true;
  const sportOnboarding = data.sportOnboarding;
  if (
    sportOnboarding != null &&
    typeof sportOnboarding === "object" &&
    (sportOnboarding as Record<string, unknown>).completedAt != null
  ) {
    return true;
  }
  return false;
}

export function isValidWhatsApp(raw: unknown): boolean {
  const digits = trimString(raw).replace(/\D/g, "");
  if (digits.length >= 10 && digits.length <= 11) return true;
  if (digits.length >= 12 && digits.length <= 13 && digits.startsWith("55")) {
    return true;
  }
  return false;
}

/** WhatsApp utilizável para contato: número declarado pelo atleta OU posse
 *  confirmada por SMS (Firebase Phone Auth, gravada só pela Cloud Function
 *  `confirmPhoneVerification`).
 *
 *  A verificação por SMS deixou de ser obrigatória para inscrição — o SMS não
 *  chega para parte dos atletas e travava a inscrição inteira. O selo
 *  `phoneVerified` continua valendo (contas legadas verificadas antes de
 *  `phoneNumber` existir no doc passam só por ele), mas um número em formato
 *  válido já basta para o organizador ter contato. */
function hasWhatsApp(data: UserAccessData): boolean {
  if (data.phoneVerified === true) return true;
  return isValidWhatsApp(data.phoneNumber);
}

/** Cidade preenchida (UF não obrigatória para torneios). */
function hasCity(data: UserAccessData): boolean {
  return resolveCity(data).length > 0;
}

/** IDs dos requisitos mínimos para torneios. */
export type TournamentProfileRequirementId =
  | "onboarding"
  | "whatsapp"
  | "city";

const TOURNAMENT_REQUIREMENT_LABELS: Record<TournamentProfileRequirementId, string> = {
  onboarding: "cadastro inicial",
  whatsapp: "WhatsApp",
  city: "cidade",
};

/** Requisitos de torneio ainda pendentes. */
export function missingTournamentProfileRequirementIds(
  data: UserAccessData,
): TournamentProfileRequirementId[] {
  const missing: TournamentProfileRequirementId[] = [];
  if (!isOnboardingCompleted(data)) missing.push("onboarding");
  if (!hasWhatsApp(data)) missing.push("whatsapp");
  if (!hasCity(data)) missing.push("city");
  return missing;
}

/** Rótulos (PT) dos requisitos pendentes para o gate de torneio. Doc ausente
 *  conta como tudo pendente; perfil pronto (inclui o curto-circuito legado
 *  `isProfileComplete`) devolve lista vazia. */
export function missingTournamentProfileRequirementLabels(
  data: UserAccessData | null,
): string[] {
  if (data != null && isTournamentProfileReady(data)) return [];
  const missing = data == null ?
    (Object.keys(TOURNAMENT_REQUIREMENT_LABELS) as
      TournamentProfileRequirementId[]) :
    missingTournamentProfileRequirementIds(data);
  return missing.map((id) => TOURNAMENT_REQUIREMENT_LABELS[id]);
}

function formatMissingStepsList(labels: string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} e ${labels[1]}`;
  const head = labels.slice(0, -1).join(", ");
  return `${head} e ${labels[labels.length - 1]}`;
}

/** Perfil mínimo para inscrição em torneios. */
export function isTournamentProfileReady(data: UserAccessData): boolean {
  if (data.isProfileComplete === true) return true;
  return isOnboardingCompleted(data) && hasWhatsApp(data) && hasCity(data);
}

/** @deprecated Gamificação — não usar para gate de torneios. */
export function isProfileStepsComplete(_data: UserAccessData): boolean {
  return isTournamentProfileReady(_data);
}

/** @deprecated Use missingTournamentProfileRequirementIds. */
export function missingProfileStepIds(
  data: UserAccessData,
): TournamentProfileRequirementId[] {
  return missingTournamentProfileRequirementIds(data);
}

export function canAccessOfficialTournaments(data: UserAccessData): boolean {
  return isTournamentProfileReady(data);
}

export function tournamentAccessBlockMessage(data: UserAccessData): string {
  if (canAccessOfficialTournaments(data)) {
    return "";
  }
  const missing = missingTournamentProfileRequirementIds(data);
  if (missing.length === 0) {
    return "Complete cadastro, WhatsApp e cidade para desbloquear torneios oficiais.";
  }
  const list = formatMissingStepsList(
    missing.map((id) => TOURNAMENT_REQUIREMENT_LABELS[id]),
  );
  if (missing.includes("onboarding")) {
    return `Conclua o cadastro inicial. Falta: ${list}.`;
  }
  return `Falta completar no perfil: ${list}.`;
}

export async function loadUserAccessData(
  db: Firestore,
  uid: string,
): Promise<UserAccessData | null> {
  const trimmed = uid.trim();
  if (!trimmed) return null;
  const snap = await db.doc(`users/${trimmed}`).get();
  if (!snap.exists) return null;
  return snap.data() as UserAccessData;
}

/** Valida perfil antes de convite, aceite ou PIX de torneio. */
export async function assertCanRegisterInTournament(
  db: Firestore,
  uid: string,
): Promise<void> {
  const data = await loadUserAccessData(db, uid);
  if (data == null) {
    throw new HttpsError(
      "failed-precondition",
      "Conclua o cadastro inicial para competir em torneios oficiais.",
    );
  }
  if (!canAccessOfficialTournaments(data)) {
    const message = tournamentAccessBlockMessage(data);
    throw new HttpsError(
      "failed-precondition",
      message || "Complete seu perfil para se inscrever em torneios.",
    );
  }
}
