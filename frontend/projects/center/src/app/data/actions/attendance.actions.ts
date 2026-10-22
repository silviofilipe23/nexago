import { Injectable } from '@angular/core';
import { arrayUnion, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore';
import { formatDayKey } from '../../domain/dates';
import type { AttendanceMark, ClassSession } from '../../domain/models';
import { db } from '../firebase';
import { CenterActionsBase } from './actor';
import { callCenterFunction } from './invoices.actions';

export const MARK_LABELS: Record<AttendanceMark, string> = {
  present: 'Presente',
  excused: 'Falta justificada',
  absent: 'Falta',
};

function tally(marks: Record<string, AttendanceMark>): string {
  const v = Object.values(marks);
  const n = (m: AttendanceMark) => v.filter((x) => x === m).length;
  return `${n('present')} P · ${n('excused')} J · ${n('absent')} F`;
}

/**
 * Chamada da aula (P3–P7 do protótipo, no portal). O professor da aula ou o gestor registram; os
 * créditos (pacote consumido, reposição gerada/gasta) NÃO são escritos aqui — o servidor aplica ao
 * ver a aula finalizada (`functions/src/training-center-attendance.ts`), porque o professor não
 * mexe em crédito pelas rules.
 */
@Injectable({ providedIn: 'root' })
export class AttendanceActions extends CenterActionsBase {
  /**
   * Candidatos de reposição para quem não vê todos os alunos (professor): o servidor devolve só
   * id, nome e créditos.
   */
  listMakeupCandidates(sessionId: string): Promise<{ candidates: { id: string; name: string; makeupCredits: number }[] }> {
    return callCenterFunction('listTrainingCenterMakeupCandidates', { centerId: this.centerId(), sessionId });
  }

  /** Grava a chamada; com `finalize`, encerra a aula (dispara os créditos no servidor). */
  async save(s: ClassSession, marks: Record<string, AttendanceMark>, makeupStudentIds: string[], finalize: boolean): Promise<void> {
    this.assertWritable();
    const a = this.actor();
    const b = writeBatch(db());
    b.update(this.ref('sessions', s.id), {
      attendance: marks,
      makeupStudentIds,
      attendanceUpdatedAt: serverTimestamp(),
      ...(finalize ? { status: 'done', finalizedAt: serverTimestamp(), finalizedByName: a.name } : {}),
    });
    const audit = this.auditDoc({
      action: finalize ? 'session.finalized' : 'session.attendance',
      entity: 'session',
      entityId: s.id,
      detail: `${s.className} · ${formatDayKey(s.date)} ${s.startTime}: chamada ${finalize ? 'finalizada' : 'salva'} (${tally(marks)})`,
    });
    b.set(audit.ref, audit.data);
    await b.commit();
  }

  /** Corrige um aluno depois de finalizada — exige justificativa e fica no histórico da aula. */
  async correct(s: ClassSession, studentId: string, studentName: string, to: AttendanceMark, reason: string): Promise<void> {
    this.assertWritable();
    const a = this.actor();
    const from = s.attendance[studentId] ?? null;
    const b = writeBatch(db());
    b.update(this.ref('sessions', s.id), {
      attendance: { ...s.attendance, [studentId]: to },
      attendanceUpdatedAt: serverTimestamp(),
      attendanceLog: arrayUnion({ at: Timestamp.now(), byName: a.name, studentId, from, to, reason: reason.trim() }),
    });
    const audit = this.auditDoc({
      action: 'session.attendance_corrected',
      entity: 'session',
      entityId: s.id,
      detail: `${studentName} · ${formatDayKey(s.date)}: ${from ? MARK_LABELS[from] : 'sem marcação'} → ${MARK_LABELS[to]}`,
      reason,
    });
    b.set(audit.ref, audit.data);
    await b.commit();
  }

  /** Reabre a aula finalizada (o servidor desfaz os créditos que tinha aplicado). */
  async reopen(s: ClassSession, reason: string): Promise<void> {
    this.assertWritable();
    const b = writeBatch(db());
    b.update(this.ref('sessions', s.id), { status: 'scheduled', finalizedAt: null, finalizedByName: '' });
    const audit = this.auditDoc({
      action: 'session.reopened',
      entity: 'session',
      entityId: s.id,
      detail: `${s.className} · ${formatDayKey(s.date)}: chamada reaberta`,
      reason,
    });
    b.set(audit.ref, audit.data);
    await b.commit();
  }
}
