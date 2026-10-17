import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/store/domain/store_checkout_models.dart';
import 'package:nexago_app/features/store/domain/store_checkout_rules.dart';
import 'package:nexago_app/features/store/domain/store_models.dart';

/// Os mesmos casos de `store-checkout-model.spec.ts` (portal): mesmas
/// entradas, mesmas strings.
StoreAddress _addr(
  String id, {
  bool main = false,
  String number = '1240',
}) =>
    StoreAddress(
      id: id,
      label: 'Casa',
      recipient: 'Ana',
      phone: '62998124471',
      zip: '74210130',
      street: 'Rua T-37',
      number: number,
      complement: 'Ap 802',
      district: 'Setor Bueno',
      city: 'Goiânia',
      uf: 'GO',
      main: main,
    );

void main() {
  group('carrinho', () {
    test('chave da linha: lineId da personalizada, senão produto/SKU', () {
      expect(
        storeCartLineKey(
          const StoreCartItem(productId: 'p', skuId: 's', qty: 1),
        ),
        'p/s',
      );
      expect(
        storeCartLineKey(
          const StoreCartItem(productId: 'p', skuId: 's', qty: 1, lineId: 'L1'),
        ),
        'L1',
      );
    });

    test('mudar a quantidade preserva as outras linhas inteiras', () {
      const custom = StoreCartItem(
        productId: 'cami',
        skuId: 'm',
        qty: 1,
        lineId: 'L1',
        customization: {'name': 'ANTUNES', 'extraPriceCents': 1490},
      );
      const bola = StoreCartItem(productId: 'bola', skuId: 'unico', qty: 1);
      final next = storeCartWithLineQty([custom, bola], 'bola/unico', 3);
      expect(next.map((i) => i.qty), [1, 3]);
      expect(next.first.lineId, 'L1');
      expect(next.first.customization,
          {'name': 'ANTUNES', 'extraPriceCents': 1490});
      // A própria linha personalizada também leva lineId e customization.
      final custom2 = storeCartWithLineQty([custom, bola], 'L1', 2).first;
      expect(custom2.qty, 2);
      expect(custom2.lineId, 'L1');
      expect(custom2.customization?['name'], 'ANTUNES');
    });

    test('0 remove a linha e o teto da compra é 10', () {
      const bola = StoreCartItem(productId: 'bola', skuId: 'unico', qty: 1);
      expect(storeCartWithLineQty([bola], 'bola/unico', 0), isEmpty);
      expect(storeCartWithLineQty([bola], 'bola/unico', 40).single.qty, 10);
      expect(storeCartWithLineQty([bola], 'outra/x', 2).single.qty, 1);
    });
  });

  group('cotação', () {
    test('lê a cotação e descarta problema que não conhece', () {
      final q = storeQuoteFromMap({
        'lines': [
          {'key': 'p/s', 'qty': 2, 'totalCents': 1000, 'problem': 'esgotado'},
          {'key': 'x', 'problem': 'outro'},
        ],
        'subtotalCents': 1000,
        'coupon': {'code': 'NEXA10', 'discountCents': 100, 'problem': null},
        'totalCents': 900,
        'problems': ['linha_com_problema', 'inventado'],
      })!;
      expect(
          q.lines.map((l) => l.problem), [StoreQuoteLineProblem.soldOut, null]);
      expect(q.problems, [StoreQuoteProblem.lineProblem]);
      expect(storeAppliedCoupon(q)?.code, 'NEXA10');
      expect(storeQuoteFromMap({'foo': 1}), isNull);
      expect(storeQuoteFromMap(null), isNull);
    });

    test('o motivo do Pagar travado segue a ordem que o atleta resolve', () {
      final q = storeQuoteFromMap({
        'lines': [],
        'problems': ['entrega_faltando', 'linha_com_problema'],
      })!;
      expect(storeQuoteBlocker(q), 'Revise os itens marcados no carrinho.');
      expect(storeQuoteBlocker(q.copyWith(problems: const [])), isNull);
      expect(
        storeAppliedCoupon(
          q.copyWith(
            coupon: const StoreQuoteCoupon(
              code: 'X',
              problem: 'minimo',
              message: 'm',
            ),
          ),
        ),
        isNull,
      );
      expect(
        storeQuoteBlocker(
          q.copyWith(problems: const [StoreQuoteProblem.deliveryMissing]),
        ),
        'Escolha como receber.',
      );
    });

    test('rótulos das linhas com problema iguais aos do portal', () {
      expect(
        StoreQuoteLineProblem.unavailable.label,
        'Saiu da loja — remova pra seguir',
      );
      expect(
          StoreQuoteLineProblem.soldOut.label, 'Sem estoque nessa quantidade');
      expect(StoreQuoteLineProblem.noPickup.label,
          'Não sai pra retirada na arena');
      expect(StoreQuoteLineProblem.noDelivery.label, 'Não tem entrega em casa');
      expect(
        StoreQuoteLineProblem.customizationOff.label,
        'Essa personalização não vale mais — remova e refaça',
      );
    });

    test('pedido do cliente vira o mapa da callable', () {
      const req = StoreCheckoutRequest(
        channel: kStoreChannelIos,
        delivery: StoreHomeDelivery(addressId: 'a1', modeId: 'expressa'),
        couponCode: 'VERAO',
      );
      expect(req.toMap(), {
        'channel': 'app_ios',
        'delivery': {'type': 'casa', 'addressId': 'a1', 'modeId': 'expressa'},
        'couponCode': 'VERAO',
      });
      expect(
        const StoreCheckoutRequest(channel: kStoreChannelAndroid).toMap(),
        {'channel': 'app_android', 'delivery': null, 'couponCode': null},
      );
    });
  });

  group('erros do checkout', () {
    test('CPF faltando pede o CPF', () {
      final e = storeCheckoutErrorOf(
        code: 'failed-precondition',
        message: 'Informe seu CPF para pagar com Pix.',
        details: {'reason': 'cpf_required'},
      );
      expect(e.kind, StoreCheckoutErrorKind.cpf);
      expect(e.message, 'Informe seu CPF para pagar com Pix.');
    });

    test('total mudou e carrinho com problema trazem a cotação nova', () {
      final quote = {
        'lines': [
          {'key': 'bola/unico', 'qty': 1, 'totalCents': 17000},
        ],
        'totalCents': 17000,
      };
      final changed = storeCheckoutErrorOf(
        code: 'aborted',
        message: 'Os valores do carrinho mudaram. Confira o novo total.',
        details: {'quote': quote},
      );
      expect(changed.kind, StoreCheckoutErrorKind.changed);
      expect(changed.quote?.totalCents, 17000);
      final blocked = storeCheckoutErrorOf(
        code: 'failed-precondition',
        message: 'Revise o carrinho antes de pagar.',
        details: {
          'problems': ['linha_com_problema'],
          'quote': quote,
        },
      );
      expect(blocked.kind, StoreCheckoutErrorKind.blocked);
      expect(blocked.quote, isNotNull);
    });

    test('callable não deployada, sessão e erro cru', () {
      expect(
        storeCheckoutErrorOf(code: 'not-found', message: 'NOT FOUND').message,
        'O checkout ainda não está disponível. Tente de novo em instantes.',
      );
      expect(
        storeCheckoutErrorOf(code: 'unauthenticated').kind,
        StoreCheckoutErrorKind.session,
      );
      final raw = storeCheckoutErrorOf(code: 'internal', message: 'INTERNAL');
      expect(raw.message,
          'Não deu pra fechar o pedido. Tente de novo em instantes.');
      expect(
        storeQuoteErrorMessage(raw),
        'Não deu pra calcular o total. Tente de novo em instantes.',
      );
    });

    test('CPF com máscara enquanto digita', () {
      expect(formatStoreCpf('123'), '123');
      expect(formatStoreCpf('1234'), '123.4');
      expect(formatStoreCpf('1234567'), '123.456.7');
      expect(formatStoreCpf('1234567890'), '123.456.789-0');
      expect(formatStoreCpf('123.456.789-09'), '123.456.789-09');
      expect(formatStoreCpf('123456789091234'), '123.456.789-09');
    });
  });

  group('endereços', () {
    test('o primeiro nasce principal; marcar outro tira a marca do anterior',
        () {
      final one = upsertStoreAddress([], _addr('a'), makeMain: false)!;
      expect(one.map((a) => a.main), [true]);
      final two = upsertStoreAddress(one, _addr('b'), makeMain: false)!;
      expect(two.map((a) => a.main), [true, false]);
      final swapped = upsertStoreAddress(two, _addr('b'), makeMain: true)!;
      expect(swapped.map((a) => a.main), [false, true]);
      expect(defaultStoreAddressId(swapped), 'b');
      expect(defaultStoreAddressId(const []), isNull);
    });

    test('teto de 10; editar no teto continua valendo', () {
      final full = [
        for (var i = 0; i < kStoreMaxAddresses; i++) _addr('a$i', main: i == 0),
      ];
      expect(upsertStoreAddress(full, _addr('novo'), makeMain: false), isNull);
      expect(
        upsertStoreAddress(full, _addr('a3', number: '9'), makeMain: false)![3]
            .number,
        '9',
      );
    });

    test('excluir o principal promove o primeiro que sobrou', () {
      final list = [_addr('a', main: true), _addr('b')];
      expect(removeStoreAddress(list, 'a'), [_addr('b', main: true)]);
    });

    test('doc ↔ lista: descarta lixo e só grava `main` no principal', () {
      expect(
        storeAddressesFromMap({
          'items': [
            storeAddressToMap(_addr('a')),
            {'id': 'x', 'street': '', 'city': 'X', 'uf': 'GO'},
            'lixo',
          ],
        }),
        [_addr('a')],
      );
      expect(storeAddressToMap(_addr('a')).containsKey('main'), isFalse);
      expect(storeAddressToMap(_addr('a', main: true))['main'], isTrue);
      expect(storeAddressToMap(_addr('a')).keys.toSet(), {
        'id',
        'label',
        'recipient',
        'phone',
        'zip',
        'street',
        'number',
        'complement',
        'district',
        'city',
        'uf',
      });
    });

    test('formata linha, CEP e celular', () {
      expect(storeAddressLine(_addr('a')), 'Rua T-37, 1240 · Ap 802');
      expect(storeAddressArea(_addr('a')), 'Setor Bueno · Goiânia, GO');
      expect(formatStoreCep('74210130'), '74210-130');
      expect(formatStoreCep('742'), '742');
      expect(formatStorePhone('62998124471'), '(62) 99812-4471');
      expect(formatStorePhone('6232410000'), '(62) 3241-0000');
      expect(formatStorePhone('6'), '(6');
      expect(formatStorePhone(''), '');
    });

    test('rascunho: confere campo a campo e normaliza ao salvar', () {
      expect(
        storeAddressDraftErrors(StoreAddressDraft.empty).keys.toSet(),
        {
          StoreAddressField.city,
          StoreAddressField.district,
          StoreAddressField.number,
          StoreAddressField.phone,
          StoreAddressField.recipient,
          StoreAddressField.street,
          StoreAddressField.uf,
          StoreAddressField.zip,
        },
      );
      expect(
        storeAddressDraftErrors(
            StoreAddressDraft.empty)[StoreAddressField.number],
        'Informe o número (ou S/N)',
      );
      const ok = StoreAddressDraft(
        zip: '74210-130',
        street: 'Rua T-37',
        number: 'S/N',
        district: 'Bueno',
        city: 'Goiânia',
        uf: 'go',
        recipient: 'Ana',
        phone: '(62) 99812-4471',
      );
      expect(storeAddressDraftErrors(ok), isEmpty);
      final saved = storeAddressFromDraft(ok, id: 'id1', main: true);
      expect(saved.zip, '74210130');
      expect(saved.uf, 'GO');
      expect(saved.phone, '62998124471');
      expect(saved.label, 'Casa');
      expect(saved.main, isTrue);
    });

    test('ViaCEP: CEP inexistente vira null; CEP geral vem sem rua', () {
      expect(storeViaCepFromMap({'erro': 'true'}), isNull);
      expect(storeViaCepFromMap({'erro': true}), isNull);
      expect(
        storeViaCepFromMap({
          'cep': '75380-000',
          'localidade': 'Trindade',
          'uf': 'go',
          'logradouro': '',
        }),
        const StoreViaCepAddress(
          cep: '75380000',
          city: 'Trindade',
          uf: 'GO',
        ),
      );
    });
  });
}
