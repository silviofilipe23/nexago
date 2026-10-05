/**
 * Catálogo de esportes (spec multiesporte 2026-10-03, eixo 1). Os dados vêm de
 * `catalog.generated.ts` (gerado de `sports/catalog.json`); a lógica aqui é a
 * MESMA de `frontend/shared/sports/index.ts` e `core/sports/sport_catalog.dart`
 * — os vetores em `vectors.generated.ts` provam a paridade.
 */
import {
  SPORT_CATALOG,
  SPORT_INDEX,
  type SportCatalogEntry,
  type SportSupport,
} from "./catalog.generated";

export {SPORT_CATALOG, SPORT_UNKNOWN_LABEL} from "./catalog.generated";
export type {SportCatalogEntry, SportSupport} from "./catalog.generated";

const FOLD: Readonly<Record<string, string>> = {
  "á": "a", "à": "a", "â": "a", "ã": "a", "ä": "a", "é": "e", "è": "e", "ê": "e", "ë": "e",
  "í": "i", "ì": "i", "î": "i", "ï": "i", "ó": "o", "ò": "o", "ô": "o", "õ": "o", "ö": "o",
  "ú": "u", "ù": "u", "û": "u", "ü": "u", "ç": "c", "ñ": "n",
};

const INDEX = new Map(Object.entries(SPORT_INDEX));
const BY_CODE = new Map(SPORT_CATALOG.map((e) => [e.code, e]));

export function normalizeSportKey(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let out = "";
  for (const ch of raw.toLowerCase()) {
    const c = FOLD[ch] ?? ch;
    if (/^[a-z0-9]$/.test(c)) out += c;
  }
  return out;
}

export function resolveSport(raw: unknown): SportCatalogEntry | null {
  const code = INDEX.get(normalizeSportKey(raw));
  return code ? BY_CODE.get(code) ?? null : null;
}

export function sportProfileCode(raw: unknown): string | null {
  return resolveSport(raw)?.profileCode ?? null;
}

export function titleCaseSportCode(raw: string): string {
  return raw
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Conhecido → rótulo do catálogo; desconhecido → o código em title case; vazio → null. */
export function sportLabel(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  return resolveSport(raw)?.label ?? titleCaseSportCode(raw);
}

export function sportsWithSupport(support: SportSupport): SportCatalogEntry[] {
  return SPORT_CATALOG.filter((e) => e.support === support);
}
