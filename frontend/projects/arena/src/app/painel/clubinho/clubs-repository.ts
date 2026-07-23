import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import {
  arenaClubFromDoc,
  clubParticipantFromDoc,
  clubSessionFromDoc,
  type ArenaClub,
  type ArenaClubSession,
  type ClubParticipant,
} from './club.model';

/** Leitura direta do Firestore (rules liberam read autenticado); TODA escrita passa por
 *  Cloud Functions callable — gate de plano, locks de agenda, contadores de vaga e
 *  pagamento/estorno Asaas vivem no servidor (`functions/src/arena-club*.ts`). */

export class ArenaClubError extends Error {}

function mapFunctionsError(err: unknown): ArenaClubError {
  const message =
    err instanceof Error && err.message ? err.message : 'Não foi possível concluir a operação. Tente novamente.';
  return new ArenaClubError(message);
}

export async function fetchClubs(db: Firestore, arenaId: string): Promise<ArenaClub[]> {
  const snap = await getDocs(query(collection(db, 'arenaClubs'), where('arenaId', '==', arenaId)));
  return snap.docs
    .map(arenaClubFromDoc)
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}

export async function fetchClub(db: Firestore, clubId: string): Promise<ArenaClub | null> {
  const snap = await getDoc(doc(db, 'arenaClubs', clubId));
  return snap.exists() ? arenaClubFromDoc(snap) : null;
}

/** Sessões futuras (ou todas a partir de `fromDate`) de um clubinho, por data. */
export async function fetchClubSessions(
  db: Firestore,
  clubId: string,
  fromDate: string,
): Promise<ArenaClubSession[]> {
  const snap = await getDocs(
    query(
      collection(db, 'arenaClubSessions'),
      where('clubId', '==', clubId),
      where('date', '>=', fromDate),
      orderBy('date'),
    ),
  );
  return snap.docs.map(clubSessionFromDoc);
}

export function watchClubSession(
  db: Firestore,
  sessionId: string,
  onChange: (session: ArenaClubSession | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'arenaClubSessions', sessionId),
    (snap) => onChange(snap.exists() ? clubSessionFromDoc(snap) : null),
    () => onChange(null),
  );
}

export function watchClubParticipants(
  db: Firestore,
  sessionId: string,
  onChange: (participants: ClubParticipant[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'arenaClubSessions', sessionId, 'clubParticipants'), orderBy('joinedAt')),
    (snap) => onChange(snap.docs.map(clubParticipantFromDoc)),
    () => onChange([]),
  );
}

// ── Callables ────────────────────────────────────────────────────────────────

export interface UpsertClubInput {
  clubId?: string;
  arenaId: string;
  name: string;
  description?: string | null;
  weekday: number | null;
  startTime: string;
  endTime: string;
  courtIds: string[];
  capacity: number;
  priceReais: number;
  cancelWindowHours: number;
  allowOnsitePayment: boolean;
  endDate?: string | null;
}

export interface UpsertClubResult {
  clubId: string;
  createdDates: string[];
  skippedDates: string[];
}

export async function upsertClub(functions: Functions, input: UpsertClubInput): Promise<UpsertClubResult> {
  try {
    const result = await httpsCallable<UpsertClubInput, UpsertClubResult>(functions, 'upsertArenaClub')(input);
    return result.data;
  } catch (err) {
    throw mapFunctionsError(err);
  }
}

export async function setClubStatus(
  functions: Functions,
  clubId: string,
  status: 'active' | 'paused' | 'archived',
): Promise<void> {
  try {
    await httpsCallable<{ clubId: string; status: string }, unknown>(functions, 'setArenaClubStatus')({ clubId, status });
  } catch (err) {
    throw mapFunctionsError(err);
  }
}

export async function createClubSession(
  functions: Functions,
  clubId: string,
  date: string,
): Promise<{ sessionId: string; skippedCourtIds: string[] }> {
  try {
    const result = await httpsCallable<
      { clubId: string; date: string },
      { sessionId: string; skippedCourtIds: string[] }
    >(functions, 'createArenaClubSession')({ clubId, date });
    return result.data;
  } catch (err) {
    throw mapFunctionsError(err);
  }
}

// ── Gestor adiciona/remove atleta na lista ──────────────────────────────────

export interface AthleteSearchResult {
  id: string;
  name: string;
  photoUrl: string | null;
}

function normalizeSearchTerm(term: string): string {
  return term
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Busca no espelho público `public_profiles` (mesmo índice keywords do app/portal atleta). */
export async function searchAthletes(db: Firestore, term: string): Promise<AthleteSearchResult[]> {
  const normalized = normalizeSearchTerm(term);
  if (!normalized) return [];
  const snap = await getDocs(
    query(
      collection(db, 'public_profiles'),
      where('hasAthleteRole', '==', true),
      where('keywords', 'array-contains', normalized),
      limit(10),
    ),
  );
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    const name =
      (typeof data['fullName'] === 'string' && data['fullName']) ||
      (typeof data['name'] === 'string' && data['name']) ||
      (typeof data['nickname'] === 'string' && data['nickname']) ||
      'Atleta';
    const rawPhoto = data['profilePhotoUrl'] ?? data['avatarUrl'] ?? data['photoURL'];
    return {
      id: d.id,
      name,
      photoUrl: typeof rawPhoto === 'string' && rawPhoto ? rawPhoto : null,
    };
  });
}

/** Adiciona atleta da plataforma (athleteId) OU convidado sem conta (customerName). */
export async function addClubParticipant(
  functions: Functions,
  sessionId: string,
  input: { athleteId?: string; customerName?: string },
): Promise<{ participantId: string }> {
  try {
    const result = await httpsCallable<
      { sessionId: string; athleteId?: string; customerName?: string },
      { participantId: string }
    >(functions, 'addArenaClubParticipant')({ sessionId, ...input });
    return result.data;
  } catch (err) {
    throw mapFunctionsError(err);
  }
}

/** Remove da lista — PIX confirmado é estornado automaticamente; onsite só cancela. */
export async function removeClubParticipant(
  functions: Functions,
  sessionId: string,
  participantId: string,
): Promise<{ refunded: boolean }> {
  try {
    const result = await httpsCallable<
      { sessionId: string; participantId: string },
      { refunded: boolean }
    >(functions, 'removeArenaClubParticipant')({ sessionId, participantId });
    return result.data;
  } catch (err) {
    throw mapFunctionsError(err);
  }
}

export async function cancelClubSession(
  functions: Functions,
  sessionId: string,
  reason?: string,
): Promise<{ refunded: number; refundFailed: number; canceledPending: number }> {
  try {
    const result = await httpsCallable<
      { sessionId: string; reason?: string },
      { refunded: number; refundFailed: number; canceledPending: number }
    >(functions, 'cancelArenaClubSession')({ sessionId, reason });
    return result.data;
  } catch (err) {
    throw mapFunctionsError(err);
  }
}
