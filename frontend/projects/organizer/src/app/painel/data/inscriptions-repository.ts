import { collection, documentId, getDocs, query, where, type Firestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { organizerFirestore } from './firestore';

/** `artifacts/{projectId}/public/data/inscriptions` (mesma coleção que o athlete lê em
 *  `tournament-registrations-repository.ts`) — o doc real só guarda `participantUids`/`teamId`
 *  (uids) e `isPaid`/`waitlist` (booleanos); não existe nome de dupla nem status de pagamento em
 *  texto no schema. O painel precisa dos dois em texto, então resolve nomes via `teams`
 *  (`teamName`) e `public_profiles` (`nickname`/`fullName`) — mesmo join que
 *  `tournament-brackets.component.ts` faz no athlete — e deriva `paymentStatus` a partir dos
 *  booleanos reais (`isPaid`/`waitlist`). */

export interface TournamentInscription {
  id: string;
  tournamentId: string;
  categoryId: string | null;
  teamName: string; // nome da dupla/equipe ou jogadores
  participantNames: string[];
  paymentStatus: string; // raw (ex.: paid/pending/…)
  paid: boolean;
  createdAt: Date | null;
}

function optionalStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function toDate(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | undefined;
  return typeof t?.toDate === 'function' ? t.toDate() : null;
}

interface RawInscription {
  id: string;
  tournamentId: string;
  categoryId: string | null;
  teamId: string | null;
  participantUids: string[];
  isPaid: boolean;
  waitlist: boolean;
  createdAt: Date | null;
}

function rawFromDoc(id: string, data: Record<string, unknown>): RawInscription {
  return {
    id,
    tournamentId: optionalStr(data['tournamentId']) ?? '',
    categoryId: optionalStr(data['categoryId']),
    teamId: optionalStr(data['teamId']),
    participantUids: Array.isArray(data['participantUids']) ? data['participantUids'].filter((x): x is string => typeof x === 'string') : [],
    isPaid: data['isPaid'] === true,
    waitlist: data['waitlist'] === true,
    createdAt: toDate(data['createdAt']),
  };
}

async function fetchTeamNames(db: Firestore, projectId: string, teamIds: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(teamIds.filter((id) => id.length > 0))];
  const result = new Map<string, string>();
  if (unique.length === 0) return result;
  const col = collection(db, 'artifacts', projectId, 'public', 'data', 'teams');
  for (let i = 0; i < unique.length; i += 10) {
    const chunk = unique.slice(i, i + 10);
    const snap = await getDocs(query(col, where(documentId(), 'in', chunk)));
    for (const d of snap.docs) {
      const name = optionalStr((d.data() as Record<string, unknown>)['teamName']);
      if (name) result.set(d.id, name);
    }
  }
  return result;
}

async function fetchDisplayNames(db: Firestore, uids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(uids.filter((id) => id.length > 0))];
  const result = new Map<string, string>();
  if (unique.length === 0) return result;
  for (let i = 0; i < unique.length; i += 10) {
    const chunk = unique.slice(i, i + 10);
    const snap = await getDocs(query(collection(db, 'public_profiles'), where(documentId(), 'in', chunk)));
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      const name = optionalStr(data['nickname']) ?? optionalStr(data['fullName']) ?? optionalStr(data['name']);
      if (name) result.set(d.id, name);
    }
  }
  return result;
}

export async function listInscriptions(tournamentId: string): Promise<TournamentInscription[]> {
  const db = organizerFirestore();
  const projectId = environment.firebase.projectId;
  if (!projectId) return [];

  const snap = await getDocs(query(collection(db, 'artifacts', projectId, 'public', 'data', 'inscriptions'), where('tournamentId', '==', tournamentId)));
  const rows = snap.docs.map((d) => rawFromDoc(d.id, d.data() as Record<string, unknown>));

  const teamIds = rows.map((r) => r.teamId).filter((id): id is string => id != null);
  const participantUids = rows.flatMap((r) => r.participantUids);
  const [teamNames, displayNames] = await Promise.all([fetchTeamNames(db, projectId, teamIds), fetchDisplayNames(db, participantUids)]);

  return rows.map((r) => {
    const participantNames = r.participantUids.map((uid) => displayNames.get(uid) ?? 'Atleta');
    const teamName = (r.teamId ? teamNames.get(r.teamId) : null) ?? (participantNames.length > 0 ? participantNames.join(' / ') : 'Inscrição');
    const paymentStatus = r.isPaid ? 'paid' : r.waitlist ? 'waitlist' : 'pending';
    return {
      id: r.id,
      tournamentId: r.tournamentId,
      categoryId: r.categoryId,
      teamName,
      participantNames,
      paymentStatus,
      paid: r.isPaid,
      createdAt: r.createdAt,
    };
  });
}
