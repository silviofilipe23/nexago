/** Porta fiel de `nexago_app/lib/core/search/search_keywords.dart` (que por sua vez espelha
 *  `functions/src/search-keywords.ts`): prefixos por palavra pra busca no Firestore. O doc de
 *  torneio/liga publicado pelo painel precisa gravar os MESMOS `keywords` que o app gravaria,
 *  senão eventos criados na web ficam invisíveis na busca do app. */

const MIN_PREFIX_LENGTH = 2;
const MAX_KEYWORDS = 400;

function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeSearchTerm(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return stripDiacritics(trimmed)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function tokenizeSearchText(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const tokens = new Set<string>();

  const addParts = (value: string): void => {
    for (const part of value.split(/[\s@._-]+/)) {
      const normalized = normalizeSearchTerm(part);
      if (normalized) tokens.add(normalized);
    }
  };

  if (trimmed.includes('@')) {
    const atIndex = trimmed.indexOf('@');
    addParts(trimmed.slice(0, atIndex));
    addParts(trimmed.slice(atIndex + 1));
  } else {
    addParts(trimmed);
  }

  return [...tokens];
}

function wordPrefixes(token: string, minPrefix: number, maxLen: number): string[] {
  const normalized = normalizeSearchTerm(token);
  if (!normalized) return [];
  const limit = Math.min(normalized.length, maxLen);
  const out = new Set<string>();
  const start = Math.min(Math.max(minPrefix, 1), limit);
  for (let i = start; i <= limit; i++) out.add(normalized.slice(0, i));
  out.add(normalized);
  return [...out];
}

export function generateKeywords(sources: readonly string[]): string[] {
  const keywords = new Set<string>();
  for (const source of sources) {
    if (!source.trim()) continue;
    for (const token of tokenizeSearchText(source)) {
      for (const prefix of wordPrefixes(token, MIN_PREFIX_LENGTH, 32)) {
        keywords.add(prefix);
        if (keywords.size >= MAX_KEYWORDS) return [...keywords].sort();
      }
    }
  }
  return [...keywords].sort();
}
