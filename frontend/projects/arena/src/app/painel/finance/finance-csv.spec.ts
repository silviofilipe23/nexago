import { buildMovementsCsv } from './finance-csv';
import type { FinanceMovement } from './finance.model';

describe('buildMovementsCsv', () => {
  it('writes the header row', () => {
    expect(buildMovementsCsv([])).toBe('Data;Tipo;Descrição;Detalhe;Status;Valor (R$)');
  });

  it('writes one semicolon-delimited row per movement, with comma as decimal separator', () => {
    const movement: FinanceMovement = {
      id: 'ledger_l1',
      type: 'credit',
      amountReais: 95.5,
      platformFeeReais: 5,
      label: 'Reserva · Quadra 1',
      sub: 'João S.',
      dateLabel: 'Hoje, 09:12',
      createdAt: new Date('2026-07-14T09:12:00'),
      status: 'ok',
    };
    const lines = buildMovementsCsv([movement]).split('\n');
    expect(lines[1]).toBe('Hoje, 09:12;Recebimento;Reserva · Quadra 1;João S.;Concluído;95,50');
  });

  it('quotes a field that contains the delimiter', () => {
    const movement: FinanceMovement = {
      id: 'withdrawal_w1',
      type: 'debit',
      amountReais: 150,
      platformFeeReais: 0,
      label: 'Saque PIX',
      sub: 'chave; com ponto e vírgula',
      dateLabel: 'Ontem, 14:00',
      createdAt: new Date('2026-07-13T14:00:00'),
      status: 'pend',
    };
    const lines = buildMovementsCsv([movement]).split('\n');
    expect(lines[1]).toContain('"chave; com ponto e vírgula"');
  });
});
