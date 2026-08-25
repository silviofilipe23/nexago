import { mapFiscalInvoice, FISCAL_INVOICE_STATUS_LABEL, FISCAL_INVOICE_ORIGIN_LABEL } from './fiscal-invoice.model';

describe('mapFiscalInvoice', () => {
  it('mapeia uma nota autorizada', () => {
    const item = mapFiscalInvoice('inv1', {
      arenaId: 'arena1',
      origin: 'booking',
      status: 'authorized',
      numero: '42',
      valorBrutoReais: 100,
      tomador: { nome: 'Fulano', cpfCnpj: '39053344705' },
      pdfUrl: 'https://exemplo/n.pdf',
    });
    expect(item.id).toBe('inv1');
    expect(item.numero).toBe('42');
    expect(item.pdfUrl).toBe('https://exemplo/n.pdf');
    expect(item.tomadorNome).toBe('Fulano');
  });

  it('sobrevive a documento incompleto', () => {
    const item = mapFiscalInvoice('inv2', { arenaId: 'arena1' });
    expect(item.status).toBe('requested');
    expect(item.valorBrutoReais).toBe(0);
    expect(item.pdfUrl).toBeNull();
  });
});

describe('FISCAL_INVOICE_STATUS_LABEL', () => {
  it('traduz os status para português', () => {
    expect(FISCAL_INVOICE_STATUS_LABEL.requested).toBe('Na fila');
    expect(FISCAL_INVOICE_STATUS_LABEL.processing).toBe('Processando');
    expect(FISCAL_INVOICE_STATUS_LABEL.authorized).toBe('Autorizada');
    expect(FISCAL_INVOICE_STATUS_LABEL.rejected).toBe('Rejeitada');
  });
});

describe('FISCAL_INVOICE_ORIGIN_LABEL', () => {
  it('rotula activation_test', () => {
    expect(FISCAL_INVOICE_ORIGIN_LABEL['activation_test']).toBe('Teste de ativação');
  });
});
