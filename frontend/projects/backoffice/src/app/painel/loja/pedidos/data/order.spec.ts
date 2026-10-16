import {
  applyFilters,
  filtersFromParams,
  filtersToParams,
  maskCpf,
  orderFromDoc,
  pageList,
  paymentLabel,
  pillOf,
  primaryAction,
  relativeDate,
  separateBlock,
  tabCounts,
  timelineOf,
  transferBlock,
  transferLines,
  DEFAULT_FILTERS,
  type Order,
} from './order';

const at = (iso: string) => new Date(iso);
const NOW = at('2026-10-16T18:42:00Z'); // 15:42 em SP

function order(over: Record<string, unknown> = {}, id = 'o1'): Order {
  return orderFromDoc(id, {
    number: 'NX-4821', status: 'ret', channel: 'app_ios',
    customer: { uid: 'u1', name: 'Marcelo Antunes', email: 'm@x.com', phone: '(62) 99812-4471', cpf: '12348233100', level: 3, orderIndex: 6 },
    items: [
      { productId: 'cam', skuId: 'm', skuCode: 'NX-CAM-BRA-M', productName: 'Camiseta Dry UV50 Areia', variantLabel: 'Branco areia · M', qty: 1, unitCents: 12990, totalCents: 12990 },
      { productId: 'vis', skuId: 'u', skuCode: 'NX-VIS-PRE-U', productName: 'Viseira Dry Fit', variantLabel: 'Preta · único', qty: 2, unitCents: 6990, totalCents: 13980 },
    ],
    units: 3, subtotalCents: 26970, pixDiscountCents: 1349, walletCents: 4200, shippingCents: 0, totalCents: 21421,
    payments: [{ method: 'pix', amountCents: 21421, txid: 'E18236120202610141410', feeCents: 490 }, { method: 'saldo', amountCents: 4200 }],
    paymentMethods: ['pix', 'saldo'],
    delivery: { type: 'arena', locationId: 'arena-errejota', placeName: 'Arena Errejota', pickupCode: '4821', pickupDeadline: at('2026-10-19T01:00:00Z') },
    reservation: { locationId: 'arena-errejota', active: true },
    paidAt: at('2026-10-14T17:10:00Z'), separatedAt: at('2026-10-14T20:32:00Z'), createdAt: at('2026-10-14T17:08:00Z'),
    history: [
      { type: 'criado', title: 'Pedido criado', detail: 'App iOS', actor: null, at: at('2026-10-14T17:08:00Z') },
      { type: 'pago', title: 'Pix aprovado', detail: 'txid E1823…9F2A', actor: null, at: at('2026-10-14T17:10:00Z') },
      { type: 'separado', title: 'Separado no CD Goiânia', detail: '', actor: { uid: 'a', name: 'Lucas M.' }, at: at('2026-10-14T20:32:00Z') },
      { type: 'remessa', title: 'Remessa criada', detail: 'TR-117 para a arena', actor: { uid: 'a', name: 'Lucas M.' }, at: at('2026-10-15T10:00:00Z') },
      { type: 'na_arena', title: 'Recebido na Arena Errejota', detail: 'Remessa TR-117', actor: { uid: 'b', name: 'Gerente' }, at: at('2026-10-15T12:40:00Z') },
    ],
    version: 5,
    ...over,
  });
}

describe('pedidos · modelo', () => {
  it('lê o doc com padrões seguros', () => {
    const o = orderFromDoc('x', {});
    expect(o.number).toBe('x');
    expect(o.status).toBe('pag');
    expect(o.delivery.type).toBe('arena');
    expect(o.items).toEqual([]);
  });

  it('rótulos: pagamento, CPF mascarado, data relativa em SP', () => {
    expect(paymentLabel(order())).toBe('Pix + saldo');
    expect(paymentLabel(order({ payments: [{ method: 'cartao', amountCents: 1, installments: 3 }] }))).toBe('Cartão 3×');
    expect(maskCpf('12348233100')).toBe('***.482.331-**');
    expect(maskCpf('')).toBe('—');
    expect(relativeDate(at('2026-10-16T18:42:00Z'), NOW)).toBe('Hoje 15:42');
    expect(relativeDate(at('2026-10-15T17:08:00Z'), NOW)).toBe('Ontem 14:08');
    expect(relativeDate(at('2026-10-12T15:00:00Z'), NOW)).toBe('12 out');
  });

  it('pill: separado mostra o que espera', () => {
    expect(pillOf(order()).label).toBe('Pronto p/ retirar');
    expect(pillOf(order({ status: 'sepd', separatedAt: null })).label).toBe('Separando');
    expect(pillOf(order({ status: 'sepd' })).label).toBe('Aguard. remessa');
    expect(pillOf(order({ status: 'sepd', transferId: 't1' })).label).toBe('Em remessa');
    expect(pillOf(order({ status: 'sepd', delivery: { type: 'casa' } })).label).toBe('Aguard. envio');
  });

  it('ação primária por status', () => {
    expect(primaryAction(order({ status: 'pag' }))?.kind).toBe('reenviar_cobranca');
    expect(primaryAction(order({ status: 'sep' }))?.kind).toBe('iniciar_separacao');
    expect(primaryAction(order({ status: 'sepd', separatedAt: null }))?.kind).toBe('marcar_separado');
    expect(primaryAction(order({ status: 'sepd', delivery: { type: 'casa' } }))?.kind).toBe('enviar');
    expect(primaryAction(order({ status: 'sepd' }))?.kind).toBe('criar_remessa');
    expect(primaryAction(order({ status: 'sepd', transferId: 't1' }))).toBeNull();
    expect(primaryAction(order())?.label).toBe('Confirmar retirada');
    expect(primaryAction(order({ status: 'tra' }))?.kind).toBe('entregue');
    for (const s of ['ent', 'rtd', 'can']) expect(primaryAction(order({ status: s }))).toBeNull();
  });

  it('filtros vão e voltam da URL; só o que difere do padrão', () => {
    const f = filtersFromParams({ aba: 'sep', arena: 'a,b', pagamento: 'pix', canal: 'app', ordem: 'valor', p: '2', q: 'nx-48' });
    expect(f).toEqual({ tab: 'sep', q: 'nx-48', entrega: 'todas', arenas: ['a', 'b'], pagamento: 'pix', canal: 'app', ordem: 'valor', page: 2 });
    expect(filtersFromParams(filtersToParams(f) as Record<string, string>)).toEqual(f);
    expect(Object.values(filtersToParams(DEFAULT_FILTERS)).every((v) => v === null)).toBeTrue();
    expect(filtersFromParams({ aba: 'xyz', p: '-3' }).tab).toBe('todos');
  });

  it('busca por número, nome sem acento ou CPF; chips de arena e canal', () => {
    const list = [
      order({}, 'a'),
      order({ number: 'NX-4830', customer: { name: 'Carla Mendes', cpf: '99900011122' }, channel: 'web', delivery: { type: 'casa', city: 'Anápolis', uf: 'GO' } }, 'b'),
    ];
    const f = { ...DEFAULT_FILTERS };
    expect(applyFilters(list, { ...f, q: '#nx-4821' }).map((o) => o.id)).toEqual(['a']);
    expect(applyFilters(list, { ...f, q: 'marcelo antunes' }).map((o) => o.id)).toEqual(['a']);
    expect(applyFilters(list, { ...f, q: '999.000' }).map((o) => o.id)).toEqual(['b']);
    expect(applyFilters(list, { ...f, arenas: ['arena-errejota'] }).map((o) => o.id)).toEqual(['a']);
    expect(applyFilters(list, { ...f, canal: 'app' }).map((o) => o.id)).toEqual(['a']);
    expect(applyFilters(list, { ...f, entrega: 'casa' }).map((o) => o.id)).toEqual(['b']);
    expect(tabCounts(list).ret).toBe(2);
    expect(tabCounts([order({ status: 'ent' }), order({ status: 'rtd' })]).concluidos).toBe(2);
  });

  it('seleção em massa: separar e remessa explicam por que não', () => {
    expect(separateBlock(order({ status: 'sep' }))).toBeNull();
    expect(separateBlock(order({ status: 'pag' }))).toBe('aguardando pagamento');
    const cd = (id: string, arena = 'arena-errejota') =>
      order({ status: 'sep', separatedAt: null, reservation: { locationId: 'cd', active: true }, delivery: { type: 'arena', locationId: arena } }, id);
    expect(transferBlock([cd('a'), cd('b')])).toBeNull();
    expect(transferBlock([cd('a'), cd('b', 'arena-cfc')])).toContain('arenas diferentes');
    expect(transferBlock([order({ status: 'sep' })])).toContain('própria arena');
    expect(transferLines([cd('a'), cd('b')])).toEqual([
      { productId: 'cam', skuId: 'm', qty: 2 },
      { productId: 'vis', skuId: 'u', qty: 4 },
    ]);
  });

  it('timeline da retirada: concluídas, atual com prazo, próxima vazada', () => {
    const steps = timelineOf(order());
    expect(steps.map((s) => s.state)).toEqual(['done', 'done', 'done', 'done', 'current', 'next']);
    expect(steps[2]!.detail).toContain('por Lucas M.');
    expect(steps[4]!.detail).toBe('Prazo até dom, 18 out · 22h');
    const pag = timelineOf(order({ status: 'pag', history: [{ type: 'criado', title: 'Pedido criado', detail: 'Site' }] }));
    expect(pag[1]).toEqual({ title: 'Aguardando pagamento', detail: '', state: 'current' });
    const can = timelineOf(order({ status: 'can', cancelReason: 'Desistiu', history: [{ type: 'criado', title: 'Pedido criado' }] }));
    expect(can.at(-1)!.state).toBe('canceled');
    const home = timelineOf(order({ status: 'tra', delivery: { type: 'casa' }, history: [] }));
    expect(home.map((s) => s.title)).toEqual(['Pedido criado', 'Pagamento aprovado', 'Separado', 'Enviado', 'Entregue']);
  });

  it('paginação compacta', () => {
    expect(pageList(1, 24)).toEqual([1, 2, 3, null, 24]);
    expect(pageList(10, 24)).toEqual([1, null, 9, 10, 11, null, 24]);
    expect(pageList(1, 1)).toEqual([1]);
  });
});
