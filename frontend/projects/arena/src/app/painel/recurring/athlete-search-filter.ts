export interface AthleteCandidate {
  athleteId: string;
  name: string;
}

const MAX_RESULTS = 8;
const MIN_QUERY_LENGTH = 2;

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** Filtro client-side por substring (sem acento/caixa) — a base de candidatos
 *  já foi carregada uma vez (seguidores da arena), então isso é só um filtro
 *  em memória, sem query nova no Firestore. */
export function filterAthleteCandidates(candidates: AthleteCandidate[], queryText: string): AthleteCandidate[] {
  const q = normalize(queryText);
  if (q.length < MIN_QUERY_LENGTH) return [];
  return candidates.filter((c) => normalize(c.name).includes(q)).slice(0, MAX_RESULTS);
}
