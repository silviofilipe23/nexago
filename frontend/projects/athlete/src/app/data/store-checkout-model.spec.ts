import {
  addressDraftErrors,
  addressFromDraft,
  addressesFromDoc,
  addressLine,
  addressToDoc,
  appliedCoupon,
  cartLineKey,
  defaultAddressId,
  EMPTY_ADDRESS_DRAFT,
  formatCep,
  formatCivilDate,
  formatDeadline,
  formatOrderDate,
  formatPhone,
  MAX_ADDRESSES,
  orderInfo,
  orderMatchesFilter,
  orderMatchesSearch,
  orderProgress,
  orderTitle,
  orderViewFromDoc,
  orderWhere,
  pixCountdown,
  quoteBlocker,
  quoteFromData,
  removeAddress,
  upsertAddress,
  type StoreAddress,
  type StoreOrderView,
} from './store-checkout-model';
import { mapViaCepResponse } from './via-cep';

function addr(id: string, over: Partial<StoreAddress> = {}): StoreAddress {
  return {
    id,
    label: 'Casa',
    recipient: 'Ana',
    phone: '62998124471',
    zip: '74210130',
    street: 'Rua T-37',
    number: '1240',
    complement: 'Ap 802',
    district: 'Setor Bueno',
    city: 'Goiânia',
    uf: 'GO',
    main: false,
    ...over,
  };
}

function view(over: Record<string, unknown> = {}): StoreOrderView {
  return orderViewFromDoc('ord_1', {
    uid: 'ana',
    number: 'NX-4821',
    status: 'sep',
    items: [{ productId: 'p1', skuId: 's1', name: 'Bola Pro Beach', variantLabel: 'Amarela', qty: 1, unitCents: 18990, totalCents: 18990 }],
    units: 1,
    totalCents: 18990,
    delivery: { type: 'arena', placeName: 'Arena Errejota', counter: 'recepção', address: 'Rua 1, Goiânia', pickupCode: null },
    createdAt: '2026-10-17T19:02:00.000Z',
    ...over,
  })!;
}

describe('store-checkout-model', () => {
  it('chave da linha: lineId da personalizada, senão produto/SKU (a mesma do servidor)', () => {
    expect(cartLineKey({ productId: 'p', skuId: 's', qty: 1 })).toBe('p/s');
    expect(cartLineKey({ productId: 'p', skuId: 's', qty: 1, lineId: 'L1' })).toBe('L1');
  });

  it('lê a cotação e descarta problema que não conhece', () => {
    const q = quoteFromData({
      lines: [{ key: 'p/s', qty: 2, totalCents: 1000, problem: 'esgotado' }, { key: 'x', problem: 'outro' }],
      subtotalCents: 1000,
      coupon: { code: 'NEXA10', discountCents: 100, problem: null },
      totalCents: 900,
      problems: ['linha_com_problema', 'inventado'],
    })!;
    expect(q.lines.map((l) => l.problem)).toEqual(['esgotado', null]);
    expect(q.problems).toEqual(['linha_com_problema']);
    expect(appliedCoupon(q)?.code).toBe('NEXA10');
    expect(quoteFromData({ foo: 1 })).toBeNull();
  });

  it('o motivo do Pagar travado segue a ordem que o atleta resolve', () => {
    const q = quoteFromData({ lines: [], problems: ['entrega_faltando', 'linha_com_problema'] })!;
    expect(quoteBlocker(q)).toBe('Revise os itens marcados no carrinho.');
    expect(quoteBlocker({ ...q, problems: [] })).toBeNull();
    expect(appliedCoupon({ ...q, coupon: { code: 'X', discountCents: 0, problem: 'minimo', message: 'm' } })).toBeNull();
  });

  describe('endereços', () => {
    it('o primeiro nasce principal; marcar outro tira a marca do anterior', () => {
      const one = upsertAddress([], addr('a'), false)!;
      expect(one.map((a) => a.main)).toEqual([true]);
      const two = upsertAddress(one, addr('b'), false)!;
      expect(two.map((a) => a.main)).toEqual([true, false]);
      const swapped = upsertAddress(two, addr('b'), true)!;
      expect(swapped.map((a) => a.main)).toEqual([false, true]);
      expect(defaultAddressId(swapped)).toBe('b');
    });

    it('teto de 10; editar no teto continua valendo', () => {
      const full = Array.from({ length: MAX_ADDRESSES }, (_, i) => addr(`a${i}`, { main: i === 0 }));
      expect(upsertAddress(full, addr('novo'), false)).toBeNull();
      expect(upsertAddress(full, addr('a3', { number: '9' }), false)![3]!.number).toBe('9');
    });

    it('excluir o principal promove o primeiro que sobrou', () => {
      const list = [addr('a', { main: true }), addr('b')];
      expect(removeAddress(list, 'a')).toEqual([addr('b', { main: true })]);
    });

    it('doc ↔ lista: descarta lixo e só grava `main` quando é o principal', () => {
      expect(addressesFromDoc({ items: [addressToDoc(addr('a')), { id: 'x', street: '', city: 'X', uf: 'GO' }, 'lixo'] })).toEqual([addr('a')]);
      expect('main' in addressToDoc(addr('a'))).toBeFalse();
      expect(addressToDoc(addr('a', { main: true }))['main']).toBeTrue();
    });

    it('formata linha, CEP e celular', () => {
      expect(addressLine(addr('a'))).toBe('Rua T-37, 1240 · Ap 802');
      expect(formatCep('74210130')).toBe('74210-130');
      expect(formatCep('742')).toBe('742');
      expect(formatPhone('62998124471')).toBe('(62) 99812-4471');
      expect(formatPhone('6232410000')).toBe('(62) 3241-0000');
    });

    it('rascunho: confere campo a campo e normaliza ao salvar', () => {
      expect(Object.keys(addressDraftErrors(EMPTY_ADDRESS_DRAFT)).sort()).toEqual(
        ['city', 'district', 'number', 'phone', 'recipient', 'street', 'uf', 'zip'].sort(),
      );
      const ok = { ...EMPTY_ADDRESS_DRAFT, zip: '74210-130', street: 'Rua T-37', number: 'S/N', district: 'Bueno', city: 'Goiânia', uf: 'go', recipient: 'Ana', phone: '(62) 99812-4471' };
      expect(addressDraftErrors(ok)).toEqual({});
      const saved = addressFromDraft(ok, 'id1', true);
      expect(saved.zip).toBe('74210130');
      expect(saved.uf).toBe('GO');
      expect(saved.phone).toBe('62998124471');
    });

    it('ViaCEP: CEP inexistente vira null; CEP geral vem sem rua', () => {
      expect(mapViaCepResponse({ erro: 'true' })).toBeNull();
      expect(mapViaCepResponse({ cep: '75380-000', localidade: 'Trindade', uf: 'go', logradouro: '' })).toEqual({
        cep: '75380000',
        street: '',
        district: '',
        city: 'Trindade',
        uf: 'GO',
      });
    });
  });

  describe('pedido', () => {
    const now = new Date('2026-10-17T20:00:00.000Z'); // 17:00 em SP

    it('lê a visão; código só na arena e Pix só aguardando pagamento', () => {
      const ret = view({ status: 'ret', delivery: { type: 'arena', pickupCode: '4821', pickupDeadline: '2026-10-19T01:00:00.000Z' } });
      expect(ret.delivery.type === 'arena' && ret.delivery.pickupCode).toBe('4821');
      const sep = view({ status: 'sep', delivery: { type: 'arena', pickupCode: '4821' }, pix: { copyPaste: 'x'.repeat(30) } });
      expect(sep.delivery.type === 'arena' && sep.delivery.pickupCode).toBeNull();
      expect(sep.pix).toBeNull();
      expect(orderViewFromDoc('x', { status: 'inventado' })).toBeNull();
    });

    it('barra de etapas por entrega; encerrado não tem barra', () => {
      expect(orderProgress(view({ status: 'ret' }))).toEqual({ steps: ['Pago', 'Separado', 'Na arena', 'Retirado'], step: 3 });
      expect(orderProgress(view({ status: 'tra', delivery: { type: 'casa' } }))!.step).toBe(2);
      expect(orderProgress(view({ status: 'ent', delivery: { type: 'casa' } }))).toBeNull();
    });

    it('filtros e busca sem acento por número ou produto', () => {
      const o = view();
      expect(orderMatchesFilter(o, 'andamento')).toBeTrue();
      expect(orderMatchesFilter(view({ status: 'rtd' }), 'concluidos')).toBeTrue();
      expect(orderMatchesFilter(view({ status: 'can' }), 'andamento')).toBeFalse();
      expect(orderMatchesSearch(o, '#nx-4821')).toBeTrue();
      expect(orderMatchesSearch(o, 'BOLA pro')).toBeTrue();
      expect(orderMatchesSearch(o, 'rede')).toBeFalse();
    });

    it('título, onde e o recado de cada momento', () => {
      expect(orderTitle(view())).toBe('Bola Pro Beach');
      expect(orderTitle(view({ items: [{ name: 'A', qty: 1 }, { name: 'B', qty: 3 }], units: 4 }))).toBe('4 itens');
      expect(orderWhere(view())).toBe('Arena Errejota · recepção');
      expect(orderWhere(view({ status: 'rtd' }))).toBe('Retirado na Arena Errejota');
      expect(orderInfo(view({ status: 'pag', pix: { copyPaste: 'x'.repeat(30), expiresAt: '2026-10-17T20:30:00.000Z' } }))).toBe(
        'Pague o Pix até 17:30',
      );
      expect(orderInfo(view({ status: 'ret', delivery: { type: 'arena', pickupDeadline: '2026-10-19T01:00:00.000Z' } }))).toBe(
        'Retire até dom, 18 out · 22h',
      );
      expect(orderInfo(view({ status: 'tra', delivery: { type: 'casa', eta: '2026-10-22' } }))).toBe('Chega até qui, 22 out');
    });

    it('datas no relógio de São Paulo', () => {
      expect(formatOrderDate(new Date('2026-10-17T19:02:00.000Z'), now)).toBe('Hoje, 16:02');
      expect(formatOrderDate(new Date('2026-10-16T17:08:00.000Z'), now)).toBe('Ontem, 14:08');
      expect(formatOrderDate(new Date('2026-10-08T15:00:00.000Z'), now)).toBe('8 out');
      // 01:30 UTC do dia 17 ainda é dia 16 em SP.
      expect(formatOrderDate(new Date('2026-10-17T01:30:00.000Z'), now)).toBe('Ontem, 22:30');
      expect(formatDeadline(new Date('2026-10-19T01:00:00.000Z'))).toBe('dom, 18 out · 22h');
      expect(formatCivilDate('2026-10-22')).toBe('qui, 22 out');
      expect(formatCivilDate('22/10')).toBeNull();
    });

    it('contagem do Pix até vencer', () => {
      expect(pixCountdown(new Date(now.getTime() + 125_000), now)).toBe('02:05');
      expect(pixCountdown(new Date(now.getTime() - 1), now)).toBeNull();
      expect(pixCountdown(null, now)).toBeNull();
    });
  });
});
