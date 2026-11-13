import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/core/profiles/users_repository.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena/data/manual_booking_service.dart';
import 'package:nexago_app/features/arena/domain/arena_access_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_bookings_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_manual_booking.dart';
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

  List<Override> overrides(
    _FakeManualBookingService service,
    _FakeUsersRepository users,
  ) {
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
      usersRepositoryProvider.overrideWithValue(users),
    ];
  }

  Future<void> pumpPage(
    WidgetTester tester,
    _FakeManualBookingService service, {
    ArenaSlot? slotOverride,
    _FakeUsersRepository? users,
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
        overrides: overrides(service, users ?? _FakeUsersRepository()),
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
    await tester.ensureVisible(submitButton);
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
    await tester.ensureVisible(submitButton);
    await tester.tap(submitButton);
    await tester.pump();

    expect(service.created, isEmpty);
    expect(
      find.text('Informe o atleta ou o nome do cliente.'),
      findsOneWidget,
    );
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
    await tester.ensureVisible(submitButton);
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

  testWidgets('atleta mensalista: desconta do banco de horas', (tester) async {
    final service = _FakeManualBookingService(
      quoteAmount: 120,
      memberHours: const ArenaMemberHours(
        weeklyMinutes: 240,
        availableMinutes: 180,
        coverMinutes: 60,
        planName: 'Mensal 4h',
        blocked: false,
      ),
    );
    final users = _FakeUsersRepository(results: const [
      AppUserProfile(uid: 'u1', nickname: '@maria', fullName: 'Maria Souza'),
    ]);
    await pumpPage(tester, service, users: users);

    await openSheet(tester);
    await tester.enterText(
      find.widgetWithText(TextField, 'Buscar por nome ou apelido'),
      'mar',
    );
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump();
    expect(users.terms, ['mar']);

    await tester.tap(find.text('maria'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    // Cotação com o atleta: traz o banco de horas.
    expect(service.quotedAthleteIds.last, 'u1');
    expect(find.text('Trocar'), findsOneWidget);
    expect(
      find.text('Descontar do banco de horas · Mensal 4h'),
      findsOneWidget,
    );
    expect(find.text('A cobrar: nada (coberta pelo plano)'), findsOneWidget);

    await tester.ensureVisible(submitButton);
    await tester.tap(submitButton);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    final call = service.created.single;
    expect(call['athleteId'], 'u1');
    expect(call['customerName'], 'maria');
    expect(call['useMemberHours'], true);
    expect(call['amountReais'], 120.0);
  });

  testWidgets('mensalista desmarca o banco: reserva avulsa', (tester) async {
    final service = _FakeManualBookingService(
      quoteAmount: 120,
      memberHours: const ArenaMemberHours(
        weeklyMinutes: 240,
        availableMinutes: 180,
        coverMinutes: 60,
        planName: 'Mensal 4h',
        blocked: false,
      ),
    );
    final users = _FakeUsersRepository(results: const [
      AppUserProfile(uid: 'u1', nickname: 'maria'),
    ]);
    await pumpPage(tester, service, users: users);

    await openSheet(tester);
    await tester.enterText(
      find.widgetWithText(TextField, 'Buscar por nome ou apelido'),
      'mar',
    );
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump();
    await tester.tap(find.text('maria'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    await tester.tap(find.byType(Checkbox));
    await tester.pump();
    expect(find.textContaining('A cobrar'), findsNothing);

    await tester.ensureVisible(submitButton);
    await tester.tap(submitButton);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(service.created.single['useMemberHours'], false);
    expect(service.created.single['athleteId'], 'u1');
  });

  testWidgets('mensalista atrasado: avisa e não desconta', (tester) async {
    final service = _FakeManualBookingService(
      quoteAmount: 120,
      memberHours: const ArenaMemberHours(
        weeklyMinutes: 240,
        availableMinutes: 180,
        coverMinutes: 0,
        planName: 'Mensal 4h',
        blocked: true,
      ),
    );
    final users = _FakeUsersRepository(results: const [
      AppUserProfile(uid: 'u1', nickname: 'maria'),
    ]);
    await pumpPage(tester, service, users: users);

    await openSheet(tester);
    await tester.enterText(
      find.widgetWithText(TextField, 'Buscar por nome ou apelido'),
      'mar',
    );
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump();
    await tester.tap(find.text('maria'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.textContaining('mensalidade atrasada'), findsOneWidget);
    expect(find.byType(Checkbox), findsNothing);

    await tester.ensureVisible(submitButton);
    await tester.tap(submitButton);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(service.created.single['useMemberHours'], false);
  });

  testWidgets('trocar o atleta volta para a busca', (tester) async {
    final service = _FakeManualBookingService(quoteAmount: 120);
    final users = _FakeUsersRepository(results: const [
      AppUserProfile(uid: 'u1', nickname: 'maria'),
    ]);
    await pumpPage(tester, service, users: users);

    await openSheet(tester);
    await tester.enterText(
      find.widgetWithText(TextField, 'Buscar por nome ou apelido'),
      'mar',
    );
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump();
    await tester.tap(find.text('maria'));
    await tester.pump();

    await tester.tap(find.text('Trocar'));
    await tester.pump();

    expect(find.text('Trocar'), findsNothing);
    expect(
      find.widgetWithText(TextField, 'Buscar por nome ou apelido'),
      findsOneWidget,
    );
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
}

class _FakeManualBookingService implements ArenaManualBookingService {
  _FakeManualBookingService({
    this.quoteAmount,
    this.memberHours,
    this.createError,
  });

  final double? quoteAmount;
  final ArenaMemberHours? memberHours;
  final Object? createError;
  final List<String?> quotedAthleteIds = [];
  final List<Map<String, Object?>> created = [];

  @override
  Future<ArenaManualBookingQuote> quote({
    required String arenaId,
    required String courtId,
    required String dateKey,
    required String startTime,
    required String endTime,
    String? athleteId,
  }) async {
    quotedAthleteIds.add(athleteId);
    return ArenaManualBookingQuote(
      amountReais: quoteAmount,
      memberHours: athleteId != null ? memberHours : null,
    );
  }

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
    final error = createError;
    if (error != null) throw error;
    created.add({
      'arenaId': arenaId,
      'courtId': courtId,
      'dateKey': dateKey,
      'startTime': startTime,
      'endTime': endTime,
      'amountReais': amountReais,
      'athleteId': athleteId,
      'customerName': customerName,
      'useMemberHours': useMemberHours,
      'note': note,
    });
    return 'bk1';
  }
}

class _FakeUsersRepository implements UsersRepository {
  _FakeUsersRepository({this.results = const []});

  final List<AppUserProfile> results;
  final List<String> terms = [];

  @override
  Future<List<AppUserProfile>> searchAthletesByKeywords(
    String term, {
    int max = 25,
  }) async {
    terms.add(term);
    return results;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
