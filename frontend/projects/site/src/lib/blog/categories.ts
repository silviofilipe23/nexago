import type { BlogCategory } from '../firestore/blog';

export interface BlogCategoryMeta {
  label: string;
  /** Classes do chip (texto + tint). Strings literais para o Tailwind enxergar. */
  chip: string;
  /**
   * Cor da arte de capa padrão (post sem capa). A arte é sempre escura, nos dois temas, como no
   * app — por isso usa a cor do tema escuro direto, e não o token que muda no claro.
   */
  art: string;
}

export const BLOG_CATEGORY_META: Record<BlogCategory, BlogCategoryMeta> = {
  torneios: { label: 'Torneios', chip: 'border-cat-torneios/25 bg-cat-torneios/10 text-cat-torneios', art: '#ff6a1a' },
  treino: { label: 'Treino', chip: 'border-cat-treino/25 bg-cat-treino/10 text-cat-treino', art: '#2bd17e' },
  regras: { label: 'Regras', chip: 'border-cat-regras/25 bg-cat-regras/10 text-cat-regras', art: '#c9a7ff' },
  arenas: { label: 'Arenas', chip: 'border-cat-arenas/25 bg-cat-arenas/10 text-cat-arenas', art: '#e3b85c' },
  guia: { label: 'Guia do app', chip: 'border-cat-guia/25 bg-cat-guia/10 text-cat-guia', art: '#9ab4ff' },
  loja: { label: 'Loja', chip: 'border-cat-loja/25 bg-cat-loja/10 text-cat-loja', art: '#ff8a4a' },
};

/** Post sem categoria conhecida (os estáticos antigos): chip e arte na cor da marca. */
export const BLOG_NEUTRAL_CHIP = 'border-brand/25 bg-brand-tint text-brand';
export const BLOG_NEUTRAL_ART = '#ff6a1a';
