import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_radii.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_home/athlete_home_hero.dart';
import 'package:nexago_app/features/cashback/application/cashback_providers.dart';
import 'package:nexago_app/features/cashback/presentation/widgets/cashback_balance_pill.dart';

/// Réplica da pílula de XP privada (`_HeroXpPill`, em `athlete_home_page.dart`
/// — não é exportável): mesmo Row/Icon/Text/padding, só para testar o
/// encaixe ao lado da pílula de cashback em telas estreitas.
class _XpPillReplica extends StatelessWidget {
  const _XpPillReplica({required this.current, required this.goal});

  final int current;
  final int goal;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        borderRadius: AppRadii.pillAll,
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.55)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.bolt_rounded, size: 16, color: AppColors.brand),
          const SizedBox(width: 5),
          Text(
            '$current/$goal',
            style: AppTypography.titleS.copyWith(
              color: AppColors.white,
              fontSize: 13,
            ),
          ),
        ],
      ),
    );
  }
}

void main() {
  // Saldo de 4 dígitos (R$ 1.234,56) e XP bem acima do normal: o pior caso
  // para a largura da fileira de pílulas no canto do hero.
  const availableCents = 123456;
  const xpCurrent = 9999;
  const xpGoal = 100;

  Future<void> pumpHeroAt(WidgetTester tester, double width) async {
    tester.view.physicalSize = Size(width, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          cashbackPillCentsProvider.overrideWithValue(availableCents),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          // `setSurfaceSize` sozinho não muda o MediaQuery: o hero e as
          // pílulas leem `MediaQuery.paddingOf`/largura disponível por ele,
          // não pelo tamanho físico da superfície de teste.
          home: MediaQuery(
            data: MediaQueryData(
              size: Size(width, 640),
              padding: const EdgeInsets.only(top: 59),
            ),
            child: Scaffold(
              body: AthleteHomeHero(
                name: 'Atleta',
                gender: 'Masculino',
                tagline: 'O esporte conecta.',
                now: DateTime(2026, 9, 11, 22),
                // Mesma composição de `AthleteHomePage`: pílula do cashback
                // à esquerda da de XP, num Row de mainAxisSize.min.
                bottomRight: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CashbackHeroPillSlot(),
                    _XpPillReplica(current: xpCurrent, goal: xpGoal),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pump();
  }

  for (final width in [320.0, 375.0]) {
    testWidgets(
      'pílulas de cashback e XP cabem lado a lado em ${width.toInt()}px '
      'sem estourar',
      (tester) async {
        await pumpHeroAt(tester, width);

        expect(
          tester.takeException(),
          isNull,
          reason: 'fileira de pílulas não pode estourar em $width px',
        );
        expect(find.byType(CashbackBalancePill), findsOneWidget);
        expect(find.text(formatBRLFromCents(availableCents)), findsOneWidget);
        expect(find.byType(_XpPillReplica), findsOneWidget);
        expect(find.text('$xpCurrent/$xpGoal'), findsOneWidget);
      },
    );
  }
}
