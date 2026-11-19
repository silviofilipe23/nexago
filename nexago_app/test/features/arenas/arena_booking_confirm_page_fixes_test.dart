import 'dart:async';

import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/auth/auth_service.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/data/booking_service.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_confirm_args.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_quote.dart';
import 'package:nexago_app/features/arenas/domain/arena_court.dart';
import 'package:nexago_app/features/arenas/domain/arenas_providers.dart';
import 'package:nexago_app/features/arenas/domain/booking_athlete_notes.dart';
import 'package:nexago_app/features/arenas/domain/booking_providers.dart';
import 'package:nexago_app/features/arenas/domain/slots_providers.dart';
import 'package:nexago_app/features/arenas/presentation/arena_booking_confirm_page.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/booking_confirm/booking_confirm_sticky_bar.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';

import '../../core/theme/state_tone_contrast.dart';
import '../weather/weather_test_fakes.dart';

// Correções da tela de confirmar reserva: erro técnico na tela, botão
// liberado com o preço desatualizado, laranja ilegível no tema claro e o
// recado para a arena (antes "Observações", que não chegava em lugar nenhum).

final _args = ArenaBookingConfirmArgs(
  arenaId: 'a1',
  arenaName: 'Arena CFC',
  courtId: 'q2',
  courtName: 'Quadra 2',
  date: DateTime(2030, 11, 8),
  startTime: '19:00',
  endTime: '20:00',
  amountReais: 70,
  selectedSlotStartTimes: const ['19:00'],
);

/// Cotação controlada pelo teste; criação da reserva pode falhar à vontade.
class _FakeBookingService extends BookingService {
  _FakeBookingService({this.createError})
      : super(UnusedFirestore(), functions: FakeWeatherFunctions());

  final Object? createError;

  /// `athleteNotes` recebido na última criação (o que a página mandou).
  String? sentAthleteNotes;
  bool created = false;
  Completer<ArenaBookingQuote> pendingQuote = Completer()
    ..complete(const ArenaBookingQuote(amountReais: 70, lineItems: []));

  @override
  Future<ArenaBookingQuote> quoteBooking({
    required ArenaBookingConfirmArgs args,
    String? couponCode,
    bool asProfessor = false,
    bool useWeatherCredit = false,
    String paymentMode = 'onsite',
  }) =>
      pendingQuote.future;

  @override
  Future<CreateBookingResult?> findResumablePixBooking({
    required String athleteId,
    required ArenaBookingConfirmArgs args,
  }) async =>
      null;

  @override
  Future<CreateBookingResult> createBookingAtomically({
    required ArenaBookingConfirmArgs args,
    required String athleteId,
    String paymentMode = 'onsite',
    double paymentFraction = 1.0,
    String? couponCode,
    String? sport,
    bool asProfessor = false,
    String? professorStudentId,
    bool useWeatherCredit = false,
    String? athleteNotes,
  }) async {
    created = true;
    sentAthleteNotes = athleteNotes;
    throw createError ?? StateError('não configurado');
  }
}

Future<void> _pumpConfirm(
  WidgetTester tester,
  _FakeBookingService service, {
  ThemeData? theme,
}) async {
  tester.view.physicalSize = const Size(900, 3200);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final router = GoRouter(
    initialLocation: '/arena/a1/book/confirm',
    initialExtra: _args,
    routes: [
      GoRoute(
        path: AppRoutes.arenaBookingConfirm,
        builder: (context, state) =>
            ArenaBookingConfirmPage(arenaId: state.pathParameters['arenaId']!),
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
        bookingServiceProvider.overrideWithValue(service),
        arenaByIdProvider.overrideWith((ref, id) => Stream.value(null)),
        courtsStreamProvider.overrideWith(
          (ref, id) => Stream.value(const [
            ArenaCourt(
              id: 'q2',
              name: 'Quadra 2',
              sportTypes: ['Pickleball', 'Beach Tennis'],
            ),
          ]),
        ),
        myArenaProfessorLinkProvider
            .overrideWith((ref, id) => Stream.value(null)),
      ],
      child: MaterialApp.router(
        theme: theme ?? AppTheme.dark,
        routerConfig: router,
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 500));
}

FilledButton _cta(WidgetTester tester) => tester.widget<FilledButton>(
      find.descendant(
        of: find.byType(BookingConfirmStickyBar),
        matching: find.byType(FilledButton),
      ),
    );

final _notesField =
    find.byKey(const Key('booking-confirm-athlete-notes-field'));

Future<void> _tapConfirm(WidgetTester tester) async {
  await tester.tap(find.descendant(
    of: find.byType(BookingConfirmStickyBar),
    matching: find.text('Confirmar reserva'),
  ));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
}

/// Escolhe o primeiro esporte da quadra (sem esporte o botão só avisa).
Future<void> _pickSport(WidgetTester tester) async {
  await tester.tap(find.text('Pickleball'));
  await tester.pump();
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  testWidgets('recado para a arena começa recolhido', (tester) async {
    await _pumpConfirm(tester, _FakeBookingService());

    expect(find.text('OBSERVAÇÕES (OPCIONAL)'), findsNothing);
    expect(find.text('Recado para a arena'), findsOneWidget);
    expect(_notesField, findsNothing);
    expect(find.byType(TextField), findsOneWidget, reason: 'só o cupom');
  });

  testWidgets('recado digitado vai junto na criação da reserva',
      (tester) async {
    final service = _FakeBookingService();
    await _pumpConfirm(tester, service);
    await _pickSport(tester);

    await tester.tap(find.text('Recado para a arena'));
    await tester.pump();
    expect(_notesField, findsOneWidget);
    expect(find.text('RECADO PARA A ARENA (OPCIONAL)'), findsOneWidget);

    await tester.enterText(_notesField, '  Vamos chegar 10 min antes  ');
    await _tapConfirm(tester);

    expect(service.created, isTrue);
    expect(service.sentAthleteNotes, '  Vamos chegar 10 min antes  ',
        reason: 'o serviço apara e descarta vazio');
  });

  testWidgets('recado não passa de $kAthleteNotesMaxLength caracteres',
      (tester) async {
    await _pumpConfirm(tester, _FakeBookingService());
    await tester.tap(find.text('Recado para a arena'));
    await tester.pump();

    await tester.enterText(_notesField, 'a' * (kAthleteNotesMaxLength + 20));
    await tester.pump();

    final field = tester.widget<TextField>(_notesField);
    expect(field.controller!.text.length, kAthleteNotesMaxLength);
    expect(find.text('$kAthleteNotesMaxLength/$kAthleteNotesMaxLength'),
        findsOneWidget);
  });

  testWidgets('botão travado enquanto o preço é recalculado', (tester) async {
    final service = _FakeBookingService()..pendingQuote = Completer();
    await _pumpConfirm(tester, service);

    expect(find.text('Calculando…'), findsWidgets);
    expect(_cta(tester).onPressed, isNull);

    service.pendingQuote
        .complete(const ArenaBookingQuote(amountReais: 70, lineItems: []));
    await tester.pump();

    expect(find.text('Calculando…'), findsNothing);
    expect(_cta(tester).onPressed, isNotNull);
  });

  testWidgets('falha inesperada ao reservar mostra texto amigável, sem o erro',
      (tester) async {
    await _pumpConfirm(
      tester,
      _FakeBookingService(createError: StateError('type Null is not a String')),
    );
    await _pickSport(tester);
    await _tapConfirm(tester);

    expect(
      find.text('Não foi possível reservar. Tente de novo em instantes.'),
      findsOneWidget,
    );
    expect(find.textContaining('type Null'), findsNothing);
    expect(find.textContaining('Erro ao reservar'), findsNothing);
  });

  for (final (name, theme) in [
    ('claro', AppTheme.light),
    ('escuro', AppTheme.dark),
  ]) {
    testWidgets('laranja como texto e ícone legível no tema $name',
        (tester) async {
      await _pumpConfirm(tester, _FakeBookingService(), theme: theme);
      await _pickSport(tester);

      final checked = expectBrandTextLegible(
        tester,
        find.byType(ArenaBookingConfirmPage),
      );
      // Total da barra, esporte escolhido (texto e check) e forma de
      // pagamento marcada.
      expect(checked, containsAll(<Object>['Pickleball', Icons.check_rounded]));
      expect(checked, contains(Icons.check_circle_rounded));
    });
  }

  group('serviço: athleteNotes no payload do createArenaBooking', () {
    Future<Map<String, dynamic>?> payloadFor(String? notes) async {
      final functions = FakeWeatherFunctions(responses: {
        'createArenaBooking': {'bookingId': 'b1', 'amountReais': 70.0},
      });
      await BookingService(UnusedFirestore(), functions: functions)
          .createBookingAtomically(
        args: _args,
        athleteId: 'u1',
        athleteNotes: notes,
      );
      return functions.payloadOf('createArenaBooking');
    }

    test('vai aparado', () async {
      final payload = await payloadFor('  Traz bola?\n');
      expect(payload?['athleteNotes'], 'Traz bola?');
    });

    test('vazio, só espaços ou nulo: a chave nem vai', () async {
      for (final notes in [null, '', '   ']) {
        final payload = await payloadFor(notes);
        expect(payload?.containsKey('athleteNotes'), isFalse,
            reason: 'notes=$notes');
      }
    });
  });

  test('serviço: resposta quebrada vira frase amigável, sem o erro cru',
      () async {
    final functions = FakeWeatherFunctions(responses: {
      // bookingId numérico: o cast falha dentro do serviço.
      'createArenaBooking': {'bookingId': 42, 'amountReais': 70.0},
    });
    final service = BookingService(UnusedFirestore(), functions: functions);

    await expectLater(
      service.createBookingAtomically(args: _args, athleteId: 'u1'),
      throwsA(isA<BookingException>().having(
        (e) => e.message,
        'message',
        'Não foi possível concluir a reserva. Tente de novo em instantes.',
      )),
    );
  });
}
