import { Injectable } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import { athleteFirestore, athleteProjectId } from './firestore';
import {
  ORGANIZER_PUBLIC_PROFILES,
  organizerEventFromDoc,
  organizerFollowWrite,
  organizerProfileIsPublic,
  organizerPublicProfileFromDoc,
  organizerReputationDetailFromData,
  organizerReviewSummaryFromDoc,
  teamDisplayName,
  type OrganizerEvent,
  type OrganizerPublicProfile,
  type OrganizerReputationDetail,
  type OrganizerReviewSummaryRow,
} from './organizer-public-profiles';
import { fetchPublicProfilesByIds } from './public-profiles-repository';
import { fetchTeamsByIds, teamMemberIds } from './teams-repository';

/**
 * Leituras e escritas do perfil público do organizador. Tudo aqui é público (`read: if true`),
 * menos a contagem de inscrições e a lista de seguidores, que exigem login — as duas rotas que
 * usam isto têm `authGuard`.
 */

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))];
}

export async function fetchOrganizerPublicProfile(db: Firestore, uid: string): Promise<OrganizerPublicProfile | null> {
  const snap = await getDoc(doc(db, ORGANIZER_PUBLIC_PROFILES, uid));
  return snap.exists() ? organizerPublicProfileFromDoc(snap.id, snap.data()) : null;
}

/** Lista "Organizadores": só quem o servidor marcou `listed` (tem o papel e evento listado). O
 *  filtro por `isOrganizer` repete o do servidor: doc sem identidade nunca vira card. */
export async function fetchListedOrganizerProfiles(db: Firestore): Promise<OrganizerPublicProfile[]> {
  const snap = await getDocs(query(collection(db, ORGANIZER_PUBLIC_PROFILES), where('listed', '==', true)));
  return snap.docs.map((d) => organizerPublicProfileFromDoc(d.id, d.data())).filter(organizerProfileIsPublic);
}

export async function fetchOrganizerReputationDetail(db: Firestore, uid: string): Promise<OrganizerReputationDetail | null> {
  const snap = await getDoc(doc(db, 'organizerReputation', uid));
  return snap.exists() ? organizerReputationDetailFromData(snap.data()) : null;
}

/** Reputação dos cards da lista, em blocos de 10 ids (`in`). */
export async function fetchOrganizerReputationsByIds(db: Firestore, ids: readonly string[]): Promise<Map<string, OrganizerReputationDetail>> {
  const result = new Map<string, OrganizerReputationDetail>();
  await Promise.all(
    chunks(uniqueIds(ids), 10).map(async (chunk) => {
      const snap = await getDocs(query(collection(db, 'organizerReputation'), where(documentId(), 'in', chunk)));
      for (const d of snap.docs) {
        const reputation = organizerReputationDetailFromData(d.data());
        if (reputation) result.set(d.id, reputation);
      }
    }),
  );
  return result;
}

/** Torneios do organizador. Filtro de campo único, sem `orderBy`: dispensa índice composto — a
 *  definição de "listado" e a ordem por data ficam no cliente. */
export async function fetchOrganizerEvents(db: Firestore, uid: string): Promise<OrganizerEvent[]> {
  const snap = await getDocs(query(collection(db, 'tournaments'), where('managerId', '==', uid)));
  return snap.docs.map((d) => organizerEventFromDoc(d.id, d.data())).filter((e): e is OrganizerEvent => e != null);
}

export async function fetchOrganizerReviewSummaries(db: Firestore, uid: string): Promise<OrganizerReviewSummaryRow[]> {
  const snap = await getDocs(query(collection(db, 'tournamentReviewSummaries'), where('organizerId', '==', uid)));
  return snap.docs.map((d) => organizerReviewSummaryFromDoc(d.id, d.data()));
}

/** Inscrições por torneio com `count()` — 1 leitura por torneio em vez de baixar cada inscrição
 *  (`fetchEnrolledCountsByTournament` baixa os docs). Os contadores do doc do torneio são dado
 *  morto. Torneio cuja contagem falhar fica fora do mapa (a tela mostra só a capacidade). */
export async function fetchTournamentEnrolledCounts(db: Firestore, projectId: string, ids: readonly string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const col = collection(db, 'artifacts', projectId, 'public', 'data', 'inscriptions');
  await Promise.all(
    uniqueIds(ids).map(async (id) => {
      try {
        const snap = await getCountFromServer(query(col, where('tournamentId', '==', id)));
        result.set(id, snap.data().count);
      } catch {
        // Sem contagem: o card mostra a capacidade sem o preenchido.
      }
    }),
  );
  return result;
}

/** Nome de exibição de cada equipe campeã (`teamDisplayName`). Equipe que não existe mais, ou
 *  sem nome e sem perfis legíveis, fica fora do mapa. */
export async function fetchTeamDisplayNames(db: Firestore, projectId: string, teamIds: readonly string[]): Promise<Map<string, string>> {
  const teams = await fetchTeamsByIds(db, projectId, uniqueIds(teamIds));
  const profiles = await fetchPublicProfilesByIds(db, [...teams.values()].flatMap((t) => teamMemberIds(t)));
  const result = new Map<string, string>();
  for (const [id, team] of teams) {
    const name = teamDisplayName(team, profiles);
    if (name) result.set(id, name);
  }
  return result;
}

export async function fetchIsFollowingOrganizer(db: Firestore, viewerUid: string, organizerId: string): Promise<boolean> {
  const write = organizerFollowWrite(viewerUid, organizerId);
  if (!write) return false;
  const [first, ...rest] = write.path;
  const snap = await getDoc(doc(db, first, ...rest));
  return snap.exists();
}

/** Seguir é CRIAR o doc (a rule não aceita update), deixar de seguir é apagar. `setDoc` sem
 *  merge e com exatamente as três chaves da rule. O contador do doc pai é do servidor. */
export async function setFollowingOrganizer(db: Firestore, viewerUid: string, organizerId: string, follow: boolean): Promise<void> {
  const write = organizerFollowWrite(viewerUid, organizerId);
  if (!write) return;
  const [first, ...rest] = write.path;
  const ref = doc(db, first, ...rest);
  if (follow) await setDoc(ref, { ...write.data, followedAt: serverTimestamp() });
  else await deleteDoc(ref);
}

/** Costura de teste das telas de `/organizadores` (mesmo papel do `PublicTournamentReviewsSource`).
 *  Sem Firestore configurado tudo vem vazio: a tela cai em "não encontrado". */
@Injectable({ providedIn: 'root' })
export class OrganizerPublicProfileSource {
  private db(): Firestore | null {
    return athleteFirestore();
  }

  fetchProfile(uid: string): Promise<OrganizerPublicProfile | null> {
    const db = this.db();
    return db ? fetchOrganizerPublicProfile(db, uid) : Promise.resolve(null);
  }

  fetchListedOrganizers(): Promise<OrganizerPublicProfile[]> {
    const db = this.db();
    return db ? fetchListedOrganizerProfiles(db) : Promise.resolve([]);
  }

  fetchReputation(uid: string): Promise<OrganizerReputationDetail | null> {
    const db = this.db();
    return db ? fetchOrganizerReputationDetail(db, uid) : Promise.resolve(null);
  }

  fetchReputations(ids: readonly string[]): Promise<Map<string, OrganizerReputationDetail>> {
    const db = this.db();
    return db ? fetchOrganizerReputationsByIds(db, ids) : Promise.resolve(new Map());
  }

  fetchEvents(uid: string): Promise<OrganizerEvent[]> {
    const db = this.db();
    return db ? fetchOrganizerEvents(db, uid) : Promise.resolve([]);
  }

  fetchReviewSummaries(uid: string): Promise<OrganizerReviewSummaryRow[]> {
    const db = this.db();
    return db ? fetchOrganizerReviewSummaries(db, uid) : Promise.resolve([]);
  }

  fetchEnrolledCounts(tournamentIds: readonly string[]): Promise<Map<string, number>> {
    const db = this.db();
    const projectId = athleteProjectId();
    return db && projectId ? fetchTournamentEnrolledCounts(db, projectId, tournamentIds) : Promise.resolve(new Map());
  }

  fetchTeamNames(teamIds: readonly string[]): Promise<Map<string, string>> {
    const db = this.db();
    const projectId = athleteProjectId();
    return db && projectId ? fetchTeamDisplayNames(db, projectId, teamIds) : Promise.resolve(new Map());
  }

  isFollowing(viewerUid: string, organizerId: string): Promise<boolean> {
    const db = this.db();
    return db ? fetchIsFollowingOrganizer(db, viewerUid, organizerId) : Promise.resolve(false);
  }

  setFollowing(viewerUid: string, organizerId: string, follow: boolean): Promise<void> {
    const db = this.db();
    if (!db) return Promise.reject(new Error('Firestore indisponível'));
    return setFollowingOrganizer(db, viewerUid, organizerId, follow);
  }
}
