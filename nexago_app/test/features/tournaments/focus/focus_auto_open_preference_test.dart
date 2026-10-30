import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/data/focus_auto_open_preference.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/widgets/focus_auto_open_settings_tile.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('desligada por padrão', () async {
    SharedPreferences.setMockInitialValues({});
    final container = ProviderContainer();
    addTearDown(container.dispose);

    expect(await container.read(focusAutoOpenPreferenceProvider.future), false);
  });

  test('a escolha fica gravada no aparelho', () async {
    SharedPreferences.setMockInitialValues({});
    final first = ProviderContainer();
    await first.read(focusAutoOpenPreferenceProvider.future);
    await first.read(focusAutoOpenPreferenceProvider.notifier).set(true);
    first.dispose();

    final second = ProviderContainer();
    addTearDown(second.dispose);
    expect(await second.read(focusAutoOpenPreferenceProvider.future), true);
  });

  testWidgets('a chave das Configurações liga e desliga', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(
          home: Scaffold(body: FocusAutoOpenSettingsTile()),
        ),
      ),
    );
    await tester.pumpAndSettle();

    Switch toggle() => tester.widget<Switch>(find.byType(Switch));
    expect(find.text('Abrir o Modo Focus sozinho'), findsOneWidget);
    expect(toggle().value, isFalse);

    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    expect(toggle().value, isTrue);

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getBool(FocusAutoOpenPreferenceNotifier.prefsKey), isTrue);
  });
}
