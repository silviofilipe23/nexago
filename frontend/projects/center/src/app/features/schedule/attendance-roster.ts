import type { AttendanceMark } from '../../domain/models';

export interface RosterRow {
  studentId: string;
  /** Encaixado como reposição nesta aula (não é da turma). */
  makeup: boolean;
  /** Já saiu da turma, mas tem marcação nesta aula (chamada antiga). */
  former: boolean;
}

/**
 * Quem aparece na chamada: a lista da turma (`rosterStudentIds`), os encaixados de reposição e
 * quem já tem marcação nesta aula (mesmo que tenha saído depois — a chamada não perde ninguém).
 */
export function attendanceRoster(
  roster: readonly string[],
  attendance: Record<string, AttendanceMark>,
  makeupIds: readonly string[],
): RosterRow[] {
  const inRoster = new Set(roster);
  const makeups = new Set(makeupIds.filter((id) => !inRoster.has(id)));
  const out: RosterRow[] = roster.map((studentId) => ({ studentId, makeup: false, former: false }));
  for (const id of makeups) out.push({ studentId: id, makeup: true, former: false });
  for (const id of Object.keys(attendance)) {
    if (!inRoster.has(id) && !makeups.has(id)) out.push({ studentId: id, makeup: false, former: true });
  }
  return out;
}

/** Etiqueta da resposta do aluno pelo app ("Vai · app", "Avisou no prazo · app"), com a cor. */
export function rsvpLabel(
  rsvp: 'going' | 'not_going' | undefined,
  excusedByStudent: boolean,
): { text: string; tone: 'green' | 'yellow' } | null {
  if (rsvp === 'going') return { text: 'Vai · app', tone: 'green' };
  if (rsvp === 'not_going') return { text: excusedByStudent ? 'Avisou no prazo · app' : 'Não vai · app', tone: 'yellow' };
  return null;
}

/** "−1 crédito do pacote", "+1 reposição"… do que o servidor já aplicou. */
export function effectLabel(e: { credit: number; makeup: number } | undefined): string {
  if (!e) return '';
  const parts: string[] = [];
  if (e.credit) parts.push(`${e.credit > 0 ? '+' : '−'}${Math.abs(e.credit)} crédito do pacote`);
  if (e.makeup) parts.push(`${e.makeup > 0 ? '+' : '−'}${Math.abs(e.makeup)} reposição`);
  return parts.join(' · ');
}
