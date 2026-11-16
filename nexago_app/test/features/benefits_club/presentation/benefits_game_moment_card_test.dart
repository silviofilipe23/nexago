import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/benefits_club/domain/benefits_club_config.dart';
import 'package:nexago_app/features/benefits_club/domain/partner.dart';
import 'package:nexago_app/features/benefits_club/presentation/widgets/benefits_game_moment_card.dart';

import '../support/benefits_club_fakes.dart';

const _postGameAcai = Partner(
  id: 'fast-acai',
  name: 'Fast Açaí',
  category: PartnerCategory.food,
  benefitHighlight: '10% OFF',
  benefitTitle: '10% de desconto',
  ctaLabel: 'Pedir',
  link: 'https://fast.example',
  active: true,
  priority: 10,
  placements: [PartnerPlacement.postGame],
);

const _dayShop = Partner(
  id: 'day-shop',
  name: 'Loja do Dia',
  category: PartnerCategory.sports,
  benefitHighlight: '5% OFF',
  ctaLabel: 'Usar',
  link: 'https://day.example',
  active: true,
  placements: [PartnerPlacement.tournamentDay],
);

Future<void> _pumpCard(
  WidgetTester tester, {
  required PartnerPlacement placement,
  List<Partner> partners = const [_postGameAcai, _dayShop],
  BenefitsClubConfig config = const BenefitsClubConfig(enabled: true),
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: benefitsOverrides(
        service: FakeBenefitsClubService(),
        config: config,
        partners: partners,
      ),
      child: MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: ListView(
            children: [
              const Text('placar'),
              BenefitsGameMomentCard(placement: placement),
            ],
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('pós-jogo: o parceiro de maior prioridade com post_game', (
    tester,
  ) async {
    await _pumpCard(tester, placement: PartnerPlacement.postGame);

    expect(find.byKey(BenefitsGameMomentCard.cardKey), findsOneWidget);
    expect(find.text('CLUBE DE VANTAGENS'), findsOneWidget);
    expect(find.text('Bateu a fome?'), findsOneWidget);
    expect(find.text('10% OFF na Fast Açaí'), findsOneWidget);
  });

  testWidgets(
    'dia de torneio: parceiro que não é de comida tem título neutro',
    (tester) async {
      await _pumpCard(tester, placement: PartnerPlacement.tournamentDay);

      expect(find.text('Vantagem do clube'), findsOneWidget);
      expect(find.text('5% OFF na Loja do Dia'), findsOneWidget);
    },
  );

  testWidgets('sem parceiro com o placement: nada aparece', (tester) async {
    await _pumpCard(
      tester,
      placement: PartnerPlacement.postGame,
      partners: const [_dayShop],
    );
    expect(find.byKey(BenefitsGameMomentCard.cardKey), findsNothing);
    expect(find.text('placar'), findsOneWidget);
  });

  testWidgets('clube invisível para a pessoa: nada aparece', (tester) async {
    await _pumpCard(
      tester,
      placement: PartnerPlacement.postGame,
      config: const BenefitsClubConfig(testerUids: ['outra-pessoa']),
    );
    expect(find.byKey(BenefitsGameMomentCard.cardKey), findsNothing);
  });

  testWidgets('parceiro com requisito fica fora do momento do jogo', (
    tester,
  ) async {
    await _pumpCard(
      tester,
      placement: PartnerPlacement.postGame,
      partners: const [
        Partner(
          id: 'squad',
          name: 'Squad Food',
          category: PartnerCategory.food,
          ctaLabel: 'Usar',
          active: true,
          placements: [PartnerPlacement.postGame],
          requirement: PartnerRequirement(type: PartnerRequirementType.squad),
        ),
      ],
    );
    expect(find.byKey(BenefitsGameMomentCard.cardKey), findsNothing);
  });
}
