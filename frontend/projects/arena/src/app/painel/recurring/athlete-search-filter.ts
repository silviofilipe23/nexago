export interface AthleteCandidate {
  athleteId: string;
  name: string;
  photoUrl?: string | null;
}

const MAX_RESULTS = 8;
/** Campo vazio vira lista navegável (o gestor clica e escolhe), não só type-ahead. */
const MAX_BROWSE_RESULTS = 50;

const BY_NAME = new Intl.Collator('pt-BR', { sensitivity: 'base' });

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** Filtro client-side por substring (sem acento/caixa) — a base de candidatos
 *  já foi carregada uma vez (clientes da arena), então isso é só um filtro
 *  em memória, sem query nova no Firestore. Sem texto, lista todos em ordem alfabética. */
export function filterAthleteCandidates(candidates: AthleteCandidate[], queryText: string): AthleteCandidate[] {
  const q = normalize(queryText);
  const sorted = [...candidates].sort((a, b) => BY_NAME.compare(a.name, b.name));
  if (!q) return sorted.slice(0, MAX_BROWSE_RESULTS);
  return sorted.filter((c) => normalize(c.name).includes(q)).slice(0, MAX_RESULTS);
}
