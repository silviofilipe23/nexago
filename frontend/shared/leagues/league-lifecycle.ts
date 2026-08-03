import { doc, getDoc, serverTimestamp, updateDoc, type Firestore } from 'firebase/firestore';
import { leagueListingStatusOf, type LeagueListingStatus } from './league.model';

/** Ciclo de vida da liga — porta fiel de `_updateLeagueListingStatus`
 *  (`organizer_leagues_repository.dart`). As transições permitidas são as mesmas de
 *  `leagueListingStatusTransitionAllowed` em `firestore.rules`; validar aqui antes de escrever
 *  troca um erro genérico de permissão por uma mensagem que o organizador entende. */

export function leagueStatusTransitionAllowed(before: LeagueListingStatus, after: LeagueListingStatus): boolean {
  if (before === after) return true;
  if (before === 'draft') return after === 'open' || after === 'cancelled';
  if (before === 'open') return after === 'closed' || after === 'cancelled';
  return false;
}

/** Ação disponível ao organizador — o no-op (status igual ao destino) não conta como ação,
 *  senão o botão apareceria numa liga que já está encerrada/cancelada. */
export function canCloseLeagueSeason(status: LeagueListingStatus): boolean {
  return status !== 'closed' && leagueStatusTransitionAllowed(status, 'closed');
}

export function canCancelLeague(status: LeagueListingStatus): boolean {
  return status !== 'cancelled' && leagueStatusTransitionAllowed(status, 'cancelled');
}

async function updateLeagueListingStatus(
  db: Firestore,
  params: { leagueId: string; uid: string; next: LeagueListingStatus },
): Promise<void> {
  const { uid, next } = params;
  const leagueId = params.leagueId.trim();
  if (!leagueId) throw new Error('ID da liga inválido.');
  if (!uid) throw new Error('Usuário não autenticado.');

  const ref = doc(db, 'leagues', leagueId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Liga não encontrada.');

  const data = snap.data() as Record<string, unknown>;
  if (data['managerId'] !== uid) throw new Error('Sem permissão para gerenciar esta liga.');

  const current = leagueListingStatusOf(data);
  if (current === next) return;
  if (!leagueStatusTransitionAllowed(current, next)) {
    throw new Error(
      next === 'closed' ? 'Só é possível encerrar uma liga publicada.' : 'Esta liga não pode ser cancelada.',
    );
  }

  // `status` acompanha `listingStatus` — os dois são gravados juntos desde a criação.
  await updateDoc(ref, { listingStatus: next, status: next, updatedAt: serverTimestamp() });
}

export function closeLeagueSeason(db: Firestore, leagueId: string, uid: string): Promise<void> {
  return updateLeagueListingStatus(db, { leagueId, uid, next: 'closed' });
}

export function cancelLeague(db: Firestore, leagueId: string, uid: string): Promise<void> {
  return updateLeagueListingStatus(db, { leagueId, uid, next: 'cancelled' });
}
