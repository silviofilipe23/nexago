import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/store/domain/store_models.dart';
import 'package:nexago_app/features/store/infrastructure/firestore_store_repository.dart';

void main() {
  group('storeProductFromMap (espelho storeShowcase/{id})', () {
    test('lê o formato gravado pelo gatilho, com Timestamps', () {
      final p = storeProductFromMap('camiseta', {
        'name': 'Camiseta Dry UV50 Areia',
        'slug': 'camiseta-dry-uv50-areia',
        'category': 'vestuario',
        'collection': 'verao-2026',
        'brand': 'NexaGO',
        'badge': 'nova',
        'badgeExpiresAt': Timestamp.fromDate(DateTime.utc(2026, 11, 15)),
        'priceCents': 12990,
        'compareAtPriceCents': 15990,
        'minPriceCents': 12990,
        'maxPriceCents': 14990,
        'coverUrl': 'https://cdn/x.jpg',
        'channels': {'app': true, 'web': true},
        'pickup': true,
        'delivery': false,
        'axes': [
          {
            'id': 'cor',
            'label': 'Cor',
            'values': [
              {'id': 'branco', 'label': 'Branco', 'hex': '#FFFFFF'},
            ],
          },
        ],
        'variants': [
          {
            'id': 'branco_m',
            'values': {'cor': 'branco', 'tam': 'm'},
            'priceCents': 12990,
            'inStock': true,
          },
          {
            'id': 'branco_g',
            'values': {'cor': 'branco', 'tam': 'g'},
            'priceCents': 14990,
            'inStock': false,
          },
        ],
        'soldOut': false,
        'customizable': false,
        'ratingAvg': null,
        'ratingCount': 0,
        'soldLast30': 42,
        'publishedAt': Timestamp.fromDate(DateTime.utc(2026, 10, 16)),
        'updatedAt': Timestamp.fromDate(DateTime.utc(2026, 10, 16)),
      })!;

      expect(p.id, 'camiseta');
      expect(p.badge, StoreBadge.isNew);
      expect(p.badgeExpiresAt?.toUtc(), DateTime.utc(2026, 11, 15));
      expect(p.compareAtPriceCents, 15990);
      expect(p.minPriceCents, 12990);
      expect(p.maxPriceCents, 14990);
      expect(p.pickup, isTrue);
      expect(p.axes.single.values.single.hex, '#FFFFFF');
      expect(p.variants.map((v) => v.id), ['branco_m', 'branco_g']);
      expect(p.variants.first.values, {'cor': 'branco', 'tam': 'm'});
      expect(p.variants.last.inStock, isFalse);
      expect(p.ratingAvg, isNull);
      expect(p.soldLast30, 42);
      expect(p.publishedAt?.toUtc(), DateTime.utc(2026, 10, 16));
    });

    test('sem nome ou sem preço é descartado', () {
      expect(storeProductFromMap('a', {'name': '', 'priceCents': 100}), isNull);
      expect(storeProductFromMap('a', {'name': 'Bola'}), isNull);
      expect(storeProductFromMap('a', null), isNull);
    });

    test('min/max ausentes caem no preço; "de" menor que o preço some', () {
      final p = storeProductFromMap('a', {
        'name': 'Bola',
        'priceCents': 28990,
        'compareAtPriceCents': 1000,
        'badge': 'inventado',
      })!;
      expect(p.minPriceCents, 28990);
      expect(p.maxPriceCents, 28990);
      expect(p.compareAtPriceCents, isNull);
      expect(p.badge, isNull);
      expect(p.brand, 'NexaGO');
    });
  });

  group('storeShowcaseConfigFromMap (storePublic/showcase)', () {
    test('doc ausente: categorias padrão, sem Pix, banner nem arena', () {
      final c = storeShowcaseConfigFromMap(null);
      expect(c.categories.first.id, 'bolas');
      expect(c.benefits.pixDiscountPct, isNull);
      expect(c.banners, isEmpty);
      expect(c.pickupArenas, isEmpty);
    });

    test('lê banners, benefícios e arenas; descarta banner incompleto', () {
      final c = storeShowcaseConfigFromMap({
        'banners': [
          {
            'id': 'verao',
            'kicker': 'Coleção Verão 26',
            'title': 'Equipamento de quem joga na areia',
            'subtitle': '',
            'imageUrl': null,
            'primary': {'label': 'Ver coleção', 'collectionId': 'verao-2026'},
            'secondary': null,
            'startDate': '2026-10-01',
            'endDate': 'amanhã',
          },
          {'id': 'sem-colecao', 'title': 'x', 'primary': {}},
        ],
        'benefits': {
          'pixDiscountPct': 5,
          'pickupReadyHours': 24,
          'exchangeDays': 30,
        },
        'categories': [
          {'id': 'bolas', 'label': 'Bolas'},
        ],
        'collections': [],
        'pickupArenas': [
          {
            'arenaId': 'errejota',
            'name': 'Arena Errejota',
            'address': 'Rua 1',
            'city': 'Goiânia',
            'state': 'GO',
            'latitude': -16.7,
            'longitude': -49.2,
            'readyHours': 24,
          },
          {'arenaId': '', 'name': 'sem id'},
        ],
        'updatedAt': Timestamp.fromDate(DateTime.utc(2026, 10, 16)),
      });

      expect(c.banners.single.id, 'verao');
      expect(c.banners.single.collectionId, 'verao-2026');
      expect(c.banners.single.startDate, '2026-10-01');
      // Data fora do formato civil vira "sem limite" em vez de quebrar a conta.
      expect(c.banners.single.endDate, isNull);
      expect(c.benefits.pixDiscountPct, 5);
      expect(c.benefits.pickupReadyHours, 24);
      expect(c.categories.single.label, 'Bolas');
      // Lista vazia cai no padrão.
      expect(c.collections.first.id, 'verao-2026');
      expect(c.pickupArenas.single.name, 'Arena Errejota');
      expect(c.pickupArenas.single.hasCoordinates, isTrue);
    });
  });

  group('preferências e carrinho', () {
    test('storeShoppers: arena e buscas recentes (até 5)', () {
      final s = storeShopperFromMap({
        'pickupArenaId': 'errejota',
        'recentSearches': ['a', 'b', 'c', 'd', 'e', 'f', 3],
        'favoriteIds': ['p1'],
      });
      expect(s.pickupArenaId, 'errejota');
      expect(s.recentSearches, ['a', 'b', 'c', 'd', 'e']);
      expect(s.favoriteIds, ['p1']);
      expect(storeShopperFromMap(null).pickupArenaId, isNull);
    });

    test('storeCarts: descarta linha sem produto, sem SKU ou sem quantidade', () {
      final items = storeCartItemsFromMap({
        'items': [
          {'productId': 'bola', 'skuId': 'unico', 'qty': 2},
          {'productId': '', 'skuId': 'unico', 'qty': 1},
          {'productId': 'x', 'skuId': '', 'qty': 1},
          {'productId': 'y', 'skuId': 'u', 'qty': 0},
          'lixo',
        ],
      });
      expect(items, const [
        StoreCartItem(productId: 'bola', skuId: 'unico', qty: 2),
      ]);
      expect(storeCartItemsFromMap(null), isEmpty);
    });

    test('linha do carrinho grava só productId, skuId e qty', () {
      expect(
        const StoreCartItem(productId: 'bola', skuId: 'unico', qty: 2).toMap(),
        {'productId': 'bola', 'skuId': 'unico', 'qty': 2},
      );
    });
  });
}
