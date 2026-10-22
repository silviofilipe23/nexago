import { Injectable, inject } from '@angular/core';
import { collection, getDocs, increment, query, where, writeBatch, type DocumentReference } from 'firebase/firestore';
import { addDays, formatDayKey, todayKey } from '../../domain/dates';
import { holdsSeat } from '../../domain/enrollment';
import type { ClassSession, TrainingClass } from '../../domain/models';
import { horizonEnd, occurrences, sessionId } from '../../domain/schedule';
import { CenterStore } from '../center-store.service';
import { CENTERS, db } from '../firebase';
import { CenterActionsBase } from './actor';

export type ClassInput = Omit<TrainingClass, 'id' | 'seatsTaken' | 'status' | 'generatedUntil'>;

export type SessionPatch = Partial<Pick<ClassSession, 'startTime' | 'durationMin' | 'coachUid' | 'coachName' | 'courtId' | 'courtName'>>;

/**
 * Escritas em lote ficam em pedaços pequenos: cada documento do batch paga os `get()` das rules
 * (vínculo + centro) e o teto de acessos por requisição é baixo.
 */
const CHUNK = 8;

type Op = (b: ReturnType<typeof writeBatch>) => void;

async function commitInChunks(ops: Op[]): Promise<void> {
  for (let i = 0; i < ops.length; i += CHUNK) {
    const b = writeBatch(db());
    ops.slice(i, i + CHUNK).forEach((op) => op(b));
    await b.commit();
  }
}

function sessionData(c: Pick<TrainingClass, 'name' | 'programId' | 'startTime' | 'durationMin' | 'coachUid' | 'coachName' | 'courtId' | 'courtName'>, classId: string, date: string) {
  return {
    classId,
    className: c.name,
    programId: c.programId,
    date,
    startTime: c.startTime,
    durationMin: c.durationMin,
    coachUid: c.coachUid,
    coachName: c.coachName,
    courtId: c.courtId,
    courtName: c.courtName,
    status: 'scheduled',
    changed: false,
    changeReason: '',
    attendance: {},
    makeupStudentIds: [],
  };
}

/** Turmas (regra) e aulas (ocorrências). */
@Injectable({ providedIn: 'root' })
export class ClassesActions extends CenterActionsBase {
  private readonly store = inject(CenterStore);

  private today(): string {
    return todayKey(this.ctx.center()?.timezone);
  }

  private sessionRef(id: string): DocumentReference {
    return this.ref('sessions', id);
  }

  /**
   * Cria ou edita a turma. Ao ATIVAR, gera as aulas das próximas 8 semanas. Editar uma turma
   * ativa só muda a regra daqui pra frente via `applySeriesChange` (a tela decide qual usar).
   */
  async saveClass(id: string | null, input: ClassInput, activate: boolean): Promise<string> {
    this.assertWritable();
    const ref = this.ref('classes', id ?? undefined);
    const existing = id ? this.store.classById(id) : undefined;
    const status = activate ? 'active' : (existing?.status ?? 'draft');
    const b = writeBatch(db());
    b.set(
      ref,
      {
        ...input,
        name: input.name.trim(),
        status,
        ...(existing ? {} : { seatsTaken: 0, generatedUntil: null }),
      },
      { merge: true },
    );
    const audit = this.auditDoc({
      action: existing ? 'class.updated' : 'class.created',
      entity: 'class',
      entityId: ref.id,
      detail: `${input.name.trim()}${activate && existing?.status !== 'active' ? ' · ativada' : ''}`,
    });
    b.set(audit.ref, audit.data);
    await b.commit();
    if (status === 'active') {
      await this.ensureSessions({ ...input, id: ref.id, generatedUntil: existing?.generatedUntil ?? null });
    }
    return ref.id;
  }

  /** Materializa aulas que faltam até o horizonte (idempotente: só datas depois de `generatedUntil`). */
  async ensureSessions(c: Pick<TrainingClass, 'id' | 'name' | 'programId' | 'weekdays' | 'startTime' | 'durationMin' | 'coachUid' | 'coachName' | 'courtId' | 'courtName' | 'startDate' | 'endDate' | 'generatedUntil'>): Promise<number> {
    const today = this.today();
    const until = horizonEnd(today);
    const from = c.generatedUntil ? addDays(c.generatedUntil, 1) : today;
    if (from > until) {
      return 0;
    }
    const dates = occurrences(c, from, until);
    const ops: Op[] = dates.map((d) => (b) => b.set(this.sessionRef(sessionId(c.id, d)), sessionData(c, c.id, d)));
    ops.push((b) => b.update(this.ref('classes', c.id), { generatedUntil: until }));
    await commitInChunks(ops);
    return dates.length;
  }

  /**
   * "Esta e as próximas": muda a regra e reescreve as aulas futuras ainda não alteradas
   * individualmente. Aulas passadas, já realizadas ou mexidas uma a uma ficam como estão.
   */
  async applySeriesChange(c: TrainingClass, next: ClassInput, fromDate: string, reason: string): Promise<void> {
    this.assertWritable();
    const centerId = this.centerId();
    const snap = await getDocs(
      query(collection(db(), CENTERS, centerId, 'sessions'), where('classId', '==', c.id), where('date', '>=', fromDate)),
    );
    const updated = { ...c, ...next };
    const ops: Op[] = [];
    const keep = new Set<string>();
    for (const d of snap.docs) {
      const s = d.data() as { date: string; status: string; changed?: boolean };
      if (s.status !== 'scheduled' || s.changed) {
        keep.add(s.date);
        continue;
      }
      const stillValid = occurrences(updated, s.date, s.date).length === 1;
      if (stillValid) {
        keep.add(s.date);
        ops.push((b) =>
          b.update(d.ref, {
            className: updated.name,
            startTime: updated.startTime,
            durationMin: updated.durationMin,
            coachUid: updated.coachUid,
            coachName: updated.coachName,
            courtId: updated.courtId,
            courtName: updated.courtName,
          }),
        );
      } else {
        ops.push((b) => b.delete(d.ref));
      }
    }
    const until = c.generatedUntil ?? horizonEnd(this.today());
    for (const date of occurrences(updated, fromDate, until)) {
      if (!keep.has(date)) {
        ops.push((b) => b.set(this.sessionRef(sessionId(c.id, date)), sessionData(updated, c.id, date)));
      }
    }
    const audit = this.auditDoc({
      action: 'class.series_changed',
      entity: 'class',
      entityId: c.id,
      detail: `${c.name}: regra alterada a partir de ${formatDayKey(fromDate)}`,
      reason,
    });
    ops.unshift((b) => {
      b.update(this.ref('classes', c.id), { ...next, name: next.name.trim() });
      b.set(audit.ref, audit.data);
    });
    await commitInChunks(ops);
  }

  /** Encerra a turma: some da agenda daqui pra frente (aulas futuras sem chamada são removidas). */
  async closeClass(c: TrainingClass, reason: string): Promise<void> {
    this.assertWritable();
    const today = this.today();
    const snap = await getDocs(
      query(collection(db(), CENTERS, this.centerId(), 'sessions'), where('classId', '==', c.id), where('date', '>', today)),
    );
    const audit = this.auditDoc({ action: 'class.closed', entity: 'class', entityId: c.id, detail: `${c.name} encerrada`, reason });
    const ops: Op[] = [
      (b) => {
        b.update(this.ref('classes', c.id), { status: 'closed', endDate: today });
        b.set(audit.ref, audit.data);
      },
    ];
    for (const d of snap.docs) {
      const s = d.data() as { status: string; attendance?: Record<string, unknown> };
      if (s.status === 'scheduled' && Object.keys(s.attendance ?? {}).length === 0) {
        ops.push((b) => b.delete(d.ref));
      }
    }
    await commitInChunks(ops);
  }

  /**
   * Cancela SÓ esta aula. Nunca consome crédito; com a política "reposição automática", cada aluno
   * matriculado (ativo) ganha +1 crédito de reposição.
   */
  async cancelSession(s: ClassSession, reason: string): Promise<number> {
    this.assertWritable();
    const policies = this.ctx.center()?.policies;
    const auto = policies?.cancelledClassMakeup === 'auto';
    const affected = this.store
      .enrollments()
      .filter((e) => e.classId === s.classId && holdsSeat(e.status) && e.status !== 'paused')
      .map((e) => e.studentId);
    const students = [...new Set([...affected, ...s.makeupStudentIds])];
    const audit = this.auditDoc({
      action: 'session.cancelled',
      entity: 'session',
      entityId: s.id,
      detail: `${s.className} · ${formatDayKey(s.date)} ${s.startTime} cancelada${auto ? ` · +${students.length} reposições` : ''}`,
      reason,
    });
    const ops: Op[] = [
      (b) => {
        b.update(this.sessionRef(s.id), { status: 'cancelled', changeReason: reason.trim() });
        b.set(audit.ref, audit.data);
      },
    ];
    if (auto) {
      for (const id of students) {
        ops.push((b) => b.update(this.ref('students', id), { makeupCredits: increment(1) }));
      }
    }
    await commitInChunks(ops);
    return students.length;
  }

  /** Muda horário, professor ou quadra SÓ desta aula. */
  async changeSession(s: ClassSession, patch: SessionPatch, reason: string): Promise<void> {
    this.assertWritable();
    const parts: string[] = [];
    if (patch.startTime && patch.startTime !== s.startTime) parts.push(`horário ${s.startTime} → ${patch.startTime}`);
    if (patch.coachName && patch.coachUid !== s.coachUid) parts.push(`professor → ${patch.coachName}`);
    if (patch.courtName && patch.courtId !== s.courtId) parts.push(`quadra → ${patch.courtName}`);
    const b = writeBatch(db());
    b.update(this.sessionRef(s.id), { ...patch, changed: true, changeReason: reason.trim() });
    const audit = this.auditDoc({
      action: 'session.changed',
      entity: 'session',
      entityId: s.id,
      detail: `${s.className} · ${formatDayKey(s.date)}: ${parts.join(', ') || 'alterada'}`,
      reason,
    });
    b.set(audit.ref, audit.data);
    await b.commit();
  }

  /** Reabre uma aula cancelada por engano (não devolve créditos já concedidos). */
  async restoreSession(s: ClassSession): Promise<void> {
    this.assertWritable();
    const b = writeBatch(db());
    b.update(this.sessionRef(s.id), { status: 'scheduled' });
    const audit = this.auditDoc({ action: 'session.restored', entity: 'session', entityId: s.id, detail: `${s.className} · ${formatDayKey(s.date)} reaberta` });
    b.set(audit.ref, audit.data);
    await b.commit();
  }
}
