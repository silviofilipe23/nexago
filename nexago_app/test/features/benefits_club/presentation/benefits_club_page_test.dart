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
import 'package:nexago_app/features/benefits_club/presentation/benefit_partner_page.dart';
import 'package:nexago_app/features/benefits_club/presentation/benefits_search_page.dart';
import 'package:nexago_app/features/benefits_club/presentation/widgets/benefits_member_card.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../support/benefits_club_fakes.dart';

const _gym = Partner(
  id: 'gym',
  name: 'Academia Areia',
  category: PartnerCategory.health,
  benefitHighlight: '15% OFF',
  benefitTitle: '15% na mensalidade',
  ctaType: PartnerCtaType.link,
  ctaLabel: 'Quero o desconto',
  link: 'https://gym.example',
  cities: ['Anápolis'],
  active: true,
);

Future<GoRouter> _pumpClub(
  WidgetTester tester, {
  required FakeBenefitsClubService service,
  BenefitsClubConfig config = const BenefitsClubConfig(enabled: true),
  List<Partner> partners = const [fastAcai, linq, _gym],
  String location = '/athlete/clube?origem=hub_card',
  FakeOnboardingStore? onboarding,
  UserLocationSnapshot userLocation = const UserLocationSnapshot(
    source: UserLocationSource.none,
  ),
  DateTime? memberSince,
  bool settle = true,
}) async {
  await tester.binding.setSurfaceSize(const Size(430, 2400));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  final router = benefitsTestRouter(location);
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: benefitsOverrides(
        service: service,
        config: config,
        partners: partners,
        onboarding: onboarding,
        location: userLocation,
        memberSince: memberSince,
      ),
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  if (settle) await tester.pumpAndSettle();
  return router;
}

/// Parceiros comuns para os testes de descoberta (busca só com 8+).
List<Partner> _manyPartners(int count) => [
  for (var i = 0; i < count; i++)
    Partner(
      id: 'p$i',
      name: i == 0 ? 'Café Açaí da Praia' : 'Parceiro $i',
      category: i.isEven ? PartnerCategory.food : PartnerCategory.sports,
      benefitHighlight: '$i% OFF',
      benefitTitle: 'Desconto $i',
      ctaLabel: 'Usar',
      link: 'https://p$i.example',
      active: true,
      priority: 100.0 - i,
      locations: [
        PartnerLocation(
          name: 'Loja $i',
          address: 'Rua $i',
          latitude: -16.68 - i * 0.01,
          longitude: -49.25,
        ),
      ],
    ),
];

void main() {
  testWidgets('quem testa vê "Oferecido por" do patrocinador, o oficial na '
      'lista, chips só das categorias presentes e o filtro local', (
    tester,
  ) async {
    final service = FakeBenefitsClubService();
    await _pumpClub(
      tester,
      service: service,
      config: const BenefitsClubConfig(testerUids: [testUid]),
    );

    expect(find.text('Clube de Vantagens'), findsOneWidget);
    expect(find.text('Oferecido por LinQ Telecom'), findsOneWidget);
    expect(find.byKey(const Key('benefits-open-mine')), findsOneWidget);

    // Banner do patrocinador oficial (v1), logo abaixo da carteirinha.
    final banner = find.byKey(const Key('benefits-sponsor-banner'));
    expect(banner, findsOneWidget);
    expect(
      find.descendant(of: banner, matching: find.text('LinQ Telecom')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: banner, matching: find.text('Instalação grátis')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: banner, matching: find.text('Quero contratar')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: banner, matching: find.text('PATROCINADOR OFICIAL')),
      findsOneWidget,
    );
    expect(
      tester.getTopLeft(banner).dy,
      greaterThan(
        tester.getBottomLeft(find.byKey(BenefitsMemberCard.cardKey)).dy,
      ),
    );
    expect(
      tester.getBottomLeft(banner).dy,
      lessThan(
        tester.getTopLeft(find.byKey(const Key('benefits-chip-all'))).dy,
      ),
    );

    // A academia é só de Anápolis: o atleta é de Goiânia.
    expect(find.byKey(const Key('benefits-partner-gym')), findsNothing);
    expect(find.byKey(const Key('benefits-chip-all')), findsOneWidget);
    expect(find.byKey(const Key('benefits-chip-food')), findsOneWidget);
    expect(find.byKey(const Key('benefits-chip-services')), findsOneWidget);
    expect(find.byKey(const Key('benefits-chip-health')), findsNothing);
    expect(find.text('2 PARCEIROS EM GOIÂNIA'), findsOneWidget);
    expect(find.byKey(const Key('benefits-partner-linq')), findsOneWidget);
    expect(find.byKey(const Key('benefits-partner-fast-acai')), findsOneWidget);
    expect(find.text('SERVIÇOS · OFICIAL'), findsOneWidget);
    expect(find.text('10% OFF'), findsOneWidget);
    expect(
      find.text(
        'Os descontos são dados pelos parceiros. Você não paga nada '
        'a mais por usar o clube.',
      ),
      findsOneWidget,
    );
    // Com menos de 8 parceiros não há busca, mapa nem "Perto de você".
    expect(find.byKey(const Key('benefits-search')), findsNothing);
    expect(find.byKey(const Key('benefits-near')), findsNothing);

    await tester.tap(find.byKey(const Key('benefits-chip-food')));
    await tester.pump();
    expect(find.byKey(const Key('benefits-partner-fast-acai')), findsOneWidget);
    expect(find.byKey(const Key('benefits-partner-linq')), findsNothing);
    expect(find.text('1 PARCEIRO EM GOIÂNIA'), findsOneWidget);

    // O banner fica fixo com o filtro.
    expect(find.byKey(const Key('benefits-sponsor-banner')), findsOneWidget);

    await tester.tap(find.byKey(const Key('benefits-chip-all')));
    await tester.pump();
    expect(find.byKey(const Key('benefits-partner-linq')), findsOneWidget);

    expect(service.of(BenefitEventType.clubView), hasLength(1));
    expect(
      service.of(BenefitEventType.clubView).single.source,
      BenefitSource.hubCard,
    );
  });

  testWidgets('quem não testa não vê a LinQ, o banner nem o "Oferecido por"', (
    tester,
  ) async {
    await _pumpClub(tester, service: FakeBenefitsClubService());

    expect(find.byKey(const Key('benefits-sponsor-banner')), findsNothing);
    expect(find.text('Oferecido por LinQ Telecom'), findsNothing);
    expect(find.text('Descontos dos parceiros NexaGO'), findsOneWidget);
    expect(find.byKey(const Key('benefits-partner-linq')), findsNothing);
    expect(find.byKey(const Key('benefits-chip-services')), findsNothing);
    expect(find.byKey(const Key('benefits-chip-food')), findsOneWidget);
    expect(find.text('1 PARCEIRO EM GOIÂNIA'), findsOneWidget);
  });

  testWidgets('sem parceiro visível mostra o vazio', (tester) async {
    await _pumpClub(tester, service: FakeBenefitsClubService(), partners: []);

    expect(find.text('Nenhum parceiro por aqui ainda'), findsOneWidget);
  });

  testWidgets('carregando mostra o esqueleto com brilho', (tester) async {
    await tester.binding.setSurfaceSize(const Size(430, 1600));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final router = benefitsTestRouter('/athlete/clube');
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(
        overrides: benefitsOverrides(
          service: FakeBenefitsClubService(),
          partnersStream: pendingStream(),
        ),
        child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
      ),
    );
    await tester.pump();
    expect(find.byKey(const Key('benefits-skeleton')), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 700));
    expect(find.byKey(const Key('benefits-skeleton')), findsOneWidget);
  });

  testWidgets('link direto (sem origem) grava deeplink e passa adiante', (
    tester,
  ) async {
    final service = FakeBenefitsClubService();
    await _pumpClub(tester, service: service, location: '/athlete/clube');

    expect(
      service.of(BenefitEventType.clubView).single.source,
      BenefitSource.deeplink,
    );

    await tester.tap(find.byKey(const Key('benefits-partner-fast-acai')));
    await tester.pumpAndSettle();
    // A tela do parceiro recebeu a mesma origem pela rota.
    final page = tester.widget<BenefitPartnerPage>(
      find.byType(BenefitPartnerPage),
    );
    expect(page.partnerId, 'fast-acai');
    expect(page.source, BenefitSource.deeplink);
    expect(service.of(BenefitEventType.partnerView).single, (
      type: BenefitEventType.partnerView,
      source: BenefitSource.deeplink,
      partnerId: 'fast-acai',
    ));
  });

  group('carteirinha', () {
    testWidgets('sem resgate confirmado: nome, nível, membro desde e código, '
        'sem linha de economia', (tester) async {
      await _pumpClub(
        tester,
        service: FakeBenefitsClubService(
          myBenefits: const MyBenefits(
            savings: BenefitSavings(confirmedCount: 0, totalDiscountCents: 0),
          ),
        ),
        memberSince: DateTime(2025, 3, 10),
      );

      final card = find.byKey(BenefitsMemberCard.cardKey);
      expect(card, findsOneWidget);
      expect(find.text('NEXA · MEMBRO'), findsOneWidget);
      expect(find.text('Silvio Dionizio'), findsOneWidget);
      expect(find.text('Membro desde mar/2025'), findsOneWidget);
      expect(find.textContaining('beach_tennis · '), findsOneWidget);
      expect(find.text('NEXA-ABCD'), findsOneWidget);
      expect(find.byKey(BenefitsMemberCard.savingsKey), findsNothing);
      expect(find.textContaining('Economia'), findsNothing);
    });

    testWidgets('com resgate confirmado mostra o valor real', (tester) async {
      await _pumpClub(
        tester,
        service: FakeBenefitsClubService(
          myBenefits: const MyBenefits(
            savings: BenefitSavings(
              confirmedCount: 2,
              totalDiscountCents: 1250,
            ),
          ),
        ),
      );

      expect(find.byKey(BenefitsMemberCard.savingsKey), findsOneWidget);
      expect(find.text('Economia confirmada pelos parceiros'), findsOneWidget);
      expect(find.textContaining('12,50'), findsOneWidget);
      // Sem data da conta, a linha "Membro desde" some.
      expect(find.textContaining('Membro desde'), findsNothing);
    });

    testWidgets('"Mostrar QR" abre a folha com o QR do código e o Copiar', (
      tester,
    ) async {
      String? copied;
      final messenger = tester.binding.defaultBinaryMessenger;
      messenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
        if (call.method == 'Clipboard.setData') {
          copied = (call.arguments as Map)['text'] as String?;
        }
        return null;
      });
      addTearDown(
        () => messenger.setMockMethodCallHandler(SystemChannels.platform, null),
      );
      await _pumpClub(tester, service: FakeBenefitsClubService());

      await tester.tap(find.byKey(BenefitsMemberCard.qrButtonKey));
      await tester.pumpAndSettle();
      expect(find.text('Seu código de membro'), findsOneWidget);
      final qr = tester.widget<QrImageView>(find.byType(QrImageView));
      expect(qr.semanticsLabel, 'QR do código NEXA-ABCD');
      expect(
        find.text('Mostre no balcão do parceiro. O código é só seu.'),
        findsOneWidget,
      );

      await tester.tap(find.byKey(const Key('benefits-qr-copy')));
      await tester.pump();
      expect(copied, 'NEXA-ABCD');
      expect(find.text('Código NEXA-ABCD copiado'), findsOneWidget);
    });
  });

  testWidgets('destaque da semana no topo (com selo de prazo), fora da lista, '
      'e abre com a origem featured; "Novo" no card novo', (tester) async {
    final service = FakeBenefitsClubService();
    final featured = Partner(
      id: 'promo',
      name: 'Promo Açaí',
      category: PartnerCategory.food,
      benefitHighlight: '20% OFF',
      benefitTitle: '20% no combo',
      ctaLabel: 'Pedir',
      link: 'https://promo.example',
      active: true,
      featured: true,
      validUntil: testNow.add(const Duration(days: 3)),
    );
    final fresh = Partner(
      id: 'fresh',
      name: 'Loja Nova',
      category: PartnerCategory.sports,
      benefitTitle: 'Brinde',
      ctaLabel: 'Usar',
      link: 'https://fresh.example',
      active: true,
      createdAt: testNow.subtract(const Duration(days: 2)),
    );
    await _pumpClub(
      tester,
      service: service,
      partners: [featured, fastAcai, fresh],
    );

    expect(find.byKey(const Key('benefits-featured-promo')), findsOneWidget);
    expect(find.text('DESTAQUE DA SEMANA'), findsOneWidget);
    expect(find.text('TERMINA EM 3 DIAS'), findsOneWidget);
    expect(find.byKey(const Key('benefits-partner-promo')), findsNothing);
    expect(find.text('NOVO'), findsOneWidget);

    await tester.tap(find.byKey(const Key('benefits-featured-promo')));
    await tester.pumpAndSettle();
    expect(
      tester.widget<BenefitPartnerPage>(find.byType(BenefitPartnerPage)).source,
      BenefitSource.featured,
    );
  });

  testWidgets('parceiro fora da validade some', (tester) async {
    await _pumpClub(
      tester,
      service: FakeBenefitsClubService(),
      partners: [
        fastAcai,
        Partner(
          id: 'old',
          name: 'Antigo',
          ctaLabel: 'Usar',
          active: true,
          validUntil: testNow.subtract(const Duration(hours: 1)),
        ),
        Partner(
          id: 'later',
          name: 'Depois',
          ctaLabel: 'Usar',
          active: true,
          startsAt: testNow.add(const Duration(days: 1)),
        ),
      ],
    );

    expect(find.byKey(const Key('benefits-partner-old')), findsNothing);
    expect(find.byKey(const Key('benefits-partner-later')), findsNothing);
    expect(find.byKey(const Key('benefits-partner-fast-acai')), findsOneWidget);
  });

  testWidgets('parceiro com requisito aparece bloqueado com a frase', (
    tester,
  ) async {
    const squadOnly = Partner(
      id: 'squad-shop',
      name: 'Loja do Squad',
      category: PartnerCategory.sports,
      benefitHighlight: '30% OFF',
      benefitTitle: '30% em tudo',
      ctaLabel: 'Usar',
      link: 'https://squad.example',
      couponMode: PartnerCouponMode.fixed,
      active: true,
      requirement: PartnerRequirement(type: PartnerRequirementType.squad),
      requirementLabel: 'Exclusivo para embaixadores do Squad',
    );
    await _pumpClub(
      tester,
      service: FakeBenefitsClubService(),
      partners: const [fastAcai, squadOnly],
    );

    final card = find.byKey(const Key('benefits-partner-squad-shop'));
    expect(card, findsOneWidget);
    expect(
      find.descendant(
        of: card,
        matching: find.text('Exclusivo para embaixadores do Squad'),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: card,
        matching: find.byIcon(Icons.lock_outline_rounded),
      ),
      findsWidgets,
    );
  });

  group('botão de busca no header (8+ parceiros)', () {
    testWidgets('com 7 parceiros não há botão de busca nem busca na tela', (
      tester,
    ) async {
      await _pumpClub(
        tester,
        service: FakeBenefitsClubService(),
        partners: _manyPartners(7),
      );
      expect(find.byKey(const Key('benefits-open-search')), findsNothing);
      expect(find.byKey(const Key('benefits-search')), findsNothing);
    });

    testWidgets('com 8 o botão aparece no header e abre a tela de busca', (
      tester,
    ) async {
      await _pumpClub(
        tester,
        service: FakeBenefitsClubService(),
        partners: _manyPartners(8),
      );
      // A busca não fica mais embutida na tela do clube.
      expect(find.byKey(const Key('benefits-search')), findsNothing);
      expect(find.byKey(const Key('benefits-open-search')), findsOneWidget);
      expect(find.byKey(const Key('benefits-open-mine')), findsOneWidget);

      await tester.tap(find.byKey(const Key('benefits-open-search')));
      await tester.pumpAndSettle();
      expect(find.byType(BenefitsSearchPage), findsOneWidget);
      expect(find.byKey(const Key('benefits-search')), findsOneWidget);
    });
  });

  group('folhas da entrada', () {
    testWidgets('primeira visita mostra "Como funciona o clube" uma vez', (
      tester,
    ) async {
      final onboarding = FakeOnboardingStore(seen: false);
      await _pumpClub(
        tester,
        service: FakeBenefitsClubService(),
        onboarding: onboarding,
      );

      expect(find.text('Como funciona o clube'), findsOneWidget);
      expect(find.text('Um toque e pronto'), findsOneWidget);
      expect(onboarding.marks, 1);
      await tester.tap(find.byKey(const Key('benefits-how-it-works-ok')));
      await tester.pumpAndSettle();
      expect(find.text('Como funciona o clube'), findsNothing);
    });

    testWidgets('pergunta pendente: "Sim" responde pela callable', (
      tester,
    ) async {
      final service = FakeBenefitsClubService(
        myBenefits: MyBenefits(
          uses: [
            BenefitUse(
              partnerId: 'fast-acai',
              useCount: 1,
              lastUsedAt: testNow.subtract(const Duration(days: 1)),
            ),
          ],
          pendingQuestionPartnerId: 'fast-acai',
        ),
      );
      await _pumpClub(tester, service: service);

      expect(
        find.text('Conseguiu usar o desconto na Fast Açaí?'),
        findsOneWidget,
      );
      expect(find.textContaining('NEXAGO10 ontem'), findsOneWidget);
      await tester.tap(find.byKey(const Key('benefits-question-yes')));
      await tester.pumpAndSettle();
      expect(service.answers.single, (partnerId: 'fast-acai', used: true));
    });

    testWidgets('"Agora não" só fecha e não pergunta de novo na sessão', (
      tester,
    ) async {
      final service = FakeBenefitsClubService(
        myBenefits: const MyBenefits(pendingQuestionPartnerId: 'fast-acai'),
      );
      final router = await _pumpClub(tester, service: service);

      await tester.tap(find.byKey(const Key('benefits-question-later')));
      await tester.pumpAndSettle();
      expect(service.answers, isEmpty);

      router.go('/');
      await tester.pumpAndSettle();
      router.go('/athlete/clube');
      await tester.pumpAndSettle();
      expect(
        find.text('Conseguiu usar o desconto na Fast Açaí?'),
        findsNothing,
      );
    });
  });

  testWidgets('toque no banner abre o patrocinador com a origem da visita', (
    tester,
  ) async {
    final service = FakeBenefitsClubService();
    await _pumpClub(
      tester,
      service: service,
      config: const BenefitsClubConfig(testerUids: [testUid]),
    );

    await tester.tap(find.byKey(const Key('benefits-sponsor-banner')));
    await tester.pumpAndSettle();
    final page = tester.widget<BenefitPartnerPage>(
      find.byType(BenefitPartnerPage),
    );
    expect(page.partnerId, 'linq');
    expect(page.source, BenefitSource.hubCard);
  });

  testWidgets('ordem: banner antes do destaque; master que também é destaque '
      'aparece só no banner', (tester) async {
    const featuredSponsor = Partner(
      id: 'linq',
      name: 'LinQ Telecom',
      category: PartnerCategory.services,
      benefitTitle: 'Instalação grátis',
      ctaType: PartnerCtaType.leadForm,
      ctaLabel: 'Quero contratar',
      isMasterSponsor: true,
      featured: true,
      priority: 100,
      active: true,
    );
    const otherFeatured = Partner(
      id: 'promo',
      name: 'Promo',
      category: PartnerCategory.food,
      benefitTitle: 'Combo',
      ctaLabel: 'Pedir',
      link: 'https://promo.example',
      featured: true,
      priority: 10,
      active: true,
    );

    // Master também é o destaque de maior prioridade: só o banner.
    await _pumpClub(
      tester,
      service: FakeBenefitsClubService(),
      partners: const [featuredSponsor, otherFeatured, fastAcai],
    );
    expect(find.byKey(const Key('benefits-sponsor-banner')), findsOneWidget);
    expect(find.byKey(const Key('benefits-featured-linq')), findsNothing);
    expect(find.text('DESTAQUE DA SEMANA'), findsNothing);
  });

  testWidgets('master diferente do destaque: banner e depois o destaque', (
    tester,
  ) async {
    const promo = Partner(
      id: 'promo',
      name: 'Promo',
      category: PartnerCategory.food,
      benefitTitle: 'Combo',
      ctaLabel: 'Pedir',
      link: 'https://promo.example',
      featured: true,
      priority: 10,
      active: true,
    );
    await _pumpClub(
      tester,
      service: FakeBenefitsClubService(),
      config: const BenefitsClubConfig(testerUids: [testUid]),
      partners: const [linq, promo, fastAcai],
    );

    final banner = find.byKey(const Key('benefits-sponsor-banner'));
    final featured = find.byKey(const Key('benefits-featured-promo'));
    expect(banner, findsOneWidget);
    expect(featured, findsOneWidget);
    expect(
      tester.getBottomLeft(banner).dy,
      lessThan(tester.getTopLeft(featured).dy),
    );
    expect(
      tester.getBottomLeft(featured).dy,
      lessThan(
        tester.getTopLeft(find.byKey(const Key('benefits-chip-all'))).dy,
      ),
    );
  });
}
