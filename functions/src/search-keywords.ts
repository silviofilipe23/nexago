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

export type LeagueSearchFields = {
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

/**
 * Mesma normalização, mas PRESERVANDO o acento (só derruba caixa e pontuação).
 * As variantes acentuadas entram em `keywords` como apólice: qualquer
 * superfície que consulte sem passar por `normalizeSearchTerm` ainda acha o
 * atleta. Só é emitida quando difere da forma sem acento.
 */
export function normalizeAccentedTerm(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function normalizeToken(raw: string): string {
  return normalizeSearchTerm(raw);
}

// Só os separadores que de fato quebram palavra num nome. Apóstrofo e
// parênteses ficam de FORA de propósito: `D'Ávila` tem que virar `davila`
// (a normalização os apaga e cola as partes), não `d` + `avila`.
const TOKEN_SEPARATORS = /[\s@._-]+/;

function splitParts(value: string): string[] {
  return value.split(TOKEN_SEPARATORS).filter((p) => p.trim().length > 0);
}

/** Quebra texto em tokens: palavras, partes de e-mail e separadores `. _ -`. */
export function tokenizeSearchText(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const tokens: string[] = [];
  const seen = new Set<string>();
  const addParts = (value: string) => {
    for (const part of splitParts(value)) {
      const normalized = normalizeToken(part);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      tokens.push(normalized);
    }
  };

  if (trimmed.includes("@")) {
    const atIndex = trimmed.indexOf("@");
    addParts(trimmed.slice(0, atIndex));
    addParts(trimmed.slice(atIndex + 1));
  } else {
    addParts(trimmed);
  }

  return tokens;
}

/** Tokens preservando acento, na mesma quebra de `tokenizeSearchText`. */
function tokenizeAccentedText(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const source = trimmed.includes("@") ?
    `${trimmed.slice(0, trimmed.indexOf("@"))} ${trimmed.slice(
      trimmed.indexOf("@") + 1
    )}` :
    trimmed;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of splitParts(source)) {
    const accented = normalizeAccentedTerm(part);
    if (!accented || seen.has(accented)) continue;
    seen.add(accented);
    out.push(accented);
  }
  return out;
}

function looksLikeEmail(raw: string): boolean {
  const at = raw.trim().indexOf("@");
  return at > 0;
}

/**
 * Todas as formas indexáveis de um texto: cada palavra sem acento, cada
 * palavra com acento (quando difere) e a forma COLADA do texto inteiro — é
 * ela que faz `"ana_paula"` e `"João Silva"` casarem com quem digita
 * `"anapaula"` / `"joaosilva"`.
 */
export function searchVariants(raw: string): string[] {
  const ascii = tokenizeSearchText(raw);
  if (ascii.length === 0) return [];

  const out: string[] = [...ascii];
  const seen = new Set(ascii);

  const push = (value: string) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  };

  // A forma colada é para nome/apelido (`ana_paula` → `anapaula`). E-mail
  // fica de fora: `maria@gmail.com` viraria `mariagmailcom`, dezenas de
  // prefixos sem valor de busca — e o endereço reconstruído num espelho que
  // é declaradamente sem PII.
  if (ascii.length > 1 && !looksLikeEmail(raw)) push(ascii.join(""));
  for (const accented of tokenizeAccentedText(raw)) push(accented);

  return out;
}

function wordPrefixes(
  token: string,
  minPrefix: number,
  maxLen: number
): string[] {
  if (!token) return [];

  const limit = Math.min(token.length, maxLen);
  const out = new Set<string>();
  const start = Math.max(1, Math.min(minPrefix, limit));
  for (let i = start; i <= limit; i++) {
    out.add(token.slice(0, i));
  }
  out.add(token);
  return [...out];
}

/**
 * Gera as `keywords` de busca a partir de várias fontes de texto.
 *
 * Duas passadas de propósito: primeiro a forma EXATA de toda variante, depois
 * os prefixos. Assim, se o teto de `maxKeywords` estourar num nome muito
 * longo, o apelido ainda tem sua palavra inteira indexada — a passada única
 * gastava o orçamento todo nos prefixos da primeira fonte.
 */
export function generateKeywords(
  sources: string[],
  options: GenerateKeywordsOptions = {}
): string[] {
  const minPrefix = options.minPrefix ?? DEFAULT_MIN_PREFIX;
  const maxKeywords = options.maxKeywords ?? DEFAULT_MAX_KEYWORDS;

  const variants: string[] = [];
  const seenVariants = new Set<string>();
  for (const source of sources) {
    if (!source?.trim()) continue;
    for (const variant of searchVariants(source)) {
      if (seenVariants.has(variant)) continue;
      seenVariants.add(variant);
      variants.push(variant);
    }
  }

  const keywords = new Set<string>();
  for (const variant of variants) {
    if (keywords.size >= maxKeywords) break;
    keywords.add(variant);
  }
  for (const variant of variants) {
    if (keywords.size >= maxKeywords) break;
    for (const prefix of wordPrefixes(variant, minPrefix, 32)) {
      keywords.add(prefix);
      if (keywords.size >= maxKeywords) break;
    }
  }

  return [...keywords].sort();
}

/** Tokens do termo digitado, na ordem em que foram escritos. */
export function searchQueryTokens(raw: string): string[] {
  return tokenizeSearchText(raw);
}

/**
 * Token que vai no `array-contains`: o mais longo é o mais seletivo, então
 * `"de oliveira"` consulta por `oliveira` e não pela preposição. Os demais
 * tokens viram filtro no client (`profileMatchesSearchTokens`).
 */
export function searchAnchorToken(tokens: readonly string[]): string {
  let anchor = "";
  for (const token of tokens) {
    if (token.length > anchor.length) anchor = token;
  }
  return anchor;
}

export type SearchableProfile = {
  fullName?: string | null;
  name?: string | null;
  nickname?: string | null;
  keywords?: readonly string[] | null;
};

function profileTexts(profile: SearchableProfile): string[] {
  const out: string[] = [];
  const push = (v: string | null | undefined) => {
    if (typeof v === "string" && v.trim()) out.push(v);
  };
  push(profile.fullName);
  push(profile.name);
  push(profile.nickname ? normalizeNicknameForSearch(profile.nickname) : "");
  return out;
}

function tokenMatchesProfile(
  profile: SearchableProfile,
  variants: readonly string[],
  token: string
): boolean {
  if (Array.isArray(profile.keywords) && profile.keywords.includes(token)) {
    return true;
  }
  // Confere também contra o nome do próprio doc: `keywords` gravado por uma
  // versão antiga do gerador não pode esconder um atleta que casa de fato.
  return variants.some((variant) => variant.startsWith(token));
}

/**
 * O documento casa com TODOS os tokens digitados? É o `AND` que o Firestore
 * não faz: `array-contains` aceita um valor só, então a consulta ancora no
 * token mais seletivo e este filtro corta o resto — sem leitura extra, porque
 * `keywords` e o nome já vieram no próprio doc.
 */
export function profileMatchesSearchTokens(
  profile: SearchableProfile,
  tokens: readonly string[]
): boolean {
  if (tokens.length === 0) return false;
  const variants = profileTexts(profile).flatMap((text) => searchVariants(text));
  return tokens.every((token) => tokenMatchesProfile(profile, variants, token));
}

/**
 * Ordem de exibição do resultado: quanto menor, mais relevante. Sem isso o
 * `limit` do Firestore devolve um recorte arbitrário e o casamento exato pode
 * ficar de fora da página.
 */
export function searchRelevanceScore(
  profile: SearchableProfile,
  tokens: readonly string[]
): number {
  if (tokens.length === 0) return 9;
  const joined = tokens.join("");
  const nickname = normalizeSearchTerm(
    normalizeNicknameForSearch(profile.nickname ?? "")
  );
  const fullName = normalizeSearchTerm(
    profile.fullName?.trim() || profile.name?.trim() || ""
  );
  const words = profileTexts(profile).flatMap((text) =>
    tokenizeSearchText(text)
  );

  if (nickname === joined || fullName === joined) return 0;
  if (words.includes(joined)) return 1;
  if (nickname.startsWith(joined) || fullName.startsWith(joined)) return 2;
  if (words.some((word) => word.startsWith(tokens[0] ?? ""))) return 3;
  return 4;
}

function userDocHasRole(data: Record<string, unknown>, role: string): boolean {
  const roles = data.roles;
  return Array.isArray(roles) &&
    roles.some((r) => typeof r === "string" && r.trim().toLowerCase() === role);
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

export function buildLeagueSearchFields(
  data: Record<string, unknown>
): LeagueSearchFields {
  const name = readString(data, "name");
  const city = readString(data, "city");
  const seasonLabel =
    readString(data, "seasonLabel") || readString(data, "season");
  const sources = [name, city, seasonLabel];

  const stages = data.stages;
  if (Array.isArray(stages)) {
    for (const stage of stages) {
      if (!stage || typeof stage !== "object") continue;
      const stageName = readString(stage as Record<string, unknown>, "name");
      if (stageName) sources.push(stageName);
    }
  }

  return {
    keywords: generateKeywords(sources),
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

  const keys = ["fullName", "name", "nickname", "email", "roles"];
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

export function leagueSearchSourceFieldsChanged(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined
): boolean {
  if (!after) return false;
  if (!before) return true;

  const keys = ["name", "city", "seasonLabel", "season", "stages"];
  for (const key of keys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) return true;
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
