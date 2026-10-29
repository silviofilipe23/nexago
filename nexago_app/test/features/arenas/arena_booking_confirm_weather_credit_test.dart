import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/auth/auth_service.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/data/booking_service.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_confirm_args.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_pix_args.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_success_args.dart';
import 'package:nexago_app/features/arenas/domain/arena_court.dart';
import 'package:nexago_app/features/arenas/domain/arenas_providers.dart';
import 'package:nexago_app/features/arenas/domain/booking_providers.dart';
import 'package:nexago_app/features/arenas/domain/slots_providers.dart';
import 'package:nexago_app/features/arenas/presentation/arena_booking_confirm_page.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/booking_confirm/booking_confirm_sticky_bar.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';
import 'package:nexago_app/features/weather/presentation/widgets/weather_credit_checkout_card.dart';

import '../weather/weather_test_fakes.dart';

/// Só a parte de pagamento: sem Firestore (retomada de Pix não existe aqui).
class _FakeBookingService extends BookingService {
  _FakeBookingService(FakeWeatherFunctions functions)
      : super(UnusedFirestore(), functions: functions);

  @override
  Future<CreateBookingResult?> findResumablePixBooking({
    required String athleteId,
    required ArenaBookingConfirmArgs args,
  }) async =>
      null;
}

final args = ArenaBookingConfirmArgs(
  arenaId: 'a1',
  arenaName: 'Arena CFC',
  courtId: 'q2',
  courtName: 'Quadra 2',
  // Longe de hoje: a missão "reservar hoje" não entra.
  date: DateTime(2030, 11, 8),
  startTime: '19:00',
  endTime: '20:00',
  amountReais: 70,
  selectedSlotStartTimes: const ['19:00'],
);

Map<String, Object?> quote({
  double amount = 70,
  double available = 60,
  double applied = 60,
}) =>
    {
      'amountReais': amount,
      'lineItems': <dynamic>[],
      'weatherCreditAvailableReais': available,
      'weatherCreditNextExpiresAt': '2031-01-27T15:00:00.000Z',
      'weatherCreditAppliedReais': applied,
      'amountAfterCreditReais': amount - applied,
    };

Future<({FakeWeatherFunctions functions, List<Object?> successExtras})>
    pumpConfirm(
  WidgetTester tester, {
  required Map<String, Object?> quoteResponse,
  Map<String, Object?>? createResponse,
}) async {
  tester.view.physicalSize = const Size(900, 3200);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final functions = FakeWeatherFunctions(responses: {
    'quoteArenaBooking': quoteResponse,
    if (createResponse != null) 'createArenaBooking': createResponse,
    'notifyArenaBookingCreated': {'ok': true},
  });
  final successExtras = <Object?>[];
  final router = GoRouter(
    initialLocation: '/arena/a1/book/confirm',
    initialExtra: args,
    routes: [
      GoRoute(
        path: AppRoutes.arenaBookingConfirm,
        builder: (context, state) =>
            ArenaBookingConfirmPage(arenaId: state.pathParameters['arenaId']!),
      ),
      GoRoute(
        path: AppRoutes.arenaBookingSuccess,
        builder: (context, state) {
          successExtras.add(state.extra);
          return const Scaffold(body: Text('tela de sucesso'));
        },
      ),
      GoRoute(
        path: AppRoutes.arenaBookingPix,
        name: AppRouteNames.arenaBookingPix,
        builder: (context, state) {
          successExtras.add(state.extra);
          return const Scaffold(body: Text('tela do pix'));
        },
      ),
    ],
  );
  addTearDown(router.dispose);

  final user = MockUser(uid: 'u1');
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authProvider.overrideWith((ref) => Stream.value(user)),
        authServiceProvider.overrideWithValue(
          AuthService(MockFirebaseAuth(signedIn: true, mockUser: user)),
        ),
        bookingServiceProvider
            .overrideWithValue(_FakeBookingService(functions)),
        arenaByIdProvider.overrideWith((ref, id) => Stream.value(null)),
        courtsStreamProvider.overrideWith(
          (ref, id) => Stream.value(const [
            ArenaCourt(id: 'q2', name: 'Quadra 2', sportTypes: ['Pickleball']),
          ]),
        ),
        myArenaProfessorLinkProvider
            .overrideWith((ref, id) => Stream.value(null)),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 500));
  return (functions: functions, successExtras: successExtras);
}

/// CTA da barra fixa (o título da página também diz "Confirmar reserva").
Finder confirmCta() => find.descendant(
      of: find.byType(BookingConfirmStickyBar),
      matching: find.text('Confirmar reserva'),
    );

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  testWidgets('com saldo: card ligado, recota com o crédito e mostra "A pagar"',
      (tester) async {
    final r = await pumpConfirm(tester, quoteResponse: quote());

    final quotePayload = r.functions.payloadOf('quoteArenaBooking')!;
    expect(quotePayload['useWeatherCredit'], isTrue);
    expect(quotePayload['paymentMode'], 'onsite');

    expect(find.text('Usar crédito de chuva'), findsOneWidget);
    expect(
      tester
          .widget<Switch>(find.byKey(WeatherCreditCheckoutCard.switchKey))
          .value,
      isTrue,
    );
    expect(find.byKey(const Key('booking-confirm-weather-credit')),
        findsOneWidget);
    expect(find.text('− ${formatBRL(60)}'), findsOneWidget);
    expect(find.text('A pagar'), findsOneWidget);
    // Resumo + barra fixa mostram o que sobra.
    expect(find.text(formatBRL(10)), findsNWidgets(2));
  });

  testWidgets('desligar o card recota sem o crédito e volta ao total cheio',
      (tester) async {
    final r = await pumpConfirm(tester, quoteResponse: quote());
    final before =
        r.functions.calls.where((c) => c.name == 'quoteArenaBooking').length;

    await tester.tap(find.byKey(WeatherCreditCheckoutCard.switchKey));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    final quotes =
        r.functions.calls.where((c) => c.name == 'quoteArenaBooking').toList();
    expect(quotes.length, before + 1);
    expect(quotes.last.payload!.containsKey('useWeatherCredit'), isFalse);
    expect(
        find.byKey(const Key('booking-confirm-weather-credit')), findsNothing);
    expect(find.text(formatBRL(70)), findsWidgets);
  });

  testWidgets('crédito cobre tudo: confirma sem Pix e vai para o sucesso',
      (tester) async {
    final r = await pumpConfirm(
      tester,
      quoteResponse: quote(amount: 50, available: 60, applied: 50),
      createResponse: {
        'bookingId': 'b9',
        'amountReais': 50.0,
        'amountToPayNowReais': 0.0,
        'amountDueOnsiteReais': 0.0,
        'paymentMode': 'weather_credit',
        'weatherCreditAppliedReais': 50.0,
      },
    );
    expect(find.text('coberto pelo crédito de chuva'), findsOneWidget);

    await tester.tap(confirmCta());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(r.functions.payloadOf('createArenaBooking')!['useWeatherCredit'],
        isTrue);
    expect(find.text('tela de sucesso'), findsOneWidget);
    expect(find.text('tela do pix'), findsNothing);
    final extra = r.successExtras.last as BookingSuccessArgs;
    expect(extra.bookingIds, ['b9']);
    expect(extra.paymentLabel, 'Pago com crédito de chuva.');
  });

  testWidgets('sem saldo: nada de card e payload de criação sem a chave',
      (tester) async {
    final r = await pumpConfirm(
      tester,
      quoteResponse: {'amountReais': 70.0, 'lineItems': <dynamic>[]},
      createResponse: {
        'bookingId': 'b1',
        'amountReais': 70.0,
        'paymentMode': 'onsite'
      },
    );
    expect(find.text('Usar crédito de chuva'), findsNothing);

    await tester.tap(confirmCta());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(
        r.functions
            .payloadOf('createArenaBooking')!
            .containsKey('useWeatherCredit'),
        isFalse);
    expect(find.text('tela de sucesso'), findsOneWidget);
  });

  testWidgets('crédito parcial no Pix: a tela do Pix recebe o crédito aplicado',
      (tester) async {
    final r = await pumpConfirm(
      tester,
      quoteResponse: quote(),
      createResponse: {
        'bookingId': 'b9',
        'amountReais': 70.0,
        'amountToPayNowReais': 10.0,
        'amountDueOnsiteReais': 0.0,
        'paymentMode': 'pix',
        'paymentFraction': 1.0,
        'weatherCreditAppliedReais': 60.0,
      },
    );

    await tester.tap(find.text('Pagar online'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(
      find.descendant(
        of: find.byType(BookingConfirmStickyBar),
        matching: find.text('Confirmar e pagar'),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('tela do pix'), findsOneWidget);
    final pix = r.successExtras.last as ArenaBookingPixArgs;
    expect(pix.weatherCreditAppliedReais, 60);
    expect(pix.amountToPayNowReais, 10);
    expect(pix.paymentFraction, 1.0);
  });
}
