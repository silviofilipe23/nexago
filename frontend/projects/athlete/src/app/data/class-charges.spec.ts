import {
  classChargeInfoLabel,
  classChargeItemFromRaw,
  classChargeLine,
  safeExternalUrl,
} from './class-agenda-repository';

/** Item de `getMyClassCharges` (`functions/src/arena-class-athlete-charges.ts`). */
const RAW = {
  chargeId: 'e1_2026-11',
  arenaId: 'arena1',
  arenaName: 'Arena CFC',
  description: 'Mensal 2x · Novembro',
  amountReais: 180,
  dueDate: '2026-11-05',
  overdue: false,
  payment: 'online',
  invoiceUrl: 'https://www.asaas.com/i/abc123',
};

describe('mensalidades a pagar (portal do atleta)', () => {
  it('lê o item da callable', () => {
    const c = classChargeItemFromRaw(RAW);
    expect(c.invoiceUrl).toBe('https://www.asaas.com/i/abc123');
    expect(c.payment).toBe('online');
    expect(classChargeInfoLabel(c)).toBeNull();
    expect(classChargeLine(c).replace(/\s/g, ' ')).toBe('R$ 180,00 · vence 05/11');
  });

  it('vencida diz "venceu"', () => {
    const c = classChargeItemFromRaw({ ...RAW, dueDate: '2026-10-05', overdue: true });
    expect(classChargeLine(c)).toContain('venceu 05/10');
  });

  it('sem fatura: em preparo ou direto com a arena (sem botão)', () => {
    expect(classChargeInfoLabel(classChargeItemFromRaw({ ...RAW, payment: 'preparing', invoiceUrl: null }))).toBe(
      'Link de pagamento em preparo',
    );
    expect(classChargeInfoLabel(classChargeItemFromRaw({ ...RAW, payment: 'manual', invoiceUrl: null }))).toBe(
      'Pagamento direto com a arena',
    );
    expect(classChargeItemFromRaw({ ...RAW, payment: 'x' }).payment).toBe('manual');
  });

  it('só aceita link http(s) absoluto', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('/agenda')).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
    expect(classChargeItemFromRaw({ ...RAW, invoiceUrl: 'javascript:alert(1)' }).invoiceUrl).toBeNull();
  });
});
