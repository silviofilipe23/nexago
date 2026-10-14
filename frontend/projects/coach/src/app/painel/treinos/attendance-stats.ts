import { compareTrainings } from './training-rules';
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

/** 2 faltas seguidas pedem atenção; 3 ou mais são críticas. */
export const ABSENCE_WARN = 2;
export const ABSENCE_CRITICAL = 3;

export interface AbsenceStreak {
  /** Faltas (`ausente`) seguidas terminando no treino realizado mais recente do atleta. */
  streak: number;
  /** Data do treino da última presença (presente/atrasado), ou `null` se nunca compareceu. */
  lastPresentDate: string | null;
}

/**
 * Sequência atual de faltas. Só conta treinos `realizado` com registro do atleta; `presente`,
 * `atrasado` e `justificado` quebram a sequência (justificado: o professor já sabe o motivo).
 * `trainings` deve ser só os da equipe do atleta.
 */
export function absenceStreak(athleteUid: string, trainings: Training[]): AbsenceStreak {
  const recorded = trainings
    .filter((t) => t.status === 'realizado' && athleteUid in t.attendance)
    .sort(compareTrainings);
  let streak = 0;
  for (let i = recorded.length - 1; i >= 0 && recorded[i]!.attendance[athleteUid] === 'ausente'; i--) {
    streak++;
  }
  const lastPresent = [...recorded].reverse().find((t) => isPresent(t.attendance[athleteUid]!));
  return { streak, lastPresentDate: lastPresent?.date ?? null };
}

export interface AthleteAtRisk extends AbsenceStreak {
  athleteUid: string;
  displayName: string;
  level: 'atencao' | 'critico';
}

/**
 * Atletas `ativo` com {@link ABSENCE_WARN}+ faltas seguidas, mais críticos primeiro.
 * Lesionado, afastado e férias ficam de fora: a ausência deles já é esperada.
 */
export function athletesAtRisk(
  roster: { athleteUid: string; displayName: string; squadId: string | null; status: string }[],
  trainings: Training[],
): AthleteAtRisk[] {
  const out: AthleteAtRisk[] = [];
  for (const a of roster) {
    if (a.status !== 'ativo' || !a.squadId) {
      continue;
    }
    const result = absenceStreak(a.athleteUid, trainings.filter((t) => t.squadId === a.squadId));
    if (result.streak >= ABSENCE_WARN) {
      out.push({
        athleteUid: a.athleteUid,
        displayName: a.displayName,
        ...result,
        level: result.streak >= ABSENCE_CRITICAL ? 'critico' : 'atencao',
      });
    }
  }
  return out.sort((x, y) => y.streak - x.streak || x.displayName.localeCompare(y.displayName));
}
