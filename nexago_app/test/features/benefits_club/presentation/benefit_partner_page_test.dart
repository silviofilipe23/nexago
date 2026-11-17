import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/location/user_location_snapshot.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/benefits_club/domain/benefit_event.dart';
import 'package:nexago_app/features/benefits_club/domain/benefits_club_config.dart';
import 'package:nexago_app/features/benefits_club/domain/my_benefits.dart';
import 'package:nexago_app/features/benefits_club/domain/partner.dart';
import 'package:nexago_app/features/benefits_club/presentation/partner_lead_form_page.dart';

import '../support/benefits_club_fakes.dart';

const _urlLauncherChannel = MethodChannel('plugins.flutter.io/url_launcher');

/// Parceiro de link com cupom no link, termos em chips e uma unidade.
final _fastPlus = Partner(
  id: 'fast-acai',
  name: 'Fast Açaí',
  category: PartnerCategory.food,
  benefitHighlight: '10% OFF',
  benefitTitle: '10% de desconto em todo pedido',
  ctaType: PartnerCtaType.link,
  ctaLabel: 'Pedir com 10% off',
  link: 'https://fast.example/cardapio',
  couponMode: PartnerCouponMode.fixed,
  couponCode: 'NEXAGO10',
  couponUrlParam: 'cupom',
  brandColor: '#5E1E7A',
  active: true,
  termsTags: const [PartnerTermsTag.online, PartnerTermsTag.notCumulative],
  locations: const [
    PartnerLocation(
      name: 'Fast Bueno',
      address: 'Rua T-55, 100',
      latitude: -16.70,
      longitude: -49.27,
      hours: 'Todo dia, 10h às 23h',
    ),
  ],
  validUntil: testNow.add(const Duration(days: 2)),
);

const _squadShop = Partner(
  id: 'squad-shop',
  name: 'Loja do Squad',
  category: PartnerCategory.sports,
  benefitHighlight: '30% OFF',
  benefitTitle: '30% em tudo',
  ctaType: PartnerCtaType.link,
  ctaLabel: 'Usar desconto',
  link: 'https://squad.example',
  couponMode: PartnerCouponMode.fixed,
  active: true,
  requirement: PartnerRequirement(type: PartnerRequirementType.squad),
);

const _levelShop = Partner(
  id: 'level-shop',
  name: 'Loja Avançada',
  ctaLabel: 'Usar',
  link: 'https://level.example',
  couponMode: PartnerCouponMode.fixed,
  active: true,
  requirement: PartnerRequirement(
    type: PartnerRequirementType.minLevel,
    minLevel: 'avancado_1',
  ),
);

class _Launches {
  String? copied;
  String? launched;
}

_Launches _mockPlatform(WidgetTester tester) {
  final record = _Launches();
  final messenger = tester.binding.defaultBinaryMessenger;
  messenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
    if (call.method == 'Clipboard.setData') {
      record.copied = (call.arguments as Map)['text'] as String?;
    }
    return null;
  });
  messenger.setMockMethodCallHandler(_urlLauncherChannel, (call) async {
    if (call.method == 'launch') {
      record.launched = (call.arguments as Map)['url'] as String?;
    }
    return true;
  });
  addTearDown(() {
    messenger.setMockMethodCallHandler(SystemChannels.platform, null);
    messenger.setMockMethodCallHandler(_urlLauncherChannel, null);
  });
  return record;
}

Future<GoRouter> _pumpPartner(
  WidgetTester tester, {
  required FakeBenefitsClubService service,
  required String location,
  List<Partner> partners = const [fastAcai, linq],
  BenefitsClubConfig config = const BenefitsClubConfig(
    enabled: true,
    testerUids: [testUid],
  ),
  FakeBenefitsClubRepository? repository,
  UserLocationSnapshot userLocation = const UserLocationSnapshot(
    source: UserLocationSource.none,
  ),
}) async {
  await tester.binding.setSurfaceSize(const Size(430, 2000));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  final router = benefitsTestRouter(location);
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: benefitsOverrides(
        service: service,
        config: config,
        partners: partners,
        repository: repository,
        location: userLocation,
      ),
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await tester.pumpAndSettle();
  return router;
}

void main() {
  testWidgets(
    'parceiro de link: benefício, cupom copiável, passos e o botão copia o '
    'cupom e abre o site com UTMs, tudo com a origem da visita',
    (tester) async {
      final service = FakeBenefitsClubService();
      final platform = _mockPlatform(tester);

      await _pumpPartner(
        tester,
        service: service,
        location: '/athlete/clube/fast-acai?origem=hub_card',
      );

      expect(find.text('Fast Açaí'), findsOneWidget);
      expect(find.text('ALIMENTAÇÃO'), findsOneWidget);
      expect(find.text('10% OFF'), findsOneWidget);
      expect(find.text('10% de desconto em todo pedido'), findsOneWidget);
      expect(find.text('NEXAGO10'), findsOneWidget);
      expect(find.text('COMO USAR'), findsOneWidget);
      expect(
        find.text('Copia o cupom e abre o site da Fast Açaí'),
        findsOneWidget,
      );
      expect(find.text('PATROCINADOR OFICIAL'), findsNothing);
      expect(service.of(BenefitEventType.partnerView).single, (
        type: BenefitEventType.partnerView,
        source: BenefitSource.hubCard,
        partnerId: 'fast-acai',
      ));

      await tester.tap(find.byKey(const Key('benefits-copy-coupon')));
      await tester.pump();
      expect(platform.copied, 'NEXAGO10');
      expect(find.text('Cupom copiado'), findsOneWidget);
      expect(
        service.of(BenefitEventType.codeCopy).single.source,
        BenefitSource.hubCard,
      );

      expect(find.text('Não cumulativo com outras promoções.'), findsNothing);
      await tester.tap(find.byKey(const Key('benefits-terms-toggle')));
      await tester.pump();
      expect(find.text('Não cumulativo com outras promoções.'), findsOneWidget);

      platform.copied = null;
      await tester.tap(find.byKey(const Key('benefits-partner-cta')));
      await tester.pump();
      expect(platform.copied, 'NEXAGO10');
      expect(
        find.text('Cupom NEXAGO10 copiado. É só colar no fechamento.'),
        findsOneWidget,
      );
      await tester.pumpAndSettle();
      expect(service.of(BenefitEventType.ctaClick).single, (
        type: BenefitEventType.ctaClick,
        source: BenefitSource.hubCard,
        partnerId: 'fast-acai',
      ));
      expect(service.of(BenefitEventType.codeCopy), hasLength(2));
      // Sem `couponUrlParam`, o cupom não vai na URL.
      expect(
        platform.launched,
        'https://fast.example/cardapio?loja=12&utm_source=nexago'
        '&utm_medium=app&utm_campaign=clube_vantagens&ref=NEXA-ABCD',
      );
    },
  );

  testWidgets('cupom na URL, chips dos termos, "Onde usar" com distância, '
      'selo de prazo e o coração salva', (tester) async {
    final service = FakeBenefitsClubService();
    final repository = FakeBenefitsClubRepository();
    final platform = _mockPlatform(tester);
    await _pumpPartner(
      tester,
      service: service,
      partners: [_fastPlus],
      repository: repository,
      location: '/athlete/clube/fast-acai?origem=push',
      userLocation: const UserLocationSnapshot(
        source: UserLocationSource.profile,
        latitude: -16.70,
        longitude: -49.28,
      ),
    );

    expect(find.text('Online'), findsOneWidget);
    expect(find.text('Não cumulativo'), findsOneWidget);
    expect(find.text('ONDE USAR'), findsOneWidget);
    expect(find.text('Fast Bueno'), findsOneWidget);
    expect(find.textContaining('Rua T-55, 100 · '), findsOneWidget);
    expect(find.text('Todo dia, 10h às 23h'), findsOneWidget);
    expect(find.text('TERMINA EM 2 DIAS'), findsOneWidget);

    await tester.tap(find.byKey(const Key('benefits-save')));
    await tester.pumpAndSettle();
    expect(repository.writes.single, (partnerId: 'fast-acai', saved: true));
    expect(find.text('Fast Açaí salvo em Meus benefícios.'), findsOneWidget);

    // O aviso cobre o pé da tela: aciona o botão direto.
    tester
        .widget<FilledButton>(find.byKey(const Key('benefits-partner-cta')))
        .onPressed!();
    await tester.pumpAndSettle();
    expect(
      platform.launched,
      'https://fast.example/cardapio?utm_source=nexago&utm_medium=app'
      '&utm_campaign=clube_vantagens&ref=NEXA-ABCD&cupom=NEXAGO10',
    );
    expect(
      service.of(BenefitEventType.ctaClick).single.source,
      BenefitSource.push,
    );
  });

  testWidgets('parceiro de formulário: selo oficial e o botão abre o '
      'formulário com a mesma origem', (tester) async {
    final service = FakeBenefitsClubService();
    await _pumpPartner(
      tester,
      service: service,
      location: '/athlete/clube/linq?origem=hub_card',
    );

    expect(find.text('PATROCINADOR OFICIAL'), findsOneWidget);
    expect(find.text('COMO FUNCIONA'), findsOneWidget);
    expect(find.byKey(const Key('benefits-copy-coupon')), findsNothing);
    expect(
      find.text('Seus dados só vão para a LinQ Telecom com a sua autorização'),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const Key('benefits-partner-cta')));
    await tester.pumpAndSettle();
    final form = tester.widget<PartnerLeadFormPage>(
      find.byType(PartnerLeadFormPage),
    );
    expect(form.partnerId, 'linq');
    expect(form.source, BenefitSource.hubCard);
    expect(find.text('Enviar'), findsOneWidget);
    expect(
      service.of(BenefitEventType.ctaClick).single.source,
      BenefitSource.hubCard,
    );
  });

  testWidgets(
    'parceiro de teste para quem não testa = indisponível, sem evento',
    (tester) async {
      final service = FakeBenefitsClubService();
      await _pumpPartner(
        tester,
        service: service,
        location: '/athlete/clube/linq',
        config: const BenefitsClubConfig(enabled: true),
      );

      expect(find.text('Benefício indisponível'), findsOneWidget);
      expect(service.of(BenefitEventType.partnerView), isEmpty);
    },
  );

  testWidgets('bloqueado (Squad): cadeado, cupom mascarado, "Como '
      'desbloquear" e o botão leva ao Squad, sem resgate', (tester) async {
    final service = FakeBenefitsClubService();
    await _pumpPartner(
      tester,
      service: service,
      partners: const [_squadShop],
      location: '/athlete/clube/squad-shop',
    );

    expect(find.text('EXCLUSIVO SQUAD'), findsOneWidget);
    expect(find.byKey(const Key('benefits-coupon-masked')), findsOneWidget);
    expect(find.byKey(const Key('benefits-unlock')), findsOneWidget);
    expect(find.text('Exclusivo para embaixadores do Squad.'), findsOneWidget);
    expect(find.byKey(const Key('benefits-partner-cta')), findsNothing);
    expect(find.text('Conhecer o Squad'), findsOneWidget);
    expect(
      find.text('Sem botão de resgate enquanto o benefício estiver bloqueado'),
      findsOneWidget,
    );
    expect(service.claims, isEmpty);
  });

  testWidgets('bloqueado por nível: explicação e nenhum botão', (tester) async {
    await _pumpPartner(
      tester,
      service: FakeBenefitsClubService(),
      partners: const [_levelShop],
      location: '/athlete/clube/level-shop',
    );

    expect(
      find.text('Exclusivo para atletas a partir do nível Avançado 1.'),
      findsOneWidget,
    );
    expect(find.byKey(const Key('benefits-unlock-cta')), findsNothing);
    expect(find.byKey(const Key('benefits-partner-cta')), findsNothing);
  });

  testWidgets('elegível: o botão pede o cupom à claimBenefit, copia e abre', (
    tester,
  ) async {
    final service = FakeBenefitsClubService(
      myBenefits: const MyBenefits(eligiblePartnerIds: {'squad-shop'}),
    );
    final platform = _mockPlatform(tester);
    await _pumpPartner(
      tester,
      service: service,
      partners: const [_squadShop],
      location: '/athlete/clube/squad-shop?origem=hub_card',
    );

    expect(find.byKey(const Key('benefits-coupon-masked')), findsNothing);
    expect(find.byKey(const Key('benefits-claim-coupon')), findsOneWidget);

    await tester.tap(find.byKey(const Key('benefits-partner-cta')));
    await tester.pumpAndSettle();
    expect(service.claims, ['squad-shop']);
    expect(platform.copied, 'SQUAD20');
    expect(find.text('SQUAD20'), findsOneWidget);
    expect(platform.launched, startsWith('https://squad.example'));
  });

  testWidgets('erro da claimBenefit aparece amigável e não abre o site', (
    tester,
  ) async {
    final service =
        FakeBenefitsClubService(
            myBenefits: const MyBenefits(eligiblePartnerIds: {'squad-shop'}),
          )
          ..claimError = FirebaseFunctionsException(
            code: 'permission-denied',
            message: 'Exclusivo para embaixadores do Squad.',
          );
    final platform = _mockPlatform(tester);
    await _pumpPartner(
      tester,
      service: service,
      partners: const [_squadShop],
      location: '/athlete/clube/squad-shop',
    );

    await tester.tap(find.byKey(const Key('benefits-claim-coupon')));
    await tester.pumpAndSettle();
    expect(
      find.text(
        'Não foi possível liberar o cupom. Exclusivo para embaixadores do '
        'Squad.',
      ),
      findsOneWidget,
    );
    expect(platform.launched, isNull);
    expect(service.of(BenefitEventType.ctaClick), isEmpty);
  });

  testWidgets('parceiro vencido = indisponível', (tester) async {
    await _pumpPartner(
      tester,
      service: FakeBenefitsClubService(),
      partners: [
        Partner(
          id: 'old',
          name: 'Antigo',
          ctaLabel: 'Usar',
          active: true,
          validUntil: testNow.subtract(const Duration(minutes: 1)),
        ),
      ],
      location: '/athlete/clube/old',
    );
    expect(find.text('Benefício indisponível'), findsOneWidget);
  });

  testWidgets('tela do app: o botão copia o cupom e abre a reserva da arena '
      'no app, sem abrir o site', (tester) async {
    final service = FakeBenefitsClubService();
    final platform = _mockPlatform(tester);
    const vegeton = Partner(
      id: 'vegeton-beach-club',
      name: 'Vegeton Beach Club',
      ctaLabel: 'Reservar com R\$ 10 off',
      link: 'https://atleta.nexago.com.br/reservar/TtYSz7IaOHB7Hf7CXdIr',
      appRoute: '/arena/TtYSz7IaOHB7Hf7CXdIr',
      couponMode: PartnerCouponMode.fixed,
      couponCode: 'NEXAGO10',
      active: true,
    );

    await _pumpPartner(
      tester,
      service: service,
      partners: const [vegeton],
      location: '/athlete/clube/vegeton-beach-club',
    );
    expect(
      find.text('Copia o cupom e abre a Vegeton Beach Club no app'),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const Key('benefits-partner-cta')));
    await tester.pumpAndSettle();

    expect(platform.copied, 'NEXAGO10');
    expect(platform.launched, isNull);
    expect(find.text('arena TtYSz7IaOHB7Hf7CXdIr'), findsOneWidget);
    expect(service.of(BenefitEventType.ctaClick), hasLength(1));
  });
}
