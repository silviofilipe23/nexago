import { collection, doc, getDoc, getDocs, type DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { isActiveStatus, isDraftStatus, rawStatusOf, resolveListingStatus } from './tournament-status';
import type { TournamentCategory, TournamentDetail, TournamentSummary } from './types';

function toDate(value: unknown): Date | null {
  if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

/**
 * Estrito de propósito: doc sem o campo é `linkOnly` e só existe pelo link que o organizador
 * compartilha — mesma regra de `tournament-share.ts` no portal do organizador.
 */
function isPublic(data: DocumentData): boolean {
  return data.visibility === 'publicListing';
}

function mapSummary(id: string, d: DocumentData, now: Date): TournamentSummary {
  const categories = Array.isArray(d.categories) ? d.categories : [];
  const startAt = toDate(d.startAt);
  const endAt = toDate(d.endAt);
  const enrolledCount = Number(d.enrolledCount ?? 0);
  const capacity = typeof d.capacity === 'number' ? d.capacity : null;
  const liveMatchesNow = Number(d.liveMatchesNow ?? 0);
  return {
    id,
    name: String(d.name ?? 'Torneio'),
    sport: String(d.sport ?? ''),
    city: d.city ?? null,
    state: d.state ?? null,
    locationName: d.locationName ?? null,
    dateLabel: d.dateLabel ?? null,
    startAt,
    endAt,
    listingStatus: resolveListingStatus(
      { rawStatus: rawStatusOf(d), startAt, endAt, liveMatchesNow, enrolledCount, capacity },
      now,
    ),
    featured: Boolean(d.featured),
    enrolledCount,
    capacity,
    liveMatchesNow,
    categoriesCount: categories.length,
    leagueId: d.leagueId ?? null,
    leagueStageName: d.leagueStageName ?? null,
    coverUrl: d.coverUrl ?? d.imageUrl ?? null,
  };
}

/** Ativos primeiro (o próximo antes), encerrados depois (o mais recente antes). Sem data vai pro fim. */
function byRelevance(a: TournamentSummary, b: TournamentSummary): number {
  const aActive = isActiveStatus(a.listingStatus);
  const bActive = isActiveStatus(b.listingStatus);
  if (aActive !== bActive) return aActive ? -1 : 1;
  const aTime = a.startAt?.getTime();
  const bTime = b.startAt?.getTime();
  if (aTime == null) return bTime == null ? 0 : 1;
  if (bTime == null) return -1;
  return aActive ? aTime - bTime : bTime - aTime;
}

function mapCategory(c: DocumentData): TournamentCategory {
  return {
    categoryName: typeof c.categoryName === 'string' ? c.categoryName : c.name,
    genderType: c.genderType,
    level: c.level,
    entryFeeCents: typeof c.entryFeeCents === 'number' ? c.entryFeeCents : undefined,
    spotsTotal: typeof c.spotsTotal === 'number' ? c.spotsTotal : undefined,
    bracketFormat: c.bracketFormat,
  };
}

/**
 * Torneios públicos e publicados: ativos primeiro, encerrados depois.
 *
 * Sem `orderBy('startAt')` de propósito — o Firestore descarta em silêncio os docs que não têm
 * o campo (é o caso dos docs legados), então a ordenação acontece em memória. A coleção é
 * pequena e a página é ISR; se crescer, o caminho é denormalizar um campo de ordenação e criar
 * o índice composto, não voltar o `orderBy`.
 */
export async function getPublicTournaments(max = 48): Promise<TournamentSummary[]> {
  // Cancelado só existe pelo link compartilhado — não ocupa espaço na vitrine.
  const tournaments = await getPublishedTournaments();
  return tournaments.filter((t) => t.listingStatus !== 'cancelled').slice(0, max);
}

/**
 * Todo torneio que tem página pública — **inclui cancelado**, que sai da listagem mas mantém a
 * página aberta pelo link que o organizador compartilhou.
 *
 * É o que o `generateStaticParams` precisa no export estático: enumerar só a listagem deixaria o
 * link de um torneio cancelado sem página gerada, ou seja, 404 em vez do aviso de cancelamento.
 */
export async function getPublishedTournaments(max = 500): Promise<TournamentSummary[]> {
  try {
    const snap = await getDocs(collection(db, 'tournaments'));
    const now = new Date();
    return snap.docs
      .filter((doc) => isPublic(doc.data()) && !isDraftStatus(rawStatusOf(doc.data())))
      .map((doc) => mapSummary(doc.id, doc.data(), now))
      .sort(byRelevance)
      .slice(0, max);
  } catch (err) {
    console.error('[tournaments] getPublishedTournaments failed:', err);
    return [];
  }
}

/** Só o que ainda vai acontecer ou está acontecendo — usado na vitrine da home. */
export async function getActiveTournaments(max = 6): Promise<TournamentSummary[]> {
  const tournaments = await getPublicTournaments();
  return tournaments.filter((t) => isActiveStatus(t.listingStatus)).slice(0, max);
}

/** Separa a listagem nas duas seções de `/torneios`. */
export function splitByActivity(tournaments: TournamentSummary[]): {
  active: TournamentSummary[];
  ended: TournamentSummary[];
} {
  return {
    active: tournaments.filter((t) => isActiveStatus(t.listingStatus)),
    ended: tournaments.filter((t) => !isActiveStatus(t.listingStatus)),
  };
}

export async function getTournamentById(id: string): Promise<TournamentDetail | null> {
  try {
    const snap = await getDoc(doc(db, 'tournaments', id));
    if (!snap.exists()) return null;
    const d = snap.data();
    // Rascunho não é público mesmo com `visibility: 'publicListing'` — o wizard grava a
    // visibilidade já na criação, antes de o organizador publicar. Sem isso a página existiria.
    if (!isPublic(d) || isDraftStatus(rawStatusOf(d))) return null;
    const categories = Array.isArray(d.categories) ? d.categories.map(mapCategory) : [];
    return {
      ...mapSummary(snap.id, d, new Date()),
      description: d.description ?? null,
      location: d.location ?? null,
      locationAddress: d.locationAddress ?? null,
      registrationOpensAt: toDate(d.registrationOpensAt),
      registrationClosesAt: toDate(d.registrationClosesAt),
      defaultEntryFeeCents: typeof d.defaultEntryFeeCents === 'number' ? d.defaultEntryFeeCents : null,
      cashPrizesEnabled: Boolean(d.cashPrizesEnabled),
      categories,
    };
  } catch (err) {
    console.error('[tournaments] getTournamentById failed:', err);
    return null;
  }
}
