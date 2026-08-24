import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/location/location_permission_status.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/arena_search/arena_location_permission_banner.dart';

Future<void> _pump(
  WidgetTester tester, {
  required LocationPermissionStatus status,
  required VoidCallback onOpenSettings,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: ArenaLocationPermissionBanner(
          nudge: locationSettingsNudgeFor(status)!,
          onOpenSettings: onOpenSettings,
        ),
      ),
    ),
  );
}

void main() {
  testWidgets('recusa definitiva: diz o que fazer e oferece o atalho',
      (tester) async {
    await _pump(
      tester,
      status: LocationPermissionStatus.deniedForever,
      onOpenSettings: () {},
    );

    expect(find.textContaining('Ative a localização'), findsOneWidget);
    expect(find.text('ATIVAR'), findsOneWidget);
  });

  testWidgets('serviço desligado fala do aparelho, não da permissão',
      (tester) async {
    await _pump(
      tester,
      status: LocationPermissionStatus.serviceDisabled,
      onOpenSettings: () {},
    );

    expect(find.textContaining('aparelho'), findsOneWidget);
  });

  testWidgets('tocar em qualquer ponto da faixa abre os Ajustes',
      (tester) async {
    var aberturas = 0;
    await _pump(
      tester,
      status: LocationPermissionStatus.deniedForever,
      onOpenSettings: () => aberturas++,
    );

    // A faixa inteira é o alvo: um "ATIVAR" de 11px seria um alvo de toque
    // menor do que o dedo do atleta.
    await tester.tap(find.byType(ArenaLocationPermissionBanner));
    await tester.pump();

    expect(aberturas, 1);
  });
}
