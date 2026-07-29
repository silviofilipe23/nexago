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
export const ARENA_SITE_MAX_GALLERY_IMAGES = 8;
export const ARENA_SITE_MAX_PLANS = 4;
export const ARENA_SITE_MAX_FAQ_ITEMS = 8;

export interface ArenaSitePlan {
  name: string;
  price: string;
  /** Uma vantagem por linha no editor; vira array na gravação. */
  features: string[];
  featured: boolean;
}

export interface ArenaSiteFaqItem {
  q: string;
  a: string;
}

export interface ArenaSiteDraft {
  status: ArenaSiteStatus;
  slug: string;
  theme: { paletteId: string; dark: boolean };
  hero: { headline: string; tagline: string; imageUrl: string; ctaLabel: string; ctaUrl: string };
  about: { enabled: boolean; title: string; body: string; imageUrls: string[] };
  contact: { enabled: boolean; whatsapp: string; instagram: string; address: string };
  /** Seções automáticas: só liga/desliga — os dados (horários das quadras,
   *  torneios com `arenaId` da arena, avaliações) o site lê ao vivo das
   *  coleções públicas; nada é copiado pro rascunho nem pro espelho. */
  schedule: { enabled: boolean };
  events: { enabled: boolean };
  reviews: { enabled: boolean };
  gallery: { enabled: boolean; imageUrls: string[] };
  plans: { enabled: boolean; items: ArenaSitePlan[] };
  faq: { enabled: boolean; items: ArenaSiteFaqItem[] };
}

export const ARENA_SITE_EMPTY: ArenaSiteDraft = {
  status: 'draft',
  slug: '',
  theme: { paletteId: 'laranja', dark: true },
  hero: { headline: '', tagline: '', imageUrl: '', ctaLabel: '', ctaUrl: '' },
  about: { enabled: true, title: '', body: '', imageUrls: [] },
  contact: { enabled: true, whatsapp: '', instagram: '', address: '' },
  schedule: { enabled: true },
  events: { enabled: true },
  reviews: { enabled: true },
  gallery: { enabled: true, imageUrls: [] },
  plans: { enabled: true, items: [] },
  faq: { enabled: true, items: [] },
};

const SLUG_MIN = 3;
const SLUG_MAX = 40;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

/** Mesma lista da function `publishArenaSite` — inclui nomes de infra/portal
 *  porque o slug vira subdomínio `{slug}.nexago.com.br` na fase 4. */
const RESERVED_SLUGS = new Set([
  'a', 'o', 'api', 'app', 'admin', 'arena', 'arenas', 'atleta', 'athlete',
  'backoffice', 'blog', 'cdn', 'coach', 'contato', 'dev', 'email', 'ftp', 'imap',
  'ligas', 'login', 'mail', 'nexago', 'ns1', 'ns2', 'organizador', 'organizadores',
  'organizer', 'painel', 'pop', 'portal', 'privacidade', 'rankings', 'site', 'smtp',
  'sobre', 'staging', 'static', 'status', 'suporte', 'termos', 'teste', 'torneios', 'www',
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
