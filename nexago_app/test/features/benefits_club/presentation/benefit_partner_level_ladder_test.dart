import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/benefits_club/domain/benefits_club_config.dart';
import 'package:nexago_app/features/benefits_club/domain/partner.dart';
import 'package:nexago_app/features/benefits_club/presentation/widgets/benefit_partner_level_ladder.dart';

import '../support/benefits_club_fakes.dart';

/// Fast Açaí com desconto por elo: base 10%, Competidor 15%, Elite 20%.
const _tiered = Partner(
  id: 'fast-acai',
  name: 'Fast Açaí',
  category: PartnerCategory.food,
  benefitHighlight: '10% OFF',
  benefitTitle: '10% de desconto em todo pedido',
  ctaType: PartnerCtaType.link,
  ctaLabel: 'Pedir com desconto',
  link: 'https://fast.example/cardapio',
  couponMode: PartnerCouponMode.fixed,
  couponCode: 'NEXAGO10',
  active: true,
  levelTiers: [
    PartnerLevelTier(
      minRank: 'COMPETIDOR',
      benefitHighlight: '15% OFF',
      benefitTitle: '15% de desconto em todo pedido',
    ),
    PartnerLevelTier(
      minRank: 'ELITE',
      benefitHighlight: '20% OFF',
      benefitTitle: '20% de desconto em todo pedido',
    ),
  ],
);

/// Desafiante III (degrau 6): alcança a faixa de Competidor, não a de Elite.
const _desafiante = AthleteProfile(
  id: testUid,
  name: 'Atleta Teste',
  sport: 'beach_tennis',
  level: 'C',
  city: 'Goiânia',
  sandRankTrackIndex: 6,
);

Future<void> _pumpPartner(
  WidgetTester tester, {
  required FakeBenefitsClubService service,
  required List<Partner> partners,
  AthleteProfile profile = _desafiante,
}) async {
  await tester.binding.setSurfaceSize(const Size(430, 2000));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  final router = benefitsTestRouter('/athlete/clube/${partners.first.id}');
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: benefitsOverrides(
        service: service,
        config: const BenefitsClubConfig(enabled: true),
        partners: partners,
        profile: profile,
      ),
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('"Desconto por elo" lista a base e as faixas e marca a do '
      'atleta; o benefício e o cupom são os da faixa dele', (tester) async {
    final service = FakeBenefitsClubService()..claimCoupon = 'NEXA15';
    await _pumpPartner(tester, service: service, partners: const [_tiered]);

    expect(find.text('DESCONTO POR ELO'), findsOneWidget);
    expect(find.text('Iniciante'), findsOneWidget);
    expect(find.text('Competidor'), findsOneWidget);
    expect(find.text('Elite'), findsOneWidget);

    final current = find.byKey(BenefitLevelLadder.currentRowKey);
    expect(current, findsOneWidget);
    expect(
      find.descendant(of: current, matching: find.text('Competidor')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: current, matching: find.text('SEU DESCONTO')),
      findsOneWidget,
    );
    expect(find.text('SEU DESCONTO'), findsOneWidget);

    // O destaque do parceiro já é o da faixa (e não o benefício-base).
    expect(find.text('15% de desconto em todo pedido'), findsOneWidget);
    expect(find.text('10% de desconto em todo pedido'), findsNothing);

    // O cupom público nunca aparece como se fosse o do atleta.
    expect(find.text('NEXAGO10'), findsNothing);
    expect(find.byKey(const Key('benefits-claim-coupon')), findsOneWidget);

    await tester.tap(find.byKey(const Key('benefits-claim-coupon')));
    await tester.pumpAndSettle();
    expect(service.claims, ['fast-acai']);
    expect(find.text('NEXA15'), findsWidgets);
  });

  testWidgets('sem elo: a linha marcada é a do Iniciante', (tester) async {
    await _pumpPartner(
      tester,
      service: FakeBenefitsClubService(),
      partners: const [_tiered],
      profile: athleteProfile,
    );

    final current = find.byKey(BenefitLevelLadder.currentRowKey);
    expect(
      find.descendant(of: current, matching: find.text('Iniciante')),
      findsOneWidget,
    );
    expect(find.text('10% de desconto em todo pedido'), findsOneWidget);
  });

  testWidgets('parceiro sem faixas não mostra a seção e mantém o cupom '
      'público', (tester) async {
    final service = FakeBenefitsClubService();
    await _pumpPartner(tester, service: service, partners: const [fastAcai]);

    expect(find.text('DESCONTO POR ELO'), findsNothing);
    expect(find.byType(BenefitLevelLadder), findsNothing);
    expect(find.text('NEXAGO10'), findsOneWidget);
    expect(service.claims, isEmpty);
  });
}
