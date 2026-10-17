import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/observability/analytics_events.dart';

void main() {
  group('tournamentRegistrationParams', () {
    test('includes trimmed ids', () {
      final p = tournamentRegistrationParams(
        tournamentId: '  t1 ',
        categoryId: 'c1',
      );
      expect(p, {'tournament_id': 't1', 'category_id': 'c1'});
    });

    test('omits empty fields (analytics rejects null/empty)', () {
      final p = tournamentRegistrationParams(
        tournamentId: '',
        categoryId: '   ',
      );
      expect(p, isEmpty);
    });

    test('includes amountType only when present', () {
      expect(
        tournamentRegistrationParams(
          tournamentId: 't',
          categoryId: 'c',
          amountType: 'full',
        )['amount_type'],
        'full',
      );
      expect(
        tournamentRegistrationParams(
          tournamentId: 't',
          categoryId: 'c',
          amountType: '  ',
        ).containsKey('amount_type'),
        isFalse,
      );
    });
  });

  group('storeEventParams (Loja · vitrine)', () {
    test('event names match the web portal', () {
      expect(AnalyticsEvents.storeShowcaseView, 'loja_vitrine_view');
      expect(AnalyticsEvents.storeBannerClick, 'loja_banner_click');
      expect(AnalyticsEvents.storeCategorySelect, 'loja_categoria_select');
      expect(AnalyticsEvents.storeSearch, 'loja_busca');
      expect(AnalyticsEvents.storeProductClick, 'loja_produto_click');
      expect(AnalyticsEvents.storeQuickAdd, 'loja_add_rapido');
      expect(AnalyticsEvents.storeFavorite, 'loja_favoritar');
      expect(AnalyticsEvents.storePickupArenaChange, 'loja_arena_trocar');
    });

    test('uses the portal param names; bool becomes 1/0', () {
      expect(
        storeEventParams(productId: ' bola ', position: 3),
        {'produto_id': 'bola', 'posicao': 3},
      );
      expect(
        storeEventParams(term: 'bola', results: 0),
        {'termo': 'bola', 'resultados': 0},
      );
      expect(storeEventParams(productId: 'b', on: false), {
        'produto_id': 'b',
        'on': 0,
      });
      expect(storeEventParams(campaignId: 'verao'), {'campanha_id': 'verao'});
      expect(storeEventParams(category: 'tudo'), {'categoria': 'tudo'});
      expect(storeEventParams(arenaId: 'a1'), {'arena_id': 'a1'});
    });

    test('drops blank text', () {
      expect(storeEventParams(term: '  ', arenaId: ''), isEmpty);
      expect(storeEventParams(origin: '', color: ' ', sku: ''), isEmpty);
    });
  });

  group('storeEventParams (Loja · produto)', () {
    test('event names match the web portal', () {
      expect(AnalyticsEvents.storeProductView, 'loja_produto_view');
      expect(AnalyticsEvents.storePhotoSwipe, 'loja_foto_swipe');
      expect(AnalyticsEvents.storeVariantSelect, 'loja_variacao_select');
      expect(AnalyticsEvents.storeNotifyMe, 'loja_avise_me');
      expect(AnalyticsEvents.storeAddToCart, 'loja_add_carrinho');
      expect(AnalyticsEvents.storeDeliverySelect, 'loja_entrega_select');
      expect(AnalyticsEvents.storeCustomizeOpen, 'loja_personalizar_open');
      expect(AnalyticsEvents.storeRelatedClick, 'loja_relacionado_click');
    });

    test('uses the contract param names', () {
      expect(
        storeEventParams(productId: 'cam', origin: 'vitrine'),
        {'produto_id': 'cam', 'origem': 'vitrine'},
      );
      expect(
        storeEventParams(color: 'branco', size: 'm'),
        {'cor': 'branco', 'tamanho': 'm'},
      );
      expect(
        storeEventParams(sku: 'branco_m', qty: 2, priceCents: 12990),
        {'sku': 'branco_m', 'qtd': 2, 'preco': 12990},
      );
      expect(storeEventParams(type: 'retirada'), {'tipo': 'retirada'});
    });
  });

  group('storeEventParams (Loja · Personalizar)', () {
    test('event names match the contract', () {
      expect(AnalyticsEvents.storeCustomizeName, 'loja_personalizar_nome');
      expect(AnalyticsEvents.storeCustomizeImage, 'loja_personalizar_imagem');
    });

    test('uses the contract param names; personalizado becomes 1/0', () {
      expect(
        storeEventParams(productId: 'cam', channel: 'app'),
        {'produto_id': 'cam', 'canal': 'app'},
      );
      expect(storeEventParams(font: 'bloco'), {'fonte': 'bloco'});
      expect(
        storeEventParams(area: 'peito_esquerdo', quality: 'good'),
        {'area': 'peito_esquerdo', 'qualidade': 'good'},
      );
      expect(
        storeEventParams(
          sku: 'preto_m',
          qty: 1,
          priceCents: 15480,
          customized: true,
        ),
        {'sku': 'preto_m', 'qtd': 1, 'preco': 15480, 'personalizado': 1},
      );
      expect(storeEventParams(font: ' ', area: ''), isEmpty);
    });
  });

  group('storeEventParams (Loja · checkout e pedidos)', () {
    test('event names match the web portal', () {
      expect(AnalyticsEvents.storeCartView, 'loja_carrinho_view');
      expect(AnalyticsEvents.storeCartQty, 'loja_carrinho_qtd');
      expect(AnalyticsEvents.storeCartRemove, 'loja_carrinho_remover');
      expect(AnalyticsEvents.storeAddressSave, 'loja_endereco_salvar');
      expect(AnalyticsEvents.storeCouponApply, 'loja_cupom_aplicar');
      expect(AnalyticsEvents.storeCheckoutPay, 'loja_checkout_pagar');
      expect(AnalyticsEvents.storePixCopy, 'loja_pix_copiar');
      expect(AnalyticsEvents.storeOrderView, 'loja_pedido_view');
      expect(AnalyticsEvents.storeOrdersView, 'loja_pedidos_view');
      expect(AnalyticsEvents.storeRebuy, 'loja_comprar_de_novo');
    });

    test('uses the portal param names; novo becomes 1/0', () {
      expect(storeEventParams(units: 4), {'itens': 4});
      expect(
        storeEventParams(line: 'bola/unico', qty: 0),
        {'linha': 'bola/unico', 'qtd': 0},
      );
      expect(storeEventParams(isNew: true), {'novo': 1});
      expect(
        storeEventParams(totalCents: 18040, delivery: 'arena', coupon: 'VERAO'),
        {'total': 18040, 'entrega': 'arena', 'cupom': 'VERAO'},
      );
      expect(
        storeEventParams(type: 'casa', screen: 'checkout'),
        {'tipo': 'casa', 'tela': 'checkout'},
      );
      expect(storeEventParams(orderId: 'ord_1'), {'pedido_id': 'ord_1'});
    });
  });
}
