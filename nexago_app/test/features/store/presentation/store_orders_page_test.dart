import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/store/domain/store_checkout_models.dart';

import 'store_checkout_test_kit.dart';

/// Meus pedidos (08) e o pedido (06 Pix · 07 retirada).

StoreOrderView _pag() => orderView('ord_3', {
      'number': 'NX-3',
      'status': 'pag',
      'pix': {'copyPaste': 'x' * 40, 'expiresAt': '2026-10-17T20:30:00.000Z'},
    });

StoreOrderView _ret() => orderView('ord_2', {
      'number': 'NX-2',
      'status': 'ret',
      'createdAt': '2026-10-16T17:08:00.000Z',
      'delivery': {
        'type': 'arena',
        'placeName': 'Arena Errejota',
        'counter': 'recepção',
        'address': 'Rua 1, Goiânia',
        'pickupCode': '0427',
        'pickupDeadline': '2026-10-19T01:00:00.000Z',
      },
    });

StoreOrderView _ent() => orderView('ord_1', {
      'number': 'NX-1',
      'status': 'ent',
      'createdAt': '2026-10-08T15:00:00.000Z',
      'items': [
        {
          'productId': 'bola',
          'skuId': 'unico',
          'name': 'Bola Pro Beach',
          'qty': 2
        },
        {
          'productId': 'cami',
          'skuId': 'm',
          'name': 'Camiseta Personalizada',
          'qty': 1,
          'personalized': true,
          'customizationLabel': 'ANTUNES',
        },
      ],
      'units': 3,
      'delivery': {'type': 'casa', 'address': 'Rua T-37, 1240'},
    });

/// A rota do topo (o `push` não muda a `uri` do go_router).
String _pathOf(CheckoutHarness h) =>
    h.router.routerDelegate.currentConfiguration.last.matchedLocation;

void main() {
  group('Meus pedidos', () {
    testWidgets('lista em andamento e anteriores, com as ações de cada um', (
      tester,
    ) async {
      final h = CheckoutHarness();
      await h.pump(tester, initial: AppRoutes.storeOrders);
      h.checkout.orders.add([_pag(), _ret(), _ent()]);
      await tester.pump();
      await tester.pump();

      expect(find.text('EM ANDAMENTO'), findsOneWidget);
      expect(find.text('ANTERIORES'), findsOneWidget);
      expect(
          find.byKey(const ValueKey('store-order-card-ord_3')), findsOneWidget);
      expect(
          find.byKey(const ValueKey('store-order-card-ord_2')), findsOneWidget);
      expect(
          find.byKey(const ValueKey('store-order-card-ord_1')), findsOneWidget);
      // Rótulos, datas e recados iguais aos do portal.
      expect(find.text('Aguardando pagamento'), findsOneWidget);
      expect(find.text('Pronto pra retirar'), findsOneWidget);
      expect(find.text('Entregue'), findsOneWidget);
      expect(find.text('Hoje, 16:02'), findsOneWidget);
      expect(find.text('Ontem, 14:08'), findsOneWidget);
      expect(find.text('8 out'), findsOneWidget);
      expect(find.text('Pague o Pix até 17:30'), findsOneWidget);
      expect(find.text('Retire até dom, 18 out · 22h'), findsOneWidget);
      expect(find.text('Arena Errejota · recepção'), findsWidgets);
      expect(find.text('3 itens'), findsOneWidget);
      expect(find.text('PERSONALIZADO'), findsOneWidget);
      // Ações por status.
      expect(find.text('Pagar Pix'), findsOneWidget);
      expect(find.text('Ver código'), findsOneWidget);
      expect(find.text('Como chegar'), findsOneWidget);
      expect(find.text('Comprar de novo'), findsOneWidget);
      // Contagem por filtro.
      expect(find.text('Todos'), findsOneWidget);
      expect(
        find.descendant(
          of: find.byKey(const ValueKey('store-orders-filter-todos')),
          matching: find.text('3'),
        ),
        findsOneWidget,
      );
      expect(
        find.text('Cancelado depois de pago gera reembolso, e a gente avisa'),
        findsOneWidget,
      );
      expect(h.analytics.logged(#logStoreOrdersView), isTrue);

      await tester.tap(find.text('Como chegar'));
      await tester.pump();
      expect(
        h.opened.single.toString(),
        'https://www.google.com/maps/search/?api=1&query=Rua%201%2C%20Goi%C3%A2nia',
      );
    });

    testWidgets('filtro e busca sem acento por número ou produto', (
      tester,
    ) async {
      final h = CheckoutHarness();
      await h.pump(tester, initial: AppRoutes.storeOrders);
      h.checkout.orders.add([_pag(), _ret(), _ent()]);
      await tester.pump();
      await tester.pump();

      final done = find.byKey(const ValueKey('store-orders-filter-concluidos'));
      await tester.ensureVisible(done);
      await tester.pump();
      await tester.tap(done);
      await tester.pump();
      expect(
          find.byKey(const ValueKey('store-order-card-ord_1')), findsOneWidget);
      expect(
          find.byKey(const ValueKey('store-order-card-ord_2')), findsNothing);
      expect(find.text('EM ANDAMENTO'), findsNothing);

      final all = find.byKey(const ValueKey('store-orders-filter-todos'));
      await tester.ensureVisible(all);
      await tester.pump();
      await tester.tap(all);
      await tester.pump();
      await tester.enterText(
        find.byKey(const ValueKey('store-orders-search')),
        '#nx-2',
      );
      await tester.pump();
      expect(
          find.byKey(const ValueKey('store-order-card-ord_2')), findsOneWidget);
      expect(
          find.byKey(const ValueKey('store-order-card-ord_3')), findsNothing);

      await tester.enterText(
        find.byKey(const ValueKey('store-orders-search')),
        'camiseta personalizada',
      );
      await tester.pump();
      expect(
          find.byKey(const ValueKey('store-order-card-ord_1')), findsOneWidget);
      expect(
          find.byKey(const ValueKey('store-order-card-ord_2')), findsNothing);

      await tester.enterText(
        find.byKey(const ValueKey('store-orders-search')),
        'rede',
      );
      await tester.pump();
      expect(find.text('Nenhum pedido com esse filtro.'), findsOneWidget);
    });

    testWidgets('sem pedidos: convite pra vitrine', (tester) async {
      final h = CheckoutHarness();
      await h.pump(tester, initial: AppRoutes.storeOrders);
      h.checkout.orders.add(const []);
      await tester.pump();
      await tester.pump();

      // O AppEmptyView entra com atraso (FadeSlideIn).
      await tester.pump(const Duration(seconds: 1));
      expect(find.text('Você ainda não fez pedidos'), findsOneWidget);
      expect(find.text('Ver a loja'), findsOneWidget);
    });

    testWidgets('comprar de novo repõe só as peças comuns e abre o carrinho', (
      tester,
    ) async {
      final h = CheckoutHarness(cart: const []);
      await h.pump(tester, initial: AppRoutes.storeOrders);
      h.checkout.orders.add([_ent()]);
      await tester.pump();
      await tester.pump();

      await tester.tap(find.text('Comprar de novo'));
      await tester.pump();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 600));

      // A personalizada ficou de fora; a bola volta com o saldo como teto.
      expect(h.store.added, [('bola', 'unico', 2, 3)]);
      expect(h.analytics.logged(#logStoreRebuy, {#orderId: 'ord_1'}), isTrue);
      expect(_pathOf(h), AppRoutes.storeCart);
    });
  });

  group('Pedido', () {
    testWidgets(
        'logo depois do checkout mostra o Pix do extra, antes do espelho', (
      tester,
    ) async {
      final messages = <MethodCall>[];
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        (call) async {
          messages.add(call);
          return null;
        },
      );
      addTearDown(
        () => tester.binding.defaultBinaryMessenger
            .setMockMethodCallHandler(SystemChannels.platform, null),
      );
      final h = CheckoutHarness();
      await h.pump(
        tester,
        initial: '/loja/pedidos/ord_pedido_1',
        extra: StoreCreatedOrder(
          orderId: 'ord_pedido_1',
          number: 'NX-0001',
          totalCents: 18040,
          pix: StoreOrderPix(
            copyPaste: 'x' * 40,
            expiresAt: kTestNow.add(const Duration(minutes: 30)),
          ),
        ),
      );
      // O espelho ainda não existe.
      h.checkout.order('ord_pedido_1').add(null);
      await tester.pump();
      await tester.pump(const Duration(seconds: 3));

      expect(find.text('Pagamento'), findsOneWidget);
      expect(find.text('Pedido #NX-0001'), findsOneWidget);
      expect(find.text('Pague com Pix'), findsOneWidget);
      expect(
        tester
            .widget<Text>(find.byKey(const ValueKey('store-pix-amount')))
            .data,
        brl(18040),
      );
      expect(find.text('EXPIRA EM 30:00'), findsOneWidget);
      expect(find.byKey(const ValueKey('store-pix-qr')), findsOneWidget);
      expect(find.text('Aguardando o pagamento…'), findsOneWidget);
      // Sem espelho mas com o Pix na mão: nunca vira "não achamos".
      expect(find.text('Não achamos esse pedido'), findsNothing);

      await tester.tap(find.byKey(const ValueKey('store-pix-copy')));
      await tester.pump();
      await tester.pump();
      expect(find.text('Copiado!'), findsOneWidget);
      final copy = messages.firstWhere((m) => m.method == 'Clipboard.setData');
      expect((copy.arguments as Map)['text'], 'x' * 40);
      expect(h.analytics.logged(#logStorePixCopy, {#orderId: 'ord_pedido_1'}),
          isTrue);
      expect(h.analytics.logged(#logStoreOrderView, {#orderId: 'ord_pedido_1'}),
          isTrue);
      await tester.pump(const Duration(seconds: 3));
      expect(find.text('Copiar código Pix'), findsOneWidget);
    });

    testWidgets('o pagamento cai com a tela aberta: "Pagamento aprovado!"', (
      tester,
    ) async {
      final h = CheckoutHarness();
      await h.pump(tester, initial: '/loja/pedidos/ord_3');
      h.checkout.order('ord_3').add(_pag());
      await tester.pump();
      await tester.pump();
      expect(find.text('Pague com Pix'), findsOneWidget);
      expect(find.text('Pagamento aprovado!'), findsNothing);

      h.checkout
          .order('ord_3')
          .add(orderView('ord_3', {'number': 'NX-3', 'status': 'sep'}));
      await tester.pump();
      await tester.pump();

      expect(find.text('Pague com Pix'), findsNothing);
      expect(find.text('Pagamento aprovado!'), findsOneWidget);
      expect(find.text('Avisamos quando estiver pronto pra retirar.'),
          findsOneWidget);
      expect(find.text('Em separação'), findsOneWidget);
      expect(find.text('Separando pra levar à arena'), findsOneWidget);
      expect(find.text('Meu pedido'), findsOneWidget);
    });

    testWidgets('espelho já chega pago logo depois do checkout também avisa', (
      tester,
    ) async {
      final h = CheckoutHarness();
      await h.pump(
        tester,
        initial: '/loja/pedidos/ord_3',
        extra: StoreCreatedOrder(
          orderId: 'ord_3',
          number: 'NX-3',
          totalCents: 18040,
          pix: StoreOrderPix(
            copyPaste: 'x' * 40,
            expiresAt: kTestNow.add(const Duration(minutes: 30)),
          ),
        ),
      );
      h.checkout.order('ord_3').add(null);
      await tester.pump();
      h.checkout
          .order('ord_3')
          .add(orderView('ord_3', {'number': 'NX-3', 'status': 'sep'}));
      await tester.pump();
      await tester.pump();

      expect(find.text('Pagamento aprovado!'), findsOneWidget);
    });

    testWidgets('na arena mostra o código, o prazo e o "Como chegar"', (
      tester,
    ) async {
      final h = CheckoutHarness();
      await h.pump(tester, initial: '/loja/pedidos/ord_2');
      h.checkout.order('ord_2').add(_ret());
      await tester.pump();
      await tester.pump();

      expect(find.byKey(const ValueKey('store-pickup-ready')), findsOneWidget);
      expect(find.text('Arena Errejota · recepção'), findsWidgets);
      expect(
        tester
            .widget<Text>(find.byKey(const ValueKey('store-pickup-code')))
            .data,
        '0427',
      );
      expect(
        tester
            .widget<Text>(find.byKey(const ValueKey('store-pickup-deadline')))
            .data,
        'Retire até dom, 18 out · 22h',
      );
      expect(find.text('#NX-2 · 1 item'), findsOneWidget);

      await tester.tap(find.text('Como chegar'));
      await tester.pump();
      expect(h.opened.single.host, 'www.google.com');
    });

    testWidgets('Pix vencido: aviso e "Montar o carrinho de novo"', (
      tester,
    ) async {
      final h = CheckoutHarness(cart: const []);
      await h.pump(
        tester,
        initial: '/loja/pedidos/ord_3',
        now: DateTime.utc(2026, 10, 17, 20, 31),
      );
      h.checkout.order('ord_3').add(_pag());
      await tester.pump();
      await tester.pump();

      expect(find.text('O prazo do Pix acabou'), findsOneWidget);
      await tester.tap(find.text('Montar o carrinho de novo'));
      await tester.pump();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 600));
      expect(h.store.added, [('bola', 'unico', 1, 3)]);
      expect(_pathOf(h), AppRoutes.storeCart);
    });

    testWidgets('cancelado com reembolso não promete Pix', (tester) async {
      final h = CheckoutHarness();
      await h.pump(tester, initial: '/loja/pedidos/ord_9');
      h.checkout.order('ord_9').add(
            orderView('ord_9', {
              'status': 'can',
              'refundedCents': 18040,
              'cancelReason': 'Estoque acabou',
            }),
          );
      await tester.pump();
      await tester.pump();

      expect(find.text('Cancelado'), findsOneWidget);
      expect(find.text('Reembolso registrado'), findsOneWidget);
      expect(find.text('Motivo: Estoque acabou'), findsOneWidget);
      expect(find.text('Reembolso: ${brl(18040)}'), findsOneWidget);
      expect(find.text('Comprar de novo'), findsOneWidget);
    });

    testWidgets('sem espelho e sem o Pix na mão: "não achamos"',
        (tester) async {
      final h = CheckoutHarness();
      await h.pump(tester, initial: '/loja/pedidos/ord_x');
      h.checkout.order('ord_x').add(null);
      await tester.pump();
      await tester.pump(const Duration(seconds: 3));

      expect(find.text('Não achamos esse pedido'), findsOneWidget);
    });
  });
}
