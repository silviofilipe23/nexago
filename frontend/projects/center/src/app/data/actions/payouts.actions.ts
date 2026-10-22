import { Injectable } from '@angular/core';
import { collection, onSnapshot, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { formatDayKey, monthLabel } from '../../domain/dates';
import { formatBRL } from '../../domain/money';
import {
  describeRule,
  payoutId,
  readPayRule,
  type PayRule,
  type Payout,
  type PayoutCalc,
  type PayoutLine,
} from '../../domain/payouts';
import { CENTERS, db } from '../firebase';
import { date, num, str } from '../mappers';
import { CenterActionsBase } from './actor';

type Data = Record<string, unknown>;

function readLine(raw: unknown): PayoutLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Data;
  const kind = d['kind'] === 'revenue' || d['kind'] === 'fixed' ? d['kind'] : 'class';
  return { kind, ref: str(d, 'ref'), date: str(d, 'date'), label: str(d, 'label'), amountCents: num(d, 'amountCents'), baseCents: num(d, 'baseCents') };
}

export function readPayout(id: string, d: Data): Payout {
  return {
    id,
    month: str(d, 'month'),
    coachUid: str(d, 'coachUid'),
    coachName: str(d, 'coachName', 'Professor'),
    rule: readPayRule((d['rule'] as Data | undefined) ?? null),
    classesGiven: num(d, 'classesGiven'),
    baseCents: num(d, 'baseCents'),
    totalCents: num(d, 'totalCents'),
    lines: Array.isArray(d['lines']) ? (d['lines'] as unknown[]).map(readLine).filter((x): x is PayoutLine => x != null) : [],
    status: d['status'] === 'paid' ? 'paid' : 'closed',
    closedAt: date(d['closedAt']),
    closedByName: str(d, 'closedByName'),
    paidAt: date(d['paidAt']),
    paidOn: str(d, 'paidOn'),
    paidByName: str(d, 'paidByName'),
    paidMethod: str(d, 'paidMethod'),
    note: str(d, 'note'),
  };
}

const METHOD_LABEL: Record<string, string> = { pix: 'Pix', transfer: 'Transferência', cash: 'Dinheiro', other: 'Outro' };

/**
 * Repasses aos professores (fase 1): regra por professor, fechamento do mês (retrato) e "marcar como
 * pago" — o pagamento em si é feito por fora. Pago não muda mais.
 */
@Injectable({ providedIn: 'root' })
export class PayoutsActions extends CenterActionsBase {
  watchRules(onData: (rules: Map<string, PayRule>) => void, onError: (e: unknown) => void): () => void {
    return onSnapshot(
      collection(db(), CENTERS, this.centerId(), 'payRules'),
      (snap) => onData(new Map(snap.docs.map((d) => [d.id, readPayRule(d.data())]))),
      onError,
    );
  }

  watchMonth(month: string, onData: (payouts: Payout[]) => void, onError: (e: unknown) => void): () => void {
    return onSnapshot(
      query(collection(db(), CENTERS, this.centerId(), 'payouts'), where('month', '==', month)),
      (snap) => onData(snap.docs.map((d) => readPayout(d.id, d.data()))),
      onError,
    );
  }

  async setRule(coachUid: string, coachName: string, before: PayRule, next: PayRule): Promise<void> {
    this.assertWritable();
    const brl = (c: number) => formatBRL(c);
    await runTransaction(db(), async (t) => {
      t.set(this.ref('payRules', coachUid), {
        kind: next.kind,
        amountCents: next.kind === 'per_class' || next.kind === 'monthly' ? next.amountCents : 0,
        percent: next.kind === 'percent' ? next.percent : 0,
        updatedAt: serverTimestamp(),
        updatedByName: this.actor().name,
      });
      const audit = this.auditDoc({
        action: 'payout.rule',
        entity: 'member',
        entityId: coachUid,
        detail: `${coachName} · ${describeRule(before, brl)} → ${describeRule(next, brl)}`,
      });
      t.set(audit.ref, audit.data);
    });
  }

  /** Fecha (ou refaz o fechamento de) um mês do professor. Já pago não muda. */
  async close(month: string, coachName: string, calc: PayoutCalc): Promise<void> {
    this.assertWritable();
    const ref = this.ref('payouts', payoutId(month, calc.coachUid));
    await runTransaction(db(), async (t) => {
      const cur = await t.get(ref);
      if (cur.exists() && cur.data()['status'] === 'paid') {
        throw new Error('Este repasse já foi pago e não muda mais.');
      }
      t.set(ref, {
        month,
        coachUid: calc.coachUid,
        coachName,
        rule: { ...calc.rule },
        classesGiven: calc.classesGiven,
        baseCents: calc.baseCents,
        totalCents: calc.totalCents,
        lines: calc.lines.map((l) => ({ ...l })),
        status: 'closed',
        closedAt: serverTimestamp(),
        closedByName: this.actor().name,
        paidAt: null,
        paidOn: '',
        paidByName: '',
        paidMethod: '',
        note: '',
      });
      const audit = this.auditDoc({
        action: 'payout.closed',
        entity: 'payout',
        entityId: ref.id,
        detail: `${coachName} · ${monthLabel(month, true)} · ${formatBRL(calc.totalCents)}${calc.rule.kind === 'per_class' ? ` · ${calc.classesGiven} aulas` : ''}`,
      });
      t.set(audit.ref, audit.data);
    });
  }

  async markPaid(p: Payout, input: { paidOn: string; method: string; note: string }): Promise<void> {
    this.assertWritable();
    const ref = this.ref('payouts', p.id);
    await runTransaction(db(), async (t) => {
      const cur = await t.get(ref);
      if (!cur.exists() || cur.data()['status'] !== 'closed') {
        throw new Error('O repasse mudou. Recarregue e tente de novo.');
      }
      t.update(ref, {
        status: 'paid',
        paidAt: serverTimestamp(),
        paidOn: input.paidOn,
        paidByName: this.actor().name,
        paidMethod: input.method,
        note: input.note.trim().slice(0, 300),
      });
      const audit = this.auditDoc({
        action: 'payout.paid',
        entity: 'payout',
        entityId: p.id,
        detail: `${p.coachName} · ${monthLabel(p.month, true)} · ${formatBRL(p.totalCents)} · ${METHOD_LABEL[input.method] ?? input.method} em ${formatDayKey(input.paidOn)}`,
      });
      t.set(audit.ref, audit.data);
    });
  }
}
