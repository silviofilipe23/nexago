import { Injectable } from '@angular/core';
import { runTransaction, serverTimestamp, Timestamp, type Transaction } from 'firebase/firestore';
import { formatDayKey, monthKey, monthLabel, todayKey } from '../../domain/dates';
import { buildContract, canTransition, rosterAfter, seatDelta } from '../../domain/enrollment';
import { formatBRL } from '../../domain/money';
import type { ContractSnapshot, Enrollment, EnrollmentStatus, Plan, Student, TrainingClass } from '../../domain/models';
import { hasPermission } from '../../domain/roles';
import { db } from '../firebase';
import { readClass } from '../mappers';
import { CenterActionsBase } from './actor';

export interface EnrollInput {
  student: Pick<Student, 'id' | 'name'>;
  cls: Pick<TrainingClass, 'id' | 'name'>;
  plan: Plan;
  startDate: string;
  notifyOnSeat: boolean;
}

export type EnrollResult =
  | { kind: 'enrolled'; id: string; status: EnrollmentStatus }
  | { kind: 'full'; capacity: number; seatsTaken: number };

/**
 * Matrículas. Toda mudança que mexe em vaga roda em TRANSAÇÃO com o doc da turma: lê
 * `seatsTaken` fresco, decide e grava matrícula + contador juntos. Se outra pessoa pegou a
 * última vaga enquanto o formulário estava aberto, a transação vê a turma cheia e devolve
 * `full` — nada é gravado e a tela oferece fila ou outra turma.
 */
@Injectable({ providedIn: 'root' })
export class EnrollmentsActions extends CenterActionsBase {
  private today(): string {
    return todayKey(this.ctx.center()?.timezone);
  }

  private holdUntil(hours: number): Timestamp {
    return Timestamp.fromMillis(Date.now() + hours * 3600_000);
  }

  /** Pode emitir cobrança junto (owner/admin, recepção ou permissão de matrícula). */
  private canBill(): boolean {
    return hasPermission(this.ctx.me(), 'enroll_students') && this.ctx.center()?.status === 'active';
  }

  private firstInvoice(t: Transaction, enrollmentId: string, studentId: string, payerName: string, contract: ContractSnapshot): void {
    const ref = this.ref('invoices');
    const today = this.today();
    const reference =
      contract.planType === 'class_pack'
        ? contract.planName
        : `${contract.planName} · ${monthLabel(monthKey(today)).toLowerCase()}`;
    t.set(ref, {
      studentId,
      enrollmentId,
      payerName,
      reference,
      amountCents: contract.priceCents,
      dueDate: today,
      status: 'pending',
      method: null,
      providerRef: '',
      events: [{ at: Timestamp.now(), type: 'created', title: 'Cobrança criada', detail: `${formatBRL(contract.priceCents)} · ${reference}`, byName: this.actor().name }],
      approvedAt: null,
      refundedCents: 0,
      createdAt: serverTimestamp(),
    });
  }

  private assertOperational(): void {
    this.assertWritable();
    if (this.ctx.center()?.status !== 'active') {
      throw new Error('Matrículas liberam depois que o centro for ativado.');
    }
  }

  async enroll(input: EnrollInput, payerName: string): Promise<EnrollResult> {
    this.assertOperational();
    const center = this.ctx.center()!;
    const contract = buildContract(input.plan, center.policies, this.today());
    const classRef = this.ref('classes', input.cls.id);
    const enrollmentRef = this.ref('enrollments');
    return runTransaction(db(), async (t) => {
      const snap = await t.get(classRef);
      if (!snap.exists()) {
        throw new Error('Turma não encontrada.');
      }
      const cls = readClass(snap.id, snap.data());
      if (cls.status !== 'active') {
        throw new Error('A turma não está ativa.');
      }
      if (cls.seatsTaken >= cls.capacity) {
        return { kind: 'full', capacity: cls.capacity, seatsTaken: cls.seatsTaken } as EnrollResult;
      }
      const status: EnrollmentStatus = center.policies.activation === 'on_confirmation' ? 'active' : 'pending';
      t.update(classRef, { seatsTaken: cls.seatsTaken + 1, rosterStudentIds: rosterAfter(cls.rosterStudentIds, input.student.id, 1) });
      t.set(enrollmentRef, {
        studentId: input.student.id,
        studentName: input.student.name,
        classId: input.cls.id,
        className: input.cls.name,
        planId: input.plan.id,
        contract,
        status,
        startDate: input.startDate,
        holdUntil: status === 'pending' ? this.holdUntil(center.policies.pendingHoldHours) : null,
        pausedUntil: null,
        pauseReason: '',
        creditsLeft: contract.planType === 'class_pack' ? contract.credits : null,
        waitlistedAt: null,
        notifyOnSeat: false,
        endedAt: null,
        createdAt: serverTimestamp(),
        createdByName: this.actor().name,
      });
      if (this.canBill()) {
        this.firstInvoice(t, enrollmentRef.id, input.student.id, payerName, contract);
      }
      const audit = this.auditDoc({
        action: 'enrollment.created',
        entity: 'enrollment',
        entityId: enrollmentRef.id,
        detail: `${input.student.name} → ${input.cls.name} · ${contract.planName} ${formatBRL(contract.priceCents)} · ${status === 'active' ? 'ativa' : 'pendente'}`,
      });
      t.set(audit.ref, audit.data);
      return { kind: 'enrolled', id: enrollmentRef.id, status } as EnrollResult;
    });
  }

  /** Entra na fila (sem ocupar vaga). O contrato é congelado na hora em que a vaga for oferecida. */
  async joinWaitlist(input: EnrollInput): Promise<string> {
    this.assertOperational();
    const center = this.ctx.center()!;
    if (!center.policies.waitlistEnabled) {
      throw new Error('A lista de espera está desligada nas políticas do centro.');
    }
    const ref = this.ref('enrollments');
    await runTransaction(db(), async (t) => {
      t.set(ref, {
        studentId: input.student.id,
        studentName: input.student.name,
        classId: input.cls.id,
        className: input.cls.name,
        planId: input.plan.id,
        contract: null,
        status: 'waitlisted',
        startDate: input.startDate,
        holdUntil: null,
        pausedUntil: null,
        pauseReason: '',
        creditsLeft: null,
        waitlistedAt: serverTimestamp(),
        notifyOnSeat: input.notifyOnSeat,
        endedAt: null,
        createdAt: serverTimestamp(),
        createdByName: this.actor().name,
      });
      const audit = this.auditDoc({ action: 'enrollment.waitlisted', entity: 'enrollment', entityId: ref.id, detail: `${input.student.name} na lista de espera de ${input.cls.name}` });
      t.set(audit.ref, audit.data);
    });
    return ref.id;
  }

  /** Oferece a vaga ao da fila: vira pendente, ocupa a vaga e tem N horas para pagar/aceitar. */
  async offerSeat(e: Enrollment, plan: Plan, payerName: string): Promise<'offered' | 'full'> {
    this.assertOperational();
    const center = this.ctx.center()!;
    const contract = buildContract(plan, center.policies, this.today());
    const classRef = this.ref('classes', e.classId);
    const enrollmentRef = this.ref('enrollments', e.id);
    return runTransaction(db(), async (t) => {
      const [cSnap, eSnap] = [await t.get(classRef), await t.get(enrollmentRef)];
      if (!cSnap.exists() || !eSnap.exists()) {
        throw new Error('Matrícula ou turma não encontrada.');
      }
      const cls = readClass(cSnap.id, cSnap.data());
      if (eSnap.data()['status'] !== 'waitlisted') {
        throw new Error('Esta matrícula já saiu da fila.');
      }
      if (cls.seatsTaken >= cls.capacity) {
        return 'full' as const;
      }
      t.update(classRef, { seatsTaken: cls.seatsTaken + 1, rosterStudentIds: rosterAfter(cls.rosterStudentIds, e.studentId, 1) });
      t.update(enrollmentRef, {
        status: 'pending',
        contract,
        planId: plan.id,
        holdUntil: this.holdUntil(center.policies.waitlistAcceptHours),
        creditsLeft: contract.planType === 'class_pack' ? contract.credits : null,
      });
      if (this.canBill()) {
        this.firstInvoice(t, e.id, e.studentId, payerName, contract);
      }
      const audit = this.auditDoc({ action: 'enrollment.seat_offered', entity: 'enrollment', entityId: e.id, detail: `Vaga em ${e.className} oferecida a ${e.studentName} · ${center.policies.waitlistAcceptHours}h para aceitar` });
      t.set(audit.ref, audit.data);
      return 'offered' as const;
    });
  }

  /**
   * Transição de estado com ajuste de vaga (cancelar/concluir libera; reativar pausada não muda).
   * `extra` grava campos da transição (pausa até, motivo…).
   */
  async transition(e: Enrollment, to: EnrollmentStatus, reason: string, extra: Record<string, unknown> = {}): Promise<void> {
    this.assertWritable();
    if (!canTransition(e.status, to)) {
      throw new Error('Mudança de situação não permitida.');
    }
    const classRef = this.ref('classes', e.classId);
    const enrollmentRef = this.ref('enrollments', e.id);
    const delta = seatDelta(e.status, to);
    await runTransaction(db(), async (t) => {
      const eSnap = await t.get(enrollmentRef);
      const cSnap = delta !== 0 ? await t.get(classRef) : null;
      if (!eSnap.exists() || eSnap.data()['status'] !== e.status) {
        throw new Error('A matrícula mudou enquanto você editava. Confira e tente de novo.');
      }
      if (cSnap?.exists()) {
        const taken = Number(cSnap.data()['seatsTaken'] ?? 0);
        const roster = cSnap.data()['rosterStudentIds'] as string[] | undefined;
        t.update(classRef, { seatsTaken: Math.max(0, taken + delta), rosterStudentIds: rosterAfter(roster, e.studentId, delta) });
      }
      const ending = to === 'cancelled' || to === 'completed';
      t.update(enrollmentRef, {
        status: to,
        ...(to === 'active' ? { holdUntil: null, pausedUntil: null, pauseReason: '' } : {}),
        ...(ending ? { endedAt: serverTimestamp(), holdUntil: null } : {}),
        ...extra,
      });
      const labels: Record<EnrollmentStatus, string> = {
        active: 'ativada',
        pending: 'pendente',
        paused: 'pausada',
        cancelled: 'cancelada',
        completed: 'concluída',
        waitlisted: 'na fila',
      };
      const until = typeof extra['pausedUntil'] === 'string' ? ` até ${formatDayKey(extra['pausedUntil'] as string)}` : '';
      const audit = this.auditDoc({
        action: `enrollment.${to}`,
        entity: 'enrollment',
        entityId: e.id,
        detail: `${e.studentName} · ${e.className}: matrícula ${labels[to]}${until}`,
        reason,
      });
      t.set(audit.ref, audit.data);
    });
  }

  pause(e: Enrollment, until: string, reason: string): Promise<void> {
    return this.transition(e, 'paused', reason, { pausedUntil: until, pauseReason: reason.trim() });
  }
}
