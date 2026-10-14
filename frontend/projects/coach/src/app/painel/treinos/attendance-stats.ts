import type { AttendanceStatus, Training } from './trainings.service';

/** Única regra de "compareceu": presente e atrasado contam; ausente e justificado não. */
export function isPresent(status: AttendanceStatus): boolean {
  return status === 'presente' || status === 'atrasado';
}

/** Chamada de partida: todo o elenco `presente`, pra o professor só ajustar as exceções. */
export function defaultAttendance(athleteUids: string[]): Record<string, AttendanceStatus> {
  return Object.fromEntries(athleteUids.map((uid) => [uid, 'presente' as const]));
}

export interface AttendanceSummary {
  presente: number;
  ausente: number;
  atrasado: number;
  justificado: number;
  semMarcacao: number;
}

/** Conta por status só o elenco atual (quem saiu da equipe não entra) e quantos ainda não foram marcados. */
export function summarizeAttendance(
  attendance: Record<string, AttendanceStatus>,
  athleteUids: string[],
): AttendanceSummary {
  const summary: AttendanceSummary = { presente: 0, ausente: 0, atrasado: 0, justificado: 0, semMarcacao: 0 };
  for (const uid of athleteUids) {
    const status = attendance[uid];
    if (status) {
      summary[status]++;
    } else {
      summary.semMarcacao++;
    }
  }
  return summary;
}

/** Mesmo conteúdo (ignora ordem das chaves)? Usado pra saber se há algo a salvar. */
export function sameAttendance(a: Record<string, AttendanceStatus>, b: Record<string, AttendanceStatus>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}

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
    return isPresent(t.attendance[athleteUid]!);
  }).length;
  return Math.round((attended / relevant.length) * 100);
}
