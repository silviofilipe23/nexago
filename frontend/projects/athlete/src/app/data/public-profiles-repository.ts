import { defaultSportChipFromProfile, type ArenaSportChip } from '@nexago/arena-discovery';
import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import type { RankingLevel } from '../ranking/athlete-ranking.models';

/** Espelha `public_profiles/{uid}` (`functions/src/public-profile-sync.ts`) — mirror sem PII
 *  de `users/{uid}`, mantido por Cloud Function trigger a cada escrita em `users`. Nunca tem
 *  email/telefone/nascimento/cpf — só o que a busca/ranking/perfil público precisam mostrar. */

export interface AthletePublicProfile {
  id: string;
  displayName: string;
  handle: string | null;
  city: string | null;
  state: string | null;
  avatarUrl: string | null;
  /** Código Firestore do esporte principal (ex.: `VOLEI_PRAIA`). */
  primarySportId: string | null;
  sportChip: ArenaSportChip;
  /** Código do nível pro esporte principal (ex.: `intermediario_1`), já com fallback pro nível legado. */
  levelCode: string | null;
  hasAthleteRole: boolean;
  lookingForPartner: boolean;
  lastActiveAt: Date | null;
  isDiscoverable: boolean;
}

function optionalTrimmed(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function toDate(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | undefined;
  return typeof t?.toDate === 'function' ? t.toDate() : null;
}

function stripHandle(nickname: string | null): string | null {
  if (!nickname) return null;
  return nickname.startsWith('@') ? nickname.slice(1).trim() || null : nickname;
}

/** Espelha `LEVEL_RANK`/`AthleteProfileOptions.levelRank` (`functions/src/category-level-eligibility.ts`). */
export function levelRankOf(raw: string | null): number | null {
  if (!raw) return null;
  const v = raw
    .trim()
    .toLowerCase()
    .replace(/á/g, 'a')
    .replace(/é/g, 'e')
    .replace(/í/g, 'i');
  switch (v) {
    case 'iniciante':
    case 'basico':
    case 'iniciante 1':
    case 'iniciante_1':
      return 0;
    case 'iniciante 2':
    case 'iniciante_2':
      return 1;
    case 'intermediario':
    case 'intermediario 1':
    case 'intermediario_1':
      return 2;
    case 'intermediario 2':
    case 'intermediario_2':
      return 3;
    case 'open':
    case 'livre':
      return 5;
    default:
      return null;
  }
}

/** Bucket de 3 níveis (`AthleteProfileOptions.legacyBucketLabel`) — "Avançado"/"Profissional"
 *  não existem como tiers reais no backend (eram sinônimos legados que viraram Intermediário/Open). */
export function levelBucketOf(raw: string | null): RankingLevel | null {
  const rank = levelRankOf(raw);
  if (rank == null) return null;
  if (rank <= 1) return 'Iniciante';
  if (rank <= 3) return 'Intermediário';
  return 'Open';
}

function readPublicProfileEnabled(data: Record<string, unknown>): boolean {
  const prefs = data['privacyPreferences'];
  if (prefs && typeof prefs === 'object' && 'publicProfileEnabled' in (prefs as Record<string, unknown>)) {
    return (prefs as Record<string, unknown>)['publicProfileEnabled'] !== false;
  }
  if ('publicProfileEnabled' in data) return data['publicProfileEnabled'] !== false;
  return true;
}

function isDiscoverable(data: Record<string, unknown>): boolean {
  const prefs = data['privacyPreferences'] as Record<string, unknown> | undefined;
  const visibility = typeof prefs?.['profileVisibility'] === 'string' ? (prefs['profileVisibility'] as string) : null;
  return readPublicProfileEnabled(data) && visibility !== 'private';
}

export function athletePublicProfileFromDoc(id: string, data: Record<string, unknown>): AthletePublicProfile {
  const nickname = optionalTrimmed(data['nickname']);
  const sportOnboarding = data['sportOnboarding'] as Record<string, unknown> | undefined;
  const primarySportId = optionalTrimmed(sportOnboarding?.['primarySportId']) ?? optionalTrimmed(data['primarySport']) ?? optionalTrimmed(data['sport']);
  const levelsBySport = sportOnboarding?.['levelsBySport'] as Record<string, unknown> | undefined;
  const levelForPrimarySport = primarySportId ? optionalTrimmed(levelsBySport?.[primarySportId]) : null;
  const roles = Array.isArray(data['roles']) ? (data['roles'] as unknown[]).filter((r): r is string => typeof r === 'string') : [];

  return {
    id,
    displayName: nickname ?? optionalTrimmed(data['fullName']) ?? optionalTrimmed(data['name']) ?? `Atleta (…${id.slice(-6)})`,
    handle: stripHandle(nickname),
    city: optionalTrimmed(data['city']),
    state: optionalTrimmed(data['state']),
    avatarUrl: optionalTrimmed(data['profilePhotoUrl']) ?? optionalTrimmed(data['avatarUrl']) ?? optionalTrimmed(data['photoURL']),
    primarySportId,
    sportChip: defaultSportChipFromProfile({ primarySport: primarySportId, sport: optionalTrimmed(data['sport']) }),
    levelCode: levelForPrimarySport ?? optionalTrimmed(data['level']) ?? optionalTrimmed(data['nivel']),
    hasAthleteRole: data['hasAthleteRole'] === true || roles.includes('athlete') || data['role'] === 'athlete',
    lookingForPartner: data['lookingForPartner'] === true,
    lastActiveAt: toDate(data['lastActiveAt']),
    isDiscoverable: isDiscoverable(data),
  };
}

const PAGE_SIZE = 30;

/** Página de atletas descobríveis, ordenada por id do doc (cursor barato, sem precisar de
 *  snapshot) — espelha `AthleteDiscoverRepository` (Flutter). Filtra `isDiscoverable` no
 *  client (não é indexado). */
export async function fetchAthleteDirectoryPage(
  db: Firestore,
  cursor: string | null,
): Promise<{ profiles: AthletePublicProfile[]; nextCursor: string | null }> {
  const constraints = [where('hasAthleteRole', '==', true), orderBy(documentId()), limit(PAGE_SIZE)];
  const q = cursor
    ? query(collection(db, 'public_profiles'), where('hasAthleteRole', '==', true), orderBy(documentId()), startAfter(cursor), limit(PAGE_SIZE))
    : query(collection(db, 'public_profiles'), ...constraints);

  const snap = await getDocs(q);
  const profiles = snap.docs
    .map((d) => athletePublicProfileFromDoc(d.id, d.data() as Record<string, unknown>))
    .filter((p) => p.isDiscoverable);
  const nextCursor = snap.docs.length === PAGE_SIZE ? snap.docs[snap.docs.length - 1]!.id : null;
  return { profiles, nextCursor };
}

function normalizeSearchTerm(term: string): string {
  return term
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Busca por prefixo via `keywords array-contains` — mesmo índice composto
 *  (`hasAthleteRole+keywords CONTAINS`) já usado pelo app Flutter. */
export async function searchAthleteDirectory(db: Firestore, term: string): Promise<AthletePublicProfile[]> {
  const normalized = normalizeSearchTerm(term);
  if (!normalized) return [];
  const snap = await getDocs(
    query(collection(db, 'public_profiles'), where('hasAthleteRole', '==', true), where('keywords', 'array-contains', normalized), limit(25)),
  );
  return snap.docs.map((d) => athletePublicProfileFromDoc(d.id, d.data() as Record<string, unknown>)).filter((p) => p.isDiscoverable);
}

/** Atletas de olho em formar dupla (`role==athlete` + `lookingForPartner==true` — mesmo par de
 *  campos do índice composto `role+lookingForPartner` já usado pelo app). */
export async function fetchPartnerCandidates(db: Firestore, excludeUid: string | null): Promise<AthletePublicProfile[]> {
  const snap = await getDocs(
    query(collection(db, 'public_profiles'), where('role', '==', 'athlete'), where('lookingForPartner', '==', true), limit(60)),
  );
  return snap.docs
    .map((d) => athletePublicProfileFromDoc(d.id, d.data() as Record<string, unknown>))
    .filter((p) => p.isDiscoverable && p.id !== excludeUid);
}

export async function fetchPublicProfile(db: Firestore, uid: string): Promise<AthletePublicProfile | null> {
  const snap = await getDoc(doc(db, 'public_profiles', uid));
  if (!snap.exists()) return null;
  return athletePublicProfileFromDoc(snap.id, snap.data() as Record<string, unknown>);
}

/** Busca em lote por id (chunks de 10, `documentId() in [...]`) — mesmo padrão usado pelo
 *  Ranking e por Equipes pra resolver nomes/avatares dos participantes. */
export async function fetchPublicProfilesByIds(db: Firestore, ids: readonly string[]): Promise<Map<string, AthletePublicProfile>> {
  const unique = [...new Set(ids.filter((id) => id.trim().length > 0))];
  const result = new Map<string, AthletePublicProfile>();
  if (unique.length === 0) return result;

  const chunkPromises: Promise<QueryDocumentSnapshot[]>[] = [];
  for (let i = 0; i < unique.length; i += 10) {
    const chunk = unique.slice(i, i + 10);
    chunkPromises.push(getDocs(query(collection(db, 'public_profiles'), where(documentId(), 'in', chunk))).then((s) => s.docs));
  }
  const chunks = await Promise.all(chunkPromises);
  for (const docs of chunks) {
    for (const d of docs) {
      result.set(d.id, athletePublicProfileFromDoc(d.id, d.data() as Record<string, unknown>));
    }
  }
  return result;
}
