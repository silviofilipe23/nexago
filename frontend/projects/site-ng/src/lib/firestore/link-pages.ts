import { collection, doc, getDoc, getDocs, type DocumentData } from 'firebase/firestore/lite';
import { liteDb } from '../firebase-lite';

/**
 * Página pública de links (link-in-bio) de arenas e organizadores — `/a/{slug}` e `/o/{slug}`.
 *
 * O painel escreve `linkPages/{ownerType}_{ownerId}` e a Cloud Function mantém o índice
 * `linkPageSlugs/{slug}` -> pageId. Aqui resolvemos slug -> página com dois `getDoc` por id,
 * sem query nem índice composto — o site é somente leitura.
 *
 * Porta de `src/lib/firestore/link-pages.ts` (site Next.js) para o SDK **lite** — mesmo
 * formato de dados e mesma resolução em dois passos. `getAllLinkPageSlugs` não foi portada:
 * existia só pro `generateStaticParams` do export estático do Next.js, sem equivalente num
 * app CSR-only. `ownerAvatarUrl` também fica local aqui (não em `./arenas`) para manter este
 * arquivo autocontido.
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
  'link',
  'calendar',
  'whatsapp',
  'instagram',
  'trophy',
  'ticket',
  'pin',
  'shirt',
  'menu',
  'cash',
  'star',
  'users',
  'video',
  'globe',
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

function firstString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v;
  }
  return null;
}

function glyph(value: unknown): LinkGlyphName {
  return GLYPHS.includes(value as LinkGlyphName) ? (value as LinkGlyphName) : 'link';
}

function mapHighlights(value: unknown): { value: string; label: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((h): h is DocumentData => !!h && typeof h === 'object')
    .map((h) => ({ value: str(h['value']), label: str(h['label']) }))
    .filter((h) => h.value !== '')
    .slice(0, 3);
}

/** `null` quando o slug não existe, a página sumiu, está despublicada, ou algo falha na leitura. */
export async function getLinkPageBySlug(
  slug: string,
  ownerType: LinkPageOwnerType,
): Promise<PublicLinkPage | null> {
  try {
    const normalized = decodeURIComponent(slug).trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(normalized)) return null;

    const slugSnap = await getDoc(doc(liteDb, 'linkPageSlugs', normalized));
    if (!slugSnap.exists()) return null;

    const pageId = str(slugSnap.data()['pageId']);
    if (!pageId) return null;

    const pageSnap = await getDoc(doc(liteDb, 'linkPages', pageId));
    if (!pageSnap.exists()) return null;

    const data = pageSnap.data();
    if (data['published'] === false) return null;
    // O prefixo da URL (/a ou /o) precisa bater com o tipo do dono — senão é link forjado.
    if (data['ownerType'] !== ownerType) return null;

    const linksSnap = await getDocs(collection(liteDb, 'linkPages', pageId, 'links'));
    const links = linksSnap.docs
      .filter((d) => d.data()['active'] !== false)
      .map<PublicPageLink & { order: number }>((d) => {
        const l = d.data();
        return {
          id: d.id,
          title: str(l['title']),
          subtitle: str(l['subtitle']),
          url: str(l['url']),
          icon: glyph(l['icon']),
          featured: l['featured'] === true,
          live: l['live'] === true,
          order: typeof l['order'] === 'number' ? (l['order'] as number) : 0,
        };
      })
      .filter((l) => l.title !== '' && l.url !== '')
      .sort((a, b) => (a.featured === b.featured ? a.order - b.order : a.featured ? -1 : 1))
      .map(({ order: _order, ...link }) => link);

    return {
      id: pageSnap.id,
      ownerType: data['ownerType'] === 'organizer' ? 'organizer' : 'arena',
      slug: str(data['slug']) || normalized,
      title: str(data['title']) || 'nexaGO',
      handle: str(data['handle']),
      bio: str(data['bio']),
      avatarUrl: str(data['avatarUrl']) || (await ownerAvatarUrl(ownerType, str(data['ownerId']))),
      highlights: mapHighlights(data['highlights']),
      links,
    };
  } catch (err) {
    console.error('[link-pages] getLinkPageBySlug failed:', err);
    return null;
  }
}

/**
 * Avatar herdado do dono quando a página não tem um próprio.
 *
 * Hoje o painel não oferece campo de foto para a página, então `avatarUrl` nasce sempre
 * vazio — sem isso toda arena cairia nas iniciais mesmo tendo logo. Ler o logo na hora
 * também mantém a página em dia quando a arena troca a marca.
 *
 * Organizador fica de fora: o dono é um usuário, e tanto `users` quanto `public_profiles`
 * exigem login para leitura — o site é anônimo.
 */
async function ownerAvatarUrl(ownerType: LinkPageOwnerType, ownerId: string): Promise<string | null> {
  if (ownerType !== 'arena' || !ownerId) return null;
  try {
    const snap = await getDoc(doc(liteDb, 'arenas', ownerId));
    if (!snap.exists()) return null;
    const d = snap.data();
    return firstString(d['logoUrl'], d['logo'], d['coverUrl']);
  } catch (err) {
    console.error('[link-pages] ownerAvatarUrl failed:', err);
    return null;
  }
}
