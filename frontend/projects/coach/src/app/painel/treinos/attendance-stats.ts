import type { Training } from './trainings.service';

/**
 * % de presença de um atleta nos treinos já realizados. `presente` e
 * `atrasado` contam como presença; `ausente` e `justificado` não. Treinos
 * sem entrada de presença para o atleta são ignorados (não contam nem a
 * favor nem contra). Retorna `null` se o atleta não aparece em nenhum
 * treino realizado.
 */
export function attendanceRate(athleteUid: string, trainings: Training[]): number | null {
  const relevant = trainings.filter(
    (t) => t.status === 'realizado' && athleteUid in t.attendance,
  );
  if (relevant.length === 0) {
    return null;
  }
  const attended = relevant.filter((t) => {
    const status = t.attendance[athleteUid];
    return status === 'presente' || status === 'atrasado';
  }).length;
  return Math.round((attended / relevant.length) * 100);
}
