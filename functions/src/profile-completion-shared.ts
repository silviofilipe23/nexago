/**
 * Leitura de campos de perfil (`users/{uid}`) compartilhada entre
 * profile-completion-gamification.ts e achievement-engine.ts.
 * Extraído para evitar import circular entre os dois módulos.
 */

export type ProfileCompletionStepId =
  | "photo"
  | "sport_level"
  | "city"
  | "whatsapp"
  | "goals";

export const PROFILE_STEPS: ProfileCompletionStepId[] = [
  "photo",
  "sport_level",
  "city",
  "whatsapp",
  "goals",
];

export const STEP_XP: Record<ProfileCompletionStepId, number> = {
  photo: 30,
  sport_level: 30,
  city: 20,
  whatsapp: 30,
  goals: 40,
};

export const STEP_XP_REASON: Record<ProfileCompletionStepId, string> = {
  photo: "PROFILE_STEP_PHOTO",
  sport_level: "PROFILE_STEP_SPORT_LEVEL",
  city: "PROFILE_STEP_CITY",
  whatsapp: "PROFILE_STEP_WHATSAPP",
  goals: "PROFILE_STEP_GOALS",
};

export type ProfileRewardContext = {
  onboardingCompleted: boolean;
  allStepsComplete: boolean;
  stepDone: Record<ProfileCompletionStepId, boolean>;
};

export function profileStepEventId(stepId: ProfileCompletionStepId): string {
  return `profile_step_${stepId}`;
}

export function achievementEventId(achievementId: string): string {
  return `achievement_${achievementId.trim()}`;
}

export function stringField(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

export function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => stringField(item))
    .filter((item) => item.length > 0);
}

export function isValidWhatsApp(raw: unknown): boolean {
  const digits = stringField(raw).replace(/\D/g, "");
  if (digits.length >= 10 && digits.length <= 11) return true;
  if (digits.length >= 12 && digits.length <= 13 && digits.startsWith("55")) {
    return true;
  }
  return false;
}

export function parseLegacyLocation(raw: string): {city: string; state: string} {
  const trimmed = raw.trim();
  if (!trimmed) return {city: "", state: ""};

  const dotParts = trimmed.split("·");
  if (dotParts.length >= 2) {
    const city = dotParts[0]?.trim() ?? "";
    const state = (dotParts[dotParts.length - 1] ?? "").trim().toUpperCase();
    if (state.length === 2) return {city, state};
  }

  const commaParts = trimmed.split(",");
  if (commaParts.length >= 2) {
    const city = commaParts[0]?.trim() ?? "";
    const state = (commaParts[commaParts.length - 1] ?? "").trim().toUpperCase();
    if (state.length === 2) return {city, state};
  }

  return {city: trimmed, state: ""};
}

export function isCityStepDone(data: Record<string, unknown>): boolean {
  const city = stringField(data["city"]);
  if (!city) return false;
  const state = stringField(data["state"]);
  if (state) return true;
  return parseLegacyLocation(city).state.length === 2;
}

export function isSportLevelStepDone(data: Record<string, unknown>): boolean {
  const primarySport = stringField(data["primarySportFirestoreId"]);
  if (primarySport) return true;

  const levelsBySport = data["levelsBySport"];
  if (levelsBySport && typeof levelsBySport === "object") {
    if (Object.keys(levelsBySport as Record<string, unknown>).length > 0) {
      return true;
    }
  }

  const sports = stringList(data["sports"]);
  if (sports.length > 0) return true;

  const sport = stringField(data["sport"]);
  const level = stringField(data["level"]);
  if (sport && level) return true;
  return sport.length > 0;
}

export function computeProfileRewardContext(
  data: Record<string, unknown>,
): ProfileRewardContext {
  const stepDone: Record<ProfileCompletionStepId, boolean> = {
    photo: stringField(data["avatarUrl"]).length > 0,
    sport_level: isSportLevelStepDone(data),
    city: isCityStepDone(data),
    whatsapp: data["phoneVerified"] === true,
    goals:
      stringList(data["goals"]).length > 0 ||
      stringField(data["gameObjective"]).length > 0,
  };

  const allStepsComplete = PROFILE_STEPS.every((step) => stepDone[step]);
  const onboardingCompleted =
    data["onboardingCompleted"] === true || allStepsComplete;

  return {
    onboardingCompleted,
    allStepsComplete,
    stepDone,
  };
}
