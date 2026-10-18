import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/store/domain/store_checkout_models.dart';
import 'package:nexago_app/features/store/domain/store_checkout_rules.dart';
import 'package:nexago_app/features/store/domain/store_models.dart';

import 'store_checkout_test_kit.dart';

Finder _pay() => find.byKey(const ValueKey('store-cart-pay'));

bool _payEnabled(WidgetTester tester) {
  final button = tester.widget<FilledButton>(
    find.descendant(of: _pay(), matching: find.byType(FilledButton)),
  );
  return button.onPressed != null;
}

String _total(WidgetTester tester) =>
    tester.widget<Text>(find.byKey(const ValueKey('store-cart-total'))).data!;

String? _hint(WidgetTester tester) {
  final f = find.byKey(const ValueKey('store-cart-hint'));
  return f.evaluate().isEmpty ? null : tester.widget<Text>(f).data;
}

Future<void> _tapTooltip(WidgetTester tester, String tooltip) async {
  await tester.tap(find.byTooltip(tooltip));
  await tester.pump();
}

void main() {
  testWidgets('carrinho vazio convida pra vitrine e não cota', (tester) async {
    final h = CheckoutHarness(cart: const []);
    await h.pump(tester);
    await CheckoutHarness.settleQuote(tester);

    expect(find.text('Seu carrinho está vazio'), findsOneWidget);
    expect(find.text('Ver a loja'), findsOneWidget);
    expect(find.text('Meus pedidos'), findsOneWidget);
    expect(h.service.quotes, isEmpty);
  });

  testWidgets('cota com retirada na arena e mostra o resumo do servidor', (
    tester,
  ) async {
    final h = CheckoutHarness();
    await h.pump(tester);
    await CheckoutHarness.settleQuote(tester);

    expect(h.service.quotes.last.toMap(), {
      'channel': 'app_ios',
      'delivery': {'type': 'arena', 'arenaId': 'a1'},
      'couponCode': null,
    });
    expect(find.text('Bola Pro Beach'), findsOneWidget);
    expect(find.text('Arena Errejota'), findsOneWidget);
    expect(find.text('Pix'), findsOneWidget);
    expect(find.text('· 5% off'), findsOneWidget);
    expect(_total(tester), brl(18040));
    expect(find.text('− ${brl(950)}'), findsOneWidget);
    expect(_payEnabled(tester), isTrue);
    expect(h.analytics.logged(#logStoreCartView, {#units: 1}), isTrue);
  });

  testWidgets('quantidade e remover gravam a linha pela chave e re-cotam', (
    tester,
  ) async {
    final h = CheckoutHarness();
    h.service.quoteImpl = (req) =>
        quoteFor(req, qty: h.store.cart.isEmpty ? 1 : h.store.cart.first.qty);
    await h.pump(tester);
    await CheckoutHarness.settleQuote(tester);
    final before = h.service.quotes.length;

    await _tapTooltip(tester, 'Aumentar');
    await CheckoutHarness.settleQuote(tester);
    expect(h.checkout.qtyCalls, [('bola/unico', 2)]);
    expect(h.service.quotes.length, greaterThan(before));
    // Cotação em dia: o preço da linha vem do servidor.
    expect(find.text(brl(37980)), findsWidgets);

    await _tapTooltip(tester, 'Diminuir');
    await CheckoutHarness.settleQuote(tester);
    await _tapTooltip(tester, 'Remover Bola Pro Beach');
    await CheckoutHarness.settleQuote(tester);

    expect(h.checkout.qtyCalls, [
      ('bola/unico', 2),
      ('bola/unico', 1),
      ('bola/unico', 0),
    ]);
    expect(
        h.analytics.logged(#logStoreCartRemove, {#line: 'bola/unico'}), isTrue);
    expect(find.text('Seu carrinho está vazio'), findsOneWidget);
  });

  testWidgets('a quantidade não passa do saldo do SKU', (tester) async {
    final h = CheckoutHarness(
      cart: const [StoreCartItem(productId: 'bola', skuId: 'unico', qty: 3)],
    );
    await h.pump(tester);
    await CheckoutHarness.settleQuote(tester);

    await _tapTooltip(tester, 'Aumentar');
    expect(h.checkout.qtyCalls, isEmpty);
  });

  testWidgets('linha com problema aparece marcada e trava o Pagar', (
    tester,
  ) async {
    final h = CheckoutHarness();
    h.service.quoteImpl = (req) => quoteFor(
          req,
          over: {
            'lines': [
              {
                'key': 'bola/unico',
                'productId': 'bola',
                'skuId': 'unico',
                'qty': 1,
                'name': 'Bola Pro Beach',
                'totalCents': 18990,
                'problem': 'esgotado',
              },
            ],
            'problems': ['linha_com_problema'],
          },
        );
    await h.pump(tester);
    await CheckoutHarness.settleQuote(tester);

    expect(find.text('Sem estoque nessa quantidade'), findsOneWidget);
    expect(_payEnabled(tester), isFalse);
    expect(_hint(tester), 'Revise os itens marcados no carrinho.');
  });

  testWidgets('cupom com erro trava até remover; remover cota sem ele', (
    tester,
  ) async {
    final h = CheckoutHarness();
    h.service.quoteImpl = (req) => quoteFor(
          req,
          over: {
            'coupon': req.couponCode == null
                ? null
                : {
                    'code': req.couponCode,
                    'discountCents': 0,
                    'problem': 'minimo',
                    'message': 'Pedido mínimo de R\$ 200,00 pra esse cupom.',
                  },
          },
        );
    await h.pump(tester);
    await CheckoutHarness.settleQuote(tester);

    await tester.enterText(
      find.byKey(const ValueKey('store-cart-coupon-field')),
      'verao',
    );
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('store-cart-coupon-apply')));
    await CheckoutHarness.settleQuote(tester);

    expect(h.service.quotes.last.couponCode, 'VERAO');
    expect(find.text('Pedido mínimo de R\$ 200,00 pra esse cupom.'),
        findsOneWidget);
    expect(_payEnabled(tester), isFalse);
    expect(_hint(tester), 'Remova ou troque o cupom pra seguir.');
    expect(h.analytics.logged(#logStoreCouponApply, {#code: 'VERAO'}), isTrue);

    await tester.tap(find.byKey(const ValueKey('store-cart-coupon-remove')));
    await CheckoutHarness.settleQuote(tester);

    expect(h.service.quotes.last.couponCode, isNull);
    expect(
        find.byKey(const ValueKey('store-cart-coupon-field')), findsOneWidget);
    expect(_payEnabled(tester), isTrue);
  });

  testWidgets('código que o servidor nem devolveu ainda tem "Remover"', (
    tester,
  ) async {
    final h = CheckoutHarness();
    // Cotação sem cupom nenhum, mesmo com código aplicado.
    h.service.quoteImpl = (req) => quoteFor(req);
    await h.pump(tester);
    await CheckoutHarness.settleQuote(tester);

    await tester.enterText(
      find.byKey(const ValueKey('store-cart-coupon-field')),
      'XYZ',
    );
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('store-cart-coupon-apply')));
    await CheckoutHarness.settleQuote(tester);

    expect(
        find.byKey(const ValueKey('store-cart-coupon-remove')), findsOneWidget);
    expect(find.text('Cupom inválido.'), findsOneWidget);
    expect(_payEnabled(tester), isFalse);
  });

  testWidgets('pagar manda o total mostrado e abre o Pix do pedido', (
    tester,
  ) async {
    final h = CheckoutHarness();
    await h.pump(tester);
    await CheckoutHarness.settleQuote(tester);

    await tester.tap(_pay());
    await tester.pump();
    await tester.pump();

    final (req, expected, cpf) = h.service.creates.single;
    expect(req.toMap(), {
      'channel': 'app_ios',
      'delivery': {'type': 'arena', 'arenaId': 'a1'},
      'couponCode': null,
    });
    expect(expected, 18040);
    expect(cpf, isNull);
    expect(
      h.analytics.logged(#logStoreCheckoutPay, {
        #totalCents: 18040,
        #delivery: 'arena',
      }),
      isTrue,
    );
    expect(
      h.router.routerDelegate.currentConfiguration.uri.path,
      '/loja/pedidos/ord_pedido_1',
    );
    // O Pix veio pelo extra, antes do espelho existir.
    await tester.pump(const Duration(milliseconds: 600));
    expect(find.text('Pague com Pix'), findsOneWidget);
    expect(
      tester.widget<Text>(find.byKey(const ValueKey('store-pix-amount'))).data,
      brl(18040),
    );
    expect(find.byKey(const ValueKey('store-cart-pay')), findsNothing);
  });

  testWidgets('sem CPF no cadastro: pede o CPF e reenvia com ele', (
    tester,
  ) async {
    final h = CheckoutHarness();
    h.service.createImpl =
        (req, expected, cpf) async => throw storeCheckoutErrorOf(
              code: 'failed-precondition',
              message: 'Informe seu CPF para pagar com Pix.',
              details: {'reason': 'cpf_required'},
            );
    await h.pump(tester);
    await CheckoutHarness.settleQuote(tester);

    await tester.tap(_pay());
    await tester.pump();
    await tester.pump();

    expect(find.text('Informe seu CPF para pagar com Pix.'), findsOneWidget);
    final cpfField = find.byKey(const ValueKey('store-cart-cpf'));
    expect(cpfField, findsOneWidget);

    // CPF incompleto não sai.
    await tester.enterText(cpfField, '1234');
    await tester.pump();
    await tester.tap(_pay());
    await tester.pump();
    expect(find.text('CPF com 11 números.'), findsOneWidget);
    expect(h.service.creates, hasLength(1));

    await tester.enterText(cpfField, '12345678909');
    await tester.pump();
    expect(find.text('123.456.789-09'), findsOneWidget);
    h.service.createImpl = (req, expected, cpf) async => StoreCreatedOrder(
          orderId: 'ord_pedido_2',
          number: 'NX-0002',
          totalCents: expected,
          pix: StoreOrderPix(
            copyPaste: 'y' * 40,
            expiresAt: kTestNow.add(const Duration(minutes: 30)),
          ),
        );
    await tester.tap(_pay());
    await tester.pump();
    await tester.pump();

    expect(h.service.creates.last.$3, '12345678909');
  });

  testWidgets('total mudou no servidor: troca pela cotação nova e avisa', (
    tester,
  ) async {
    final h = CheckoutHarness();
    h.service.createImpl =
        (req, expected, cpf) async => throw storeCheckoutErrorOf(
              code: 'aborted',
              message: 'Os valores do carrinho mudaram. Confira o novo total.',
              details: {
                'quote': {
                  'lines': [
                    {'key': 'bola/unico', 'qty': 1, 'totalCents': 17890},
                  ],
                  'subtotalCents': 17890,
                  'totalCents': 17000,
                },
              },
            );
    await h.pump(tester);
    await CheckoutHarness.settleQuote(tester);

    await tester.tap(_pay());
    await tester.pump();
    await tester.pump();

    expect(_total(tester), brl(17000));
    expect(
      find.text('O total mudou · confira o novo valor antes de pagar.'),
      findsOneWidget,
    );
    expect(_payEnabled(tester), isTrue);
  });

  testWidgets('estoque acabou na reserva: marca a linha e mostra a mensagem', (
    tester,
  ) async {
    final h = CheckoutHarness();
    h.service.createImpl =
        (req, expected, cpf) async => throw storeCheckoutErrorOf(
              code: 'failed-precondition',
              message: 'Revise o carrinho antes de pagar.',
              details: {
                'problems': ['linha_com_problema'],
                'quote': {
                  'lines': [
                    {
                      'key': 'bola/unico',
                      'qty': 1,
                      'totalCents': 18990,
                      'problem': 'esgotado',
                    },
                  ],
                  'totalCents': 18040,
                  'problems': ['linha_com_problema'],
                },
              },
            );
    await h.pump(tester);
    await CheckoutHarness.settleQuote(tester);

    await tester.tap(_pay());
    await tester.pump();
    await tester.pump();

    expect(find.text('Sem estoque nessa quantidade'), findsOneWidget);
    expect(find.text('Revise o carrinho antes de pagar.'), findsOneWidget);
    expect(_payEnabled(tester), isFalse);
  });

  testWidgets(
      'entregar sem endereço pede o cadastro; o novo endereço nasce '
      'principal e a cotação vai com ele', (tester) async {
    final h = CheckoutHarness();
    await h.pump(tester);
    await CheckoutHarness.settleQuote(tester);

    await tester.tap(find.byKey(const ValueKey('store-segment-casa')));
    await CheckoutHarness.settleQuote(tester);
    expect(_hint(tester), 'Cadastre um endereço de entrega.');
    expect(find.text('Total com frete'), findsOneWidget);
    expect(find.text('Expressa'), findsWidgets);
    expect(
        h.analytics.logged(#logStoreDeliverySelect, {#type: 'casa'}), isTrue);

    await tester.tap(find.byKey(const ValueKey('store-cart-first-address')));
    await tester.pump();
    await tester.pump();

    // 05 Novo endereço: "Quem recebe" já vem com o nome; sem "Tornar
    // principal" (o primeiro nasce principal).
    expect(find.text('Novo endereço'), findsOneWidget);
    expect(find.text('Ana Souza'), findsOneWidget);
    expect(find.byKey(const ValueKey('store-address-make-main')), findsNothing);

    Finder field(String name) => find.descendant(
          of: find.byKey(ValueKey('store-address-field-$name')),
          matching: find.byType(TextField),
        );
    await tester.enterText(field('zip'), '74210130');
    await tester.pump();
    await tester.pump();
    expect(find.text('74210-130'), findsOneWidget);
    expect(find.text('Rua T-37'), findsOneWidget);
    expect(find.text('Setor Bueno'), findsOneWidget);
    expect(find.text('GO'), findsOneWidget);

    // Sem número nem celular, não salva.
    await tester.tap(find.byKey(const ValueKey('store-address-save')));
    await tester.pump();
    expect(find.text('Informe o número (ou S/N)'), findsOneWidget);
    expect(find.text('Celular com DDD'), findsOneWidget);
    expect(h.checkout.saved, isEmpty);

    await tester.enterText(field('number'), '1240');
    await tester.enterText(field('phone'), '62998124471');
    await tester.pump();
    expect(find.text('(62) 99812-4471'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('store-address-save')));
    await tester.pump();
    await tester.pump();
    await tester.pump();

    final saved = h.checkout.saved.single.single;
    expect(saved.main, isTrue);
    expect(storeAddressToMap(saved), {
      'id': saved.id,
      'label': 'Casa',
      'recipient': 'Ana Souza',
      'phone': '62998124471',
      'zip': '74210130',
      'street': 'Rua T-37',
      'number': '1240',
      'complement': '',
      'district': 'Setor Bueno',
      'city': 'Goiânia',
      'uf': 'GO',
      'main': true,
    });
    expect(h.analytics.logged(#logStoreAddressSave, {#isNew: true}), isTrue);

    // De volta no carrinho, já escolhido e cotado com ele.
    await CheckoutHarness.settleQuote(tester);
    expect(find.text('Carrinho'), findsOneWidget);
    expect(find.text('PRINCIPAL'), findsOneWidget);
    expect(h.service.quotes.last.toMap()['delivery'], {
      'type': 'casa',
      'addressId': saved.id,
      'modeId': 'expressa',
    });
    expect(_total(tester), brl(21530));
    expect(find.text('Faltam ${brl(20910)} pro frete grátis.'), findsOneWidget);
  });

  testWidgets('endereço salvo abre escolhido e entra na cotação', (
    tester,
  ) async {
    const casa = StoreAddress(
      id: 'casa',
      label: 'Casa',
      recipient: 'Ana',
      phone: '62998124471',
      zip: '74210130',
      street: 'Rua T-37',
      number: '1240',
      district: 'Setor Bueno',
      city: 'Goiânia',
      uf: 'GO',
    );
    const trabalho = StoreAddress(
      id: 'trab',
      label: 'Trabalho',
      zip: '74160010',
      street: 'Av. 85',
      number: '2715',
      district: 'Setor Marista',
      city: 'Goiânia',
      uf: 'GO',
      main: true,
    );
    final h = CheckoutHarness(addresses: const [casa, trabalho]);
    await h.pump(tester);
    await CheckoutHarness.settleQuote(tester);

    await tester.tap(find.byKey(const ValueKey('store-segment-casa')));
    await CheckoutHarness.settleQuote(tester);
    // O principal abre escolhido.
    expect(h.service.quotes.last.delivery?.key, 'casa:trab:expressa');
    expect(find.text('Av. 85, 2715'), findsOneWidget);
    expect(
        find.text('Setor Marista · Goiânia, GO · 74160-010'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('store-address-casa')));
    await CheckoutHarness.settleQuote(tester);
    expect(h.service.quotes.last.delivery?.key, 'casa:casa:expressa');
    expect(_payEnabled(tester), isTrue);
  });
}
