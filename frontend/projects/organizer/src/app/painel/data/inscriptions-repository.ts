import { collection, documentId, getCountFromServer, getDocs, query, where, type Firestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { organizerFirestore } from './firestore';
import { fetchTeamNames, fetchTeamsByIds } from './teams-repository';

/** `artifacts/{projectId}/public/data/inscriptions` (mesma coleção que o athlete lê em
 *  `tournament-registrations-repository.ts`) — o doc real só guarda `participantUids`/`teamId`
 *  (uids) e `isPaid`/`waitlist` (booleanos); não existe nome de dupla nem status de pagamento em
 *  texto no schema. O painel precisa dos dois em texto, então resolve nomes via `teams`
 *  (`teamName`) e `public_profiles` (`nickname`/`fullName`) — mesmo join que
 *  `tournament-brackets.component.ts` faz no athlete — e deriva `paymentStatus` a partir dos
 *  booleanos reais (`isPaid`/`waitlist`). */

export interface InscriptionParticipant {
  uid: string;
  name: string;
  photoUrl: string | null;
}

export interface TournamentInscription {
  id: string;
  tournamentId: string;
  categoryId: string | null;
  teamId: string | null; // id da dupla em `teams` — usado nos seeds da geração de chave
  teamName: string; // nome da dupla/equipe ou jogadores
  /** Atletas da inscrição (1 solo / 2 dupla) — para avatares na lista. */
  participants: InscriptionParticipant[];
  participantNames: string[];
  paymentStatus: string; // raw (ex.: paid/pending/…)
  paid: boolean;
  partnerPending: boolean; // inscrição solo aguardando parceiro — não entra na chave
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
  partnerPending: boolean;
  createdAt: Date | null;
}

interface ProfileDisplay {
  name: string;
  photoUrl: string | null;
}

function rawFromDoc(id: string, data: Record<string, unknown>): RawInscription {
  return {
    id,
    tournamentId: optionalStr(data['tournamentId']) ?? '',
    categoryId: optionalStr(data['categoryId']),
    teamId: optionalStr(data['teamId']),
    participantUids: Array.isArray(data['participantUids'])
      ? data['participantUids'].filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : [],
    isPaid: data['isPaid'] === true,
    waitlist: data['waitlist'] === true,
    partnerPending: data['partnerPending'] === true,
    createdAt: toDate(data['createdAt']),
  };
}

async function fetchDisplayProfiles(db: Firestore, uids: readonly string[]): Promise<Map<string, ProfileDisplay>> {
  const unique = [...new Set(uids.filter((id) => id.length > 0))];
  const result = new Map<string, ProfileDisplay>();
  if (unique.length === 0) return result;
  for (let i = 0; i < unique.length; i += 10) {
    const chunk = unique.slice(i, i + 10);
    const snap = await getDocs(query(collection(db, 'public_profiles'), where(documentId(), 'in', chunk)));
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      const name = optionalStr(data['nickname']) ?? optionalStr(data['fullName']) ?? optionalStr(data['name']);
      const photoUrl =
        optionalStr(data['profilePhotoUrl']) ??
        optionalStr(data['avatarUrl']) ??
        optionalStr(data['photoURL']) ??
        optionalStr(data['photoUrl']);
      result.set(d.id, { name: name ?? 'Atleta', photoUrl });
    }
  }
  return result;
}

function resolveParticipantUids(
  raw: RawInscription,
  teamPlayers: { player1Id: string; player2Id: string } | null,
): string[] {
  if (raw.participantUids.length > 0) return [...new Set(raw.participantUids)];
  if (!teamPlayers) return [];
  return [teamPlayers.player1Id, teamPlayers.player2Id].filter((id) => id.length > 0);
}

/** Só o total de inscrições do torneio — agregação server-side, sem baixar os docs nem fazer
 *  os joins de nome que o `listInscriptions` faz. Usado onde a tela só mostra o número
 *  (ex.: lista de etapas da liga). */
export async function countInscriptions(tournamentId: string): Promise<number> {
  const db = organizerFirestore();
  const projectId = environment.firebase.projectId;
  if (!projectId) return 0;

  const snap = await getCountFromServer(
    query(collection(db, 'artifacts', projectId, 'public', 'data', 'inscriptions'), where('tournamentId', '==', tournamentId)),
  );
  return snap.data().count;
}

export async function listInscriptions(tournamentId: string): Promise<TournamentInscription[]> {
  const db = organizerFirestore();
  const projectId = environment.firebase.projectId;
  if (!projectId) return [];

  const snap = await getDocs(
    query(collection(db, 'artifacts', projectId, 'public', 'data', 'inscriptions'), where('tournamentId', '==', tournamentId)),
  );
  const rows = snap.docs.map((d) => rawFromDoc(d.id, d.data() as Record<string, unknown>));

  const teamIds = rows.map((r) => r.teamId).filter((id): id is string => id != null);
  const [teamNames, teams] = await Promise.all([
    fetchTeamNames(db, projectId, teamIds),
    fetchTeamsByIds(db, projectId, teamIds),
  ]);

  const allUids = new Set<string>();
  for (const r of rows) {
    for (const uid of resolveParticipantUids(r, r.teamId ? teams.get(r.teamId) ?? null : null)) {
      allUids.add(uid);
    }
  }
  const profiles = await fetchDisplayProfiles(db, [...allUids]);

  return rows.map((r) => {
    const team = r.teamId ? teams.get(r.teamId) ?? null : null;
    const uids = resolveParticipantUids(r, team);
    const participants: InscriptionParticipant[] = uids.map((uid) => {
      const profile = profiles.get(uid);
      return {
        uid,
        name: profile?.name ?? 'Atleta',
        photoUrl: profile?.photoUrl ?? null,
      };
    });
    const participantNames = participants.map((p) => p.name);
    const teamName =
      (r.teamId ? teamNames.get(r.teamId) : null) ??
      (participantNames.length > 0 ? participantNames.join(' / ') : 'Inscrição');
    const paymentStatus = r.isPaid ? 'paid' : r.waitlist ? 'waitlist' : 'pending';
    return {
      id: r.id,
      tournamentId: r.tournamentId,
      categoryId: r.categoryId,
      teamId: r.teamId,
      teamName,
      participants,
      participantNames,
      paymentStatus,
      paid: r.isPaid,
      partnerPending: r.partnerPending,
      createdAt: r.createdAt,
    };
  });
}
