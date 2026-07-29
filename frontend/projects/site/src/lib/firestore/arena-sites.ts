import { doc, getDoc, type DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * Mini-site público de arena (`/s/{slug}`). Produto separado do link-in-bio
 * (`/a/{slug}`): coleções e slugs próprios. O espelho `arenaSitesPublic/{slug}`
 * é escrito exclusivamente pela function `publishArenaSite` (conteúdo já
 * validado/sanitizado lá) e é keyed pelo próprio slug — um `getDoc` resolve.
 */

export interface PublicArenaSite {
  slug: string;
  arenaId: string;
  arenaName: string;
  theme: { paletteId: string; primaryHex: string; dark: boolean };
  hero: { headline: string; tagline: string; imageUrl: string | null; ctaLabel: string; ctaUrl: string };
  about: { enabled: boolean; title: string; body: string; imageUrls: string[] };
  contact: { enabled: boolean; whatsapp: string; instagram: string; address: string };
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

/** `null` quando o slug não existe ou o site foi despublicado. */
export async function getArenaSiteBySlug(slug: string): Promise<PublicArenaSite | null> {
  const normalized = decodeURIComponent(slug).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(normalized)) return null;

  try {
    const snap = await getDoc(doc(db, 'arenaSitesPublic', normalized));
    if (!snap.exists()) return null;
    const data = snap.data() as DocumentData;
    const theme = section(data, 'theme');
    const hero = section(data, 'hero');
    const about = section(data, 'about');
    const contact = section(data, 'contact');

    const headline = str(hero.headline);
    if (!headline) return null;

    return {
      slug: normalized,
      arenaId: str(data.arenaId),
      arenaName: str(data.arenaName) || 'Arena',
      theme: {
        paletteId: str(theme.paletteId) || 'laranja',
        primaryHex: safeHex(theme.primaryHex),
        dark: theme.dark !== false,
      },
      hero: {
        headline,
        tagline: str(hero.tagline),
        imageUrl: str(hero.imageUrl) || null,
        ctaLabel: str(hero.ctaLabel),
        ctaUrl: str(hero.ctaUrl),
      },
      about: {
        enabled: about.enabled !== false,
        title: str(about.title),
        body: str(about.body),
        imageUrls: (Array.isArray(about.imageUrls) ? about.imageUrls : [])
          .filter((u): u is string => typeof u === 'string' && u.startsWith('https://firebasestorage.googleapis.com/'))
          .slice(0, 3),
      },
      contact: {
        enabled: contact.enabled !== false,
        whatsapp: str(contact.whatsapp).replace(/\D/g, ''),
        instagram: str(contact.instagram).replace(/^@/, ''),
        address: str(contact.address),
      },
    };
  } catch {
    return null;
  }
}
