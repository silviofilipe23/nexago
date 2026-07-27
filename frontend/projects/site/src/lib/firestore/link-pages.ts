import { collection, doc, getDoc, getDocs, type DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * Página pública de links (link-in-bio) de arenas e organizadores.
 *
 * O painel escreve `linkPages/{ownerType}_{ownerId}` e a Cloud Function mantém o índice
 * `linkPageSlugs/{slug}` -> pageId. Aqui resolvemos slug -> página com dois `getDoc` por id,
 * sem query nem índice composto — o site é somente leitura.
 */

export type LinkPageOwnerType = 'arena' | 'organizer';

export type LinkGlyphName =
  | 'link'
  | 'calendar'
  | 'whatsapp'
  | 'instagram'
  | 'trophy'
  | 'ticket'
  | 'pin'
  | 'shirt'
  | 'menu'
  | 'cash'
  | 'star'
  | 'users'
  | 'video'
  | 'globe';

const GLYPHS: readonly LinkGlyphName[] = [
  'link', 'calendar', 'whatsapp', 'instagram', 'trophy', 'ticket',
  'pin', 'shirt', 'menu', 'cash', 'star', 'users', 'video', 'globe',
];

export interface PublicPageLink {
  id: string;
  title: string;
  subtitle: string;
  url: string;
  icon: LinkGlyphName;
  featured: boolean;
  live: boolean;
}

export interface PublicLinkPage {
  id: string;
  ownerType: LinkPageOwnerType;
  slug: string;
  title: string;
  handle: string;
  bio: string;
  avatarUrl: string | null;
  highlights: { value: string; label: string }[];
  links: PublicPageLink[];
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function glyph(value: unknown): LinkGlyphName {
  return GLYPHS.includes(value as LinkGlyphName) ? (value as LinkGlyphName) : 'link';
}

function mapHighlights(value: unknown): { value: string; label: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((h): h is DocumentData => !!h && typeof h === 'object')
    .map((h) => ({ value: str(h.value), label: str(h.label) }))
    .filter((h) => h.value !== '')
    .slice(0, 3);
}

/** `null` quando o slug não existe, a página sumiu ou está despublicada. */
export async function getLinkPageBySlug(
  slug: string,
  ownerType: LinkPageOwnerType,
): Promise<PublicLinkPage | null> {
  const normalized = decodeURIComponent(slug).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(normalized)) return null;

  const slugSnap = await getDoc(doc(db, 'linkPageSlugs', normalized));
  if (!slugSnap.exists()) return null;

  const pageId = str(slugSnap.data().pageId);
  if (!pageId) return null;

  const pageSnap = await getDoc(doc(db, 'linkPages', pageId));
  if (!pageSnap.exists()) return null;

  const data = pageSnap.data();
  if (data.published === false) return null;
  // O prefixo da URL (/a ou /o) precisa bater com o tipo do dono — senão é link forjado.
  if (data.ownerType !== ownerType) return null;

  const linksSnap = await getDocs(collection(db, 'linkPages', pageId, 'links'));
  const links = linksSnap.docs
    .filter((d) => d.data().active !== false)
    .map<PublicPageLink & { order: number }>((d) => {
      const l = d.data();
      return {
        id: d.id,
        title: str(l.title),
        subtitle: str(l.subtitle),
        url: str(l.url),
        icon: glyph(l.icon),
        featured: l.featured === true,
        live: l.live === true,
        order: typeof l.order === 'number' ? l.order : 0,
      };
    })
    .filter((l) => l.title !== '' && l.url !== '')
    .sort((a, b) => (a.featured === b.featured ? a.order - b.order : a.featured ? -1 : 1))
    .map(({ order: _order, ...link }) => link);

  return {
    id: pageSnap.id,
    ownerType: data.ownerType === 'organizer' ? 'organizer' : 'arena',
    slug: str(data.slug) || normalized,
    title: str(data.title) || 'nexaGO',
    handle: str(data.handle),
    bio: str(data.bio),
    avatarUrl: str(data.avatarUrl) || null,
    highlights: mapHighlights(data.highlights),
    links,
  };
}
