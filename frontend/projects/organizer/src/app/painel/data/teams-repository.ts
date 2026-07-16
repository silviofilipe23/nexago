import { collection, documentId, getDocs, query, where, type Firestore } from 'firebase/firestore';

/** `artifacts/{projectId}/public/data/teams` — nome de exibição da dupla/equipe (`teamName`).
 *  Usado onde só temos o `teamId` cru (inscrições, partidas de rodada 1 — que vêm de SEED
 *  direto e nunca ganham `teamADescription`/`teamBDescription`, só as partidas com origem
 *  WINNER/LOSER de outro jogo têm essa descrição pré-calculada, ver
 *  `category-bracket-builders.ts`). */

function optionalStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export async function fetchTeamNames(db: Firestore, projectId: string, teamIds: readonly string[]): Promise<Map<string, string>> {
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
