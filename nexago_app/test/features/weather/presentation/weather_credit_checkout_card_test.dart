import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/booking_confirm/booking_confirm_price_summary.dart';
import 'package:nexago_app/features/weather/presentation/widgets/weather_credit_checkout_card.dart';

Future<void> pumpBody(WidgetTester tester, Widget child, {ThemeData? theme}) {
  return tester.pumpWidget(
    MaterialApp(
      theme: theme ?? AppTheme.dark,
      home: Scaffold(
          body: Padding(padding: const EdgeInsets.all(16), child: child)),
    ),
  );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  group('A5 — "Usar crédito de chuva"', () {
    testWidgets('mostra saldo e vencimento; o switch devolve a escolha',
        (tester) async {
      final changes = <bool>[];
      await pumpBody(
        tester,
        WeatherCreditCheckoutCard(
          availableReais: 60,
          nextExpiresAt: DateTime(2027, 1, 27),
          value: true,
          onChanged: changes.add,
        ),
      );
      expect(find.text('Usar crédito de chuva'), findsOneWidget);
      expect(
          find.text('Saldo ${formatBRL(60)} · vence 27 jan'), findsOneWidget);
      expect(
        tester
            .widget<Switch>(find.byKey(WeatherCreditCheckoutCard.switchKey))
            .value,
        isTrue,
      );

      // Laranja da marca (`WxToggle on`), não o verde do cashback.
      final toggle = tester
          .widget<Switch>(find.byKey(WeatherCreditCheckoutCard.switchKey));
      expect(toggle.activeTrackColor, AppColors.brand);

      await tester.tap(find.byKey(WeatherCreditCheckoutCard.switchKey));
      await tester.pump();
      expect(changes, [false]);
    });

    testWidgets('sem validade e no tema claro', (tester) async {
      await pumpBody(
        tester,
        WeatherCreditCheckoutCard(
          availableReais: 15.5,
          nextExpiresAt: null,
          value: false,
          onChanged: (_) {},
        ),
        theme: AppTheme.light,
      );
      expect(
          find.text('Saldo ${formatBRL(15.5)} · sem validade'), findsOneWidget);
    });

    testWidgets('sem saldo: nada', (tester) async {
      await pumpBody(
        tester,
        WeatherCreditCheckoutCard(
          availableReais: 0,
          nextExpiresAt: null,
          value: true,
          onChanged: (_) {},
        ),
      );
      expect(find.text('Usar crédito de chuva'), findsNothing);
    });

    testWidgets('desligado enquanto envia', (tester) async {
      await pumpBody(
        tester,
        WeatherCreditCheckoutCard(
          availableReais: 60,
          nextExpiresAt: null,
          value: true,
          enabled: false,
          onChanged: (_) => fail('não deveria mudar'),
        ),
      );
      expect(
        tester
            .widget<Switch>(find.byKey(WeatherCreditCheckoutCard.switchKey))
            .onChanged,
        isNull,
      );
    });
  });

  group('resumo de valores com crédito', () {
    testWidgets('linha "Crédito de chuva" e "A pagar"', (tester) async {
      await pumpBody(
        tester,
        BookingConfirmPriceSummary(
          courtLineLabel: 'Quadra (1h)',
          courtAmountLabel: formatBRL(70),
          weatherCreditAmountLabel: '− ${formatBRL(60)}',
          totalLineLabel: 'A pagar',
          totalAmountLabel: formatBRL(10),
        ),
      );
      expect(find.byKey(const Key('booking-confirm-weather-credit')),
          findsOneWidget);
      expect(find.text('Crédito de chuva'), findsOneWidget);
      expect(find.text('− ${formatBRL(60)}'), findsOneWidget);
      expect(find.text('A pagar'), findsOneWidget);
      expect(find.text(formatBRL(10)), findsOneWidget);
    });

    testWidgets('sem crédito nem desconto: sem total (como antes)',
        (tester) async {
      await pumpBody(
        tester,
        BookingConfirmPriceSummary(
          courtLineLabel: 'Quadra (1h)',
          courtAmountLabel: formatBRL(70),
        ),
      );
      expect(find.byKey(const Key('booking-confirm-weather-credit')),
          findsNothing);
      expect(find.byKey(const Key('booking-confirm-total')), findsNothing);
    });
  });
}
