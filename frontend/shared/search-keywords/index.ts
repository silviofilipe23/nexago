/**
 * Fonte única das `keywords` de busca no frontend — porte fiel de
 * `functions/src/search-keywords.ts` (canônico) e gêmeo de
 * `nexago_app/lib/core/search/search_keywords.dart`.
 *
 * Os três precisam gerar o MESMO conjunto: quem grava o doc pode ser a CF, o
 * app ou o painel, e quem consulta é qualquer uma das superfícies. Se
 * divergirem, some atleta da busca.
 */

export const DEFAULT_MIN_PREFIX = 2;
export const DEFAULT_MAX_KEYWORDS = 400;

export type GenerateKeywordsOptions = {
  minPrefix?: number;
  maxKeywords?: number;
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

/** Remove `@` inicial de apelidos antes de tokenizar. */
export function normalizeNicknameForSearch(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("@") ? trimmed.slice(1).trim() : trimmed;
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
