import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/theme/theme_mode_provider.dart';
import 'package:nexago_app/core/theme/theme_preferences_repository.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_settings/athlete_appearance_sheet.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Mesma fiação do `main.dart`: o [MaterialApp] segue a preferência salva.
class _App extends ConsumerWidget {
  const _App();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp(
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: ref.watch(resolvedThemeModeProvider),
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: TextButton(
              onPressed: () => showAthleteAppearanceSheet(context),
              child: const Text('abrir'),
            ),
          ),
        ),
      ),
    );
  }
}

Future<void> _pumpApp(WidgetTester tester) async {
  final repo = await ThemePreferencesRepository.create();
  await tester.pumpWidget(
    ProviderScope(
      overrides: [themePreferencesRepositoryProvider.overrideWithValue(repo)],
      child: const _App(),
    ),
  );
}

Brightness _brightness(WidgetTester tester) =>
    Theme.of(tester.element(find.text('abrir'))).brightness;

void main() {
  testWidgets('sem preferência salva, o app abre no escuro', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await _pumpApp(tester);

    expect(_brightness(tester), Brightness.dark);
  });

  testWidgets('escolher Claro troca o tema, fecha a folha e salva',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    await _pumpApp(tester);

    await tester.tap(find.text('abrir'));
    await tester.pumpAndSettle();
    expect(find.text('Automático'), findsOneWidget);
    expect(find.text('Escuro'), findsOneWidget);

    await tester.tap(find.text('Claro'));
    await tester.pumpAndSettle();

    expect(find.text('Aparência'), findsNothing);
    expect(_brightness(tester), Brightness.light);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('theme_mode_preference'), 'light');
  });

  testWidgets('a preferência salva vale na próxima abertura', (tester) async {
    SharedPreferences.setMockInitialValues({'theme_mode_preference': 'light'});
    await _pumpApp(tester);

    expect(_brightness(tester), Brightness.light);
  });
}
