import { shouldExplainZeroBalance } from './wallet-view';

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
