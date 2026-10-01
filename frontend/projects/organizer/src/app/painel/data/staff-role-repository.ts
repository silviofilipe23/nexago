import { doc, getDoc } from 'firebase/firestore';
import { organizerFirestore } from './firestore';
import { roleFromStaffMirror } from './tournament-role';
import type { TournamentRole } from './tournament.model';

/** Papel do uid NUM torneio, lendo UM doc do espelho `users/{uid}/tournamentStaff/{tid}`.
 *  Sem doc = não é da equipe (dono e super admin caem aqui e passam: o acesso deles vem de
 *  outro lugar). Falha de leitura também devolve `null` — a fronteira de verdade são as
 *  rules e as callables; a tela só desvia. */
export async function readMyStaffRole(uid: string, tournamentId: string): Promise<TournamentRole | null> {
  try {
    const snap = await getDoc(doc(organizerFirestore(), 'users', uid, 'tournamentStaff', tournamentId));
    return snap.exists() ? roleFromStaffMirror(snap.data() as Record<string, unknown>) : null;
  } catch (err) {
    console.warn('Papel na equipe do torneio: falha ao ler o espelho', err);
    return null;
  }
}
