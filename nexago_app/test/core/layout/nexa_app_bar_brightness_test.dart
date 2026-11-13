import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:native_liquid_glass/native_liquid_glass.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:nexago_app/core/layout/nexa_native_liquid_glass.dart';
import 'package:nexago_app/core/theme/native_interface_style.dart';

/// A barra nativa (UINavigationBar) pinta o título com a aparência do
/// aparelho. Só pode ser usada quando ela bate com o tema do app; senão o
/// título some (preto no escuro, branco no claro).
void main() {
  final iOS = TargetPlatformVariant.only(TargetPlatform.iOS);

  setUp(() => debugNexaSupportsLiquidGlassOverride = true);
  tearDown(() => debugNexaSupportsLiquidGlassOverride = null);

  Future<void> pumpBar(
    WidgetTester tester, {
    required Brightness appBrightness,
    required Brightness platformBrightness,
  }) async {
    tester.platformDispatcher.platformBrightnessTestValue = platformBrightness;
    addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData(brightness: appBrightness),
        home: const Scaffold(appBar: NexaAppBar(title: Text('Pós-jogo'))),
      ),
    );
  }

  final cases = <(Brightness, Brightness, bool)>[
    (Brightness.dark, Brightness.dark, true),
    (Brightness.light, Brightness.light, true),
    (Brightness.dark, Brightness.light, false),
    (Brightness.light, Brightness.dark, false),
  ];

  for (final (app, device, native) in cases) {
    testWidgets(
      'app ${app.name} + aparelho ${device.name} → '
      '${native ? 'barra nativa' : 'AppBar Flutter'}',
      (tester) async {
        await pumpBar(tester, appBrightness: app, platformBrightness: device);

        expect(
          find.byType(LiquidGlassNavigationBar),
          native ? findsOneWidget : findsNothing,
        );
        expect(find.byType(AppBar), native ? findsNothing : findsOneWidget);
        if (!native) {
          // O título é desenhado pelo Flutter, com a cor do tema do app.
          final title = tester.widget<DefaultTextStyle>(
            find
                .ancestor(
                  of: find.text('Pós-jogo'),
                  matching: find.byType(DefaultTextStyle),
                )
                .first,
          );
          expect(
            title.style.color,
            ThemeData(brightness: app).colorScheme.onSurface,
          );
        }
      },
      variant: iOS,
    );
  }

  testWidgets('troca de barra quando a aparência do aparelho muda',
      (tester) async {
    await pumpBar(
      tester,
      appBrightness: Brightness.dark,
      platformBrightness: Brightness.light,
    );
    expect(find.byType(AppBar), findsOneWidget);

    // O app sincroniza a janela com o tema (overrideUserInterfaceStyle) e o
    // iOS devolve a aparência nova ao Flutter.
    tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
    await tester.pump();

    expect(find.byType(LiquidGlassNavigationBar), findsOneWidget);
    expect(find.byType(AppBar), findsNothing);
  }, variant: iOS);

  group('syncNativeInterfaceStyle', () {
    final calls = <MethodCall>[];

    setUp(() {
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      resetNativeInterfaceStyleSync();
      calls.clear();
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(nativeInterfaceStyleChannel, (call) async {
        calls.add(call);
        return null;
      });
    });

    tearDown(() {
      debugDefaultTargetPlatformOverride = null;
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(nativeInterfaceStyleChannel, null);
    });

    test('manda o modo do tema para a janela iOS, sem repetir', () async {
      await syncNativeInterfaceStyle(ThemeMode.dark);
      await syncNativeInterfaceStyle(ThemeMode.dark);
      await syncNativeInterfaceStyle(ThemeMode.light);
      await syncNativeInterfaceStyle(ThemeMode.system);

      expect(calls.map((c) => c.arguments), ['dark', 'light', 'unspecified']);
      expect(calls.every((c) => c.method == 'setInterfaceStyle'), isTrue);
    });

    test('fora do iOS não chama o canal', () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      await syncNativeInterfaceStyle(ThemeMode.dark);
      expect(calls, isEmpty);
    });
  });
}
