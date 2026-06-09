/** Prefixos de palavras para busca Firestore (`keywords` + `array-contains`). */

export const DEFAULT_MIN_PREFIX = 2;
export const DEFAULT_MAX_KEYWORDS = 400;

export type GenerateKeywordsOptions = {
  minPrefix?: number;
  maxKeywords?: number;
};

export type UserSearchFields = {
  keywords: string[];
  hasAthleteRole: boolean;
  hasOrganizerRole: boolean;
};

export type TournamentSearchFields = {
  keywords: string[];
};

export type TeamSearchFields = {
  keywords: string[];
  player1DisplayName?: string;
  player2DisplayName?: string;
};

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

/** Normaliza termo digitado na busca (lowercase, sem acentos, alfanumérico). */
export function normalizeSearchTerm(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return stripDiacritics(trimmed)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeToken(raw: string): string {
  return normalizeSearchTerm(raw);
}

/** Quebra texto em tokens: palavras, partes de e-mail e separadores `. _ -`. */
export function tokenizeSearchText(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const tokens = new Set<string>();
  const addParts = (value: string) => {
    const parts = value
      .split(/[\s@._-]+/)
      .map((p) => normalizeToken(p))
      .filter((p) => p.length > 0);
    for (const part of parts) tokens.add(part);
  };

  if (trimmed.includes("@")) {
    const [local, domain] = trimmed.split("@");
    addParts(local);
    addParts(domain);
  } else {
    addParts(trimmed);
  }

  return [...tokens];
}

function wordPrefixes(
  token: string,
  minPrefix: number,
  maxLen: number
): string[] {
  const normalized = normalizeToken(token);
  if (!normalized) return [];

  const limit = Math.min(normalized.length, maxLen);
  const out = new Set<string>();
  const start = Math.max(1, Math.min(minPrefix, limit));
  for (let i = start; i <= limit; i++) {
    out.add(normalized.slice(0, i));
  }
  out.add(normalized);
  return [...out];
}

/** Gera prefixos por palavra a partir de várias fontes de texto. */
export function generateKeywords(
  sources: string[],
  options: GenerateKeywordsOptions = {}
): string[] {
  const minPrefix = options.minPrefix ?? DEFAULT_MIN_PREFIX;
  const maxKeywords = options.maxKeywords ?? DEFAULT_MAX_KEYWORDS;
  const keywords = new Set<string>();

  for (const source of sources) {
    if (!source?.trim()) continue;
    for (const token of tokenizeSearchText(source)) {
      for (const prefix of wordPrefixes(token, minPrefix, 32)) {
        keywords.add(prefix);
        if (keywords.size >= maxKeywords) {
          return [...keywords].sort();
        }
      }
    }
  }

  return [...keywords].sort();
}

function userDocHasRole(data: Record<string, unknown>, role: string): boolean {
  const roles = data.roles;
  if (Array.isArray(roles) && roles.length > 0) {
    return roles.some((r) => typeof r === "string" && r.trim().toLowerCase() === role);
  }
  const legacy = data.role;
  return typeof legacy === "string" && legacy.trim().toLowerCase() === role;
}

function readString(data: Record<string, unknown>, key: string): string {
  const v = data[key];
  return typeof v === "string" ? v.trim() : "";
}

/** Remove `@` inicial de apelidos antes de tokenizar. */
export function normalizeNicknameForSearch(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("@") ? trimmed.slice(1).trim() : trimmed;
}

export function buildUserSearchFields(
  data: Record<string, unknown>
): UserSearchFields {
  const fullName = readString(data, "fullName") || readString(data, "name");
  const nickname = normalizeNicknameForSearch(readString(data, "nickname"));
  const email = readString(data, "email");

  return {
    keywords: generateKeywords([fullName, nickname, email]),
    hasAthleteRole: userDocHasRole(data, "athlete"),
    hasOrganizerRole: userDocHasRole(data, "organizer"),
  };
}

export function buildTournamentSearchFields(
  data: Record<string, unknown>
): TournamentSearchFields {
  const name = readString(data, "name");
  const city = readString(data, "city");
  const location = readString(data, "location");
  const seasonLabel = readString(data, "seasonLabel");

  return {
    keywords: generateKeywords([name, city, location, seasonLabel]),
  };
}

export function buildTeamSearchFields(
  data: Record<string, unknown>,
  playerNames: string[] = []
): TeamSearchFields {
  const teamName = readString(data, "teamName");
  const p1 = readString(data, "player1DisplayName");
  const p2 = readString(data, "player2DisplayName");
  const sources = [teamName, p1, p2, ...playerNames].filter((s) => s.length > 0);

  const fields: TeamSearchFields = {
    keywords: generateKeywords(sources),
  };

  const resolvedP1 = p1 || playerNames[0] || "";
  const resolvedP2 = p2 || playerNames[1] || "";
  if (resolvedP1) fields.player1DisplayName = resolvedP1;
  if (resolvedP2) fields.player2DisplayName = resolvedP2;

  return fields;
}

export function searchFieldsChanged(
  current: Record<string, unknown> | undefined,
  next: Record<string, unknown>
): boolean {
  if (!current) return true;

  for (const [key, value] of Object.entries(next)) {
    const prev = current[key];
    if (Array.isArray(value) && Array.isArray(prev)) {
      if (value.length !== prev.length) return true;
      const a = [...value].map(String).sort();
      const b = [...prev].map(String).sort();
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return true;
      }
      continue;
    }
    if (prev !== value) return true;
  }
  return false;
}

export function userSearchSourceFieldsChanged(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined
): boolean {
  if (!after) return false;
  if (!before) return true;

  const keys = ["fullName", "name", "nickname", "email", "role", "roles"];
  for (const key of keys) {
    const b = before[key];
    const a = after[key];
    if (JSON.stringify(b) !== JSON.stringify(a)) return true;
  }
  return false;
}

export function tournamentSearchSourceFieldsChanged(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined
): boolean {
  if (!after) return false;
  if (!before) return true;

  const keys = ["name", "city", "location", "seasonLabel"];
  for (const key of keys) {
    if (before[key] !== after[key]) return true;
  }
  return false;
}

export function teamSearchSourceFieldsChanged(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined
): boolean {
  if (!after) return false;
  if (!before) return true;

  const keys = [
    "teamName",
    "player1Id",
    "player2Id",
    "player1DisplayName",
    "player2DisplayName",
  ];
  for (const key of keys) {
    if (before[key] !== after[key]) return true;
  }
  return false;
}
