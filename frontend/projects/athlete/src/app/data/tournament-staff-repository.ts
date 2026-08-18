import { collection, getDocs, onSnapshot, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { fetchTournamentSummariesByIds, tournamentIsFinishedOrCancelled, type TournamentSummary } from './tournaments-repository';

/** Espelho `users/{uid}/tournamentStaff/{tournamentId}` — escrito pela Cloud Function
 *  `onTournamentStaffWrittenSyncMirror` a partir de `tournaments/{id}/staff/{uid}` e legível
 *  só pelo próprio uid (`firestore.rules`). É por ele que o portal descobre em quais torneios
 *  o atleta atua como equipe: a query por `managerId` nunca os traria.
 *
 *  Mesmo contrato do `myTournamentStaffEntriesProvider` (Flutter): só entradas `active`,
 *  ordenadas por `startAt` desc (sem data vai pro fim). */

export type TournamentStaffRole = 'manager' | 'scorer';

export interface MyStaffTournament {
  tournamentId: string;
  role: TournamentStaffRole;
  status: string;
  tournamentName: string;
  startAt: Date | null;
  endAt: Date | null;
}

const ROLE_LABEL: Record<TournamentStaffRole, string> = { manager: 'Gestor', scorer: 'Mesário' };

/** Papel desconhecido/ausente cai em gestor — mesmo default de `buildStaffMirrorData`. */
export function staffRoleOf(raw: unknown): TournamentStaffRole {
  return raw === 'scorer' ? 'scorer' : 'manager';
}

export function staffRoleLabel(role: TournamentStaffRole): string {
  return ROLE_LABEL[role];
}

function toDate(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | undefined;
  return typeof t?.toDate === 'function' ? t.toDate() : null;
}

export function staffTournamentFromDoc(tournamentId: string, data: Record<string, unknown>): MyStaffTournament {
  return {
    tournamentId,
    role: staffRoleOf(data['role']),
    status: typeof data['status'] === 'string' ? data['status'] : 'active',
    tournamentName: typeof data['tournamentName'] === 'string' ? data['tournamentName'] : '',
    startAt: toDate(data['startAt']),
    endAt: toDate(data['endAt']),
  };
}

/** Ativos primeiro por data mais recente — a ordem que a lista "Torneios que eu opero" mostra. */
export function sortStaffTournaments(entries: readonly MyStaffTournament[]): MyStaffTournament[] {
  return [...entries].sort((a, b) => {
    if (a.startAt == null && b.startAt == null) return 0;
    if (a.startAt == null) return 1;
    if (b.startAt == null) return -1;
    return b.startAt.getTime() - a.startAt.getTime();
  });
}

function activeSorted(docs: Array<{ id: string; data: Record<string, unknown> }>): MyStaffTournament[] {
  return sortStaffTournaments(docs.map((d) => staffTournamentFromDoc(d.id, d.data)).filter((e) => e.status === 'active'));
}

export async function fetchMyStaffTournaments(db: Firestore, uid: string): Promise<MyStaffTournament[]> {
  const snap = await getDocs(collection(db, 'users', uid, 'tournamentStaff'));
  return activeSorted(snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> })));
}

/** Tempo real: o dono pode adicionar/remover a equipe durante o evento, e o mesário não deve
 *  precisar recarregar a página pra o torneio aparecer. */
export function watchMyStaffTournaments(db: Firestore, uid: string, onChange: (entries: MyStaffTournament[]) => void, onError?: (error: unknown) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'users', uid, 'tournamentStaff'),
    (snap) => onChange(activeSorted(snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> })))),
    (err) => onError?.(err),
  );
}

/** O que a mesa mostra e o que ela sabe ter escondido. */
export interface MyStaffTournamentsView {
  /** Torneios que ainda se opera — os que a lista exibe. */
  ongoing: MyStaffTournament[];
  /** Tudo que o espelho traz, encerrado incluído: é o que separa "nunca fui equipe" de "só
   *  sobrou torneio encerrado" no estado vazio. */
  all: MyStaffTournament[];
}

/** Tira da mesa o que já não se opera. Torneio ausente do mapa (leitura falhou, doc apagado)
 *  fica na lista: sumir por engano no dia do evento custa mais do que sobrar uma linha. */
export function filterOngoingStaffTournaments(
  entries: readonly MyStaffTournament[],
  tournaments: ReadonlyMap<string, Pick<TournamentSummary, 'rawStatus' | 'isCancelled'>>,
): MyStaffTournament[] {
  return entries.filter((e) => {
    const t = tournaments.get(e.tournamentId);
    return t == null || !tournamentIsFinishedOrCancelled(t);
  });
}

/** O espelho de staff não guarda o status do torneio — a CF só o reescreve quando a equipe
 *  muda —, então quem decide "acabou" é o doc do torneio, lido em lote. */
async function viewOf(db: Firestore, all: MyStaffTournament[]): Promise<MyStaffTournamentsView> {
  if (all.length === 0) return { ongoing: [], all };
  const byId = await fetchTournamentSummariesByIds(db, all.map((e) => e.tournamentId));
  return { ongoing: filterOngoingStaffTournaments(all, byId), all };
}

/** Igual ao `watchMyStaffTournaments`, sem os torneios finalizados/cancelados. O status do
 *  torneio não é assinado: quem está na mesa não pode ver a lista se rearranjar embaixo do
 *  dedo, e o encerramento aparece na próxima entrada na tela. */
export function watchMyOngoingStaffTournaments(
  db: Firestore,
  uid: string,
  onChange: (view: MyStaffTournamentsView) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  let generation = 0;
  let stopped = false;
  const unsub = watchMyStaffTournaments(
    db,
    uid,
    (all) => {
      const mine = ++generation;
      void viewOf(db, all)
        .then((view) => {
          // O espelho muda ao vivo: uma busca antiga não pode sobrescrever a mais nova.
          if (!stopped && mine === generation) onChange(view);
        })
        .catch(() => {
          // Sem os status não dá pra decidir — mostra tudo em vez de esvaziar a mesa.
          if (!stopped && mine === generation) onChange({ ongoing: all, all });
        });
    },
    onError,
  );
  return () => {
    stopped = true;
    unsub();
  };
}

/** Papel do usuário num torneio específico — `null` quando ele não é (mais) da equipe. */
export function staffRoleForTournament(entries: readonly MyStaffTournament[], tournamentId: string): TournamentStaffRole | null {
  return entries.find((e) => e.tournamentId === tournamentId.trim())?.role ?? null;
}
