import type { Invoice } from '../../domain/models';
import { countByDisplayStatus, invoiceDetail, invoicesCsv, invoicesOfMonth } from './invoice-view';

function inv(p: Partial<Invoice>): Invoice {
  return {
    id: 'i1',
    studentId: null,
    enrollmentId: null,
    payerName: 'Ana',
    reference: 'Mensal · out',
    amountCents: 32000,
    dueDate: '2026-10-05',
    status: 'pending',
    method: null,
    providerRef: '', providerUrl: '', providerStatus: '', providerApproved: false,
    events: [],
    approvedAt: null,
    refundedCents: 0,
    createdAt: null,
    ...p,
  };
}

describe('invoice-view', () => {
  const today = '2026-10-22';
  const now = new Date('2026-10-22T15:00:00Z');

  it('filtra o mês pelo vencimento, mais recente primeiro', () => {
    const list = [inv({ id: 'a', dueDate: '2026-10-01' }), inv({ id: 'b', dueDate: '2026-10-20' }), inv({ id: 'c', dueDate: '2026-11-01' })];
    expect(invoicesOfMonth(list, '2026-10').map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('detalhe por situação', () => {
    expect(invoiceDetail(inv({ dueDate: '2026-10-12' }), today, now).text).toBe('10 dias em atraso');
    expect(invoiceDetail(inv({ dueDate: '2026-10-30', createdAt: new Date('2026-10-22T10:00:00Z') }), today, now)).toEqual({
      text: 'Sem confirmação há mais de 2h',
      warn: true,
    });
    expect(invoiceDetail(inv({ dueDate: '2026-10-30', createdAt: new Date('2026-10-22T14:30:00Z') }), today, now).warn).toBeFalse();
    expect(invoiceDetail(inv({ status: 'approved', method: 'pix' }), today, now).text).toBe('Pix · confirmação manual');
    expect(invoiceDetail(inv({ status: 'approved', method: 'card', providerRef: 'mp_1', providerApproved: true, refundedCents: 9000 }), today, now).text).toBe(
      'Cartão · mp_1 · estorno parcial R$ 90',
    );
    expect(invoiceDetail(inv({ status: 'refunded', refundedCents: 32000 }), today, now).text).toBe('Estorno R$ 320');
    // Fatura gerada no provedor mas baixada à mão continua "confirmação manual".
    expect(invoiceDetail(inv({ status: 'approved', method: 'pix', providerRef: 'pay_1' }), today, now).text).toBe('Pix · confirmação manual');
    expect(invoiceDetail(inv({ dueDate: '2026-10-30', providerRef: 'pay_1', createdAt: new Date('2026-10-22T14:30:00Z') }), today, now).text).toBe(
      'Pix/cartão gerado · aguardando o aluno pagar',
    );
  });

  it('conta por situação exibida (pendente vencida = vencido)', () => {
    const c = countByDisplayStatus([inv({ dueDate: '2026-10-01' }), inv({ dueDate: '2026-10-30' }), inv({ status: 'approved' })], today);
    expect(c.late).toBe(1);
    expect(c.pending).toBe(1);
    expect(c.approved).toBe(1);
  });

  it('CSV com cabeçalho e valores em reais', () => {
    const rows = invoicesCsv([inv({ status: 'approved', method: 'pix', refundedCents: 0 })], today);
    expect(rows[0]![0]).toBe('Pagador');
    expect(rows[1]).toEqual(['Ana', 'Mensal · out', '320,00', '0,00', '05 out 2026', 'Aprovado', 'Pix', 'Pix · confirmação manual']);
  });
});
