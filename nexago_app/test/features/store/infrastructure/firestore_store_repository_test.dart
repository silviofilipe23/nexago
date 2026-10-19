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

    test('lê galeria, descrição, detalhes, saldo e personalização (tela 02)',
        () {
      final p = storeProductFromMap('camiseta', {
        'name': 'Camiseta Dry UV50 Areia',
        'priceCents': 12990,
        'coverUrl': 'https://cdn/branco-1.jpg',
        'photos': [
          {'url': 'https://cdn/branco-1.jpg', 'colorValueId': 'branco'},
          {'url': 'https://cdn/geral.jpg', 'colorValueId': null},
          {'url': '', 'colorValueId': 'preto'},
          'lixo',
        ],
        'description': '  Tecido leve com proteção UV50.  ',
        'details': [
          {'label': 'Tecido', 'value': 'Poliamida dry'},
          {'label': 'Sem valor', 'value': ''},
        ],
        'variants': [
          {
            'id': 'branco_m',
            'values': {'cor': 'branco', 'tam': 'm'},
            'priceCents': 12990,
            'inStock': true,
            'maxQty': 2,
            'lowStock': true,
          },
          {
            'id': 'branco_g',
            'values': {'cor': 'branco', 'tam': 'g'},
            'priceCents': 12990,
            'inStock': false,
            'maxQty': 0,
            'lowStock': true,
          },
          {
            'id': 'branco_gg',
            'priceCents': 12990,
            'inStock': true,
            'maxQty': 40,
          },
        ],
        'customizable': true,
        'customization': {
          'fromCents': 1490,
          'leadDays': 5,
          'defectOnlyReturns': true,
        },
      })!;

      expect(p.photos, const [
        StorePhoto(url: 'https://cdn/branco-1.jpg', colorValueId: 'branco'),
        StorePhoto(url: 'https://cdn/geral.jpg'),
      ]);
      expect(p.description, 'Tecido leve com proteção UV50.');
      expect(p.details.single.label, 'Tecido');
      expect(p.details.single.value, 'Poliamida dry');
      expect(p.variants[0].maxQty, 2);
      expect(p.variants[0].lowStock, isTrue);
      // Sem saldo: 0 e sem alerta, venha o que vier.
      expect(p.variants[1].maxQty, 0);
      expect(p.variants[1].lowStock, isFalse);
      // Acima do teto exposto vira o teto.
      expect(p.variants[2].maxQty, kStoreMaxQtyPerItem);
      expect(p.customization?.fromCents, 1490);
      expect(p.customization?.leadDays, 5);
      expect(p.customization?.defectOnlyReturns, isTrue);
    });

    test('doc antigo (sem os campos da tela 02): padrões seguros', () {
      final p = storeProductFromMap('bola', {
        'name': 'Bola',
        'priceCents': 28990,
        'coverUrl': 'https://cdn/bola.jpg',
        'variants': [
          {'id': 'unico', 'priceCents': 28990, 'inStock': true},
          {'id': 'outro', 'priceCents': 28990, 'inStock': false},
        ],
        // Personalização sem `customizable` não vale.
        'customization': {'fromCents': 1490},
      })!;

      expect(p.photos, isEmpty);
      expect(p.description, '');
      expect(p.details, isEmpty);
      expect(p.customization, isNull);
      expect(p.variants.first.maxQty, kStoreMaxQtyPerItem);
      expect(p.variants.first.lowStock, isFalse);
      expect(p.variants.last.maxQty, 0);
    });

    test('personalização com opções (publicCustomization) e lado das fotos',
        () {
      final p = storeProductFromMap('camiseta', {
        'name': 'Camiseta',
        'priceCents': 12990,
        'photos': [
          {'url': 'https://cdn/f.jpg', 'colorValueId': 'preto', 'view': 'frente'},
          {'url': 'https://cdn/c.jpg', 'view': 'costas'},
          {'url': 'https://cdn/x.jpg', 'view': 'lado'},
        ],
        'customizable': true,
        'customization': {
          'fromCents': 1490,
          'leadDays': 5,
          'defectOnlyReturns': true,
          'version': 1760000000000,
          'name': {
            'enabled': true,
            'maxChars': 12,
            'placement': 'costas_superior',
            'fonts': ['bloco', 'inventada', 'mono'],
            'colors': ['#FFFFFF', '#111111', 'azul'],
          },
          'image': {
            'enabled': true,
            'formats': ['png', 'jpg', 'svg'],
            'maxSizeMb': 10,
            'minWidthPx': 1000,
            'minHeightPx': 1000,
            'areas': [
              {
                'id': 'peito_esquerdo',
                'name': 'Peito esquerdo',
                'widthCm': 9,
                'heightCm': 9,
              },
              {'id': 'sem_medida', 'name': 'X', 'widthCm': 0, 'heightCm': 9},
            ],
          },
          'price': {
            'nameOnlyCents': 1490,
            'imageOnlyCents': 1990,
            'bothCents': 2490,
          },
        },
      })!;

      expect(p.photos.map((ph) => ph.view).toList(), [
        StorePhotoView.front,
        StorePhotoView.back,
        null,
      ]);
      final c = p.customization!;
      expect(c.version, 1760000000000);
      expect(c.hasOptions, isTrue);
      expect(c.name.enabled, isTrue);
      expect(c.name.maxChars, 12);
      expect(c.name.placement, StoreNamePlacement.backUpper);
      // Fonte que o app não sabe desenhar fica de fora.
      expect(c.name.fonts, [StoreCustomFont.bloco, StoreCustomFont.mono]);
      expect(c.name.colors, ['#ffffff', '#111111']);
      expect(c.image.enabled, isTrue);
      expect(c.image.formats, ['png', 'jpg', 'svg']);
      expect(c.image.maxSizeMb, 10);
      expect(c.image.minWidthPx, 1000);
      expect(c.image.areas.single.id, 'peito_esquerdo');
      expect(c.image.areas.single.widthCm, 9);
      expect(c.price.nameOnlyCents, 1490);
      expect(c.price.imageOnlyCents, 1990);
      expect(c.price.bothCents, 2490);
    });

    test('personalização de doc antigo (sem opções): tudo desligado', () {
      final c = storeProductFromMap('camiseta', {
        'name': 'Camiseta',
        'priceCents': 12990,
        'customizable': true,
        'customization': {'fromCents': 1490, 'leadDays': 5},
      })!
          .customization!;
      expect(c.fromCents, 1490);
      expect(c.version, 0);
      expect(c.name.enabled, isFalse);
      expect(c.image.enabled, isFalse);
      expect(c.hasOptions, isFalse);
      expect(c.price.bothCents, 0);
    });

    test('opção ligada sem fonte/cor ou sem área/formato some', () {
      final c = storeCustomizationFromMap({
        'name': {'enabled': true, 'fonts': ['bloco'], 'colors': []},
        'image': {
          'enabled': true,
          'formats': ['png'],
          'areas': [],
        },
      });
      expect(c.name.enabled, isFalse);
      expect(c.image.enabled, isFalse);
      // Padrões do backoffice quando o número não vem.
      expect(c.name.maxChars, 12);
      expect(c.image.maxSizeMb, 10);
      expect(c.name.placement, StoreNamePlacement.backUpper);
    });

    test('costas: espelho com back e backCents; ausente = desligado', () {
      final c = storeCustomizationFromMap({
        'image': {
          'enabled': false,
          'formats': ['png', 'jpg'],
          'areas': [],
        },
        'back': {
          'enabled': true,
          'allowNumber': true,
          'allowImage': true,
          'numberMaxDigits': 3,
          'widthCm': 28,
          'heightCm': 30,
        },
        'price': {'nameOnlyCents': 1490, 'backCents': 990},
      });
      expect(c.back.enabled, isTrue);
      expect(c.back.allowNumber, isTrue);
      // A imagem das costas usa os formatos do bloco Imagem, mesmo desligado.
      expect(c.back.allowImage, isTrue);
      expect(c.back.numberMaxDigits, 3);
      expect(c.back.widthCm, 28);
      expect(c.back.heightCm, 30);
      expect(c.price.backCents, 990);
      // Só as costas já bastam pra abrir a tela.
      expect(c.hasOptions, isTrue);

      final old = storeCustomizationFromMap({
        'price': {'nameOnlyCents': 1490},
      });
      expect(old.back.enabled, isFalse);
      expect(old.back.allowNumber, isFalse);
      expect(old.back.allowImage, isFalse);
      expect(old.price.backCents, 0);
      expect(old.hasOptions, isFalse);
    });

    test('costas: sem opção válida somem; números fora do intervalo', () {
      // Só imagem liberada, mas sem formato no bloco Imagem.
      final noFormat = storeCustomizationFromMap({
        'back': {'enabled': true, 'allowNumber': false, 'allowImage': true},
      });
      expect(noFormat.back.enabled, isFalse);
      expect(noFormat.back.allowImage, isFalse);

      final odd = storeCustomizationFromMap({
        'back': {
          'enabled': true,
          'allowNumber': true,
          'allowImage': 'sim',
          'numberMaxDigits': 9,
          'widthCm': -1,
          'heightCm': 'x',
        },
      });
      expect(odd.back.enabled, isTrue);
      expect(odd.back.allowImage, isFalse);
      expect(odd.back.numberMaxDigits, 3);
      // Padrões do backoffice (25 × 25 cm, 2 dígitos).
      expect(odd.back.widthCm, 25);
      expect(odd.back.heightCm, 25);
      expect(
        storeCustomizationFromMap({
          'back': {'enabled': true, 'allowNumber': true},
        }).back.numberMaxDigits,
        2,
      );
      // Desligado no espelho: nada liberado.
      final off = storeCustomizationFromMap({
        'back': {'enabled': false, 'allowNumber': true},
      });
      expect(off.back.enabled, isFalse);
      expect(off.back.allowNumber, isFalse);
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
      // Doc anterior à entrega: sem frete grátis e sem modalidade.
      expect(c.delivery.freeAboveCents, isNull);
      expect(c.delivery.modes, isEmpty);
    });

    test('lê a entrega; preço ausente = calculado no checkout', () {
      final c = storeShowcaseConfigFromMap({
        'delivery': {
          'freeAboveCents': 39900,
          'modes': [
            {
              'id': 'expressa',
              'name': 'Expressa',
              'description': 'Loggi · Goiânia e região em 24 h',
              'priceCents': 3490,
            },
            {
              'id': 'calculada',
              'name': 'Correios',
              'description': '',
              'priceCents': null,
            },
            {'id': '', 'name': 'Sem id', 'priceCents': 100},
          ],
        },
      });

      expect(c.delivery.freeAboveCents, 39900);
      expect(c.delivery.modes.map((m) => m.id), ['expressa', 'calculada']);
      expect(c.delivery.modes.first.priceCents, 3490);
      expect(
        c.delivery.modes.first.description,
        'Loggi · Goiânia e região em 24 h',
      );
      expect(c.delivery.modes.last.priceCents, isNull);
      expect(
        storeShowcaseConfigFromMap({'delivery': {'freeAboveCents': 0}})
            .delivery
            .freeAboveCents,
        isNull,
      );
      expect(storeShowcaseConfigFromMap(null).delivery.modes, isEmpty);
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

    test('linha personalizada volta intacta (lineId, customization e '
        'Timestamps)', () {
      final addedAt = Timestamp.fromDate(DateTime.utc(2026, 10, 17, 12));
      final customLine = {
        'lineId': 'l-1',
        'productId': 'camiseta',
        'skuId': 'preto_m',
        'qty': 1,
        'customization': {
          'configVersion': 1760000000000,
          'extraPriceCents': 2490,
          'addedAt': addedAt,
          'name': {
            'text': 'ANTUNES',
            'fontId': 'bloco',
            'color': '#ffffff',
            'placement': 'costas_superior',
          },
          'image': {
            'path': 'store/custom-uploads/u1/a.png',
            'widthPx': null,
            'transform': {'x': 0.5, 'y': 0.5, 'scale': 1},
          },
        },
      };
      final items = storeCartItemsFromMap({
        'items': [
          {'productId': 'bola', 'skuId': 'unico', 'qty': 2},
          customLine,
        ],
      });

      expect(items.first.isCustom, isFalse);
      expect(items.last.isCustom, isTrue);
      expect(items.last.lineId, 'l-1');
      // Reescrever `items` (o "Adicionar" comum) devolve o mapa inteiro.
      expect(items.last.toMap(), customLine);
      expect(items.first.toMap(), {
        'productId': 'bola',
        'skuId': 'unico',
        'qty': 2,
      });
    });
  });
}
