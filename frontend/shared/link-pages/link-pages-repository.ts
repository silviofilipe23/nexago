import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import {
  isLinkIconName,
  linkPageIdFor,
  normalizeLinkUrl,
  validateLinkPageSlug,
  validateLinkUrl,
  type LinkIconName,
  type LinkPage,
  type LinkPageHighlight,
  type LinkPageOwnerType,
  type PageLink,
} from './link-page.model';

/** Leitura/escrita de `linkPages/{pageId}` e `linkPages/{pageId}/links/{linkId}`.
 *
 *  O cliente escreve os links diretamente (as rules validam a titularidade), mas o perfil da
 *  página passa pela callable `saveLinkPageProfile` porque trocar o slug precisa mover o
 *  registro `linkPageSlugs/{slug}` na mesma transação. Contadores são só leitura aqui —
 *  `trackLinkPageEvent` é quem incrementa. */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Chave de dia em UTC — mesma convenção usada pela Cloud Function. */
function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Soma as chaves do mapa diário dentro da janela [from, to). */
function sumDaily(daily: Record<string, unknown> | undefined, from: Date, to: Date): number {
  if (!daily) return 0;
  const fromKey = dayKey(from);
  const toKey = dayKey(to);
  let total = 0;
  for (const [key, value] of Object.entries(daily)) {
    if (key >= fromKey && key < toKey && typeof value === 'number') total += value;
  }
  return total;
}

function readDaily(data: DocumentData, field: string): Record<string, unknown> | undefined {
  const raw = data[field];
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : undefined;
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readHighlights(value: unknown): LinkPageHighlight[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((h): h is DocumentData => !!h && typeof h === 'object')
    .map((h) => ({ value: readString(h['value']), label: readString(h['label']) }))
    .filter((h) => h.value !== '' || h.label !== '');
}

export function linkPageFromFirestore(snap: DocumentSnapshot<DocumentData>, now = new Date()): LinkPage {
  const data = snap.data() ?? {};
  const daily = readDaily(data, 'dailyViews');
  const win = new Date(now.getTime() - 30 * DAY_MS);
  const prevWin = new Date(now.getTime() - 60 * DAY_MS);
  const tomorrow = new Date(now.getTime() + DAY_MS);
  return {
    id: snap.id,
    ownerType: data['ownerType'] === 'organizer' ? 'organizer' : 'arena',
    ownerId: readString(data['ownerId']),
    slug: readString(data['slug']),
    title: readString(data['title']),
    handle: readString(data['handle']),
    bio: readString(data['bio']),
    avatarUrl: readString(data['avatarUrl']) || null,
    highlights: readHighlights(data['highlights']),
    published: data['published'] !== false,
    views: readNumber(data['views']),
    views30d: sumDaily(daily, win, tomorrow),
    viewsPrev30d: sumDaily(daily, prevWin, win),
  };
}

export function pageLinkFromFirestore(snap: QueryDocumentSnapshot<DocumentData>, now = new Date()): PageLink {
  const data = snap.data();
  const icon = data['icon'];
  const win = new Date(now.getTime() - 30 * DAY_MS);
  const tomorrow = new Date(now.getTime() + DAY_MS);
  return {
    id: snap.id,
    title: readString(data['title']),
    subtitle: readString(data['subtitle']),
    url: readString(data['url']),
    icon: isLinkIconName(icon) ? icon : 'link',
    active: data['active'] !== false,
    featured: data['featured'] === true,
    live: data['live'] === true,
    order: readNumber(data['order']),
    clicks: readNumber(data['clicks']),
    clicks30d: sumDaily(readDaily(data, 'dailyClicks'), win, tomorrow),
  };
}

export async function fetchLinkPage(
  db: Firestore,
  ownerType: LinkPageOwnerType,
  ownerId: string,
): Promise<LinkPage | null> {
  const snap = await getDoc(doc(db, 'linkPages', linkPageIdFor(ownerType, ownerId)));
  return snap.exists() ? linkPageFromFirestore(snap) : null;
}

export async function fetchPageLinks(db: Firestore, pageId: string): Promise<PageLink[]> {
  const snap = await getDocs(collection(db, 'linkPages', pageId, 'links'));
  return snap.docs.map((d) => pageLinkFromFirestore(d)).sort((a, b) => a.order - b.order);
}

// ── Perfil da página (via Cloud Function, por causa do slug) ─────────────────

export interface LinkPageProfileInput {
  ownerType: LinkPageOwnerType;
  ownerId: string;
  slug: string;
  title: string;
  handle: string;
  bio: string;
  avatarUrl: string | null;
  highlights: LinkPageHighlight[];
  published: boolean;
}

export function validateLinkPageProfile(input: LinkPageProfileInput): string | null {
  if (!input.title.trim()) return 'Informe o nome exibido na página.';
  return validateLinkPageSlug(input.slug.trim());
}

/** Cria ou atualiza a página. A function devolve o id e cuida do registro de slug. */
export async function saveLinkPageProfile(
  functions: Functions,
  input: LinkPageProfileInput,
): Promise<string> {
  const error = validateLinkPageProfile(input);
  if (error) throw new Error(error);

  const callable = httpsCallable<Record<string, unknown>, { pageId: string }>(
    functions,
    'saveLinkPageProfile',
  );
  const result = await callable({
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    slug: input.slug.trim().toLowerCase(),
    title: input.title.trim(),
    handle: input.handle.trim(),
    bio: input.bio.trim(),
    avatarUrl: input.avatarUrl,
    highlights: input.highlights
      .map((h) => ({ value: h.value.trim(), label: h.label.trim() }))
      .filter((h) => h.value !== ''),
    published: input.published,
  });
  return result.data.pageId;
}

// ── Links (escrita direta, validada pelas rules) ─────────────────────────────

export interface PageLinkInput {
  title: string;
  subtitle: string;
  url: string;
  icon: LinkIconName;
  active: boolean;
  featured: boolean;
  live: boolean;
}

export function validatePageLink(input: PageLinkInput): string | null {
  if (!input.title.trim()) return 'Informe o título do link.';
  return validateLinkUrl(input.url);
}

function linkPayload(input: PageLinkInput): Record<string, unknown> {
  return {
    title: input.title.trim(),
    subtitle: input.subtitle.trim(),
    url: normalizeLinkUrl(input.url),
    icon: input.icon,
    active: input.active,
    featured: input.featured,
    live: input.live,
  };
}

/** Só um link pode ficar em destaque — os demais são rebaixados no mesmo batch. */
function clearOtherFeatured(
  batch: ReturnType<typeof writeBatch>,
  db: Firestore,
  pageId: string,
  links: readonly PageLink[],
  keepId: string | null,
): void {
  for (const link of links) {
    if (link.featured && link.id !== keepId) {
      batch.update(doc(db, 'linkPages', pageId, 'links', link.id), { featured: false });
    }
  }
}

export async function createPageLink(
  db: Firestore,
  pageId: string,
  input: PageLinkInput,
  existing: readonly PageLink[],
): Promise<string> {
  const error = validatePageLink(input);
  if (error) throw new Error(error);

  const ref = doc(collection(db, 'linkPages', pageId, 'links'));
  const nextOrder = existing.reduce((max, l) => Math.max(max, l.order), -1) + 1;

  const batch = writeBatch(db);
  if (input.featured) clearOtherFeatured(batch, db, pageId, existing, null);
  batch.set(ref, {
    ...linkPayload(input),
    order: nextOrder,
    clicks: 0,
    dailyClicks: {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  return ref.id;
}

export async function updatePageLink(
  db: Firestore,
  pageId: string,
  linkId: string,
  input: PageLinkInput,
  existing: readonly PageLink[],
): Promise<void> {
  const error = validatePageLink(input);
  if (error) throw new Error(error);

  const batch = writeBatch(db);
  if (input.featured) clearOtherFeatured(batch, db, pageId, existing, linkId);
  batch.update(doc(db, 'linkPages', pageId, 'links', linkId), {
    ...linkPayload(input),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function setPageLinkActive(
  db: Firestore,
  pageId: string,
  linkId: string,
  active: boolean,
): Promise<void> {
  await updateDoc(doc(db, 'linkPages', pageId, 'links', linkId), {
    active,
    updatedAt: serverTimestamp(),
  });
}

export async function deletePageLink(db: Firestore, pageId: string, linkId: string): Promise<void> {
  await deleteDoc(doc(db, 'linkPages', pageId, 'links', linkId));
}

/** Persiste a nova ordem da lista (índice do array vira `order`). */
export async function reorderPageLinks(
  db: Firestore,
  pageId: string,
  orderedIds: readonly string[],
): Promise<void> {
  const batch = writeBatch(db);
  orderedIds.forEach((id, index) => {
    batch.update(doc(db, 'linkPages', pageId, 'links', id), { order: index });
  });
  await batch.commit();
}
