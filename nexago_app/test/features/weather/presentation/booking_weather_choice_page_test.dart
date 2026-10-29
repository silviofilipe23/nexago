import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/formatting/app_date_format.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/domain/arena_court.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';
import 'package:nexago_app/features/arenas/domain/arenas_providers.dart';
import 'package:nexago_app/features/arenas/domain/booking_providers.dart';
import 'package:nexago_app/features/arenas/domain/slots_providers.dart';
import 'package:nexago_app/features/weather/application/weather_providers.dart';
import 'package:nexago_app/features/weather/domain/weather_models.dart';
import 'package:nexago_app/features/weather/infrastructure/weather_service.dart';
import 'package:nexago_app/features/weather/presentation/booking_weather_choice_page.dart';
import 'package:nexago_app/features/weather/presentation/weather_reschedule_view.dart';

import '../weather_test_fakes.dart';

final today =
    DateTime(DateTime.now().year, DateTime.now().month, DateTime.now().day);
final tomorrow = DateTime(today.year, today.month, today.day + 1);
final until = DateTime(today.year, today.month, today.day + 10);

Map<String, dynamic> booking({String status = 'pending_choice'}) => {
      'athleteId': 'u1',
      'arenaId': 'a1',
      'arenaName': 'Arena CFC',
      'courtId': 'q1',
      'courtName': 'Quadra 1',
      'date': calendarDateKey(today),
      'startTime': '18:00',
      'endTime': '19:00',
      'status': 'active',
      'amountReais': 60,
      'weatherRelease': {
        'status': status,
        'creditableReais': 60,
        'canReschedule': true,
        'rescheduleUntil': calendarDateKey(until),
        'decisionDeadline': today.add(const Duration(days: 1, hours: 18)),
      },
    };

List<ArenaSlot> slotsFor(DateTime date) => [
      ArenaSlot.virtual(
        arenaId: 'a1',
        courtId: 'q1',
        date: date,
        startTime: '18:00',
        endTime: '19:00',
        priceReais: 60,
      ),
      ArenaSlot.virtual(
        arenaId: 'a1',
        courtId: 'q1',
        date: date,
        startTime: '19:00',
        endTime: '20:00',
        priceReais: 70,
      ),
      ArenaSlot.virtual(
        arenaId: 'a1',
        courtId: 'q1',
        date: date,
        startTime: '20:00',
        endTime: '21:00',
        priceReais: 60,
      ).copyWith(rawStatus: 'booked'),
    ];

Future<FakeWeatherFunctions> pumpChoice(
  WidgetTester tester, {
  required Map<String, dynamic> data,
  Map<String, Object?>? chooseResponse,
  WeatherRequest? request,
}) async {
  tester.view.physicalSize = const Size(900, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final functions = FakeWeatherFunctions(responses: {
    if (chooseResponse != null) 'chooseArenaWeatherOption': chooseResponse,
  });
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authProvider.overrideWith((ref) => Stream.value(MockUser(uid: 'u1'))),
        arenaBookingDocProvider.overrideWith(
          (ref, id) => Stream<DocumentSnapshot<Map<String, dynamic>>?>.value(
            FakeBookingSnapshot(id, data),
          ),
        ),
        weatherRequestProvider.overrideWith((ref, id) => Stream.value(request)),
        weatherPolicyProvider.overrideWith(
          (ref, id) => Stream.value(const WeatherPolicy(enabled: true)),
        ),
        weatherServiceProvider.overrideWithValue(
          WeatherService(UnusedFirestore(), functions: functions),
        ),
        arenaByIdProvider.overrideWith((ref, id) => Stream.value(null)),
        courtsStreamProvider.overrideWith(
          (ref, id) =>
              Stream.value(const [ArenaCourt(id: 'q1', name: 'Quadra 1')]),
        ),
        slotsStreamProvider
            .overrideWith((ref, q) => Stream.value(slotsFor(q.date))),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: const BookingWeatherChoicePage(bookingId: 'b1'),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
  return functions;
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  testWidgets('A2: valor, opções sem custo e ticket riscado', (tester) async {
    await pumpChoice(tester, data: booking());

    expect(find.text('O que fazer com seus ${formatBRL(60)}?'), findsOneWidget);
    expect(find.text('Nenhuma opção tem custo.'), findsOneWidget);
    expect(find.text('Remarcar'), findsOneWidget);
    expect(find.text('SEM CUSTO'), findsOneWidget);
    expect(find.textContaining('Escolha outro horário até'), findsOneWidget);
    expect(
      find.textContaining(
        '${formatBRL(60)} na sua carteira para qualquer reserva na Arena CFC. Vale até',
      ),
      findsOneWidget,
    );
    expect(find.text('18:00 – 19:00'), findsOneWidget);
    expect(find.text('Escolher novo horário'), findsOneWidget);
  });

  testWidgets('A2 → A4: guardar crédito', (tester) async {
    final functions = await pumpChoice(
      tester,
      data: booking(),
      chooseResponse: {
        'creditId': 'wx_b1',
        'creditReais': 60,
        'expiresAt': DateTime(2027, 1, 27, 12).toUtc().toIso8601String(),
      },
    );

    await tester.tap(find.byKey(BookingWeatherChoicePage.creditOptionKey));
    await tester.pump();
    expect(find.text('Guardar ${formatBRL(60)} como crédito'), findsOneWidget);

    await tester.tap(find.byKey(BookingWeatherChoicePage.ctaKey));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(functions.payloadOf('chooseArenaWeatherOption'), {
      'bookingId': 'b1',
      'choice': 'credit',
    });
    expect(find.text('Crédito guardado'), findsOneWidget);
    expect(find.text(formatBRL(60)), findsOneWidget);
    expect(find.text('27 JAN 2027'), findsOneWidget);
    expect(find.text('Reservar agora'), findsOneWidget);
    expect(find.text('Voltar ao início'), findsOneWidget);
  });

  testWidgets('A3: horário mais caro cobra a diferença na arena e remarca',
      (tester) async {
    final functions = await pumpChoice(
      tester,
      data: booking(),
      chooseResponse: {
        'newBookingId': 'b2',
        'newAmountReais': 70,
        'coveredByCreditReais': 60,
        'dueOnsiteReais': 10,
        'leftoverCreditReais': 0,
      },
    );

    await tester.tap(find.byKey(BookingWeatherChoicePage.ctaKey));
    await tester.pump();
    expect(find.text('Novo horário'), findsOneWidget);

    await tester.tap(find.text(tomorrow.day.toString().padLeft(2, '0')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.text('Mesmo valor'), findsOneWidget);
    expect(find.text('+ ${formatBRL(10)}'), findsOneWidget);
    expect(find.text('Ocupado'), findsOneWidget);

    await tester.tap(find.text('19:00'));
    await tester.pump();
    expect(find.text('A pagar na arena'), findsOneWidget);
    expect(find.text(formatBRL(10)), findsOneWidget);

    await tester.tap(find.byKey(WeatherRescheduleView.confirmKey));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(functions.payloadOf('chooseArenaWeatherOption'), {
      'bookingId': 'b1',
      'choice': 'reschedule',
      'reschedule': {
        'courtId': 'q1',
        'courtName': 'Quadra 1',
        'date': calendarDateKey(tomorrow),
        'startTime': '19:00',
        'endTime': '20:00',
        'selectedSlotStartTimes': ['19:00'],
      },
    });
    expect(find.text('Remarcação confirmada'), findsOneWidget);
    expect(find.text('Ver minhas reservas'), findsOneWidget);
  });

  testWidgets('A3: horário tomado mostra o aviso e limpa a escolha',
      (tester) async {
    final functions = await pumpChoice(tester, data: booking());
    functions.errors['chooseArenaWeatherOption'] = FirebaseFunctionsException(
      code: 'already-exists',
      message: 'Esse horário acabou de ser reservado. Escolha outro.',
    );

    await tester.tap(find.byKey(BookingWeatherChoicePage.ctaKey));
    await tester.pump();
    await tester.tap(find.text(tomorrow.day.toString().padLeft(2, '0')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.tap(find.text('18:00'));
    await tester.pump();
    await tester.tap(find.byKey(WeatherRescheduleView.confirmKey));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Esse horário acabou de ser reservado. Escolha outro.'),
        findsOneWidget);
    expect(find.text('Novo horário'), findsOneWidget);
    // Seleção limpa: sem horário escolhido, nada a pagar.
    expect(find.text(formatBRL(0)), findsOneWidget);
  });

  testWidgets('já resolvida: mostra o que aconteceu', (tester) async {
    await pumpChoice(tester, data: booking(status: 'credited'));
    expect(find.text('Crédito de ${formatBRL(60)} guardado'), findsOneWidget);
    expect(find.text('O que fazer com seus ${formatBRL(60)}?'), findsNothing);
  });

  testWidgets('pedido recusado (push "decidido"): mostra o motivo',
      (tester) async {
    final data = booking()..remove('weatherRelease');
    await pumpChoice(
      tester,
      data: data,
      request: const WeatherRequest(
        bookingId: 'b1',
        status: WeatherRequestStatus.rejected,
        rejectReason: 'Quadra coberta',
      ),
    );
    expect(find.text('Pedido de cancelamento recusado'), findsOneWidget);
    expect(find.text('Motivo: Quadra coberta'), findsOneWidget);
  });
}
