import {HttpsError} from "firebase-functions/v2/https";
import type {Firestore} from "firebase-admin/firestore";

export type UserAccessData = Record<string, unknown>;

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => (typeof e === "string" ? e.trim() : ""))
    .filter((s) => s.length > 0);
}

function resolveCity(data: UserAccessData): string {
  const cityField = trimString(data.city);
  if (!cityField) return "";
  const stateField = trimString(data.state);
  if (stateField && !cityField.includes("·")) return cityField;
  const idx = cityField.indexOf("·");
  if (idx > 0) return cityField.slice(0, idx).trim();
  return cityField;
}

function resolveState(data: UserAccessData): string {
  const stateField = trimString(data.state) || trimString(data.uf);
  if (stateField) return stateField;
  const cityField = trimString(data.city);
  const idx = cityField.indexOf("·");
  if (idx > 0) return cityField.slice(idx + 1).trim();
  return "";
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

function hasProfilePhoto(data: UserAccessData): boolean {
  const profilePhotoUrl = trimString(data.profilePhotoUrl);
  if (profilePhotoUrl) return true;
  const avatarUrl = trimString(data.avatarUrl);
  if (avatarUrl) return true;
  const photoURL = trimString(data.photoURL);
  return photoURL.length > 0;
}

function hasSportLevel(data: UserAccessData): boolean {
  const sportOnboarding = data.sportOnboarding;
  if (sportOnboarding != null && typeof sportOnboarding === "object") {
    const primarySportId = trimString(
      (sportOnboarding as Record<string, unknown>).primarySportId,
    );
    if (primarySportId) return true;
  }
  const primarySport = trimString(data.primarySport);
  if (primarySport) return true;
  const sport = trimString(data.sport);
  const level = trimString(data.level) || trimString(data.nivel);
  return sport.length > 0 && level.length > 0;
}

function hasCityAndState(data: UserAccessData): boolean {
  return resolveCity(data).length > 0 && resolveState(data).length > 0;
}

export function isValidWhatsApp(raw: unknown): boolean {
  const digits = trimString(raw).replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 11;
}

function hasGoals(data: UserAccessData): boolean {
  return stringList(data.goals).length > 0;
}

/** Espelha [ProfileCompletionState.allComplete] no app. */
export function isProfileStepsComplete(data: UserAccessData): boolean {
  return (
    hasProfilePhoto(data) &&
    hasSportLevel(data) &&
    hasCityAndState(data) &&
    isValidWhatsApp(data.phoneNumber) &&
    hasGoals(data)
  );
}

export function canAccessOfficialTournaments(data: UserAccessData): boolean {
  return isOnboardingCompleted(data) && isProfileStepsComplete(data);
}

export function tournamentAccessBlockMessage(data: UserAccessData): string {
  if (canAccessOfficialTournaments(data)) {
    return "";
  }
  if (!isOnboardingCompleted(data)) {
    return "Conclua o cadastro inicial para competir em torneios oficiais.";
  }
  return "Complete os 5 passos do perfil para desbloquear torneios oficiais.";
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
