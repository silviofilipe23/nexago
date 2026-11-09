import { comandaCloseEmptyBlockReason, comandaItemReverseBlockReason } from './comanda.model';

describe('comandaCloseEmptyBlockReason', () => {
  it('permite fechar comanda aberta sem consumo', () => {
    expect(comandaCloseEmptyBlockReason({ status: 'open', totalCents: 0 })).toBeNull();
  });

  it('bloqueia quando a comanda tem consumo lançado', () => {
    expect(comandaCloseEmptyBlockReason({ status: 'open', totalCents: 1500 })).not.toBeNull();
  });

  it('bloqueia quando a comanda já não está ativa', () => {
    expect(comandaCloseEmptyBlockReason({ status: 'closed', totalCents: 0 })).not.toBeNull();
  });
});

describe('comandaItemReverseBlockReason', () => {
  const openComanda = { status: 'open' as const, itemsTotalCents: 1000, rentalCents: 0, paidCents: 0 };

  it('permite remover item com valor', () => {
    expect(comandaItemReverseBlockReason(openComanda, { quantity: 1, lineTotalCents: 500 })).toBeNull();
  });

  it('permite remover item de R$ 0,00 (brinde/produto sem preço)', () => {
    expect(
      comandaItemReverseBlockReason({ ...openComanda, itemsTotalCents: 0 }, { quantity: 1, lineTotalCents: 0 }),
    ).toBeNull();
  });

  it('bloqueia item sem quantidade ou com valor negativo', () => {
    expect(comandaItemReverseBlockReason(openComanda, { quantity: 0, lineTotalCents: 500 })).not.toBeNull();
    expect(comandaItemReverseBlockReason(openComanda, { quantity: 1, lineTotalCents: -1 })).not.toBeNull();
  });

  it('bloqueia quando o pagamento já cobre o item', () => {
    expect(
      comandaItemReverseBlockReason({ ...openComanda, paidCents: 1000 }, { quantity: 1, lineTotalCents: 500 }),
    ).not.toBeNull();
  });
});
