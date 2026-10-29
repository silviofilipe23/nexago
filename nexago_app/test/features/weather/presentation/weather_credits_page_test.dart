import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/weather/application/weather_providers.dart';
import 'package:nexago_app/features/weather/domain/weather_models.dart';
import 'package:nexago_app/features/weather/presentation/weather_credits_page.dart';
import 'package:nexago_app/features/weather/presentation/widgets/weather_credits_settings_tile.dart';

WeatherCredit credit(
  String id, {
  String arenaId = 'a1',
  String arenaName = 'Arena CFC',
  double balance = 60,
  String status = 'open',
  DateTime? expiresAt,
}) =>
    WeatherCredit.fromMap(id, {
      'arenaId': arenaId,
      'arenaName': arenaName,
      'amountReais': 60,
      'balanceReais': balance,
      'status': status,
      'originDate': '2026-10-29',
      'originStartTime': '18:00',
      'originCourtName': 'Quadra 1',
      'expiresAt': expiresAt == null ? null : Timestamp.fromDate(expiresAt),
    });

Widget app(List<WeatherCredit> credits, Widget child) => ProviderScope(
      overrides: [
        weatherCreditsProvider.overrideWith((ref) => Stream.value(credits)),
      ],
      child: MaterialApp(theme: AppTheme.dark, home: Scaffold(body: child)),
    );

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  final future = DateTime.now().add(const Duration(days: 60));

  testWidgets('lista: saldo por arena, validade e créditos usados',
      (tester) async {
    tester.view.physicalSize = const Size(900, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      app([
        credit('wx_1', balance: 60, expiresAt: future),
        credit('wx_2',
            arenaId: 'a2', arenaName: 'Arena Sol', balance: 0, status: 'used'),
      ], const WeatherCreditsPage()),
    );
    await tester.pump();
    await tester.pump();

    expect(find.text('CRÉDITO · ARENA CFC'), findsOneWidget);
    expect(find.text('CRÉDITO · ARENA SOL'), findsOneWidget);
    expect(
        find.text(formatBRL(60)), findsNWidgets(2)); // saldo + linha do crédito
    expect(find.textContaining('Disponível · vence em'), findsOneWidget);
    expect(find.text('Sem saldo disponível'), findsOneWidget);
    expect(find.text('Usado'), findsOneWidget);
    expect(find.text('29 out · 18:00 · Quadra 1'), findsNWidgets(2));
    // Deixa vencer o timer da barra (fora deste recurso) antes do fim.
    await tester.pump(const Duration(seconds: 30));
  });

  testWidgets('tile dos ajustes: sem crédito, some', (tester) async {
    await tester.pumpWidget(app(const [], const WeatherCreditsSettingsTile()));
    await tester.pump();
    await tester.pump();
    expect(find.text('Créditos de chuva'), findsNothing);
  });

  testWidgets('tile dos ajustes: com crédito, mostra o saldo', (tester) async {
    await tester.pumpWidget(
      app([credit('wx_1', balance: 45.5)],
          WeatherCreditsSettingsTile(onTap: () {})),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('Créditos de chuva'), findsOneWidget);
    expect(
        find.text('${formatBRL(45.5)} para usar nas arenas'), findsOneWidget);
  });
}
