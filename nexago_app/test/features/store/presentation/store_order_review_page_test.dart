import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/store/domain/store_checkout_models.dart';
import 'package:nexago_app/features/store/domain/store_customize_service.dart';
import 'package:nexago_app/features/store/domain/store_models.dart';
import 'package:nexago_app/features/store/domain/store_review_models.dart';
import 'package:nexago_app/features/store/presentation/widgets/store_checkout_parts.dart';

import 'store_checkout_test_kit.dart';

/// Avaliar compra (08b/08c) e as entradas em Meus pedidos / pedido.

const String _route = '/loja/pedidos/ord_r/avaliar';

/// Camiseta com eixo Tamanho (ganha a pergunta do caimento).
const StoreProduct _cami = StoreProduct(
  id: 'cami',
  name: 'Camiseta Dry',
  priceCents: 12990,
  minPriceCents: 12990,
  maxPriceCents: 12990,
  axes: [
    StoreAxis(
      id: 'tam',
      label: 'Tamanho',
      values: [StoreAxisValue(id: 'm', label: 'M')],
    ),
  ],
  variants: [
    StoreVariant(id: 'm', values: {'tam': 'm'}, priceCents: 12990, inStock: true),
  ],
);

Map<String, Object?> _line(String productId, String name, String variant) => {
      'productId': productId,
      'skuId': '${productId}_1',
      'name': name,
      'variantLabel': variant,
      'qty': 1,
      'unitCents': 6990,
      'totalCents': 6990,
    };

StoreOrderView _order([Map<String, Object?> over = const {}]) =>
    orderView('ord_r', {
      'number': 'NX-4740',
      'status': 'rtd',
      'items': [
        _line('viseira', 'Viseira Dry Fit', 'Preta · único'),
        _line('cami', 'Camiseta Dry', 'Branco · M'),
        // Mesmo produto em outra cor: um passo só.
        _line('viseira', 'Viseira Dry Fit', 'Branca · único'),
      ],
      'delivery': {
        'type': 'arena',
        'placeName': 'Arena CFC',
        'counter': 'recepção',
      },
      'completedAt': '2026-09-18T20:00:00.000Z',
      ...over,
    });

/// Pedido de casa (sem o passo da retirada).
StoreOrderView _homeOrder({int products = 2}) => _order({
      'status': 'ent',
      'items': [
        _line('viseira', 'Viseira Dry Fit', 'Preta · único'),
        if (products > 1) _line('cami', 'Camiseta Dry', 'Branco · M'),
      ],
      'delivery': {'type': 'casa', 'address': 'Rua T-37, 1240'},
    });

String _pathOf(CheckoutHarness h) =>
    h.router.routerDelegate.currentConfiguration.last.matchedLocation;

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 30));
  }
}

Future<CheckoutHarness> _open(
  WidgetTester tester,
  StoreOrderView order, {
  FakeStoreReviewRepository? reviews,
  String initial = _route,
}) async {
  final h = CheckoutHarness(products: const [kBola, _cami], reviews: reviews);
  await h.pump(tester, initial: initial);
  h.checkout.order(order.id).add(order);
  await _settle(tester);
  return h;
}

VoidCallback? _primary(WidgetTester tester, String key) =>
    tester.widget<StorePrimaryButton>(find.byKey(ValueKey(key))).onPressed;

Future<void> _tap(WidgetTester tester, String key) async {
  await tester.tap(find.byKey(ValueKey(key)));
  await _settle(tester);
}

void main() {
  group('Avaliar compra (08b)', () {
    testWidgets(
      'nota libera o "Próximo item"; pula o 2º; retirada e publicar',
      (tester) async {
        final h = await _open(tester, _order());

        // Passo 1: a viseira (a primeira linha dela).
        expect(find.text('Avaliar compra'), findsOneWidget);
        expect(find.text('#NX-4740 · item 1 de 2'), findsOneWidget);
        expect(find.text('Viseira Dry Fit'), findsOneWidget);
        expect(
          find.text('Preta · único · retirado em 18 set'),
          findsOneWidget,
        );
        expect(find.text('O que achou do produto?'), findsOneWidget);
        // Sem tamanho: "Tamanho certo" fica e o caimento não aparece.
        expect(find.byKey(const ValueKey('store-review-tag-tamanho')),
            findsOneWidget);
        expect(find.text('COMO FICOU O TAMANHO?'), findsNothing);
        expect(_primary(tester, 'store-review-next'), isNull);

        await _tap(tester, 'store-review-star-5');
        expect(find.text('Excelente'), findsOneWidget);
        expect(_primary(tester, 'store-review-next'), isNotNull);
        await _tap(tester, 'store-review-tag-custo');
        await _tap(tester, 'store-review-tag-qualidade');
        await tester.enterText(
          find.byKey(const ValueKey('store-review-comment')),
          '  Leve e seca rápido.  ',
        );
        await _settle(tester);
        expect(find.text('23/500'), findsOneWidget);
        await _tap(tester, 'store-review-anonymous');

        await _tap(tester, 'store-review-next');

        // Passo 2: a camiseta tem tamanho.
        expect(find.text('#NX-4740 · item 2 de 2'), findsOneWidget);
        expect(find.text('Camiseta Dry'), findsOneWidget);
        expect(find.text('COMO FICOU O TAMANHO?'), findsOneWidget);
        expect(find.byKey(const ValueKey('store-review-tag-tamanho')),
            findsNothing);
        expect(_primary(tester, 'store-review-next'), isNull);
        await _tap(tester, 'store-review-fit-grande');
        // Pular não exige nota (e o item sem nota não vai).
        await _tap(tester, 'store-review-skip');

        // Passo 3: a retirada (pedido de arena).
        expect(find.text('#NX-4740 · retirada'), findsOneWidget);
        expect(find.text('Retirada na Arena CFC'), findsOneWidget);
        expect(find.text('Publicar avaliação'), findsOneWidget);
        expect(_primary(tester, 'store-review-publish'), isNotNull);
        await _tap(tester, 'store-review-pickup-star-4');
        expect(find.text('Muito bom'), findsOneWidget);

        await _tap(tester, 'store-review-publish');

        expect(h.reviewService.submitted.single.toMap(), {
          'orderId': 'ord_r',
          'anonymous': true,
          'items': [
            {
              'productId': 'viseira',
              'rating': 5,
              'tags': ['qualidade', 'custo'],
              'fit': null,
              'comment': 'Leve e seca rápido.',
              'photos': <String>[],
            },
          ],
          'pickupRating': 4,
        });

        // 08c: o resumo do que foi avaliado.
        expect(find.byKey(const ValueKey('store-review-thanks')),
            findsOneWidget);
        expect(find.text('Valeu pela avaliação!'), findsOneWidget);
        expect(
          find.text('Ela já aparece na página do produto. A equipe NexaGO '
              'pode esconder avaliações fora das regras.'),
          findsOneWidget,
        );
        expect(find.text('Viseira Dry Fit'), findsOneWidget);
        expect(find.text('Camiseta Dry'), findsNothing);
        expect(find.text('Retirada · Arena CFC'), findsOneWidget);
        expect(
          find.text('Você pode editar em Meus pedidos por 30 dias.'),
          findsOneWidget,
        );

        await _tap(tester, 'store-review-back-to-store');
        expect(_pathOf(h), AppRoutes.store);
      },
    );

    testWidgets('voltar no header volta um passo', (tester) async {
      await _open(tester, _order());
      await _tap(tester, 'store-review-star-3');
      await _tap(tester, 'store-review-next');
      expect(find.text('#NX-4740 · item 2 de 2'), findsOneWidget);

      await tester.tap(find.byTooltip('Voltar'));
      await _settle(tester);
      expect(find.text('#NX-4740 · item 1 de 2'), findsOneWidget);
      // A nota escolhida continua lá.
      expect(find.text('Bom'), findsOneWidget);
    });

    testWidgets('pular no último passo sem nota nenhuma só sai', (
      tester,
    ) async {
      final h = await _open(tester, _homeOrder(products: 1));
      expect(find.text('#NX-4740 · item 1 de 1'), findsOneWidget);
      expect(_primary(tester, 'store-review-publish'), isNull);

      await _tap(tester, 'store-review-skip');
      expect(h.reviewService.submitted, isEmpty);
      expect(_pathOf(h), AppRoutes.storeOrders);
    });

    testWidgets('pular no último passo publica o que já tem nota', (
      tester,
    ) async {
      final h = await _open(tester, _homeOrder());
      await _tap(tester, 'store-review-star-2');
      await _tap(tester, 'store-review-next');
      // Pedido de casa: o último passo é o 2º produto, sem retirada.
      expect(find.text('Publicar avaliação'), findsOneWidget);
      await _tap(tester, 'store-review-skip');

      final s = h.reviewService.submitted.single;
      expect([for (final i in s.items) (i.productId, i.rating)], [
        ('viseira', 2),
      ]);
      expect(s.pickupRating, isNull);
      expect(find.text('Valeu pela avaliação!'), findsOneWidget);
      expect(find.text('Retirada · Arena CFC'), findsNothing);
    });

    testWidgets('edição vem preenchida e regrava o pedido inteiro', (
      tester,
    ) async {
      final reviews = FakeStoreReviewRepository(
        reviews: {
          'ord_r': StoreOrderReview(
            orderId: 'ord_r',
            anonymous: true,
            items: const [
              StoreOrderReviewItem(
                productId: 'viseira',
                rating: 4,
                tags: [StoreReviewTag.conforto],
                comment: 'Bom no sol',
              ),
              StoreOrderReviewItem(
                productId: 'cami',
                rating: 3,
                fit: StoreReviewFit.pequeno,
              ),
            ],
            pickup: const StoreOrderReviewPickup(
              placeName: 'Arena CFC',
              rating: 5,
            ),
            createdAt: DateTime.utc(2026, 10, 1),
            editableUntil: DateTime.utc(2026, 10, 31),
          ),
        },
      );
      final h = await _open(tester, _order(), reviews: reviews);
      h.reviewService.submitImpl = (_) async => StoreReviewSubmitResult(
            created: false,
            editableUntil: DateTime.utc(2026, 10, 31, 12),
          );

      expect(find.text('Editar avaliação'), findsOneWidget);
      expect(find.text('Muito bom'), findsOneWidget);
      expect(find.text('Bom no sol'), findsOneWidget);
      expect(_primary(tester, 'store-review-next'), isNotNull);

      await _tap(tester, 'store-review-star-5');
      await _tap(tester, 'store-review-next');
      expect(find.text('Bom'), findsOneWidget);
      await _tap(tester, 'store-review-next');
      // A retirada já avaliada.
      expect(find.text('Excelente'), findsOneWidget);
      await _tap(tester, 'store-review-publish');

      expect(h.reviewService.submitted.single.toMap(), {
        'orderId': 'ord_r',
        'anonymous': true,
        'items': [
          {
            'productId': 'viseira',
            'rating': 5,
            'tags': ['conforto'],
            'fit': null,
            'comment': 'Bom no sol',
            'photos': <String>[],
          },
          {
            'productId': 'cami',
            'rating': 3,
            'tags': <String>[],
            'fit': 'pequeno',
            'comment': '',
            'photos': <String>[],
          },
        ],
        'pickupRating': 5,
      });
      expect(find.text('Avaliação atualizada'), findsOneWidget);
      expect(
        find.text('Você pode editar em Meus pedidos até 31 out.'),
        findsOneWidget,
      );
    });

    testWidgets('erro da callable aparece e a tela fica', (tester) async {
      final h = await _open(tester, _homeOrder(products: 1));
      h.reviewService.submitImpl = (_) async => throw const StoreReviewException(
            'A avaliação ainda não está disponível. Tente de novo em instantes.',
            code: 'not-found',
          );
      await _tap(tester, 'store-review-star-4');
      await _tap(tester, 'store-review-publish');

      expect(
        find.text('A avaliação ainda não está disponível. Tente de novo em instantes.'),
        findsOneWidget,
      );
      expect(find.byKey(const ValueKey('store-review-thanks')), findsNothing);
      expect(_primary(tester, 'store-review-publish'), isNotNull);
    });

    testWidgets('foto: escolhe, sobe e vai pelo caminho; subindo segura', (
      tester,
    ) async {
      final h = await _open(tester, _homeOrder(products: 1));
      h.reviewService.uploadGate = Completer<void>();
      await _tap(tester, 'store-review-star-5');

      await _tap(tester, 'store-review-add-photo');
      await _tap(tester, 'store-review-source-photos');
      expect(h.photoPicker.picks, [StoreImageSource.photos]);
      expect(h.reviewService.uploads.single.$2, 'image/jpeg');
      // Subindo: publicar espera.
      expect(find.text('Enviando fotos…'), findsOneWidget);
      expect(_primary(tester, 'store-review-publish'), isNull);

      h.reviewService.uploadGate!.complete();
      await _settle(tester);
      expect(find.text('Publicar avaliação'), findsOneWidget);
      await _tap(tester, 'store-review-publish');
      expect(
        h.reviewService.submitted.single.items.single.photos,
        ['store/review-uploads/ana/foto1.jpg'],
      );
    });

    testWidgets('foto em formato recusado não sobe', (tester) async {
      final h = await _open(tester, _homeOrder(products: 1));
      h.photoPicker.bytes =
          Uint8List.fromList([0x47, 0x49, 0x46, 0x38, ...List.filled(20, 0)]);
      await _tap(tester, 'store-review-add-photo');
      await _tap(tester, 'store-review-source-camera');
      expect(h.reviewService.uploads, isEmpty);
      expect(
        find.text('Foto em formato não aceito (use JPG, PNG ou WEBP).'),
        findsOneWidget,
      );
    });

    testWidgets('fora do prazo: só leitura', (tester) async {
      final reviews = FakeStoreReviewRepository(
        reviews: {
          'ord_r': StoreOrderReview(
            orderId: 'ord_r',
            items: const [
              StoreOrderReviewItem(productId: 'viseira', rating: 5),
            ],
            createdAt: DateTime.utc(2026, 9, 1),
            editableUntil: DateTime.utc(2026, 10, 1),
          ),
        },
      );
      await _open(tester, _order(), reviews: reviews);
      expect(find.text('Avaliação encerrada'), findsOneWidget);
      expect(find.byKey(const ValueKey('store-review-next')), findsNothing);
    });

    testWidgets('pedido em andamento não é avaliado', (tester) async {
      await _open(tester, _order({'status': 'sep'}));
      expect(find.text('Ainda não dá pra avaliar'), findsOneWidget);
    });
  });

  group('Entradas da avaliação', () {
    testWidgets('Meus pedidos: Avaliar → Editar avaliação → Avaliado', (
      tester,
    ) async {
      final reviews = FakeStoreReviewRepository();
      final h = CheckoutHarness(products: const [kBola, _cami], reviews: reviews);
      await h.pump(tester, initial: AppRoutes.storeOrders);
      final ent = _homeOrder();
      h.checkout.orders.add([
        ent,
        orderView('ord_sep', {'number': 'NX-9', 'status': 'sep'}),
      ]);
      await _settle(tester);

      final pill = find.byKey(const ValueKey('store-order-review-ord_r'));
      expect(pill, findsOneWidget);
      expect(
        find.descendant(of: pill, matching: find.text('Avaliar')),
        findsOneWidget,
      );
      expect(find.byKey(const ValueKey('store-order-review-ord_sep')),
          findsNothing);
      // "Comprar de novo" continua lá.
      expect(find.text('Comprar de novo'), findsOneWidget);

      reviews.setReview(
        StoreOrderReview(
          orderId: 'ord_r',
          items: const [StoreOrderReviewItem(productId: 'viseira', rating: 5)],
          createdAt: DateTime.utc(2026, 10, 10),
          editableUntil: DateTime.utc(2026, 11, 9),
        ),
      );
      await _settle(tester);
      expect(
        find.descendant(of: pill, matching: find.text('Editar avaliação')),
        findsOneWidget,
      );

      reviews.setReview(
        StoreOrderReview(
          orderId: 'ord_r',
          items: const [StoreOrderReviewItem(productId: 'viseira', rating: 5)],
          createdAt: DateTime.utc(2026, 9, 1),
          editableUntil: DateTime.utc(2026, 10, 1),
        ),
      );
      await _settle(tester);
      expect(
        find.descendant(of: pill, matching: find.text('Avaliado')),
        findsOneWidget,
      );
      expect(
        tester.widget<StoreSoftButton>(pill).onPressed,
        isNull,
      );
    });

    testWidgets('Meus pedidos: "Avaliar" abre o 08b', (tester) async {
      final h = CheckoutHarness(products: const [kBola, _cami]);
      await h.pump(tester, initial: AppRoutes.storeOrders);
      h.checkout.orders.add([_homeOrder()]);
      await _settle(tester);

      await tester.tap(find.byKey(const ValueKey('store-order-review-ord_r')));
      await _settle(tester);
      expect(_pathOf(h), _route);
      h.checkout.order('ord_r').add(_homeOrder());
      await _settle(tester);
      expect(find.text('#NX-4740 · item 1 de 2'), findsOneWidget);
    });

    testWidgets('pedido entregue: "Avaliar compra"; avaliado: "Editar"', (
      tester,
    ) async {
      final reviews = FakeStoreReviewRepository();
      final h = await _open(
        tester,
        _homeOrder(),
        reviews: reviews,
        initial: '/loja/pedidos/ord_r',
      );
      final button = find.byKey(const ValueKey('store-order-review'));
      expect(button, findsOneWidget);
      expect(
        find.descendant(of: button, matching: find.text('Avaliar compra')),
        findsOneWidget,
      );
      expect(find.byKey(const ValueKey('store-order-rebuy')), findsOneWidget);

      reviews.setReview(
        StoreOrderReview(
          orderId: 'ord_r',
          items: const [StoreOrderReviewItem(productId: 'viseira', rating: 5)],
          createdAt: DateTime.utc(2026, 10, 10),
          editableUntil: DateTime.utc(2026, 11, 9),
        ),
      );
      await _settle(tester);
      expect(
        find.descendant(of: button, matching: find.text('Editar avaliação')),
        findsOneWidget,
      );

      await tester.tap(button);
      await _settle(tester);
      expect(_pathOf(h), _route);
    });
  });
}
