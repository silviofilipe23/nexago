import { doc, getDoc, type DocumentData } from 'firebase/firestore/lite';
import { liteDb } from '../firebase-lite';

/**
 * Mini-site público de arena (`/s/{slug}`). Produto separado do link-in-bio (`/a/{slug}`):
 * coleções e slugs próprios. O espelho `arenaSitesPublic/{slug}` é escrito exclusivamente pela
 * function `publishArenaSite` (conteúdo já validado/sanitizado lá) e é keyed pelo próprio slug —
 * um `getDoc` resolve.
 *
 * Porta de `src/lib/firestore/arena-sites.ts` (site Next.js) para o SDK **lite** — este app é
 * CSR puro, então toda leitura acontece no navegador do visitante.
 */

export interface PublicArenaSite {
  slug: string;
  arenaId: string;
  arenaName: string;
  theme: { paletteId: string; primaryHex: string; dark: boolean; logoUrl: string | null };
  hero: { headline: string; tagline: string; imageUrl: string | null; ctaLabel: string; ctaUrl: string };
  about: { enabled: boolean; title: string; body: string; imageUrls: string[]; stats: { value: string; label: string }[] };
  contact: { enabled: boolean; whatsapp: string; instagram: string; address: string };
  /** Seções automáticas — só o liga/desliga vem do espelho; os dados são lidos ao vivo das
   *  coleções públicas (ver `arena-site-data.ts`). Espelhos antigos não têm as chaves: ausente
   *  = ligado (a página esconde a seção se não houver dado). */
  schedule: { enabled: boolean };
  events: { enabled: boolean };
  reviews: { enabled: boolean };
  gallery: { enabled: boolean; imageUrls: string[] };
  plans: { enabled: boolean; items: ArenaSitePlanItem[] };
  faq: { enabled: boolean; items: { q: string; a: string }[] };
}

export interface ArenaSitePlanItem {
  name: string;
  price: string;
  features: string[];
  featured: boolean;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function section(data: DocumentData, key: string): DocumentData {
  const v = data[key];
  return v && typeof v === 'object' ? (v as DocumentData) : {};
}

/** A function só grava hex do catálogo, mas revalida aqui — o hex vai para CSS inline. */
function safeHex(value: unknown): string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#FF6A1A';
}

function storageUrl(value: unknown): string | null {
  return typeof value === 'string' && value.startsWith('https://firebasestorage.googleapis.com/') ? value : null;
}

/** `null` quando o slug não existe ou o site foi despublicado. */
export async function getArenaSiteBySlug(slug: string): Promise<PublicArenaSite | null> {
  const normalized = decodeURIComponent(slug).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(normalized)) return null;

  try {
    const snap = await getDoc(doc(liteDb, 'arenaSitesPublic', normalized));
    if (!snap.exists()) return null;
    const data = snap.data() as DocumentData;
    const theme = section(data, 'theme');
    const hero = section(data, 'hero');
    const about = section(data, 'about');
    const contact = section(data, 'contact');

    const headline = str(hero['headline']);
    if (!headline) return null;

    return {
      slug: normalized,
      arenaId: str(data['arenaId']),
      arenaName: str(data['arenaName']) || 'Arena',
      theme: {
        paletteId: str(theme['paletteId']) || 'laranja',
        primaryHex: safeHex(theme['primaryHex']),
        dark: theme['dark'] !== false,
        logoUrl: storageUrl(theme['logoUrl']),
      },
      hero: {
        headline,
        tagline: str(hero['tagline']),
        imageUrl: str(hero['imageUrl']) || null,
        ctaLabel: str(hero['ctaLabel']),
        ctaUrl: str(hero['ctaUrl']),
      },
      about: {
        enabled: about['enabled'] !== false,
        title: str(about['title']),
        body: str(about['body']),
        imageUrls: (Array.isArray(about['imageUrls']) ? about['imageUrls'] : [])
          .filter((u): u is string => typeof u === 'string' && u.startsWith('https://firebasestorage.googleapis.com/'))
          .slice(0, 3),
        stats: (Array.isArray(about['stats']) ? about['stats'] : [])
          .filter((s: unknown): s is DocumentData => !!s && typeof s === 'object')
          .map((s: DocumentData) => ({ value: str(s['value']), label: str(s['label']) }))
          .filter((s: { value: string; label: string }) => s.value && s.label)
          .slice(0, 3),
      },
      contact: {
        enabled: contact['enabled'] !== false,
        whatsapp: str(contact['whatsapp']).replace(/\D/g, ''),
        instagram: str(contact['instagram']).replace(/^@/, ''),
        address: str(contact['address']),
      },
      schedule: { enabled: section(data, 'schedule')['enabled'] !== false },
      events: { enabled: section(data, 'events')['enabled'] !== false },
      reviews: { enabled: section(data, 'reviews')['enabled'] !== false },
      gallery: {
        enabled: section(data, 'gallery')['enabled'] !== false,
        imageUrls: (Array.isArray(section(data, 'gallery')['imageUrls']) ? section(data, 'gallery')['imageUrls'] : [])
          .map((u: unknown) => storageUrl(u))
          .filter((u: string | null): u is string => u !== null)
          .slice(0, 8),
      },
      plans: {
        enabled: section(data, 'plans')['enabled'] !== false,
        items: (Array.isArray(section(data, 'plans')['items']) ? section(data, 'plans')['items'] : [])
          .filter((p: unknown): p is DocumentData => !!p && typeof p === 'object')
          .map((p: DocumentData) => ({
            name: str(p['name']),
            price: str(p['price']),
            features: (Array.isArray(p['features']) ? p['features'] : []).filter(
              (f: unknown): f is string => typeof f === 'string' && f.trim().length > 0,
            ),
            featured: p['featured'] === true,
          }))
          .filter((p: ArenaSitePlanItem) => p.name && p.price)
          .slice(0, 4),
      },
      faq: {
        enabled: section(data, 'faq')['enabled'] !== false,
        items: (Array.isArray(section(data, 'faq')['items']) ? section(data, 'faq')['items'] : [])
          .filter((item: unknown): item is DocumentData => !!item && typeof item === 'object')
          .map((item: DocumentData) => ({ q: str(item['q']), a: str(item['a']) }))
          .filter((item: { q: string; a: string }) => item.q && item.a)
          .slice(0, 8),
      },
    };
  } catch (err) {
    console.error('[arena-sites] getArenaSiteBySlug failed:', err);
    return null;
  }
}

// `getAllArenaSiteSlugs` do source não é portada: existia só para o `generateStaticParams` do
// export estático do Next (build de `/s/[slug]`) — sem equivalente num app CSR, onde cada
// slug é resolvido sob demanda pelo `getDoc` acima.
