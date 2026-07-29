/** Mini-site público da arena (fase 1: hero + sobre + contato).
 *
 *  Produto SEPARADO do link-in-bio (`painel/links`): coleções, slugs e página
 *  pública próprios. O rascunho vive em `arenaSites/{arenaId}` (escrita direta
 *  do gestor); a publicação passa pela function `publishArenaSite`, que valida
 *  tudo de novo server-side e grava o espelho `arenaSitesPublic/{slug}` — a
 *  única fonte que o site público lê. */

export type ArenaSiteStatus = 'draft' | 'published';

export interface ArenaSitePalette {
  id: string;
  label: string;
  hex: string;
}

/** Catálogo fechado do template clay-v1 — mesma lista da function; o espelho guarda o hex. */
export const ARENA_SITE_PALETTES: ArenaSitePalette[] = [
  { id: 'laranja', label: 'Laranja', hex: '#FF6A1A' },
  { id: 'verde', label: 'Verde', hex: '#2BD17E' },
  { id: 'azul', label: 'Azul', hex: '#38BDF8' },
  { id: 'roxo', label: 'Roxo', hex: '#A78BFA' },
  { id: 'rosa', label: 'Rosa', hex: '#F472B6' },
  { id: 'amarelo', label: 'Amarelo', hex: '#F4C543' },
];

export const ARENA_SITE_MAX_ABOUT_IMAGES = 3;

export interface ArenaSiteDraft {
  status: ArenaSiteStatus;
  slug: string;
  theme: { paletteId: string; dark: boolean };
  hero: { headline: string; tagline: string; imageUrl: string; ctaLabel: string; ctaUrl: string };
  about: { enabled: boolean; title: string; body: string; imageUrls: string[] };
  contact: { enabled: boolean; whatsapp: string; instagram: string; address: string };
}

export const ARENA_SITE_EMPTY: ArenaSiteDraft = {
  status: 'draft',
  slug: '',
  theme: { paletteId: 'laranja', dark: true },
  hero: { headline: '', tagline: '', imageUrl: '', ctaLabel: '', ctaUrl: '' },
  about: { enabled: true, title: '', body: '', imageUrls: [] },
  contact: { enabled: true, whatsapp: '', instagram: '', address: '' },
};

const SLUG_MIN = 3;
const SLUG_MAX = 40;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

/** Mesma lista da function `publishArenaSite`. */
const RESERVED_SLUGS = new Set([
  'a', 'o', 'api', 'app', 'admin', 'arena', 'arenas', 'blog', 'contato', 'ligas',
  'login', 'nexago', 'organizadores', 'privacidade', 'rankings', 'sobre', 'suporte',
  'termos', 'torneios',
]);

/** Gera um slug a partir do nome da arena (sugestão inicial do campo). */
export function slugifyArenaSite(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX);
}

/** Valida o slug no cliente (a function revalida). Retorna mensagem de erro ou null. */
export function validateArenaSiteSlug(slug: string): string | null {
  if (slug.length < SLUG_MIN || slug.length > SLUG_MAX || !SLUG_PATTERN.test(slug)) {
    return 'Endereço inválido. Use 3-40 caracteres: letras minúsculas, números e hífen.';
  }
  if (RESERVED_SLUGS.has(slug)) {
    return 'Esse endereço é reservado. Escolha outro.';
  }
  return null;
}

/** Pré-checagem antes de chamar a function de publicação. */
export function validateArenaSiteForPublish(draft: ArenaSiteDraft, slug: string): string | null {
  const slugError = validateArenaSiteSlug(slug);
  if (slugError) return slugError;
  if (!draft.hero.headline.trim()) {
    return 'Preencha o título principal (hero) antes de publicar.';
  }
  if (draft.hero.ctaUrl.trim() && !/^https?:\/\//i.test(draft.hero.ctaUrl.trim())) {
    return 'O link do botão do hero precisa começar com http:// ou https://.';
  }
  const wa = draft.contact.whatsapp.replace(/\D/g, '');
  if (wa && (wa.length < 10 || wa.length > 13)) {
    return 'WhatsApp inválido: use DDD + número (com ou sem 55).';
  }
  const insta = draft.contact.instagram.trim().replace(/^@/, '');
  if (insta && !/^[A-Za-z0-9._]+$/.test(insta)) {
    return 'Instagram inválido: use só o nome do perfil.';
  }
  return null;
}
