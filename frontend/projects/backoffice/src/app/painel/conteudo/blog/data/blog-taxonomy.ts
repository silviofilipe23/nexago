/**
 * Categorias e autores do blog. Espelha `functions/src/blog-taxonomy.ts` — mudar os dois.
 *
 * Categoria: as 6 de origem valem sem doc; um doc `blogCategories/{id}` com o mesmo id sobrescreve
 * rótulo/cor/ordem/ativa, e categoria nova é doc com id tirado do rótulo. A lista efetiva é padrões ⊕
 * docs (doc vence), por `order` e depois rótulo. `color` = tom no escuro; `colorLight` = tom de TEXTO no
 * claro (≥ 4,5:1 sobre o fundo claro do app).
 */
export const BLOG_CATEGORY_LABEL_MAX = 24;
export const BLOG_CATEGORIES_MAX = 30;
export const BLOG_CATEGORY_ORDER_MAX = 999;
export const BLOG_AUTHOR_NAME_MAX = 40;
export const BLOG_AUTHOR_ROLE_MAX = 40;
export const BLOG_AUTHOR_BIO_MAX = 160;
const CATEGORY_ID_MAX = 32;
const CATEGORY_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export interface BlogCategoryDef {
  id: string;
  label: string;
  color: string;
  colorLight: string;
  order: number;
  active: boolean;
  /** Tem doc em `blogCategories` (as de origem sem doc valem pelos padrões). */
  hasDoc: boolean;
  /** Uma das 6 de origem. */
  isDefault: boolean;
}

const def = (id: string, label: string, color: string, colorLight: string, order: number): BlogCategoryDef => ({
  id,
  label,
  color,
  colorLight,
  order,
  active: true,
  hasDoc: false,
  isDefault: true,
});

export const BLOG_DEFAULT_CATEGORIES: readonly BlogCategoryDef[] = [
  def('torneios', 'Torneios', '#FF6A1A', '#AE3A0A', 0),
  def('treino', 'Treino', '#2BD17E', '#187345', 1),
  def('regras', 'Regras', '#C9A7FF', '#6B3FB8', 2),
  def('arenas', 'Arenas', '#E3B85C', '#7A5A0F', 3),
  def('guia', 'Guia do app', '#9AB4FF', '#2F55B8', 4),
  def('loja', 'Loja', '#FF8A4A', '#9A3D0C', 5),
];

/** Id que não existe (doc apagado): "Blog" na cor neutra, como nos leitores. */
export const UNKNOWN_CATEGORY = { label: 'Blog', color: '#A1A1AA', colorLight: '#52525B' };

export function isCategoryId(v: unknown): v is string {
  return typeof v === 'string' && v.length <= CATEGORY_ID_MAX && CATEGORY_ID_RE.test(v);
}

/** "Saúde & corpo" → "saude-corpo" (o servidor resolve colisão com "-2"). */
export function categoryIdFrom(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, CATEGORY_ID_MAX)
    .replace(/-+$/g, '');
}

const str = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const hex = (v: unknown): string | null => (typeof v === 'string' && HEX_RE.test(v) ? v.toUpperCase() : null);

/** Doc → categoria; campo ruim cai no padrão daquele id (ou no neutro). */
export function categoryFromDoc(id: string, data: Record<string, unknown>): BlogCategoryDef | null {
  if (!isCategoryId(id)) {
    return null;
  }
  const base = BLOG_DEFAULT_CATEGORIES.find((c) => c.id === id);
  const order = typeof data['order'] === 'number' && Number.isInteger(data['order']) ? data['order'] : (base?.order ?? BLOG_CATEGORY_ORDER_MAX);
  return {
    id,
    label: str(data['label']) || base?.label || id,
    color: hex(data['color']) ?? base?.color ?? UNKNOWN_CATEGORY.color,
    colorLight: hex(data['colorLight']) ?? base?.colorLight ?? UNKNOWN_CATEGORY.colorLight,
    order,
    active: data['active'] !== false,
    hasDoc: true,
    isDefault: !!base,
  };
}

/** Padrões ⊕ docs (o doc vence no mesmo id), por `order` e depois rótulo. */
export function effectiveCategories(docs: readonly BlogCategoryDef[]): BlogCategoryDef[] {
  const byId = new Map<string, BlogCategoryDef>(BLOG_DEFAULT_CATEGORIES.map((c) => [c.id, c]));
  for (const d of docs) {
    byId.set(d.id, d);
  }
  return [...byId.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'pt-BR'));
}

export interface CategoryMeta {
  id: string;
  label: string;
  color: string;
  colorLight: string;
  active: boolean;
  known: boolean;
}

export function categoryMetaIn(list: readonly BlogCategoryDef[], id: string): CategoryMeta {
  const c = list.find((x) => x.id === id);
  return c
    ? { id, label: c.label, color: c.color, colorLight: c.colorLight, active: c.active, known: true }
    : { id, ...UNKNOWN_CATEGORY, active: false, known: false };
}

/** Opções do editor: só ativas; a do post, se inativa ou sumida, entra marcada. */
export function categoryChoices(list: readonly BlogCategoryDef[], current: string): Array<{ id: string; label: string }> {
  const options = list.filter((c) => c.active).map((c) => ({ id: c.id, label: c.label }));
  if (current && !options.some((o) => o.id === current)) {
    const c = list.find((x) => x.id === current);
    options.push({ id: current, label: c ? `${c.label} (inativa)` : `${current} (não existe mais)` });
  }
  return options;
}

/** Troca com o vizinho e renumera `order` pela posição. */
export function moveCategory(list: readonly BlogCategoryDef[], index: number, delta: -1 | 1): BlogCategoryDef[] {
  const to = index + delta;
  if (to < 0 || to >= list.length) {
    return [...list];
  }
  const next = [...list];
  [next[index], next[to]] = [next[to]!, next[index]!];
  return next.map((c, i) => ({ ...c, order: i }));
}

/** O que precisa ir ao servidor depois de mover: as que mudaram de `order`. */
export function changedOrders(before: readonly BlogCategoryDef[], after: readonly BlogCategoryDef[]): BlogCategoryDef[] {
  const old = new Map(before.map((c) => [c.id, c.order]));
  return after.filter((c) => old.get(c.id) !== c.order);
}

/** Ordem de uma categoria nova: depois da última. */
export function nextOrder(list: readonly BlogCategoryDef[]): number {
  return Math.min(BLOG_CATEGORY_ORDER_MAX, list.reduce((max, c) => Math.max(max, c.order), -1) + 1);
}

export interface SaveBlogCategoryInput {
  /** `null` = nova (id tirado do rótulo no servidor). */
  id: string | null;
  label: string;
  color: string;
  colorLight: string;
  order: number;
  active: boolean;
}

/** Mesmos textos de `blogCategoryErrors` do servidor. */
export function categoryErrors(c: SaveBlogCategoryInput): string[] {
  const errors: string[] = [];
  const label = str(c.label);
  if (!label) {
    errors.push('Dê um nome à categoria.');
  } else if (label.length > BLOG_CATEGORY_LABEL_MAX) {
    errors.push(`Nome passa de ${BLOG_CATEGORY_LABEL_MAX} caracteres.`);
  } else if (c.id === null && !categoryIdFrom(label)) {
    errors.push('Use letras ou números no nome.');
  }
  if (!HEX_RE.test(c.color)) {
    errors.push('Cor do tema escuro inválida.');
  }
  if (!HEX_RE.test(c.colorLight)) {
    errors.push('Cor do tema claro inválida.');
  }
  if (!Number.isInteger(c.order) || c.order < 0 || c.order > BLOG_CATEGORY_ORDER_MAX) {
    errors.push('Ordem inválida.');
  }
  return errors;
}

// ---------- contraste (WCAG 2) ----------

/** Fundo escuro dos chips/capas e os fundos claros do app (branco, canvas e cartão). */
export const DARK_BACKGROUND = '#0B0B0C';
export const LIGHT_BACKGROUNDS = ['#FFFFFF', '#FAF8F4', '#F0EDE8'] as const;
export const MIN_CONTRAST = 4.5;

export function isHexColor(v: string): boolean {
  return HEX_RE.test(v);
}

export function relativeLuminance(color: string): number {
  const n = parseInt(color.slice(1), 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** Pior contraste do texto claro entre os fundos claros do app. */
export function lightContrast(colorLight: string): number {
  return Math.min(...LIGHT_BACKGROUNDS.map((bg) => contrastRatio(colorLight, bg)));
}

export function darkContrast(color: string): number {
  return contrastRatio(color, DARK_BACKGROUND);
}

/** Avisos do par digitado à mão (não barram: o servidor aceita qualquer hex). */
export function pairWarnings(color: string, colorLight: string): string[] {
  const out: string[] = [];
  if (isHexColor(color) && darkContrast(color) < MIN_CONTRAST) {
    out.push(`A cor do escuro dá ${darkContrast(color).toFixed(1).replace('.', ',')}:1 no fundo escuro; o mínimo é 4,5:1.`);
  }
  if (isHexColor(colorLight) && lightContrast(colorLight) < MIN_CONTRAST) {
    out.push(`O texto no claro dá ${lightContrast(colorLight).toFixed(1).replace('.', ',')}:1; o mínimo é 4,5:1. Escureça a cor.`);
  }
  return out;
}

/** Pares prontos: as 6 de origem + 6 novos, todos ≥ 4,5:1 nos dois temas (testado). */
export const CATEGORY_PALETTE: ReadonlyArray<{ name: string; color: string; colorLight: string }> = [
  { name: 'Laranja', color: '#FF6A1A', colorLight: '#AE3A0A' },
  { name: 'Verde', color: '#2BD17E', colorLight: '#187345' },
  { name: 'Lilás', color: '#C9A7FF', colorLight: '#6B3FB8' },
  { name: 'Areia', color: '#E3B85C', colorLight: '#7A5A0F' },
  { name: 'Azul', color: '#9AB4FF', colorLight: '#2F55B8' },
  { name: 'Coral', color: '#FF8A4A', colorLight: '#9A3D0C' },
  { name: 'Céu', color: '#4FC3F7', colorLight: '#0B6E99' },
  { name: 'Rosa', color: '#FF7AB6', colorLight: '#A3195B' },
  { name: 'Limão', color: '#B5E853', colorLight: '#4A6B0F' },
  { name: 'Turquesa', color: '#3DD9C1', colorLight: '#0F6E60' },
  { name: 'Vermelho', color: '#FF6B6B', colorLight: '#B3261E' },
  { name: 'Duna', color: '#D6C7A1', colorLight: '#6B5B32' },
];

// ---------- autores ----------

export interface BlogAuthorDef {
  id: string;
  name: string;
  role: string;
  photoUrl: string | null;
  bio: string;
  active: boolean;
}

export function authorFromDoc(id: string, data: Record<string, unknown>): BlogAuthorDef {
  const photo = typeof data['photoUrl'] === 'string' && /^https:\/\/\S+$/.test(data['photoUrl']) ? data['photoUrl'] : null;
  return {
    id,
    name: str(data['name']) || 'Sem nome',
    role: str(data['role']),
    photoUrl: photo,
    bio: typeof data['bio'] === 'string' ? data['bio'].trim() : '',
    active: data['active'] !== false,
  };
}

/** Sem acento e sem caixa (sem importar `blog-list`, que importa `blog-post`, que importa este). */
const plain = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export function sortAuthors(list: readonly BlogAuthorDef[]): BlogAuthorDef[] {
  return [...list].sort((a, b) => plain(a.name).localeCompare(plain(b.name)));
}

export interface SaveBlogAuthorInput {
  id: string | null;
  name: string;
  role: string;
  photoUrl: string | null;
  bio: string;
  active: boolean;
}

/** Mesmos textos de `blogAuthorErrors` do servidor. */
export function authorErrors(a: SaveBlogAuthorInput): string[] {
  const errors: string[] = [];
  const name = str(a.name);
  if (!name) {
    errors.push('Informe o nome do autor.');
  } else if (name.length > BLOG_AUTHOR_NAME_MAX) {
    errors.push(`Nome passa de ${BLOG_AUTHOR_NAME_MAX} caracteres.`);
  }
  if (str(a.role).length > BLOG_AUTHOR_ROLE_MAX) {
    errors.push(`Função passa de ${BLOG_AUTHOR_ROLE_MAX} caracteres.`);
  }
  if (a.photoUrl !== null && !/^https:\/\/\S+$/.test(a.photoUrl)) {
    errors.push('Foto sem endereço https.');
  }
  if (str(a.bio).length > BLOG_AUTHOR_BIO_MAX) {
    errors.push(`Bio passa de ${BLOG_AUTHOR_BIO_MAX} caracteres.`);
  }
  return errors;
}

/** Opções do editor: ativos por nome; o do post, se inativo, entra marcado. */
export function authorChoices(list: readonly BlogAuthorDef[], currentId: string | null): Array<BlogAuthorDef & { inactive: boolean }> {
  const options = sortAuthors(list.filter((a) => a.active)).map((a) => ({ ...a, inactive: false }));
  const current = currentId ? list.find((a) => a.id === currentId) : null;
  if (current && !current.active) {
    options.push({ ...current, inactive: true });
  }
  return options;
}

// ---------- contagens ----------

/** Posts por categoria e por autor cadastrado (`author.id`), de qualquer status. */
export function taxonomyCounts(posts: ReadonlyArray<{ category: string; author: { id?: string | null } }>): {
  categories: Map<string, number>;
  authors: Map<string, number>;
} {
  const categories = new Map<string, number>();
  const authors = new Map<string, number>();
  for (const p of posts) {
    categories.set(p.category, (categories.get(p.category) ?? 0) + 1);
    if (p.author.id) {
      authors.set(p.author.id, (authors.get(p.author.id) ?? 0) + 1);
    }
  }
  return { categories, authors };
}
