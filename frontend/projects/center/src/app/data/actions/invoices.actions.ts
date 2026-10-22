import { Injectable } from '@angular/core';
import { FUNCTIONS_REGION } from '@nexago/firebase-config';
import { arrayUnion, runTransaction, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore';
import { formatBRL } from '../../domain/money';
import { PAYMENT_METHOD_LABELS, type Invoice, type PaymentMethod } from '../../domain/models';
import { db, firebaseApp } from '../firebase';
import { CenterActionsBase } from './actor';

export interface IssueOnlineResult {
  invoiceUrl: string;
  providerRef: string;
  existing: boolean;
}

export interface ResendPixResult {
  invoiceUrl: string;
  pixPayload: string;
  pushed: boolean;
}

export interface QueryProviderResult {
  providerStatus: string;
  invoiceStatus: string | null;
  outcome: string;
}

/** Callable em São Paulo; `firebase/functions` só carrega quando alguém usa a cobrança online. */
export async function callCenterFunction<T>(name: string, data: Record<string, unknown>): Promise<T> {
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const fn = httpsCallable<Record<string, unknown>, T>(getFunctions(firebaseApp(), FUNCTIONS_REGION), name);
  return (await fn(data)).data;
}

/** A function pediu o CPF do pagador (aluno sem conta NexaGO ou sem CPF no perfil). */
export function needsPayerCpf(error: unknown): boolean {
  const details = error && typeof error === 'object' && 'details' in error ? (error as { details?: { reason?: string } }).details : null;
  return details?.reason === 'needs_cpf';
}

export interface InvoiceInput {
  studentId: string | null;
  payerName: string;
  reference: string;
  amountCents: number;
  dueDate: string;
}

/**
 * Cobranças do centro aos alunos (contrato aluno → centro; a assinatura NexaGO é outro contrato).
 * Regra de ouro do protótipo: nada é dado como pago só porque a cobrança foi emitida. Aprova o
 * provedor (Asaas, pelas functions `training-center-billing.ts`) ou a confirmação MANUAL, que
 * exige comprovante + motivo e fica na auditoria.
 */
@Injectable({ providedIn: 'root' })
export class InvoicesActions extends CenterActionsBase {
  private event(type: string, title: string, detail: string) {
    return { at: Timestamp.now(), type, title, detail, byName: this.actor().name };
  }

  async create(input: InvoiceInput): Promise<void> {
    this.assertWritable();
    const ref = this.ref('invoices');
    const b = writeBatch(db());
    b.set(ref, {
      ...input,
      payerName: input.payerName.trim(),
      reference: input.reference.trim(),
      enrollmentId: null,
      status: 'pending',
      method: null,
      providerRef: '',
      events: [this.event('created', 'Cobrança avulsa criada', `${formatBRL(input.amountCents)} · ${input.reference.trim()}`)],
      approvedAt: null,
      refundedCents: 0,
      createdAt: serverTimestamp(),
    });
    const audit = this.auditDoc({ action: 'invoice.created', entity: 'invoice', entityId: ref.id, detail: `${input.payerName.trim()} · ${formatBRL(input.amountCents)} · ${input.reference.trim()}` });
    b.set(audit.ref, audit.data);
    await b.commit();
  }

  /**
   * Aprova com comprovante. Se a cobrança é a primeira de uma matrícula PENDENTE, a matrícula vira
   * ativa na mesma transação (política "ativa após pagamento").
   */
  async confirmManual(inv: Invoice, method: PaymentMethod, proof: string, reason: string): Promise<void> {
    this.assertWritable();
    const invRef = this.ref('invoices', inv.id);
    const enrRef = inv.enrollmentId ? this.ref('enrollments', inv.enrollmentId) : null;
    await runTransaction(db(), async (t) => {
      const iSnap = await t.get(invRef);
      const eSnap = enrRef ? await t.get(enrRef) : null;
      if (!iSnap.exists() || iSnap.data()['status'] !== 'pending') {
        throw new Error('Esta cobrança não está mais pendente.');
      }
      t.update(invRef, {
        status: 'approved',
        method,
        approvedAt: serverTimestamp(),
        events: arrayUnion(
          this.event('manual_confirm', 'Confirmado manualmente', `${PAYMENT_METHOD_LABELS[method]} · comprovante ${proof.trim()} · ${reason.trim()}`),
        ),
      });
      if (enrRef && eSnap?.exists() && eSnap.data()['status'] === 'pending') {
        t.update(enrRef, { status: 'active', holdUntil: null });
      }
      const audit = this.auditDoc({
        action: 'invoice.manual_confirm',
        entity: 'invoice',
        entityId: inv.id,
        detail: `${inv.payerName} · ${formatBRL(inv.amountCents)} aprovado manualmente (${PAYMENT_METHOD_LABELS[method]} · ${proof.trim()})`,
        reason,
      });
      t.set(audit.ref, audit.data);
    });
  }

  async cancel(inv: Invoice, reason: string): Promise<void> {
    this.assertWritable();
    const b = writeBatch(db());
    b.update(this.ref('invoices', inv.id), {
      status: 'cancelled',
      events: arrayUnion(this.event('cancel', 'Cobrança cancelada', reason.trim())),
    });
    const audit = this.auditDoc({ action: 'invoice.cancelled', entity: 'invoice', entityId: inv.id, detail: `${inv.payerName} · ${formatBRL(inv.amountCents)} cancelada`, reason });
    b.set(audit.ref, audit.data);
    await b.commit();
  }

  /** Estorno total (vira "estornado") ou parcial (segue aprovado, com o valor devolvido abatido). */
  async refund(inv: Invoice, cents: number, reason: string): Promise<void> {
    this.assertWritable();
    const total = Math.min(inv.amountCents, inv.refundedCents + cents);
    const b = writeBatch(db());
    b.update(this.ref('invoices', inv.id), {
      refundedCents: total,
      status: total >= inv.amountCents ? 'refunded' : 'approved',
      events: arrayUnion(this.event('refund', total >= inv.amountCents ? 'Estorno total' : 'Estorno parcial', `${formatBRL(cents)} · ${reason.trim()}`)),
    });
    const audit = this.auditDoc({ action: 'invoice.refund', entity: 'invoice', entityId: inv.id, detail: `${inv.payerName}: estorno de ${formatBRL(cents)}`, reason });
    b.set(audit.ref, audit.data);
    await b.commit();
  }

  /**
   * Gera a fatura no Asaas (o aluno paga com Pix ou cartão). A cobrança continua PENDENTE: só o
   * webhook/consulta do provedor aprova — emitir não é receber.
   */
  async issueOnline(inv: Invoice, cpfCnpj?: string): Promise<IssueOnlineResult> {
    this.assertWritable();
    return callCenterFunction<IssueOnlineResult>('issueTrainingCenterInvoicePayment', {
      centerId: this.centerId(),
      invoiceId: inv.id,
      ...(cpfCnpj ? { cpfCnpj } : {}),
    });
  }

  /** "Consultar provedor agora": se já foi paga, aprova (e ativa a matrícula) na hora. */
  async queryProvider(inv: Invoice): Promise<QueryProviderResult> {
    return callCenterFunction<QueryProviderResult>('queryTrainingCenterInvoiceProvider', { centerId: this.centerId(), invoiceId: inv.id });
  }

  /** Copia-e-cola + link da fatura; quem tem conta NexaGO recebe também um push. */
  async resendPix(inv: Invoice): Promise<ResendPixResult> {
    this.assertWritable();
    return callCenterFunction<ResendPixResult>('resendTrainingCenterInvoicePix', { centerId: this.centerId(), invoiceId: inv.id });
  }

  async addNote(inv: Invoice, note: string): Promise<void> {
    this.assertWritable();
    const b = writeBatch(db());
    b.update(this.ref('invoices', inv.id), { events: arrayUnion(this.event('note', 'Observação', note.trim())) });
    await b.commit();
  }
}
