import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/store/domain/store_checkout_models.dart';
import 'package:nexago_app/features/store/domain/store_models.dart';
import 'package:nexago_app/features/store/domain/store_order_rules.dart';

/// Os mesmos casos de `store-checkout-model.spec.ts` (portal): mesmas
/// entradas, mesmas strings.
StoreOrderView _view([Map<String, Object?> over = const {}]) =>
    storeOrderViewFromMap('ord_1', {
      'uid': 'ana',
      'number': 'NX-4821',
      'status': 'sep',
      'items': [
        {
          'productId': 'p1',
          'skuId': 's1',
          'name': 'Bola Pro Beach',
          'variantLabel': 'Amarela',
          'qty': 1,
          'unitCents': 18990,
          'totalCents': 18990,
        },
      ],
      'units': 1,
      'totalCents': 18990,
      'delivery': {
        'type': 'arena',
        'placeName': 'Arena Errejota',
        'counter': 'recepção',
        'address': 'Rua 1, Goiânia',
        'pickupCode': null,
      },
      'createdAt': '2026-10-17T19:02:00.000Z',
      ...over,
    })!;

void main() {
  // 17:00 em São Paulo.
  final now = DateTime.utc(2026, 10, 17, 20);

  test('lê a visão; código só na arena e Pix só aguardando pagamento', () {
    final ret = _view({
      'status': 'ret',
      'delivery': {
        'type': 'arena',
        'pickupCode': '4821',
        'pickupDeadline': '2026-10-19T01:00:00.000Z',
      },
    });
    expect((ret.delivery as StoreOrderArenaDelivery).pickupCode, '4821');
    final sep = _view({
      'status': 'sep',
      'delivery': {'type': 'arena', 'pickupCode': '4821'},
      'pix': {'copyPaste': 'x' * 30},
    });
    expect((sep.delivery as StoreOrderArenaDelivery).pickupCode, isNull);
    expect(sep.pix, isNull);
    final pag = _view({
      'status': 'pag',
      'pix': {'copyPaste': 'x' * 30, 'expiresAt': '2026-10-17T20:30:00.000Z'},
    });
    expect(pag.pix?.expiresAt, DateTime.utc(2026, 10, 17, 20, 30));
    expect(storeOrderViewFromMap('x', {'status': 'inventado'}), isNull);
    expect(storeOrderViewFromMap('x', null), isNull);
  });

  test('rótulos de status iguais aos do portal', () {
    expect(StoreOrderStatus.values.map((s) => s.label), [
      'Aguardando pagamento',
      'Em separação',
      'Separado',
      'Pronto pra retirar',
      'Em trânsito',
      'Entregue',
      'Retirado',
      'Cancelado',
    ]);
    expect(storeOrderTone(StoreOrderStatus.pag), StoreOrderTone.wait);
    expect(storeOrderTone(StoreOrderStatus.ret), StoreOrderTone.ready);
    expect(storeOrderTone(StoreOrderStatus.rtd), StoreOrderTone.done);
    expect(storeOrderTone(StoreOrderStatus.can), StoreOrderTone.canceled);
  });

  test('barra de etapas por entrega; encerrado não tem barra', () {
    expect(
      storeOrderProgress(_view({'status': 'ret'})),
      const StoreOrderProgress(['Pago', 'Separado', 'Na arena', 'Retirado'], 3),
    );
    expect(
      storeOrderProgress(
        _view({
          'status': 'tra',
          'delivery': {'type': 'casa'},
        }),
      )!
          .step,
      2,
    );
    expect(
      storeOrderProgress(
        _view({
          'status': 'pag',
          'delivery': {'type': 'casa'},
        }),
      ),
      const StoreOrderProgress(
          ['Pago', 'Separado', 'Em trânsito', 'Entregue'], 0),
    );
    expect(
      storeOrderProgress(
        _view({
          'status': 'ent',
          'delivery': {'type': 'casa'},
        }),
      ),
      isNull,
    );
  });

  test('filtros e busca sem acento por número ou produto', () {
    final o = _view();
    expect(storeOrderMatchesFilter(o, StoreOrderFilter.active), isTrue);
    expect(
      storeOrderMatchesFilter(_view({'status': 'rtd'}), StoreOrderFilter.done),
      isTrue,
    );
    expect(
      storeOrderMatchesFilter(
          _view({'status': 'can'}), StoreOrderFilter.active),
      isFalse,
    );
    expect(
      storeOrderMatchesFilter(
        _view({'status': 'can'}),
        StoreOrderFilter.canceled,
      ),
      isTrue,
    );
    expect(storeOrderMatchesSearch(o, '#nx-4821'), isTrue);
    expect(storeOrderMatchesSearch(o, 'BOLA pro'), isTrue);
    expect(storeOrderMatchesSearch(o, 'rede'), isFalse);
    expect(storeOrderMatchesSearch(o, '  '), isTrue);
    expect(
      storeOrderMatchesSearch(
        _view({
          'items': [
            {'name': 'Óculos Polarizado', 'qty': 1},
          ],
        }),
        'oculos',
      ),
      isTrue,
    );
  });

  test('título, onde e o recado de cada momento', () {
    expect(storeOrderTitle(_view()), 'Bola Pro Beach');
    expect(
      storeOrderTitle(
        _view({
          'items': [
            {'name': 'A', 'qty': 1},
            {'name': 'B', 'qty': 3},
          ],
          'units': 4,
        }),
      ),
      '4 itens',
    );
    expect(
      storeOrderTitle(
        _view({
          'items': [
            {'name': 'Camiseta', 'qty': 2, 'customizationLabel': 'ANTUNES'},
          ],
        }),
      ),
      'Camiseta · ANTUNES · 2×',
    );
    expect(storeOrderWhere(_view()), 'Arena Errejota · recepção');
    expect(storeOrderWhere(_view({'status': 'rtd'})),
        'Retirado na Arena Errejota');
    expect(
      storeOrderWhere(
        _view({
          'status': 'ent',
          'delivery': {'type': 'casa', 'address': 'Rua T-37, 1240'},
        }),
      ),
      'Entregue em casa',
    );
    expect(
      storeOrderInfo(
        _view({
          'status': 'pag',
          'pix': {
            'copyPaste': 'x' * 30,
            'expiresAt': '2026-10-17T20:30:00.000Z'
          },
        }),
      ),
      'Pague o Pix até 17:30',
    );
    expect(
      storeOrderInfo(
        _view({
          'status': 'ret',
          'delivery': {
            'type': 'arena',
            'pickupDeadline': '2026-10-19T01:00:00.000Z',
          },
        }),
      ),
      'Retire até dom, 18 out · 22h',
    );
    expect(
      storeOrderInfo(
        _view({
          'status': 'tra',
          'delivery': {'type': 'casa', 'eta': '2026-10-22'},
        }),
      ),
      'Chega até qui, 22 out',
    );
    expect(storeOrderInfo(_view()), 'Separando pra levar à arena');
    expect(
      storeOrderInfo(_view({'status': 'can', 'refundedCents': 18990})),
      'Reembolso registrado',
    );
    expect(
      storeOrderInfo(
        _view({'status': 'can', 'cancelReason': 'Pix expirou sem pagamento'}),
      ),
      'Pix expirou sem pagamento',
    );
  });

  test('datas no relógio de São Paulo', () {
    expect(
      formatStoreOrderDate(DateTime.parse('2026-10-17T19:02:00.000Z'), now),
      'Hoje, 16:02',
    );
    expect(
      formatStoreOrderDate(DateTime.parse('2026-10-16T17:08:00.000Z'), now),
      'Ontem, 14:08',
    );
    expect(
      formatStoreOrderDate(DateTime.parse('2026-10-08T15:00:00.000Z'), now),
      '8 out',
    );
    // 01:30 UTC do dia 17 ainda é dia 16 em SP.
    expect(
      formatStoreOrderDate(DateTime.parse('2026-10-17T01:30:00.000Z'), now),
      'Ontem, 22:30',
    );
    expect(
      formatStoreOrderDate(DateTime.parse('2025-10-08T15:00:00.000Z'), now),
      '8 out 2025',
    );
    expect(formatStoreOrderDate(null, now), '');
    // 18 out 2026 é domingo.
    expect(
      formatStoreDeadline(DateTime.parse('2026-10-19T01:00:00.000Z')),
      'dom, 18 out · 22h',
    );
    expect(
      formatStoreDeadline(DateTime.parse('2026-10-18T01:30:00.000Z')),
      'sáb, 17 out · 22:30',
    );
    expect(formatStoreCivilDate('2026-10-22'), 'qui, 22 out');
    expect(formatStoreCivilDate('22/10'), isNull);
  });

  test('contagem do Pix até vencer', () {
    expect(
      storePixCountdown(now.add(const Duration(milliseconds: 125000)), now),
      '02:05',
    );
    expect(
      storePixCountdown(now.subtract(const Duration(milliseconds: 1)), now),
      isNull,
    );
    expect(storePixCountdown(null, now), isNull);
  });

  test('resposta do createStoreOrder', () {
    final created = storeCreatedOrderFromMap({
      'orderId': 'ord_1',
      'number': 'NX-0001',
      'totalCents': 18040,
      'pix': {'copyPaste': 'x' * 40, 'expiresAt': '2026-10-17T20:30:00.000Z'},
    })!;
    expect(created.orderId, 'ord_1');
    expect(created.pix.expiresAt, DateTime.utc(2026, 10, 17, 20, 30));
    expect(storeCreatedOrderFromMap({'orderId': 'x'}), isNull);
  });

  test('Google Maps com o endereço da arena', () {
    expect(
      storeMapsUri('Rua 1, Goiânia').toString(),
      'https://www.google.com/maps/search/?api=1&query=Rua%201%2C%20Goi%C3%A2nia',
    );
  });

  test('comprar de novo: só peças comuns ainda à venda, com o saldo como teto',
      () {
    const bola = StoreProduct(
      id: 'bola',
      name: 'Bola',
      priceCents: 18990,
      minPriceCents: 18990,
      maxPriceCents: 18990,
      variants: [
        StoreVariant(id: 'unico', priceCents: 18990, inStock: true, maxQty: 3),
      ],
    );
    const viseira = StoreProduct(
      id: 'viseira',
      name: 'Viseira',
      priceCents: 6990,
      minPriceCents: 6990,
      maxPriceCents: 6990,
      variants: [StoreVariant(id: 'unico', priceCents: 6990, inStock: false)],
    );
    final plan = storeRebuyPlan(
      const [
        StoreOrderItem(productId: 'bola', skuId: 'unico', qty: 2),
        StoreOrderItem(productId: 'viseira', skuId: 'unico', qty: 1),
        StoreOrderItem(
            productId: 'bola', skuId: 'unico', qty: 1, personalized: true),
        StoreOrderItem(productId: 'sumiu', skuId: 'x', qty: 1),
      ],
      const [bola, viseira],
    );
    expect(plan.lines.single.productId, 'bola');
    expect(plan.lines.single.qty, 2);
    expect(plan.lines.single.maxQty, 3);
    expect(plan.skipped, 3);
  });
}
