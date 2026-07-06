import {levelDisplayLabel} from "./category-level-eligibility";

/** Gênero da categoria em português (ex.: Masculino, Feminino, Misto). */
export function genderTypeDisplayLabel(raw: unknown): string | null {
  const g = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (g === "male" || g === "masc" || g === "masculino") return "Masculino";
  if (g === "female" || g === "fem" || g === "feminino") return "Feminino";
  if (g === "mixed" || g === "misto") return "Misto";
  return null;
}

/** Faixa etária legível (ex.: Sub-21, +40). `null` quando Livre/open. */
export function ageBandDisplayLabel(raw: unknown): string | null {
  const band = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!band || band === "open" || band === "livre") return null;
  const subMatch = /^sub(\d{2})$/.exec(band);
  if (subMatch) return `Sub-${subMatch[1]}`;
  const plusMatch = /^plus(\d{2})$/.exec(band);
  if (plusMatch) return `+${plusMatch[1]}`;
  return band;
}

/**
 * Rótulo da categoria para notificações (ex.: `Masculino Sub-21 Intermediário`).
 * Espelha a composição do wizard (`suggestCategoryName`).
 */
export function formatCategoryInviteNotificationLabel(
  category: Record<string, unknown> | null | undefined,
): string {
  if (!category) return "categoria";

  const parts: string[] = [];
  const gender = genderTypeDisplayLabel(category.genderType);
  if (gender) parts.push(gender);

  const age = ageBandDisplayLabel(category.ageBand);
  if (age) parts.push(age);

  const rawLevel = category.level;
  if (typeof rawLevel === "string" && rawLevel.trim()) {
    // Preserva o label do nível da categoria (legado incluso), sem renumerar.
    parts.push(levelDisplayLabel(rawLevel) ?? rawLevel.trim());
  }

  if (parts.length > 0) return parts.join(" ");

  const name = String(category.categoryName ?? category.name ?? "").trim();
  return name || "categoria";
}
