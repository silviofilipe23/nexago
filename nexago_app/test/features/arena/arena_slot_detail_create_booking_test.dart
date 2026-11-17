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
import 'package:nexago_app/features/arena/presentation/arena_manual_booking_page.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';

/// "Criar reserva" no detalhe do horário era um "em breve": o gestor não tinha
/// como reservar um horário pelo app. Agora abre a tela de balcão e grava
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

  // Horários do dia aberto na agenda (base dos horários seguidos).
  final daySlots = StateProvider<List<ArenaSlot>>((ref) => const []);

  List<Override> overrides(
    _FakeManualBookingService service,
    _FakeUsersRepository users, {
    List<ArenaSlot> day = const [],
  }) {
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
      daySlots.overrideWith((ref) => day),
      arenaManualBookingDaySlotsProvider.overrideWith(
        (ref, dateKey) => ref.watch(daySlots),
      ),
    ];
  }

  Future<void> pumpPage(
    WidgetTester tester,
    _FakeManualBookingService service, {
    ArenaSlot? slotOverride,
    _FakeUsersRepository? users,
    List<ArenaSlot> day = const [],
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
        overrides: overrides(
          service,
          users ?? _FakeUsersRepository(),
          day: day,
        ),
        child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  Future<void> openPage(WidgetTester tester) async {
    await tester.tap(find.text('Criar reserva'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
  }

  final submitButton = find.widgetWithText(FilledButton, 'Criar reserva');

  testWidgets('cria a reserva do horário com o nome do cliente',
      (tester) async {
    final service = _FakeManualBookingService(quoteAmount: 90);
    await pumpPage(tester, service);

    await openPage(tester);
    expect(find.byType(ArenaManualBookingPage), findsOneWidget);
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

  group('até que horas', () {
    ArenaSlot daySlot(String start, String end, {String status = 'available'}) {
      return ArenaSlot(
        id: 'c1-$start',
        arenaId: 'a1',
        courtId: 'c1',
        date: DateTime(2026, 11, 14),
        startTime: start,
        endTime: end,
        rawStatus: status,
        priceReais: 120,
      );
    }

    // 19h (tocado) até 01h livre... 19–20, 20–21, 21–22, 22–23, 23–00.
    final day = [
      slot,
      daySlot('20:00', '21:00'),
      daySlot('21:00', '22:00'),
      daySlot('22:00', '23:00'),
      daySlot('23:00', '00:00'),
    ];

    final endSelect = find.byType(DropdownButtonFormField<int>);

    Future<void> pickEnd(WidgetTester tester, String label) async {
      await tester.ensureVisible(endSelect);
      await tester.tap(endSelect);
      await tester.pumpAndSettle();
      await tester.tap(find.text(label).last);
      await tester.pumpAndSettle();
    }

    testWidgets('select lista todos os horários livres seguidos, sem teto',
        (tester) async {
      final service = _FakeManualBookingService();
      await pumpPage(tester, service, day: day);

      await openPage(tester);
      expect(find.text('ATÉ QUE HORAS'), findsOneWidget);
      expect(find.text('20:00 · 1h'), findsOneWidget);

      await tester.tap(endSelect);
      await tester.pumpAndSettle();
      for (final label in [
        '21:00 · 2h',
        '22:00 · 3h',
        '23:00 · 4h',
        '00:00 · 5h',
      ]) {
        expect(find.text(label), findsWidgets, reason: label);
      }
    });

    testWidgets('reserva de 5h sai num intervalo só', (tester) async {
      final service = _FakeManualBookingService();
      await pumpPage(tester, service, day: day);

      await openPage(tester);
      await pickEnd(tester, '00:00 · 5h');

      expect(find.text('19:00 — 00:00'), findsOneWidget);
      // Valor sugerido = soma dos horários; cotação refeita para 19h–00h.
      expect(find.text('600.00'), findsOneWidget);
      expect(service.quotedEndTimes.last, '00:00');

      await tester.enterText(
        find.widgetWithText(TextField, 'Nome de quem vai jogar'),
        'João',
      );
      await tester.ensureVisible(submitButton);
      await tester.tap(submitButton);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      final call = service.created.single;
      expect(call['startTime'], '19:00');
      expect(call['endTime'], '00:00');
      expect(call['amountReais'], 600.0);
    });

    testWidgets('para no primeiro horário ocupado', (tester) async {
      final service = _FakeManualBookingService();
      await pumpPage(
        tester,
        service,
        day: [
          slot,
          daySlot('20:00', '21:00'),
          daySlot('21:00', '22:00', status: 'booked'),
          daySlot('22:00', '23:00'),
        ],
      );

      await openPage(tester);
      await tester.tap(endSelect);
      await tester.pumpAndSettle();
      expect(find.text('21:00 · 2h'), findsWidgets);
      expect(find.text('22:00 · 3h'), findsNothing);
    });

    testWidgets('cotação do servidor vale para o intervalo inteiro',
        (tester) async {
      final service = _FakeManualBookingService(quoteAmount: 200);
      await pumpPage(tester, service, day: day);

      await openPage(tester);
      await pickEnd(tester, '21:00 · 2h');

      expect(service.quotedEndTimes.last, '21:00');
      expect(find.text('200.00'), findsOneWidget);
    });

    testWidgets('sem horário livre em seguida: select travado no fim do tocado',
        (tester) async {
      final service = _FakeManualBookingService();
      await pumpPage(
        tester,
        service,
        day: [slot, daySlot('20:00', '21:00', status: 'blocked')],
      );

      await openPage(tester);
      expect(find.text('20:00 · 1h'), findsOneWidget);
      expect(
        find.text('Sem horário livre logo em seguida nesta quadra.'),
        findsOneWidget,
      );
      final field = tester.widget<DropdownButton<int>>(
        find.byType(DropdownButton<int>),
      );
      expect(field.onChanged, isNull);
    });

    testWidgets('horário escolhido ocupado com a tela aberta: não envia',
        (tester) async {
      final service = _FakeManualBookingService();
      await pumpPage(tester, service, day: day);

      await openPage(tester);
      await pickEnd(tester, '22:00 · 3h');

      // Outra reserva pega as 20h enquanto a tela está aberta.
      final container = ProviderScope.containerOf(
        tester.element(find.byType(ArenaManualBookingPage)),
      );
      container.read(daySlots.notifier).state = [
        slot,
        daySlot('20:00', '21:00', status: 'booked'),
      ];
      await tester.pump();

      await tester.enterText(
        find.widgetWithText(TextField, 'Nome de quem vai jogar'),
        'João',
      );
      await tester.ensureVisible(submitButton);
      await tester.tap(submitButton);
      await tester.pump();

      expect(service.created, isEmpty);
      expect(find.textContaining('acabou de ser ocupado'), findsOneWidget);
      expect(find.text('19:00 — 20:00'), findsOneWidget);
    });
  });

  testWidgets('Cancelar fecha a tela sem criar reserva', (tester) async {
    final service = _FakeManualBookingService();
    await pumpPage(tester, service);

    await openPage(tester);
    final cancel = find.widgetWithText(OutlinedButton, 'Cancelar');
    await tester.ensureVisible(cancel);
    await tester.tap(cancel);
    await tester.pumpAndSettle();

    expect(find.byType(ArenaManualBookingPage), findsNothing);
    expect(service.created, isEmpty);
    expect(find.text('Reserva criada.'), findsNothing);
  });

  testWidgets('X do topo fecha a tela sem criar reserva', (tester) async {
    final service = _FakeManualBookingService();
    await pumpPage(tester, service);

    await openPage(tester);
    await tester.tap(find.byTooltip('Fechar'));
    await tester.pumpAndSettle();

    expect(find.byType(ArenaManualBookingPage), findsNothing);
    expect(service.created, isEmpty);
  });

  // A bottom sheet subia até o relógio/notch. A tela respeita a área segura.
  testWidgets('topo da tela fica abaixo da área segura (notch)',
      (tester) async {
    const notch = 47.0;
    tester.view.padding = FakeViewPadding(
      top: notch * tester.view.devicePixelRatio,
    );
    addTearDown(tester.view.resetPadding);
    final service = _FakeManualBookingService();
    await pumpPage(tester, service);

    await openPage(tester);
    await tester.pumpAndSettle();

    expect(find.byType(ArenaManualBookingPage), findsOneWidget);
    expect(
      tester.getTopLeft(find.byTooltip('Fechar')).dy,
      greaterThanOrEqualTo(notch),
    );
    expect(
      tester.getTopLeft(find.textContaining('QUADRA 1')).dy,
      greaterThanOrEqualTo(notch),
    );
  });

  testWidgets('tocar fora dos campos fecha o teclado', (tester) async {
    final service = _FakeManualBookingService();
    await pumpPage(tester, service);

    await openPage(tester);
    final nameField = find.widgetWithText(TextField, 'Nome de quem vai jogar');
    await tester.tap(nameField);
    await tester.pump();
    expect(tester.testTextInput.isVisible, isTrue);

    // Toque num texto da tela (fora de qualquer campo).
    await tester.tap(find.text('ATÉ QUE HORAS'));
    await tester.pump();
    expect(tester.testTextInput.isVisible, isFalse);
    expect(find.byType(ArenaManualBookingPage), findsOneWidget);
  });

  testWidgets('sem nome não chama o servidor', (tester) async {
    final service = _FakeManualBookingService();
    await pumpPage(tester, service);

    await openPage(tester);
    await tester.ensureVisible(submitButton);
    await tester.tap(submitButton);
    await tester.pump();

    expect(service.created, isEmpty);
    expect(
      find.text('Informe o atleta ou o nome do cliente.'),
      findsOneWidget,
    );
  });

  testWidgets('recusa do servidor aparece e a tela continua aberta',
      (tester) async {
    final service = _FakeManualBookingService(
      createError: StateError('Esse horário já está ocupado.'),
    );
    await pumpPage(tester, service);

    await openPage(tester);
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
    expect(find.byType(ArenaManualBookingPage), findsOneWidget);
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

    await openPage(tester);
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

    await openPage(tester);
    await tester.enterText(
      find.widgetWithText(TextField, 'Buscar por nome ou apelido'),
      'mar',
    );
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump();
    await tester.tap(find.text('maria'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    await tester.ensureVisible(find.byType(Checkbox));
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

    await openPage(tester);
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

    await openPage(tester);
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

  testWidgets('horário ocupado não abre a tela', (tester) async {
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
    expect(find.byType(ArenaManualBookingPage), findsNothing);
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
  final List<String> quotedEndTimes = [];
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
    quotedEndTimes.add(endTime);
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
