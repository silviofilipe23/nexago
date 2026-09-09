import { collection, doc, getDocs, limit, onSnapshot, query, where } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { organizerFirestore } from './firestore';
import type { DrawSession } from './draw-session.model';

/**
 * Leitura da sessão de sorteio — `artifacts/{projectId}/public/data/drawSessions`.
 *
 * Um listener num documento só. É o mínimo teórico de custo (uma mudança por
 * revelação, para cada aparelho conectado) e é o que permite o TELÃO PÚBLICO
 * funcionar sem login: as rules abrem a leitura desta coleção e de nenhuma
 * outra que o telão precise.
 *
 * Nunca escreve. Toda escrita passa pelas callables.
 */

function sessionsRef(db: Firestore) {
  // `projectId` é opcional no tipo do environment, mas obrigatório no caminho.
  // Sem ele o Firebase nem inicializaria, então o fallback vazio só existe pra
  // manter o tipo honesto — a leitura falharia bem antes de chegar aqui.
  const projectId = environment.firebase.projectId ?? '';
  return collection(db, 'artifacts', projectId, 'public', 'data', 'drawSessions');
}

function toSession(id: string, data: Record<string, unknown>): DrawSession {
  return { ...(data as unknown as Omit<DrawSession, 'id'>), id };
}

/**
 * Ouve uma sessão. `onMissing` separa "link errado / sessão apagada" de "erro
 * de leitura" — o telão mostra mensagens diferentes pra cada caso, e tratar as
 * duas como falha genérica manda o público embora sem explicação.
 */
export function watchDrawSession(
  sessionId: string,
  onSession: (session: DrawSession) => void,
  onMissing: () => void,
  onError: () => void,
): () => void {
  const db = organizerFirestore();
  return onSnapshot(
    doc(sessionsRef(db), sessionId),
    (snap) => {
      if (!snap.exists()) return onMissing();
      onSession(toSession(snap.id, snap.data() as Record<string, unknown>));
    },
    () => onError(),
  );
}

/**
 * Sessão viva (ou publicada mais recente) de uma categoria — é como a tela de
 * configuração descobre que já existe sessão em vez de criar outra.
 *
 * Sem `orderBy` de propósito: ordenar por `createdAt` exigiria índice composto,
 * e o volume aqui é de unidades por categoria. A escolha da mais recente é
 * feita em memória.
 */
export async function findDrawSessionForCategory(
  tournamentId: string,
  categoryId: string,
): Promise<DrawSession | null> {
  const db = organizerFirestore();
  const snap = await getDocs(
    query(
      sessionsRef(db),
      where('tournamentId', '==', tournamentId),
      where('categoryId', '==', categoryId),
      limit(20),
    ),
  );
  const sessions = snap.docs.map((d) => toSession(d.id, d.data() as Record<string, unknown>));
  if (sessions.length === 0) return null;

  // Uma sessão anulada não some — ela continua pública como comprovante. Mas a
  // tela precisa oferecer a sessão ATIVA, então anuladas ficam por último.
  const rank = (s: DrawSession): number =>
    s.status === 'live' ? 0 : s.status === 'scheduled' || s.status === 'draft' ? 1 : s.status === 'published' ? 2 : 3;

  return [...sessions].sort(
    (a, b) => rank(a) - rank(b) || (b.startedAt ?? 0) - (a.startedAt ?? 0),
  )[0]!;
}
