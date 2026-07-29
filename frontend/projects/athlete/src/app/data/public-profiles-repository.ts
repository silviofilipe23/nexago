import { defaultSportChipFromProfile, type ArenaSportChip } from '@nexago/arena-discovery';
import { levelLabelForRank, levelRankOf as sharedLevelRankOf } from '@nexago/levels';
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
import { RankingLevel } from '../ranking/athlete-ranking.models';

/** Espelha `public_profiles/{uid}` (`functions/src/public-profile-sync.ts`) — mirror sem PII
 *  de `users/{uid}`, mantido por Cloud Function trigger a cada escrita em `users`. Nunca tem
 *  email/telefone/nascimento/cpf — só o que a busca/ranking/perfil público precisam mostrar. */

export interface AthletePublicProfile {
  id: string;
  displayName: string;
  nickname: string | null;
  handle: string | null;
  city: string | null;
  state: string | null;
  avatarUrl: string | null;
  /** Código Firestore do esporte principal (ex.: `VOLEI_PRAIA`). */
  primarySportId: string | null;
  sportChip: ArenaSportChip;
  /** Código do nível pro esporte principal (ex.: `intermediario_1`), já com fallback pro nível legado. */
  levelCode: string | null;
  /** `users/{uid}.gender` cru ("Masculino"/"Feminino"/...) — normalizar com `normalizeAthleteGender`. */
  gender: string | null;
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

/** Rank unificado do nível — delega pro vocabulário canônico compartilhado
 *  (`@nexago/levels`, espelho de `functions/src/category-level-eligibility.ts`). */
export function levelRankOf(raw: string | null): number | null {
  return sharedLevelRankOf(raw);
}

/** Label do nível a partir do rank unificado. Mapeamento EXATO por degrau —
 *  os ranks são 0,1,2,3,5 (rank 4 sem uso), então thresholds `<=` deslocavam
 *  3 dos 5 níveis (ex.: `intermediario_1` aparecia como "Iniciante 2").
 *  "Avançado"/"Profissional" não existem como tiers reais no backend. */
export function levelBucketOf(raw: string | null): RankingLevel | null {
  const rank = levelRankOf(raw);
  if (rank == null) return null;
  return levelLabelForRank(rank) as RankingLevel;
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
    nickname,
    handle: stripHandle(nickname),
    city: optionalTrimmed(data['city']),
    state: optionalTrimmed(data['state']),
    avatarUrl: optionalTrimmed(data['profilePhotoUrl']) ?? optionalTrimmed(data['avatarUrl']) ?? optionalTrimmed(data['photoURL']),
    primarySportId,
    sportChip: defaultSportChipFromProfile({ primarySport: primarySportId, sport: optionalTrimmed(data['sport']) }),
    levelCode: levelForPrimarySport ?? optionalTrimmed(data['level']) ?? optionalTrimmed(data['nivel']),
    gender: optionalTrimmed(data['gender']),
    hasAthleteRole: data['hasAthleteRole'] === true || roles.includes('athlete') || data['role'] === 'athlete',
    lookingForPartner: data['lookingForPartner'] === true,
    lastActiveAt: toDate(data['lastActiveAt']),
    isDiscoverable: isDiscoverable(data),
  };
}

const PAGE_SIZE = 30;

export interface AthleteDirectoryPageQuery {
  /** Código Firestore (`VOLEI_PRAIA`, …) — pré-filtra via `discoverSportIds` (mesmo índice do app). */
  sportFirestoreId?: string | null;
  cursor?: string | null;
}

/** Página de atletas descobríveis. Com `sportFirestoreId`, usa
 *  `hasAthleteRole + discoverSportIds array-contains` (índice do app); senão pagina por id.
 *  `isDiscoverable` continua filtrado no client (não é indexado). */
export async function fetchAthleteDirectoryPage(
  db: Firestore,
  params: AthleteDirectoryPageQuery | string | null = {},
): Promise<{ profiles: AthletePublicProfile[]; nextCursor: string | null }> {
  // Compat: chamadas antigas `fetchAthleteDirectoryPage(db, cursor)`.
  const queryParams: AthleteDirectoryPageQuery = typeof params === 'string' || params == null ? { cursor: params } : params;
  const cursor = queryParams.cursor ?? null;
  const sportId = queryParams.sportFirestoreId?.trim() || null;
  const col = collection(db, 'public_profiles');

  const run = async (sportField: 'discoverSportIds' | 'sportOnboarding.primarySportId', asArray: boolean) => {
    const sportConstraint = asArray
      ? where(sportField, 'array-contains', sportId!)
      : where(sportField, '==', sportId!);
    const q = cursor
      ? query(col, where('hasAthleteRole', '==', true), sportConstraint, orderBy(documentId()), startAfter(cursor), limit(PAGE_SIZE))
      : query(col, where('hasAthleteRole', '==', true), sportConstraint, orderBy(documentId()), limit(PAGE_SIZE));
    return getDocs(q);
  };

  let snap;
  if (sportId) {
    try {
      snap = await run('discoverSportIds', true);
      // Perfis antigos sem `discoverSportIds` — tenta o primário (paridade Flutter).
      if (snap.empty && !cursor) {
        snap = await run('sportOnboarding.primarySportId', false);
      }
    } catch {
      // Índice ausente / campo inconsistente — cai no catálogo geral; o client filtra o chip.
      snap = await getDocs(
        cursor
          ? query(col, where('hasAthleteRole', '==', true), orderBy(documentId()), startAfter(cursor), limit(PAGE_SIZE))
          : query(col, where('hasAthleteRole', '==', true), orderBy(documentId()), limit(PAGE_SIZE)),
      );
    }
  } else {
    snap = await getDocs(
      cursor
        ? query(col, where('hasAthleteRole', '==', true), orderBy(documentId()), startAfter(cursor), limit(PAGE_SIZE))
        : query(col, where('hasAthleteRole', '==', true), orderBy(documentId()), limit(PAGE_SIZE)),
    );
  }

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
