import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/features/store/domain/store_favorites_rules.dart';
import 'package:nexago_app/features/store/domain/store_models.dart';

// Mesmas regras de `store-favorites-model.ts` (portal): o contrato é um só
// (`docs/business-rules/loja-favoritos.md`).

StoreVariant _v(
  String id, {
  int price = 12990,
  int stock = 10,
  bool low = false,
  Map<String, String> values = const {},
}) {
  return StoreVariant(
    id: id,
    values: values,
    priceCents: price,
    inStock: stock > 0,
    maxQty: stock < kStoreMaxQtyPerItem ? stock : kStoreMaxQtyPerItem,
    lowStock: low,
  );
}

StoreProduct _p(
  String id, {
  int price = 12990,
  int? maxPrice,
  int? compareAt,
  bool soldOut = false,
  List<StoreVariant>? variants,
  List<StoreAxis> axes = const [],
  StoreCustomization? customization,
}) {
  return StoreProduct(
    id: id,
    name: 'Produto $id',
    priceCents: price,
    compareAtPriceCents: compareAt,
    minPriceCents: price,
    maxPriceCents: maxPrice ?? price,
    soldOut: soldOut,
    axes: axes,
    variants: variants ?? [_v('unico', price: price, stock: soldOut ? 0 : 10)],
    customizable: customization != null,
    customization: customization,
  );
}

const _tam = StoreAxis(
  id: 'tam',
  label: 'Tamanho',
  values: [
    StoreAxisValue(id: 'p', label: 'P'),
    StoreAxisValue(id: 'm', label: 'M'),
  ],
);

const _withName = StoreCustomization(
  name: StoreCustomNameOptions(enabled: true),
);

const _withImage = StoreCustomization(
  image: StoreCustomImageOptions(enabled: true),
);

void main() {
  group('ordem', () {
    final a = _p('a');
    final b = _p('b');
    final c = _p('c');

    test('último favoritado primeiro (inverso do array)', () {
      expect(
        orderedStoreFavorites(['a', 'b', 'c'], [a, b, c]).map((p) => p.id),
        ['c', 'b', 'a'],
      );
    });

    test('favorito fora do catálogo do canal fica de fora', () {
      expect(
        orderedStoreFavorites(['a', 'sumiu', 'c'], [a, b, c]).map((p) => p.id),
        ['c', 'a'],
      );
      expect(orderedStoreFavorites(['sumiu'], [a]), isEmpty);
      expect(orderedStoreFavorites(const [], [a]), isEmpty);
    });

    test('id repetido conta uma vez, na posição mais recente', () {
      expect(
        orderedStoreFavorites(['a', 'b', 'a'], [a, b]).map((p) => p.id),
        ['a', 'b'],
      );
    });
  });

  group('selo', () {
    test('esgotado manda, mesmo com desconto', () {
      final p = _p('x', price: 19990, compareAt: 21990, soldOut: true);
      expect(
        storeFavoriteBadge(p),
        const StoreFavoriteBadge(StoreFavoriteBadgeKind.soldOut, 'Esgotado'),
      );
    });

    test('desconto: "−R\$ X" com X = de − por, redondo sem centavos', () {
      final p = _p('x', price: 19990, compareAt: 21990);
      expect(storeFavoriteDiscountCents(p), 2000);
      final badge = storeFavoriteBadge(p)!;
      expect(badge.kind, StoreFavoriteBadgeKind.discount);
      expect(badge.label, '−${formatBRLWhole(20)}');
      expect(badge.label, isNot(contains(',')));
    });

    test('desconto com centavos vai completo', () {
      final p = _p('x', price: 19940, compareAt: 21990);
      expect(storeFavoriteBadge(p)!.label, '−${formatBRLFromCents(2050)}');
      expect(storeDiscountAmountLabel(2050), contains('20,50'));
      expect(storeDiscountAmountLabel(2000), formatBRLWhole(20));
      expect(storeDiscountAmountLabel(123400), formatBRLWhole(1234));
    });

    test('sem desconto quando o preço varia (não há "de" riscado)', () {
      final p = _p('x', price: 12990, maxPrice: 14990, compareAt: 15990);
      expect(storeFavoriteDiscountCents(p), 0);
      expect(storeFavoriteBadge(p), isNull);
    });

    test('desconto ganha das últimas unidades', () {
      final p = _p(
        'x',
        price: 8990,
        compareAt: 10990,
        variants: [_v('unico', price: 8990, stock: 2, low: true)],
      );
      expect(storeFavoriteBadge(p)!.kind, StoreFavoriteBadgeKind.discount);
    });

    test('últimas N: todos os SKUs com saldo em lowStock, N = soma', () {
      final p = _p(
        'x',
        axes: const [_tam],
        variants: [
          _v('p', stock: 2, low: true),
          _v('m', stock: 1, low: true),
          _v('g', stock: 0),
        ],
      );
      expect(storeLastUnits(p), 3);
      expect(
        storeFavoriteBadge(p),
        const StoreFavoriteBadge(
          StoreFavoriteBadgeKind.lastUnits,
          'Últimas 3',
        ),
      );
    });

    test('N no teto exposto (10+) vira só "Últimas unidades"', () {
      final p = _p(
        'x',
        axes: const [_tam],
        variants: [
          _v('p', stock: 6, low: true),
          _v('m', stock: 4, low: true),
        ],
      );
      expect(storeLastUnits(p), 10);
      expect(storeFavoriteBadge(p)!.label, 'Últimas unidades');
    });

    test('um SKU com saldo fora do lowStock: sem selo', () {
      final p = _p(
        'x',
        axes: const [_tam],
        variants: [
          _v('p', stock: 2, low: true),
          _v('m', stock: 8),
        ],
      );
      expect(storeLastUnits(p), isNull);
      expect(storeFavoriteBadge(p), isNull);
    });

    test('tag "Personalizável" só com nome ou imagem ligados', () {
      expect(
          storeFavoriteCustomizable(_p('a', customization: _withName)), isTrue);
      expect(storeFavoriteCustomizable(_p('b', customization: _withImage)),
          isTrue);
      expect(
        storeFavoriteCustomizable(
          _p('c', customization: const StoreCustomization(fromCents: 1490)),
        ),
        isFalse,
      );
      expect(storeFavoriteCustomizable(_p('d')), isFalse);
    });
  });

  group('ação do card', () {
    test('esgotado → avise-me (mesmo personalizável)', () {
      final p = _p('x', soldOut: true, customization: _withName);
      expect(storeFavoriteAction(p).kind, StoreFavoriteActionKind.notifyMe);
    });

    test('personalizável → personalizar', () {
      final p = _p('x', customization: _withImage);
      expect(storeFavoriteAction(p).kind, StoreFavoriteActionKind.customize);
    });

    test('personalização sem opções (espelho antigo) segue as outras regras',
        () {
      final p = _p(
        'x',
        customization: const StoreCustomization(fromCents: 1490),
      );
      expect(storeFavoriteAction(p).kind, StoreFavoriteActionKind.addDirect);
    });

    test('SKU único com saldo → adicionar direto aquele SKU', () {
      final action = storeFavoriteAction(_p('x'));
      expect(action.kind, StoreFavoriteActionKind.addDirect);
      expect(action.variant?.id, 'unico');
    });

    test('com escolha a fazer → ver opções', () {
      final p = _p(
        'x',
        axes: const [_tam],
        variants: [
          _v('p', values: const {'tam': 'p'}),
          _v('m', values: const {'tam': 'm'}),
        ],
      );
      expect(storeFavoriteAction(p).kind, StoreFavoriteActionKind.viewOptions);
      expect(storeFavoriteDirectVariant(p), isNull);
    });

    test('SKU único sem saldo (sem soldOut) → ver opções', () {
      final p = _p('x', variants: [_v('unico', stock: 0)]);
      expect(storeFavoriteAction(p).kind, StoreFavoriteActionKind.viewOptions);
    });
  });

  group('linha de preço', () {
    test('esgotado > personalizável > Pix > nada', () {
      expect(
        storeFavoriteFoot(_p('a', soldOut: true), hasPix: true),
        StoreFavoriteFoot.soldOut,
      );
      expect(
        storeFavoriteFoot(_p('b', customization: _withName), hasPix: true),
        StoreFavoriteFoot.customize,
      );
      expect(storeFavoriteFoot(_p('c'), hasPix: true), StoreFavoriteFoot.pix);
      expect(storeFavoriteFoot(_p('d'), hasPix: false), StoreFavoriteFoot.none);
    });
  });

  group('destaque', () {
    test('o favorito de maior desconto', () {
      final small = _p('small', price: 8990, compareAt: 9990);
      final big = _p('big', price: 19990, compareAt: 21990);
      final h = storeFavoriteHighlight([small, big])!;
      expect(h.product.id, 'big');
      expect(h.cents, 2000);
    });

    test('esgotado não entra; sem desconto, sem faixa', () {
      final out = _p('out', price: 1000, compareAt: 9000, soldOut: true);
      final small = _p('small', price: 8990, compareAt: 9990);
      expect(storeFavoriteHighlight([out, small])!.product.id, 'small');
      expect(storeFavoriteHighlight([out, _p('plain')]), isNull);
      expect(storeFavoriteHighlight(const []), isNull);
    });

    test('empate fica com o favoritado por último (o primeiro da lista)', () {
      final first = _p('first', price: 8990, compareAt: 9990);
      final second = _p('second', price: 18990, compareAt: 19990);
      expect(storeFavoriteHighlight([first, second])!.product.id, 'first');
    });
  });
}
