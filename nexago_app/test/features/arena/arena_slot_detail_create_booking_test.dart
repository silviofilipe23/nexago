import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena/data/manual_booking_service.dart';
import 'package:nexago_app/features/arena/domain/arena_access_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_bookings_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_schedule_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_slot_detail_args.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/presentation/arena_slot_detail_page.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_manual_booking_sheet.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';

/// "Criar reserva" no detalhe do horário era um "em breve": o gestor não tinha
/// como reservar um horário pelo app. Agora abre a folha de balcão e grava
/// pela callable `createArenaManualBooking`.
void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  final slot = ArenaSlot.virtual(
    arenaId: 'a1',
    courtId: 'c1',
    date: DateTime(2026, 11, 14),
    startTime: '19:00',
    endTime: '20:00',
    priceReais: 120,
  );

  List<Override> overrides(_FakeManualBookingService service) {
    const membership = ArenaMembership(
      arenaId: 'a1',
      name: 'Vegeton',
      isOwner: false,
      role: ArenaStaffRole.recepcao,
    );
    return [
      ownedArenaMembershipsProvider.overrideWith(
        (ref) => Stream.value(const <ArenaMembership>[]),
      ),
      staffArenaMembershipsProvider.overrideWith(
        (ref) => Stream.value(const [membership]),
      ),
      arenaManagerBookingsStreamProvider.overrideWith(
        (ref) => Stream.value(const []),
      ),
      arenaManualBookingServiceProvider.overrideWithValue(service),
    ];
  }

  Future<void> pumpPage(
    WidgetTester tester,
    _FakeManualBookingService service, {
    ArenaSlot? slotOverride,
  }) async {
    final router = GoRouter(
      initialLocation: '/slot',
      routes: [
        GoRoute(
          path: '/',
          builder: (_, __) => const Scaffold(body: Text('AGENDA')),
          routes: [
            GoRoute(
              path: 'slot',
              builder: (_, __) => ArenaSlotDetailPage(
                args: ArenaSlotDetailArgs(
                  slot: slotOverride ?? slot,
                  courtName: 'Quadra 1',
                ),
              ),
            ),
          ],
        ),
      ],
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: overrides(service),
        child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  Future<void> openSheet(WidgetTester tester) async {
    await tester.tap(find.text('Criar reserva'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
  }

  final submitButton = find.widgetWithText(FilledButton, 'Criar reserva');

  testWidgets('cria a reserva do horário com o nome do cliente',
      (tester) async {
    final service = _FakeManualBookingService(quoteAmount: 90);
    await pumpPage(tester, service);

    await openSheet(tester);
    expect(find.byType(ArenaManualBookingSheet), findsOneWidget);
    // Cotação do servidor substitui o preço do slot.
    expect(find.text('90.00'), findsOneWidget);

    await tester.enterText(
      find.widgetWithText(TextField, 'Nome de quem vai jogar'),
      'João',
    );
    await tester.tap(submitButton);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    final call = service.created.single;
    expect(call['arenaId'], 'a1');
    expect(call['courtId'], 'c1');
    expect(call['dateKey'], '2026-11-14');
    expect(call['startTime'], '19:00');
    expect(call['endTime'], '20:00');
    expect(call['customerName'], 'João');
    expect(call['amountReais'], 90.0);
    expect(find.text('Reserva criada.'), findsOneWidget);
    expect(find.text('AGENDA'), findsOneWidget);
  });

  testWidgets('sem nome não chama o servidor', (tester) async {
    final service = _FakeManualBookingService();
    await pumpPage(tester, service);

    await openSheet(tester);
    await tester.tap(submitButton);
    await tester.pump();

    expect(service.created, isEmpty);
    expect(find.text('Informe o nome do cliente.'), findsOneWidget);
  });

  testWidgets('recusa do servidor aparece e a folha continua aberta',
      (tester) async {
    final service = _FakeManualBookingService(
      createError: StateError('Esse horário já está ocupado.'),
    );
    await pumpPage(tester, service);

    await openSheet(tester);
    await tester.enterText(
      find.widgetWithText(TextField, 'Nome de quem vai jogar'),
      'João',
    );
    await tester.tap(submitButton);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(
      find.text(
        'Não foi possível criar a reserva. Esse horário já está ocupado.',
      ),
      findsOneWidget,
    );
    expect(find.byType(ArenaManualBookingSheet), findsOneWidget);
  });

  testWidgets('horário ocupado não abre a folha', (tester) async {
    final booked = ArenaSlot(
      id: 's1',
      arenaId: 'a1',
      courtId: 'c1',
      date: DateTime(2026, 11, 14),
      startTime: '19:00',
      endTime: '20:00',
      rawStatus: 'booked',
      isVirtual: false,
    );
    final service = _FakeManualBookingService();
    await pumpPage(tester, service, slotOverride: booked);

    // O card aparece desabilitado: o toque não chega nele.
    await tester.tap(find.text('Criar reserva'), warnIfMissed: false);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byType(ArenaManualBookingSheet), findsNothing);
  });

  group('parseManualBookingAmount', () {
    test('aceita formatos do balcão', () {
      expect(parseManualBookingAmount('120'), 120);
      expect(parseManualBookingAmount('120.00'), 120);
      expect(parseManualBookingAmount('120,50'), 120.5);
      expect(parseManualBookingAmount('R\$ 1.200,00'), 1200);
      expect(parseManualBookingAmount('0'), 0);
    });

    test('vazio, negativo ou lixo é null', () {
      expect(parseManualBookingAmount(''), isNull);
      expect(parseManualBookingAmount('  '), isNull);
      expect(parseManualBookingAmount('-10'), isNull);
      expect(parseManualBookingAmount('abc'), isNull);
    });
  });
}

class _FakeManualBookingService implements ArenaManualBookingService {
  _FakeManualBookingService({this.quoteAmount, this.createError});

  final double? quoteAmount;
  final Object? createError;
  final List<Map<String, Object?>> created = [];

  @override
  Future<double?> quote({
    required String arenaId,
    required String courtId,
    required String dateKey,
    required String startTime,
    required String endTime,
  }) async =>
      quoteAmount;

  @override
  Future<String> create({
    required String arenaId,
    required String courtId,
    required String dateKey,
    required String startTime,
    required String endTime,
    required String customerName,
    required double amountReais,
    String? note,
  }) async {
    final error = createError;
    if (error != null) throw error;
    created.add({
      'arenaId': arenaId,
      'courtId': courtId,
      'dateKey': dateKey,
      'startTime': startTime,
      'endTime': endTime,
      'customerName': customerName,
      'amountReais': amountReais,
      'note': note,
    });
    return 'bk1';
  }
}
