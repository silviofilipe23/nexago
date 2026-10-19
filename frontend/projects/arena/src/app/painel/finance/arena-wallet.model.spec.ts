import { withdrawalIsFailed, withdrawalStatusLabel } from './arena-wallet.model';

describe('withdrawalStatusLabel (saque da arena)', () => {
  const item = (status: string, payoutStatus: string | null) => ({ status, payoutStatus });

  it('PIX criado no Asaas é ENVIADO; só a conclusão da transferência é PAGO', () => {
    expect(withdrawalStatusLabel(item('approved', 'sent'))).toBe('ENVIADO');
    expect(withdrawalStatusLabel(item('approved', 'paid'))).toBe('PAGO');
  });

  it('PIX que o banco não concluiu (valor de volta ao caixa) é FALHOU', () => {
    expect(withdrawalStatusLabel(item('rejected', 'failed'))).toBe('FALHOU');
    expect(withdrawalIsFailed(item('rejected', 'failed'))).toBeTrue();
  });

  it('aguardando aprovação é PENDENTE', () => {
    expect(withdrawalStatusLabel(item('pending', null))).toBe('PENDENTE');
  });
});
