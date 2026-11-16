import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/location/user_location_snapshot.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/benefits_club/domain/benefit_event.dart';
import 'package:nexago_app/features/benefits_club/domain/benefits_club_config.dart';
import 'package:nexago_app/features/benefits_club/domain/partner.dart';
import 'package:nexago_app/features/benefits_club/presentation/benefit_partner_page.dart';
import 'package:nexago_app/features/benefits_club/presentation/benefits_club_page.dart';
import '../support/benefits_club_fakes.dart';

/// Abre o clube e entra na busca pelo botão do header, como o atleta faz.
Future<GoRouter> _pumpSearch(
  WidgetTester tester, {
  required List<Partner> partners,
  UserLocationSnapshot userLocation = const UserLocationSnapshot(
    source: UserLocationSource.none,
  ),
}) async {
  await tester.binding.setSurfaceSize(const Size(430, 2400));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  final router = benefitsTestRouter('/athlete/clube?origem=hub_card');
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: benefitsOverrides(
        service: FakeBenefitsClubService(),
        config: const BenefitsClubConfig(enabled: true),
        partners: partners,
        location: userLocation,
        onboarding: FakeOnboardingStore(seen: true),
      ),
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('benefits-open-search')));
  await tester.pumpAndSettle();
  return router;
}

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
  testWidgets('busca filtra sem acento e abre o parceiro com a origem search', (
    tester,
  ) async {
    await _pumpSearch(tester, partners: _manyPartners(8));

    expect(find.text('Buscar parceiro ou categoria'), findsOneWidget);
    // Sem token do Mapbox nos testes não há mapa: a tela abre na lista.
    expect(find.byKey(const Key('benefits-view-map')), findsNothing);
    expect(find.byKey(const Key('benefits-search-list')), findsOneWidget);
    // Sem localização liberada, nada de "Perto de você".
    expect(find.byKey(const Key('benefits-near')), findsNothing);

    await tester.enterText(find.byKey(const Key('benefits-search')), 'acai');
    await tester.pump();
    expect(find.byKey(const Key('benefits-partner-p0')), findsOneWidget);
    expect(find.byKey(const Key('benefits-partner-p1')), findsNothing);

    await tester.tap(find.byKey(const Key('benefits-partner-p0')));
    await tester.pumpAndSettle();
    expect(
      tester.widget<BenefitPartnerPage>(find.byType(BenefitPartnerPage)).source,
      BenefitSource.search,
    );
  });

  testWidgets('busca sem resultado avisa', (tester) async {
    await _pumpSearch(tester, partners: _manyPartners(8));
    await tester.enterText(find.byKey(const Key('benefits-search')), 'zzz');
    await tester.pump();
    expect(find.text('Nenhum parceiro encontrado para "zzz".'), findsOneWidget);
  });

  testWidgets('"Perto de você" só com GPS já liberado e ordena pela '
      'distância', (tester) async {
    await _pumpSearch(
      tester,
      partners: _manyPartners(8),
      // O atleta está ao lado da loja 7 (a de menor prioridade).
      userLocation: const UserLocationSnapshot(
        source: UserLocationSource.profile,
        latitude: -16.75,
        longitude: -49.25,
        city: 'Goiânia',
      ),
    );
    expect(find.byKey(const Key('benefits-near')), findsOneWidget);
    await tester.tap(find.byKey(const Key('benefits-near')));
    await tester.pump();
    expect(find.text('8 PARCEIROS PERTO DE VOCÊ'), findsOneWidget);

    final y7 = tester
        .getTopLeft(find.byKey(const Key('benefits-partner-p7')))
        .dy;
    final y0 = tester
        .getTopLeft(find.byKey(const Key('benefits-partner-p0')))
        .dy;
    expect(y7, lessThan(y0));
  });

  testWidgets('voltar leva de novo ao clube', (tester) async {
    await _pumpSearch(tester, partners: _manyPartners(8));
    await tester.tap(find.byTooltip('Voltar'));
    await tester.pumpAndSettle();
    expect(find.byType(BenefitsClubPage), findsOneWidget);
    expect(find.byKey(const Key('benefits-search')), findsNothing);
  });
}
