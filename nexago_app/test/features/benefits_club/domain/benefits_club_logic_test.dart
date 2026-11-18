import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/benefits_club/domain/benefit_event.dart';
import 'package:nexago_app/features/benefits_club/domain/benefits_club_config.dart';
import 'package:nexago_app/features/benefits_club/domain/benefits_club_logic.dart';
import 'package:nexago_app/features/benefits_club/domain/partner.dart';

Partner _partner(
  String id, {
  String? name,
  bool active = true,
  PartnerAudience audience = PartnerAudience.all,
  List<String> cities = const [],
  double priority = 0,
  bool master = false,
  PartnerCategory category = PartnerCategory.food,
  PartnerCtaType ctaType = PartnerCtaType.link,
  String ctaLabel = 'Pedir com 10% off',
  List<String> howToUse = const [],
  PartnerCouponMode couponMode = PartnerCouponMode.none,
  String? couponCode,
}) => Partner(
  id: id,
  name: name ?? id,
  active: active,
  audience: audience,
  cities: cities,
  priority: priority,
  isMasterSponsor: master,
  category: category,
  ctaType: ctaType,
  ctaLabel: ctaLabel,
  howToUse: howToUse,
  couponMode: couponMode,
  couponCode: couponCode,
);

void main() {
  group('Partner.fromFirestore', () {
    test('lê os campos da spec', () {
      final p = Partner.fromFirestore('fast-acai', {
        'name': ' Fast Açaí ',
        'logoUrl': 'https://cdn/fast.png',
        'category': 'food',
        'benefitHighlight': '10% OFF',
        'benefitTitle': '10% de desconto em todo pedido',
        'howToUse': ['Um', '', 'Dois', 3],
        'ctaType': 'link',
        'ctaLabel': 'Pedir com 10% off',
        'link': 'https://fast.example/cardapio',
        'couponMode': 'fixed',
        'couponCode': 'NEXAGO10',
        'brandColor': '#5E1E7A',
        'cities': ['Goiânia'],
        'isMasterSponsor': false,
        'priority': 50,
        'active': true,
        'audience': 'all',
      });

      expect(p.id, 'fast-acai');
      expect(p.name, 'Fast Açaí');
      expect(p.category, PartnerCategory.food);
      expect(p.howToUse, ['Um', 'Dois']);
      expect(p.couponMode, PartnerCouponMode.fixed);
      expect(p.couponCode, 'NEXAGO10');
      expect(p.priority, 50);
      expect(p.active, isTrue);
      expect(p.cities, ['Goiânia']);
    });

    test('tolera doc vazio, nulo e tipos errados', () {
      final empty = Partner.fromFirestore('x', null);
      expect(empty.name, '');
      expect(empty.active, isFalse);
      expect(empty.category, PartnerCategory.other);
      expect(empty.ctaType, PartnerCtaType.link);
      expect(empty.couponMode, PartnerCouponMode.none);
      expect(empty.audience, PartnerAudience.all);
      expect(empty.howToUse, isEmpty);

      final wrong = Partner.fromFirestore('y', {
        'name': 42,
        'active': 'true',
        'priority': '10',
        'category': 'cars',
        'ctaType': 'lead_form',
        'audience': 'testers',
        'cities': 'Goiânia',
        'couponCode': '  ',
      });
      expect(wrong.name, '');
      expect(wrong.active, isFalse, reason: 'só true explícito liga');
      expect(wrong.priority, 0);
      expect(wrong.category, PartnerCategory.other);
      expect(wrong.ctaType, PartnerCtaType.leadForm);
      expect(wrong.audience, PartnerAudience.testers);
      expect(wrong.cities, isEmpty);
      expect(wrong.couponCode, isNull);
    });

    test('rótulos das categorias em português', () {
      expect(PartnerCategory.values.map((c) => c.label), [
        'Alimentação',
        'Artigos esportivos',
        'Saúde e bem-estar',
        'Serviços',
        'Lazer',
        'Outros',
      ]);
    });
  });

  group('config e quem testa', () {
    test('config tolerante', () {
      final c = BenefitsClubConfig.fromMap({
        'enabled': true,
        'testerUids': ['a', 1, 'b'],
      });
      expect(c.enabled, isTrue);
      expect(c.testerUids, ['a', 'b']);
      expect(BenefitsClubConfig.fromMap(null).enabled, isFalse);
    });

    test('admin ou uid na lista testa', () {
      const config = BenefitsClubConfig(testerUids: ['u1']);
      expect(isTester(uid: 'u1', isAdmin: false, config: config), isTrue);
      expect(isTester(uid: 'u2', isAdmin: false, config: config), isFalse);
      expect(isTester(uid: 'u2', isAdmin: true, config: config), isTrue);
      expect(isTester(uid: '', isAdmin: false, config: config), isFalse);
    });

    test('admin pelo claim roles ou superAdmin', () {
      expect(
        isAdminFromClaims({
          'roles': ['athlete', 'admin'],
        }),
        isTrue,
      );
      expect(isAdminFromClaims({'superAdmin': true}), isTrue);
      expect(
        isAdminFromClaims({
          'roles': ['athlete'],
        }),
        isFalse,
      );
      expect(isAdminFromClaims(null), isFalse);
    });

    test('card do Hub: ligado ou quem testa', () {
      const off = BenefitsClubConfig();
      const on = BenefitsClubConfig(enabled: true);
      expect(hubCardVisible(off, tester: false), isFalse);
      expect(hubCardVisible(off, tester: true), isTrue);
      expect(hubCardVisible(on, tester: false), isTrue);
    });
  });

  group('visiblePartners', () {
    test('esconde inativo e o de teste para quem não testa', () {
      final partners = [
        _partner('fast'),
        _partner('off', active: false),
        _partner('linq', audience: PartnerAudience.testers),
      ];

      expect(visiblePartners(partners, tester: false).map((p) => p.id), [
        'fast',
      ]);
      expect(visiblePartners(partners, tester: true).map((p) => p.id), [
        'fast',
        'linq',
      ]);
    });

    test('cidade casa sem acento e sem caixa; lista vazia = todas', () {
      final partners = [
        _partner('goiania', cities: ['Goiânia']),
        _partner('todas'),
        _partner('anapolis', cities: ['Anápolis']),
      ];

      expect(
        visiblePartners(
          partners,
          tester: false,
          athleteCity: 'GOIANIA',
        ).map((p) => p.id),
        ['goiania', 'todas'],
      );
      expect(
        visiblePartners(
          partners,
          tester: false,
          athleteCity: null,
        ).map((p) => p.id),
        ['todas'],
        reason: 'sem cidade no perfil só vê os de todas as cidades',
      );
    });

    test('ordena por prioridade desc e depois nome', () {
      final partners = [
        _partner('b', name: 'Beta', priority: 10),
        _partner('z', name: 'Zeta', priority: 100),
        _partner('a', name: 'Água', priority: 10),
      ];

      expect(visiblePartners(partners, tester: false).map((p) => p.id), [
        'z',
        'a',
        'b',
      ]);
    });

    test('patrocinador master e categorias presentes na ordem do enum', () {
      final visible = visiblePartners([
        _partner('fast', priority: 50),
        _partner(
          'linq',
          priority: 100,
          master: true,
          category: PartnerCategory.services,
        ),
        _partner('gym', category: PartnerCategory.health),
      ], tester: true);

      expect(masterSponsor(visible)?.id, 'linq');
      expect(categoriesOf(visible), [
        PartnerCategory.food,
        PartnerCategory.health,
        PartnerCategory.services,
      ]);
      expect(
        partnersInCategory(visible, PartnerCategory.health).map((p) => p.id),
        ['gym'],
      );
      expect(partnersInCategory(visible, null), hasLength(3));
      expect(masterSponsor([_partner('x')]), isNull);
    });
  });

  group('código, cupom e link', () {
    test('código do atleta: NEXA- + 4 alfanuméricos em maiúsculas', () {
      expect(athleteCode('ab-1_c9xyz'), 'NEXA-AB1C');
      expect(athleteCode('x9'), 'NEXA-X9');
    });

    test('cupom por modo', () {
      expect(couponFor(_partner('a'), 'abcd1234'), isNull);
      expect(
        couponFor(
          _partner(
            'a',
            couponMode: PartnerCouponMode.fixed,
            couponCode: 'NEXAGO10',
          ),
          'abcd1234',
        ),
        'NEXAGO10',
      );
      expect(
        couponFor(
          _partner('a', couponMode: PartnerCouponMode.athlete),
          'abcd1234',
        ),
        'NEXA-ABCD',
      );
    });

    test('link ganha UTMs e ref, preservando query e fragmento', () {
      final url = trackedPartnerUrl(
        'https://fast.example/cardapio?loja=12&mesa=a#menu',
        'NEXA-AB12',
      );
      final uri = Uri.parse(url!);

      expect(uri.host, 'fast.example');
      expect(uri.path, '/cardapio');
      expect(uri.fragment, 'menu');
      expect(uri.queryParameters, {
        'loja': '12',
        'mesa': 'a',
        'utm_source': 'nexago',
        'utm_medium': 'app',
        'utm_campaign': 'clube_vantagens',
        'ref': 'NEXA-AB12',
      });
      expect(url, startsWith('https://fast.example/cardapio?loja=12&mesa=a&'));
    });

    test('link sem query e recusa o que não é https', () {
      expect(
        trackedPartnerUrl('https://linq.example', 'NEXA-AB12'),
        'https://linq.example?utm_source=nexago&utm_medium=app'
        '&utm_campaign=clube_vantagens&ref=NEXA-AB12',
      );
      expect(trackedPartnerUrl('http://fast.example', 'NEXA-1'), isNull);
      expect(trackedPartnerUrl('javascript:alert(1)', 'NEXA-1'), isNull);
      expect(trackedPartnerUrl(null, 'NEXA-1'), isNull);
      expect(trackedPartnerUrl('', 'NEXA-1'), isNull);
    });
  });

  group('textos', () {
    test('passos do Firestore têm prioridade', () {
      final p = _partner('a', howToUse: ['1', '2', '3', '4']);
      expect(howToUseSteps(p), ['1', '2', '3']);
    });

    test('passos padrão do link usam o botão e o cupom', () {
      final p = _partner('fast', name: 'Fast Açaí');
      final steps = howToUseSteps(p, coupon: 'NEXAGO10');
      expect(steps, hasLength(3));
      expect(steps[0], startsWith('Toque em Pedir com 10% off.'));
      expect(steps[1], 'Monte o pedido normalmente.');
      expect(steps[2], 'No fechamento, use o cupom NEXAGO10.');
    });

    test('passos padrão do formulário', () {
      final p = _partner(
        'linq',
        name: 'LinQ Telecom',
        ctaType: PartnerCtaType.leadForm,
        ctaLabel: 'Quero contratar',
      );
      expect(howToUseSteps(p), [
        'Toque em Quero contratar.',
        'Confira seus dados e autorize o envio para a LinQ Telecom.',
        'A LinQ Telecom chama você no WhatsApp para fechar o plano.',
      ]);
    });

    test('iniciais, local e contagem', () {
      expect(partnerInitials('Fast Açaí'), 'FA');
      expect(partnerInitials('linq'), 'LI');
      expect(partnerInitials('  '), '?');

      final fast = _partner('fast', cities: ['Goiânia', 'Anápolis']);
      expect(
        partnerLocationLabel(fast, athleteCity: 'anapolis'),
        'Alimentação · Anápolis',
      );
      expect(partnerLocationLabel(_partner('x')), 'Alimentação');

      expect(
        partnerListCategoryLabel(
          _partner('l', master: true, category: PartnerCategory.services),
        ),
        'Serviços · Oficial',
      );
      expect(partnersCountLabel(1), '1 parceiro');
      expect(partnersCountLabel(2, city: 'Goiânia'), '2 parceiros em Goiânia');
    });
  });

  group('origem', () {
    test('sem origem é deeplink; desconhecida é unknown', () {
      expect(BenefitSource.fromQuery(null), BenefitSource.deeplink);
      expect(BenefitSource.fromQuery(' '), BenefitSource.deeplink);
      expect(BenefitSource.fromQuery('hub_card'), BenefitSource.hubCard);
      expect(BenefitSource.fromQuery('app_news'), BenefitSource.appNews);
      expect(BenefitSource.fromQuery('banner'), BenefitSource.unknown);
    });
  });

  group('partnerAppRouteOrNull', () {
    test('aceita só caminho interno do app; o doc lê o campo', () {
      expect(partnerAppRouteOrNull(' /arena/abc '), '/arena/abc');
      expect(
        partnerAppRouteOrNull('/loja/produto/x?y=1'),
        '/loja/produto/x?y=1',
      );
      for (final bad in [
        null,
        42,
        '',
        'arena/abc',
        '//evil.example/x',
        'https://atleta.nexago.com.br/reservar/abc',
        '/arena abc',
      ]) {
        expect(partnerAppRouteOrNull(bad), isNull, reason: '$bad');
      }
      final partner = Partner.fromFirestore('v', const {
        'appRoute': '/arena/abc',
      });
      expect(partner.appRoute, '/arena/abc');
      expect(Partner.fromFirestore('v', const {}).appRoute, isNull);
    });
  });
}
