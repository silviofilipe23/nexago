import { invoiceDisplayStatus } from './enrollment';
import type { ClassSession, Invoice, TrainingClass } from './models';

/** Contagem de marcações de presença num conjunto de aulas. */
export interface AttendanceTally {
  present: number;
  excused: number;
  absent: number;
}

export function tallyAttendance(sessions: ClassSession[], studentId?: string): AttendanceTally {
  const t: AttendanceTally = { present: 0, excused: 0, absent: 0 };
  for (const s of sessions) {
    if (s.status === 'cancelled') {
      continue;
    }
    for (const [id, mark] of Object.entries(s.attendance)) {
      if (studentId && id !== studentId) {
        continue;
      }
      t[mark === 'present' ? 'present' : mark === 'excused' ? 'excused' : 'absent']++;
    }
  }
  return t;
}

/** Presença % (presentes / marcações). null = sem marcação. */
export function attendanceRate(t: AttendanceTally): number | null {
  const total = t.present + t.excused + t.absent;
  return total === 0 ? null : Math.round((t.present / total) * 100);
}

export function occupancy(classes: Pick<TrainingClass, 'status' | 'capacity' | 'seatsTaken'>[]): {
  taken: number;
  capacity: number;
  pct: number | null;
} {
  const active = classes.filter((c) => c.status === 'active');
  const taken = active.reduce((s, c) => s + Math.min(c.seatsTaken, c.capacity), 0);
  const capacity = active.reduce((s, c) => s + c.capacity, 0);
  return { taken, capacity, pct: capacity ? Math.round((taken / capacity) * 100) : null };
}

export interface MoneySplit {
  approvedCents: number;
  approvedCount: number;
  pendingCents: number;
  pendingCount: number;
  lateCents: number;
  lateCount: number;
  refundedCents: number;
  refundCount: number;
  chargedCents: number;
}

/**
 * Totais do mês. "Recebido" é só o que foi APROVADO (confirmação do provedor ou manual
 * auditada) — cobrança emitida nunca conta como paga. O mês da cobrança é o do vencimento.
 */
export function moneySplit(invoices: Invoice[], month: string, today: string): MoneySplit {
  const s: MoneySplit = {
    approvedCents: 0,
    approvedCount: 0,
    pendingCents: 0,
    pendingCount: 0,
    lateCents: 0,
    lateCount: 0,
    refundedCents: 0,
    refundCount: 0,
    chargedCents: 0,
  };
  for (const inv of invoices) {
    if (inv.dueDate.slice(0, 7) !== month || inv.status === 'cancelled') {
      continue;
    }
    s.chargedCents += inv.amountCents;
    const st = invoiceDisplayStatus(inv, today);
    if (st === 'approved') {
      s.approvedCents += inv.amountCents - inv.refundedCents;
      s.approvedCount++;
      if (inv.refundedCents > 0) {
        s.refundedCents += inv.refundedCents;
        s.refundCount++;
      }
    } else if (st === 'refunded') {
      s.refundedCents += inv.refundedCents || inv.amountCents;
      s.refundCount++;
    } else if (st === 'pending') {
      s.pendingCents += inv.amountCents;
      s.pendingCount++;
    } else if (st === 'late' || st === 'failed' || st === 'disputed') {
      s.lateCents += inv.amountCents;
      s.lateCount++;
    }
  }
  return s;
}

export function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}
