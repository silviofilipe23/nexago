import { applyLiveBalance, shouldExplainZeroBalance, sumWalletRows, withdrawalRequesterLabel } from './wallet-view';

describe('shouldExplainZeroBalance', () => {
  it('explica quando tudo foi recebido direto com o organizador', () => {
    expect(
      shouldExplainZeroBalance({
        availableReais: 0,
        pendingReais: 0,
        ledgerCount: 0,
        viaOrganizerCents: 529000,
      }),
    ).toBe(true);
  });

  it('não explica quando o zero é "já sacou tudo"', () => {
    expect(
      shouldExplainZeroBalance({
        availableReais: 0,
        pendingReais: 0,
        ledgerCount: 46,
        viaOrganizerCents: 20690,
      }),
    ).toBe(false);
  });

  it('não explica com saldo disponível', () => {
    expect(
      shouldExplainZeroBalance({
        availableReais: 10,
        pendingReais: 0,
        ledgerCount: 0,
        viaOrganizerCents: 529000,
      }),
    ).toBe(false);
  });

  it('não explica com valor só reservado em saque pendente', () => {
    expect(
      shouldExplainZeroBalance({
        availableReais: 0,
        pendingReais: 61,
        ledgerCount: 0,
        viaOrganizerCents: 529000,
      }),
    ).toBe(false);
  });

  it('carteira zerada sem arrecadação nenhuma não inventa explicação', () => {
    expect(
      shouldExplainZeroBalance({
        availableReais: 0,
        pendingReais: 0,
        ledgerCount: 0,
        viaOrganizerCents: 0,
      }),
    ).toBe(false);
  });
});

/** Mesma regra, alimentada agora por UM evento: os números vêm do caixa do
 *  torneio em exibição, não da soma dos torneios da carteira de uma pessoa. */
describe('shouldExplainZeroBalance por evento', () => {
  it('explica quando o caixa do evento está zerado e o dinheiro entrou por fora', () => {
    expect(shouldExplainZeroBalance({ availableReais: 0, pendingReais: 0, ledgerCount: 0, viaOrganizerCents: 529000 })).toBeTrue();
  });

  it('não explica quando o evento já creditou pela plataforma', () => {
    expect(shouldExplainZeroBalance({ availableReais: 0, pendingReais: 0, ledgerCount: 3, viaOrganizerCents: 529000 })).toBeFalse();
  });

  it('não explica quando há saldo', () => {
    expect(shouldExplainZeroBalance({ availableReais: 10, pendingReais: 0, ledgerCount: 0, viaOrganizerCents: 529000 })).toBeFalse();
  });
});

describe('sumWalletRows', () => {
  it('soma disponível e pendente de todos os caixas', () => {
    expect(sumWalletRows([
      { availableReais: 90, pendingReais: 5 },
      { availableReais: 10.5, pendingReais: 0 },
    ])).toEqual({ availableReais: 100.5, pendingReais: 5 });
  });

  it('lista vazia soma zero', () => {
    expect(sumWalletRows([])).toEqual({ availableReais: 0, pendingReais: 0 });
  });

  it('não acumula erro de ponto flutuante', () => {
    expect(sumWalletRows([
      { availableReais: 0.1, pendingReais: 0 },
      { availableReais: 0.2, pendingReais: 0 },
    ]).availableReais).toBe(0.3);
  });
});

describe('applyLiveBalance', () => {
  const row = { tournamentId: 't1', tournamentName: 'Copa A', availableReais: 300, pendingReais: 0 };

  it('atualiza a linha do caixa observado', () => {
    expect(applyLiveBalance(row, 't1', { availableReais: 420, pendingReais: 10 })).toEqual({
      tournamentId: 't1',
      tournamentName: 'Copa A',
      availableReais: 420,
      pendingReais: 10,
    });
  });

  it('não encosta na linha de outro caixa — snapshot atrasado do anterior não reescreve o atual', () => {
    expect(applyLiveBalance(row, 'outro', { availableReais: 0, pendingReais: 0 })).toBe(row);
  });

  it('aceita saldo PARA MENOS do caixa observado: saque reserva valor', () => {
    expect(applyLiveBalance(row, 't1', { availableReais: 0, pendingReais: 300 })).toEqual({
      tournamentId: 't1',
      tournamentName: 'Copa A',
      availableReais: 0,
      pendingReais: 300,
    });
  });
});

describe('withdrawalRequesterLabel', () => {
  it('marca o saque de quem está olhando', () => {
    expect(withdrawalRequesterLabel({ requestedBy: 'eu', requestedByStaff: false }, 'eu')).toBe('Você');
  });

  it('marca o pedido da equipe', () => {
    expect(withdrawalRequesterLabel({ requestedBy: 'gestor', requestedByStaff: true }, 'eu')).toBe('Gestor da equipe');
  });

  it('pedido de quem é dono do evento', () => {
    expect(withdrawalRequesterLabel({ requestedBy: 'dono', requestedByStaff: false }, 'eu')).toBe('Dono do evento');
  });

  it('sem quem pediu não inventa autor', () => {
    expect(withdrawalRequesterLabel({ requestedBy: '', requestedByStaff: false }, 'eu')).toBe('—');
  });

  it('sem saber quem está olhando, ninguém é "Você"', () => {
    expect(withdrawalRequesterLabel({ requestedBy: 'eu', requestedByStaff: false }, '')).toBe('Dono do evento');
  });
});
