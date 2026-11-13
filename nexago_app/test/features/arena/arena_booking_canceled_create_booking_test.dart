import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena/data/manual_booking_service.dart';
import 'package:nexago_app/features/arena/domain/arena_booking_canceled_args.dart';
import 'package:nexago_app/features/arena/domain/arena_manual_booking.dart';
import 'package:nexago_app/features/arena/domain/arena_schedule_providers.dart';
import 'package:nexago_app/features/arena/presentation/arena_booking_canceled_page.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_manual_booking_sheet.dart';

/// "Criar reserva" da tela pós-cancelamento era um "em breve". Agora abre a
/// folha de balcão no horário que o cancelamento liberou.
void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  ArenaBookingCanceledArgs argsWith({bool withSlot = true}) {
    return ArenaBookingCanceledArgs(
      bookingId: 'b1',
      arenaId: 'a1',
      athleteNames: 'Ana',
      slotHighlight: 'Sáb 19h–20h · Q1',
      slotTimeRange: '19H–20H',
      courtName: 'Quadra 1',
      releasedSlot: withSlot
          ? arenaReleasedSlot(
              arenaId: 'a1',
              courtId: 'c1',
              dateKey: '2026-11-14',
              startTime: '19:00',
              endTime: '20:00',
            )
          : null,
    );
  }

  Future<void> pumpPage(
    WidgetTester tester,
    _FakeManualBookingService service,
    ArenaBookingCanceledArgs args,
  ) async {
    final router = GoRouter(
      initialLocation: '/canceled',
      routes: [
        GoRoute(
          path: '/',
          builder: (_, __) => const Scaffold(body: Text('RESERVAS')),
          routes: [
            GoRoute(
              path: 'canceled',
              builder: (_, __) => ArenaBookingCanceledPage(args: args),
            ),
          ],
        ),
      ],
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          arenaManualBookingServiceProvider.overrideWithValue(service),
        ],
        child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  final createButton = find.widgetWithText(FilledButton, 'Criar reserva');

  testWidgets('reserva de novo o horário liberado', (tester) async {
    final service = _FakeManualBookingService();
    await pumpPage(tester, service, argsWith());

    await tester.ensureVisible(createButton);
    await tester.tap(createButton);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byType(ArenaManualBookingSheet), findsOneWidget);
    expect(find.textContaining('QUADRA 1'), findsOneWidget);

    await tester.enterText(
      find.widgetWithText(TextField, 'Nome de quem vai jogar'),
      'João',
    );
    final submit = find.descendant(
      of: find.byType(ArenaManualBookingSheet),
      matching: createButton,
    );
    await tester.ensureVisible(submit);
    await tester.tap(submit);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    final call = service.created.single;
    expect(call['courtId'], 'c1');
    expect(call['dateKey'], '2026-11-14');
    expect(call['startTime'], '19:00');
    expect(call['endTime'], '20:00');
    expect(call['customerName'], 'João');
    expect(find.text('Reserva criada.'), findsOneWidget);
    expect(find.text('RESERVAS'), findsOneWidget);
  });

  testWidgets('reserva antiga sem quadra: botão desabilitado', (tester) async {
    final service = _FakeManualBookingService();
    await pumpPage(tester, service, argsWith(withSlot: false));

    final button = tester.widget<FilledButton>(createButton);
    expect(button.onPressed, isNull);
  });
}

class _FakeManualBookingService implements ArenaManualBookingService {
  final List<Map<String, Object?>> created = [];

  @override
  Future<ArenaManualBookingQuote> quote({
    required String arenaId,
    required String courtId,
    required String dateKey,
    required String startTime,
    required String endTime,
    String? athleteId,
  }) async =>
      const ArenaManualBookingQuote(amountReais: 100);

  @override
  Future<String> create({
    required String arenaId,
    required String courtId,
    required String dateKey,
    required String startTime,
    required String endTime,
    required double amountReais,
    String? athleteId,
    String? customerName,
    bool useMemberHours = false,
    String? note,
  }) async {
    created.add({
      'courtId': courtId,
      'dateKey': dateKey,
      'startTime': startTime,
      'endTime': endTime,
      'customerName': customerName,
    });
    return 'bk2';
  }
}
