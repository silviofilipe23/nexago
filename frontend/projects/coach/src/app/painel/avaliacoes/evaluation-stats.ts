export interface EvaluationScores {
  saque: number;
  recepcao: number;
  levantamento: number;
  ataque: number;
  defesa: number;
  bloqueio: number;
  condicionamento: number;
  comunicacao: number;
  mental: number;
}

export interface Evaluation {
  id: string;
  athleteUid: string;
  date: string;
  scores: EvaluationScores;
  notes: string;
}

export function averageScore(scores: EvaluationScores): number {
  const values = Object.values(scores);
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Última e penúltima avaliação de cada atleta, ordenadas por data (string ISO, ordenável lexicograficamente). */
export function latestTwoByAthlete(
  evaluations: Evaluation[],
): Map<string, { latest: Evaluation; previous: Evaluation | null }> {
  const byAthlete = new Map<string, Evaluation[]>();
  for (const ev of evaluations) {
    const list = byAthlete.get(ev.athleteUid) ?? [];
    list.push(ev);
    byAthlete.set(ev.athleteUid, list);
  }

  const out = new Map<string, { latest: Evaluation; previous: Evaluation | null }>();
  for (const [athleteUid, list] of byAthlete) {
    const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date));
    out.set(athleteUid, { latest: sorted[0]!, previous: sorted[1] ?? null });
  }
  return out;
}
