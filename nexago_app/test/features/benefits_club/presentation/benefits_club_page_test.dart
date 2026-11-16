import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/benefits_club/domain/benefit_event.dart';
import 'package:nexago_app/features/benefits_club/domain/benefits_club_config.dart';
import 'package:nexago_app/features/benefits_club/domain/partner.dart';
import 'package:nexago_app/features/benefits_club/presentation/benefit_partner_page.dart';

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
}) async {
  await tester.binding.setSurfaceSize(const Size(430, 1800));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  final router = benefitsTestRouter(location);
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: benefitsOverrides(
        service: service,
        config: config,
        partners: partners,
      ),
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await tester.pumpAndSettle();
  return router;
}

void main() {
  testWidgets('quem testa vê o banner do patrocinador, chips só das categorias '
      'presentes e o filtro local', (tester) async {
    final service = FakeBenefitsClubService();
    await _pumpClub(
      tester,
      service: service,
      config: const BenefitsClubConfig(testerUids: [testUid]),
    );

    expect(find.text('Clube de Vantagens'), findsOneWidget);
    final banner = find.byKey(const Key('benefits-sponsor-banner'));
    expect(banner, findsOneWidget);
    expect(
      find.descendant(of: banner, matching: find.text('LinQ Telecom')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: banner, matching: find.text('Quero contratar')),
      findsOneWidget,
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

    await tester.tap(find.byKey(const Key('benefits-chip-food')));
    await tester.pump();
    expect(find.byKey(const Key('benefits-partner-fast-acai')), findsOneWidget);
    expect(find.byKey(const Key('benefits-partner-linq')), findsNothing);
    expect(find.text('1 PARCEIRO EM GOIÂNIA'), findsOneWidget);

    await tester.tap(find.byKey(const Key('benefits-chip-all')));
    await tester.pump();
    expect(find.byKey(const Key('benefits-partner-linq')), findsOneWidget);

    expect(service.of(BenefitEventType.clubView), hasLength(1));
    expect(
      service.of(BenefitEventType.clubView).single.source,
      BenefitSource.hubCard,
    );
  });

  testWidgets('quem não testa não vê a LinQ nem o banner', (tester) async {
    await _pumpClub(tester, service: FakeBenefitsClubService());

    expect(find.byKey(const Key('benefits-sponsor-banner')), findsNothing);
    expect(find.byKey(const Key('benefits-partner-linq')), findsNothing);
    expect(find.byKey(const Key('benefits-chip-services')), findsNothing);
    expect(find.byKey(const Key('benefits-chip-food')), findsOneWidget);
    expect(find.text('1 PARCEIRO EM GOIÂNIA'), findsOneWidget);
  });

  testWidgets('sem parceiro visível mostra o vazio', (tester) async {
    await _pumpClub(tester, service: FakeBenefitsClubService(), partners: []);

    expect(find.text('Nenhum parceiro por aqui ainda'), findsOneWidget);
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
}
