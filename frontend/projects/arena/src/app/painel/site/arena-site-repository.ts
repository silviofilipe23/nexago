import { doc, getDoc, setDoc, serverTimestamp, type Firestore } from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import { getDownloadURL, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage';
import { validateArenaImageFile } from '../profile/arena-profile-repository';
import { ARENA_SITE_EMPTY, ARENA_SITE_MAX_ABOUT_IMAGES, type ArenaSiteDraft } from './arena-site.model';

/** Acesso a dados do mini-site: rascunho em `arenaSites/{arenaId}` (escrita direta,
 *  rules exigem managerUserId), publicação via callables. */

function readString(data: Record<string, unknown> | undefined, key: string): string {
  const v = data?.[key];
  return typeof v === 'string' ? v : '';
}

function readSection(data: Record<string, unknown>, key: string): Record<string, unknown> {
  const v = data[key];
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

export async function fetchArenaSiteDraft(db: Firestore, arenaId: string): Promise<ArenaSiteDraft | null> {
  const snap = await getDoc(doc(db, 'arenaSites', arenaId));
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  const theme = readSection(data, 'theme');
  const hero = readSection(data, 'hero');
  const about = readSection(data, 'about');
  const contact = readSection(data, 'contact');

  return {
    status: data['status'] === 'published' ? 'published' : 'draft',
    slug: readString(data, 'slug'),
    theme: {
      paletteId: readString(theme, 'paletteId') || ARENA_SITE_EMPTY.theme.paletteId,
      dark: theme['dark'] !== false,
    },
    hero: {
      headline: readString(hero, 'headline'),
      tagline: readString(hero, 'tagline'),
      imageUrl: readString(hero, 'imageUrl'),
      ctaLabel: readString(hero, 'ctaLabel'),
      ctaUrl: readString(hero, 'ctaUrl'),
    },
    about: {
      enabled: about['enabled'] !== false,
      title: readString(about, 'title'),
      body: readString(about, 'body'),
      imageUrls: (Array.isArray(about['imageUrls']) ? about['imageUrls'] : [])
        .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
        .slice(0, ARENA_SITE_MAX_ABOUT_IMAGES),
    },
    contact: {
      enabled: contact['enabled'] !== false,
      whatsapp: readString(contact, 'whatsapp'),
      instagram: readString(contact, 'instagram'),
      address: readString(contact, 'address'),
    },
  };
}

/** Salva o rascunho (conteúdo apenas — slug/status são mantidos pela function). */
export async function saveArenaSiteDraft(db: Firestore, arenaId: string, draft: ArenaSiteDraft): Promise<void> {
  await setDoc(
    doc(db, 'arenaSites', arenaId),
    {
      arenaId,
      theme: { paletteId: draft.theme.paletteId, dark: draft.theme.dark },
      hero: {
        headline: draft.hero.headline.trim(),
        tagline: draft.hero.tagline.trim(),
        imageUrl: draft.hero.imageUrl.trim(),
        ctaLabel: draft.hero.ctaLabel.trim(),
        ctaUrl: draft.hero.ctaUrl.trim(),
      },
      about: {
        enabled: draft.about.enabled,
        title: draft.about.title.trim(),
        body: draft.about.body.trim(),
        imageUrls: draft.about.imageUrls.slice(0, ARENA_SITE_MAX_ABOUT_IMAGES),
      },
      contact: {
        enabled: draft.contact.enabled,
        whatsapp: draft.contact.whatsapp.trim(),
        instagram: draft.contact.instagram.trim().replace(/^@/, ''),
        address: draft.contact.address.trim(),
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export type ArenaSiteImageKind = 'site-hero' | 'site-about-1' | 'site-about-2' | 'site-about-3';

/** Sobe imagem do mini-site para `arenas/{arenaId}/{kind}` (nome fixo: novo upload
 *  sobrescreve, sem órfãos; storage.rules já libera escrita pro gestor). */
export async function uploadArenaSiteImage(
  storage: FirebaseStorage,
  arenaId: string,
  kind: ArenaSiteImageKind,
  file: File,
): Promise<string> {
  const error = validateArenaImageFile(file);
  if (error) {
    throw new Error(error);
  }
  const fileRef = ref(storage, `arenas/${arenaId}/${kind}`);
  await uploadBytes(fileRef, file, { contentType: file.type });
  return getDownloadURL(fileRef);
}

export async function publishArenaSite(functions: Functions, arenaId: string, slug: string): Promise<{ slug: string }> {
  const call = httpsCallable<{ arenaId: string; slug: string }, { arenaId: string; slug: string }>(
    functions,
    'publishArenaSite',
  );
  const result = await call({ arenaId, slug });
  return { slug: result.data.slug };
}

export async function unpublishArenaSite(functions: Functions, arenaId: string): Promise<void> {
  const call = httpsCallable<{ arenaId: string }, { arenaId: string }>(functions, 'unpublishArenaSite');
  await call({ arenaId });
}
