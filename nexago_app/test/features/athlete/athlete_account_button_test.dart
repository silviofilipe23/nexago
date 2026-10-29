import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/active_role_providers.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_home/athlete_account_sheet.dart';

void main() {
  Widget wrap() => ProviderScope(
        overrides: [
          athleteProfileProvider.overrideWith((ref) => Stream.value(null)),
          hasMultipleMobileRolesProvider.overrideWithValue(false),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const Scaffold(
            body: Center(child: AthleteAccountButton()),
          ),
        ),
      );

  testWidgets('abre o menu da conta com perfil e configurações',
      (tester) async {
    await tester.pumpWidget(wrap());
    await tester.pump();

    await tester.tap(find.byKey(const Key('athlete-account-button')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.byKey(const Key('athlete-account-profile')), findsOneWidget);
    expect(find.byKey(const Key('athlete-account-settings')), findsOneWidget);
  });

  testWidgets('mostra a seta ⌄ e respeita o alvo de toque de 44',
      (tester) async {
    await tester.pumpWidget(wrap());
    await tester.pump();

    expect(find.byIcon(Icons.expand_more_rounded), findsOneWidget);
    final size = tester.getSize(find.byKey(const Key('athlete-account-button')));
    expect(size.width, greaterThanOrEqualTo(44));
    expect(size.height, greaterThanOrEqualTo(44));
    expect(
      find.bySemanticsLabel(athleteAccountMenuSemanticLabel),
      findsOneWidget,
    );
  });
}
