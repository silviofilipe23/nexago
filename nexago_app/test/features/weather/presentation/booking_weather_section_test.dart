import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/weather/application/weather_providers.dart';
import 'package:nexago_app/features/weather/domain/weather_models.dart';
import 'package:nexago_app/features/weather/infrastructure/weather_service.dart';
import 'package:nexago_app/features/weather/presentation/widgets/booking_weather_section.dart';
import 'package:nexago_app/features/weather/presentation/widgets/weather_request_sheet.dart';

import '../weather_test_fakes.dart';

final now = DateTime(2026, 10, 29, 16);

Map<String, dynamic> booking({Map<String, dynamic>? release}) => {
      'athleteId': 'u1',
      'arenaId': 'a1',
      'arenaName': 'Arena CFC',
      'courtId': 'q1',
      'courtName': 'Quadra 1',
      'date': '2026-10-29',
      'startTime': '18:00',
      'endTime': '19:00',
      'status': 'active',
      'amountReais': 60,
      if (release != null) 'weatherRelease': release,
    };

final pendingRelease = <String, dynamic>{
  'status': 'pending_choice',
  'creditableReais': 60,
  'fraction': 1,
  'canReschedule': true,
  'rescheduleUntil': '2026-11-28',
  'decisionDeadline': DateTime(2026, 10, 30, 17, 30),
  // O servidor grava de 2h antes do início a 2h depois do fim.
  'forecast': [
    {'time': '16:00', 'probability': 40, 'precipitationMm': 0.5},
    {'time': '17:00', 'probability': 85, 'precipitationMm': 1.2},
    {'time': '18:00', 'probability': 92, 'precipitationMm': 5.4},
    {'time': '19:00', 'probability': 88, 'precipitationMm': 3.1},
    {'time': '20:00', 'probability': 96, 'precipitationMm': 7.8},
  ],
};

Future<FakeWeatherFunctions> pumpSection(
  WidgetTester tester, {
  required Map<String, dynamic> data,
  WeatherPolicy policy = WeatherPolicy.defaults,
  WeatherRequest? request,
  VoidCallback? onOpenChoice,
  ThemeData? theme,
  String? arenaPhone,
  List<String>? openedUrls,
  Size surface = const Size(900, 2400),
}) async {
  tester.view.physicalSize = surface;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final functions = FakeWeatherFunctions(responses: {
    'chooseArenaWeatherOption': {'kept': true},
    'requestArenaWeatherRelease': {'status': 'pending', 'weather': null},
    'withdrawArenaWeatherRequest': {'status': 'withdrawn'},
  });
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authProvider.overrideWith((ref) => Stream.value(MockUser(uid: 'u1'))),
        weatherServiceProvider.overrideWithValue(
          WeatherService(UnusedFirestore(), functions: functions),
        ),
        weatherPolicyProvider.overrideWith((ref, id) => Stream.value(policy)),
        weatherRequestProvider.overrideWith((ref, id) => Stream.value(request)),
        weatherArenaContactPhoneProvider.overrideWith((ref, id) => arenaPhone),
      ],
      child: MaterialApp(
        theme: theme ?? AppTheme.dark,
        // Como na tela da reserva: cards no corpo, ações na barra fixa.
        home: Scaffold(
          body: SingleChildScrollView(
            child: BookingWeatherSection(
              bookingId: 'b1',
              booking: data,
              arenaName: 'Arena CFC',
              now: now,
            ),
          ),
          bottomNavigationBar: BookingWeatherBottomBar(
            bookingId: 'b1',
            booking: data,
            arenaName: 'Arena CFC',
            now: now,
            onOpenChoice: onOpenChoice,
            onOpenUrl: (url) async {
              openedUrls?.add(url);
              return true;
            },
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
  return functions;
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  group('A1 — aviso de Modo chuva na reserva', () {
    testWidgets('card com aviso, previsão e prazo; ações na barra fixa',
        (tester) async {
      var opened = 0;
      await pumpSection(
        tester,
        data: booking(release: pendingRelease),
        onOpenChoice: () => opened++,
      );

      expect(find.byKey(WeatherReleaseAlertCard.cardKey), findsOneWidget);
      expect(find.text('MODO CHUVA ATIVO'), findsOneWidget);
      expect(find.text('Chuva forte às 18h'), findsOneWidget);
      expect(
        find.text(
          'A Arena CFC liberou seu horário. Remarque ou guarde o valor como crédito, sem custo.',
        ),
        findsOneWidget,
      );
      // 2h antes e 2h depois do jogo; o título fica na hora do jogo.
      for (final label in ['16h', '17h', '18h', '19h', '20h']) {
        expect(
          find.descendant(
            of: find.byKey(WeatherForecastStrip.stripKey),
            matching: find.text(label),
          ),
          findsOneWidget,
          reason: label,
        );
      }
      expect(find.text('92%'), findsOneWidget);
      expect(find.text('96%'), findsOneWidget);
      expect(
        find.text(
          'Você tem até amanhã às 17:30 para escolher. Depois disso, vira crédito automaticamente.',
        ),
        findsOneWidget,
      );

      // Os botões saíram do card e foram para a barra do rodapé.
      final card = find.byKey(WeatherReleaseAlertCard.cardKey);
      expect(
        find.descendant(of: card, matching: find.byType(ButtonStyleButton)),
        findsNothing,
      );
      final bar = find.byType(BookingWeatherBottomBar);
      expect(
        find.descendant(
          of: bar,
          matching: find.text('Remarcar ou guardar crédito'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(of: bar, matching: find.text('Manter minha reserva')),
        findsOneWidget,
      );

      await tester.tap(find.byKey(BookingWeatherBottomBar.chooseKey));
      await tester.pump();
      expect(opened, 1);
    });

    testWidgets('jogo de 3h no celular estreito: 7 horas sem estourar',
        (tester) async {
      await pumpSection(
        tester,
        surface: const Size(320, 2400),
        data: {
          ...booking(release: {
            ...pendingRelease,
            'forecast': [
              for (var h = 16; h <= 22; h++)
                {'time': '$h:00', 'probability': 100, 'precipitationMm': 9.9},
            ],
          }),
          'endTime': '21:00',
        },
      );
      expect(tester.takeException(), isNull);
      expect(
        find.descendant(
          of: find.byKey(WeatherForecastStrip.stripKey),
          matching: find.text('100%'),
        ),
        findsNWidgets(7),
      );
    });

    testWidgets('tema claro também renderiza (cores do tema)', (tester) async {
      await pumpSection(
        tester,
        data: booking(release: pendingRelease),
        theme: AppTheme.light,
      );
      expect(find.byKey(WeatherReleaseAlertCard.cardKey), findsOneWidget);
    });

    testWidgets('"Manter minha reserva" confirma e escolhe keep',
        (tester) async {
      final functions =
          await pumpSection(tester, data: booking(release: pendingRelease));

      await tester.tap(find.byKey(BookingWeatherBottomBar.keepKey));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Manter a reserva?'), findsOneWidget);
      expect(functions.calls, isEmpty);

      await tester.tap(find.byKey(const Key('weather-keep-confirm')));
      await tester.pump(const Duration(milliseconds: 300));
      expect(functions.payloadOf('chooseArenaWeatherOption'), {
        'bookingId': 'b1',
        'choice': 'keep',
      });
      expect(find.text('Reserva mantida.'), findsOneWidget);
    });

    testWidgets('sem remarcar (chuva no meio do jogo): só guardar crédito',
        (tester) async {
      await pumpSection(
        tester,
        data: booking(release: {
          ...pendingRelease,
          'canReschedule': false,
          'creditableReais': 30,
          'fraction': 0.5,
        }),
      );
      expect(find.text('Guardar crédito'), findsOneWidget);
      expect(
        find.text(
            'A Arena CFC liberou seu horário. ${formatBRL(30)} vira crédito, sem custo.'),
        findsOneWidget,
      );
    });
  });

  group('pedido do atleta', () {
    const requestPolicy =
        WeatherPolicy(enabled: true, trigger: WeatherTrigger.request);

    testWidgets('botão abre a folha e envia o pedido com a observação',
        (tester) async {
      final functions =
          await pumpSection(tester, data: booking(), policy: requestPolicy);

      expect(find.text('Choveu? Pedir cancelamento sem custo'), findsOneWidget);
      expect(find.text('Disponível até hoje às 18:00'), findsOneWidget);

      await tester.tap(find.byKey(WeatherRequestButton.buttonKey));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('Pedir cancelamento por chuva'), findsOneWidget);

      await tester.enterText(
          find.byKey(WeatherRequestSheet.noteFieldKey), 'Quadra alagada');
      await tester.tap(find.byKey(WeatherRequestSheet.submitKey));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(functions.payloadOf('requestArenaWeatherRelease'), {
        'bookingId': 'b1',
        'note': 'Quadra alagada',
      });
      expect(find.text('Pedido enviado. A Arena CFC vai analisar.'),
          findsOneWidget);
    });

    testWidgets('política no modo "arena": sem botão', (tester) async {
      await pumpSection(
        tester,
        data: booking(),
        policy: const WeatherPolicy(enabled: true),
      );
      expect(find.byKey(WeatherRequestButton.buttonKey), findsNothing);
      expect(find.byKey(WeatherRequestPendingCard.cardKey), findsNothing);
    });

    testWidgets('A6: pedido em análise, WhatsApp da arena e desistir',
        (tester) async {
      final opened = <String>[];
      final functions = await pumpSection(
        tester,
        data: booking(),
        policy: requestPolicy,
        arenaPhone: '(11) 98888-7777',
        openedUrls: opened,
        request: WeatherRequest(
          bookingId: 'b1',
          status: WeatherRequestStatus.pending,
          createdAt: DateTime(2026, 10, 29, 17, 52),
          weather: WeatherReading(
            probability: 90,
            precipitationMm: 5.4,
            fetchedAt: DateTime(2026, 10, 29, 18),
          ),
          forecast: const [
            WeatherHour(time: '16:00', probability: 30),
            WeatherHour(time: '17:00', probability: 60),
            WeatherHour(time: '18:00', probability: 90),
            WeatherHour(time: '19:00', probability: 70),
            WeatherHour(time: '20:00', probability: 20),
          ],
        ),
      );

      expect(find.byKey(WeatherRequestPendingCard.cardKey), findsOneWidget);
      expect(
        find.descendant(
          of: find.byKey(WeatherRequestPendingCard.cardKey),
          matching: find.byKey(WeatherForecastStrip.stripKey),
        ),
        findsOneWidget,
      );
      expect(find.text('20h'), findsOneWidget);
      expect(find.text('PEDIDO EM ANÁLISE'), findsOneWidget);
      expect(find.text('Pedido enviado'), findsOneWidget);
      expect(find.text('17:52'), findsOneWidget);
      expect(find.text('Chuva registrada · 5,4 mm'), findsOneWidget);
      expect(find.text('Arena confirma'), findsOneWidget);
      expect(find.text('aguardando'), findsOneWidget);
      // O desistir saiu do card: fica na barra.
      expect(
        find.descendant(
          of: find.byKey(WeatherRequestPendingCard.cardKey),
          matching: find.byType(ButtonStyleButton),
        ),
        findsNothing,
      );

      await tester.tap(find.byKey(BookingWeatherBottomBar.contactKey));
      await tester.pump();
      expect(opened, [
        'https://wa.me/5511988887777?text=${Uri.encodeComponent('Olá! Fiz um pedido de cancelamento por chuva da minha reserva de qui, 29 out às 18:00 na Quadra 1.')}',
      ]);

      await tester.tap(find.byKey(BookingWeatherBottomBar.withdrawKey));
      await tester.pump(const Duration(milliseconds: 300));
      await tester.tap(find.byKey(const Key('weather-withdraw-confirm')));
      await tester.pump(const Duration(milliseconds: 300));
      expect(functions.payloadOf('withdrawArenaWeatherRequest'),
          {'bookingId': 'b1'});
    });

    testWidgets('A6 sem número da arena: barra só com "Desistir do pedido"',
        (tester) async {
      await pumpSection(
        tester,
        data: booking(),
        policy: requestPolicy,
        request: const WeatherRequest(
          bookingId: 'b1',
          status: WeatherRequestStatus.pending,
        ),
      );
      expect(find.byKey(BookingWeatherBottomBar.contactKey), findsNothing);
      expect(find.text('Falar com a arena'), findsNothing);
      expect(find.byKey(BookingWeatherBottomBar.withdrawKey), findsOneWidget);
    });

    testWidgets('botão de pedir: a barra fica vazia', (tester) async {
      await pumpSection(tester, data: booking(), policy: requestPolicy);
      expect(find.byKey(WeatherRequestButton.buttonKey), findsOneWidget);
      expect(find.byKey(BookingWeatherBottomBar.chooseKey), findsNothing);
      expect(find.byKey(BookingWeatherBottomBar.withdrawKey), findsNothing);
    });

    testWidgets('recusado: mostra o motivo', (tester) async {
      await pumpSection(
        tester,
        data: booking(),
        policy: requestPolicy,
        request: const WeatherRequest(
          bookingId: 'b1',
          status: WeatherRequestStatus.rejected,
          rejectReason: 'Não choveu na arena',
        ),
      );
      expect(find.text('Pedido de cancelamento recusado'), findsOneWidget);
      expect(find.text('Motivo: Não choveu na arena'), findsOneWidget);
    });
  });

  group('resumo', () {
    testWidgets('crédito guardado', (tester) async {
      await pumpSection(
        tester,
        data: booking(release: {...pendingRelease, 'status': 'credited'}),
      );
      expect(find.text('Crédito de ${formatBRL(60)} guardado'), findsOneWidget);
    });

    testWidgets('cancelada sem pagamento', (tester) async {
      await pumpSection(
        tester,
        data: {
          ...booking(release: {...pendingRelease, 'status': 'canceled_unpaid'}),
          'status': 'canceled',
          'cancelReason': 'weather',
        },
      );
      expect(
          find.text('Cancelada por chuva, nada foi cobrado'), findsOneWidget);
    });
  });
}
