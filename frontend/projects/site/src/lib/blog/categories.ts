/**
 * Categorias do blog: as 6 de origem (valem sem doc) ⊕ `blogCategories/{id}` do Firestore. Doc vence
 * no mesmo id (rótulo, cor, ordem, ativa); a lista sai por `order` e depois rótulo. Contrato em
 * `functions/src/blog-taxonomy.ts` (`BLOG_DEFAULT_CATEGORIES`).
 *
 * Cor: cada categoria tem `dark` (texto/borda no tema escuro), `light` (texto no tema claro) e `art`
 * (capa-placeholder, sempre escura). As 6 de origem sem doc usam os tokens `--color-cat-*` (que já
 * trocam de tom no claro) e o hex escuro na arte. Categoria com doc usa o hex do doc — dado dinâmico,
 * exceção ao "nunca hex cru" — aplicado só como CSS custom property no elemento (`BlogCategoryChip`,
 * `BlogCover`), nunca em classe.
 */
export interface BlogCategoryView {
  id: string;
  label: string;
  order: number;
  active: boolean;
  /** Valor CSS (`var(--color-cat-x)` ou `#RRGGBB`). */
  dark: string;
  /** Valor CSS (`var(--color-cat-x)` ou `#RRGGBB`). */
  light: string;
  /** Hex do tom escuro, para a capa-placeholder. */
  art: string;
}

function preset(id: string, label: string, art: string, order: number): BlogCategoryView {
  const token = `var(--color-cat-${id})`;
  return { id, label, order, active: true, dark: token, light: token, art };
}

/** Mesmos ids, rótulos, ordem e tom escuro de `BLOG_DEFAULT_CATEGORIES` (servidor). */
export const BLOG_DEFAULT_CATEGORIES: readonly BlogCategoryView[] = [
  preset('torneios', 'Torneios', '#ff6a1a', 0),
  preset('treino', 'Treino', '#2bd17e', 1),
  preset('regras', 'Regras', '#c9a7ff', 2),
  preset('arenas', 'Arenas', '#e3b85c', 3),
  preset('guia', 'Guia do app', '#9ab4ff', 4),
  preset('loja', 'Loja', '#ff8a4a', 5),
];

/** Post sem categoria resolvida (os estáticos antigos, com rótulo da tag): chip e arte da marca. */
export const BLOG_NEUTRAL_ART = '#ff6a1a';

const HEX = /^#[0-9a-f]{6}$/i;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function hex(value: unknown): string | null {
  return typeof value === 'string' && HEX.test(value.trim()) ? value.trim().toLowerCase() : null;
}

/**
 * Doc → categoria, sobre a de origem do mesmo id quando houver (campo inválido mantém o da origem).
 * Categoria nova sem rótulo ou sem as duas cores válidas é descartada.
 */
export function mapCategoryDoc(id: string, data: Record<string, unknown>, base?: BlogCategoryView): BlogCategoryView | null {
  if (!ID.test(id) || id.length > 32) return null;
  if (!base && !(typeof data['label'] === 'string' && data['label'].trim())) return null;
  const label = typeof data['label'] === 'string' ? data['label'].replace(/\s+/g, ' ').trim() : '';
  const color = hex(data['color']);
  const colorLight = hex(data['colorLight']);
  const order = data['order'];
  const active = data['active'];

  if (color && colorLight) {
    return { ...common(), dark: color, light: colorLight, art: color };
  }
  // Cor só troca em par: com uma das cores inválida, fica a da origem (categoria nova é descartada).
  return base ? { ...common(), dark: base.dark, light: base.light, art: base.art } : null;

  function common() {
    return {
      id,
      label: label || base?.label || '',
      order: typeof order === 'number' && Number.isFinite(order) ? order : (base?.order ?? 999),
      active: typeof active === 'boolean' ? active : (base?.active ?? true),
    };
  }
}

/** Padrões ⊕ docs (doc vence no mesmo id), por `order` e depois rótulo. */
export function mergeBlogCategories(docs: { id: string; data: Record<string, unknown> }[]): BlogCategoryView[] {
  const byId = new Map(BLOG_DEFAULT_CATEGORIES.map((c) => [c.id, c]));
  for (const { id, data } of docs) {
    const merged = mapCategoryDoc(id, data, byId.get(id));
    if (merged) byId.set(id, merged);
  }
  return [...byId.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'pt-BR'));
}
