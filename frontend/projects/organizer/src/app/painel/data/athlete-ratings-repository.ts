import { collection, documentId, getDocs, query, where } from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { organizerFirestore } from './firestore';
import { chunkIds } from './teams-repository';
import type { AthleteRatingLite } from './team-level-score';

/** `artifacts/{projectId}/public/data/athleteRatings/{uid}_{sportCode}` — estado derivado da
 *  engine de rating (Glicko-2), escrito só pelo backend e de leitura pública nas rules. Mesma
 *  fonte que o app lê em `athlete_rating_repository.dart`. */

/** Esportes com engine de rating (`RATED_SPORT_CODES` em `functions/src/rating-config.ts`).
 *  Nos demais (beach tennis, futevôlei…) não existe doc — nem vale gastar a leitura. */
const RATED_SPORT_CODES = new Set(['VOLEI_PRAIA', 'VOLEI_QUADRA']);

export function hasRatingEngine(sportCode: string | null): boolean {
  return sportCode != null && RATED_SPORT_CODES.has(sportCode);
}

/** Ratings por uid. Map vazio quando o esporte não tem engine ou nada foi encontrado —
 *  falha de leitura nunca derruba a tela, o rating é só refinamento da pontuação de nível. */
export async function fetchAthleteRatings(
  uids: readonly string[],
  sportCode: string | null,
): Promise<Map<string, AthleteRatingLite>> {
  const result = new Map<string, AthleteRatingLite>();
  const projectId = environment.firebase.projectId;
  if (!projectId || !hasRatingEngine(sportCode)) return result;

  const unique = [...new Set(uids.filter((id) => id.trim().length > 0))];
  if (unique.length === 0) return result;

  const db = organizerFirestore();
  const ref = collection(db, 'artifacts', projectId, 'public', 'data', 'athleteRatings');
  const suffix = `_${sportCode}`;
  const docIds = unique.map((uid) => `${uid}${suffix}`);

  try {
    const snaps = await Promise.all(
      chunkIds(docIds).map((chunk) => getDocs(query(ref, where(documentId(), 'in', chunk)))),
    );
    for (const snap of snaps) {
      for (const d of snap.docs) {
        if (!d.id.endsWith(suffix)) continue;
        const data = d.data() as Record<string, unknown>;
        const rating = data['rating'];
        const ratedMatches = data['ratedMatches'];
        if (typeof rating !== 'number' || !Number.isFinite(rating)) continue;
        result.set(d.id.slice(0, -suffix.length), {
          rating,
          ratedMatches: typeof ratedMatches === 'number' && Number.isFinite(ratedMatches) ? ratedMatches : 0,
        });
      }
    }
  } catch {
    return new Map();
  }
  return result;
}
