import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/location/user_location_providers.dart';
import 'package:nexago_app/core/location/user_location_snapshot.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/data/booking_service.dart';
import 'package:nexago_app/features/arenas/domain/booking_providers.dart';
import 'package:nexago_app/features/athlete/domain/booking_attendance_providers.dart';
import 'package:nexago_app/features/athlete/presentation/booking_details_page.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/booking_details/booking_details_team_providers.dart';

/// Só [cancelBooking] interessa: o resto da tela não chama o serviço.
class _FakeBookingService implements BookingService {
  final canceled = <String>[];

  @override
  Future<void> cancelBooking({
    required String bookingId,
    required String athleteId,
  }) async {
    canceled.add('$bookingId/$athleteId');
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  /// Detalhes da reserva como a Agenda abre (rota empilhada).
  Future<_FakeBookingService> pumpDetails(
    WidgetTester tester, {
    required DateTime startAt,
  }) async {
    tester.view.physicalSize = const Size(1080, 6000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    final service = _FakeBookingService();
    final navigatorKey = GlobalKey<NavigatorState>();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authProvider.overrideWith(
            (ref) => Stream.value(MockUser(uid: 'atleta-1')),
          ),
          bookingServiceProvider.overrideWithValue(service),
          arenaBookingDocProvider.overrideWith((ref, id) => Stream.value(null)),
          bookingAttendanceProvider.overrideWith(
            (ref, id) => Stream.value(null),
          ),
          bookingDetailsTeamProvider.overrideWith(
            (ref, id) async => const BookingDetailsTeamState(
              members: [],
              confirmedCount: 1,
              totalSlots: 4,
            ),
          ),
          userLocationProvider.overrideWith(
            (ref) async =>
                const UserLocationSnapshot(source: UserLocationSource.none),
          ),
        ],
        child: MaterialApp(
          navigatorKey: navigatorKey,
          theme: AppTheme.dark,
          home: const Scaffold(body: Text('Agenda')),
        ),
      ),
    );
    navigatorKey.currentState!.push(
      MaterialPageRoute<void>(
        builder: (_) => BookingDetailsPage(
          bookingId: 'reserva-1',
          arenaId: null,
          arenaName: 'Arena Sol',
          courtName: 'Quadra 2',
          startAt: startAt,
          endAt: startAt.add(const Duration(hours: 1)),
          status: 'active',
          confirmedParticipants: 1,
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    return service;
  }

  Finder cancelAction() =>
      find.widgetWithText(OutlinedButton, 'Cancelar reserva');

  testWidgets('no prazo: pede confirmação antes de cancelar', (tester) async {
    final service = await pumpDetails(
      tester,
      startAt: DateTime.now().add(const Duration(days: 2)),
    );

    await tester.tap(cancelAction());
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Cancelar reserva?'), findsOneWidget);
    expect(
      find.textContaining('Cancelamento grátis até 6h antes do horário'),
      findsOneWidget,
    );
    expect(service.canceled, isEmpty);

    await tester.tap(find.byKey(const Key('booking-cancel-keep')));
    await tester.pump(const Duration(milliseconds: 300));
    expect(service.canceled, isEmpty);

    await tester.tap(cancelAction());
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.byKey(const Key('booking-cancel-confirm')));
    await tester.pump(const Duration(milliseconds: 300));

    expect(service.canceled, ['reserva-1/atleta-1']);
  });

  testWidgets('a menos de 6h: botão desligado e aviso da arena',
      (tester) async {
    final service = await pumpDetails(
      tester,
      startAt: DateTime.now().add(const Duration(hours: 3)),
    );

    final button = tester.widget<OutlinedButton>(cancelAction());
    expect(button.onPressed, isNull);
    expect(find.textContaining('fale com Arena Sol'), findsOneWidget);

    await tester.tap(cancelAction(), warnIfMissed: false);
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Cancelar reserva?'), findsNothing);
    expect(service.canceled, isEmpty);
  });
}
