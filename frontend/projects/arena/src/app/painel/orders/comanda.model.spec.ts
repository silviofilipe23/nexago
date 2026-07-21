import { comandaCloseEmptyBlockReason } from './comanda.model';

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
