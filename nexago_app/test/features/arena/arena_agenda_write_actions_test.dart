// Task 10 (RBAC arena/equipe): a diferença entre LER e ESCREVER na Agenda e
// Reservas. `manutencao` lê `agenda` mas não escreve — abre a tela e não
// encontra nenhum botão que grave. `recepcao`/`gestor` escrevem e não podem
// perder ação nenhuma.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena/domain/arena_access_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_bookings_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_club.dart';
import 'package:nexago_app/features/arena/domain/arena_club_admin_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_court_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_manager_booking.dart';
import 'package:nexago_app/features/arena/domain/arena_plan.dart';
import 'package:nexago_app/features/arena/domain/arena_plan_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_recurring_booking.dart';
import 'package:nexago_app/features/arena/domain/arena_recurring_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_schedule_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_slot_detail_args.dart';
import 'package:nexago_app/features/arena/domain/arena_slot_detail_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/presentation/arena_booking_details_page.dart';
import 'package:nexago_app/features/arena/presentation/arena_bookings_page.dart';
import 'package:nexago_app/features/arena/presentation/arena_clubs_page.dart';
import 'package:nexago_app/features/arena/presentation/arena_recurring_list_page.dart';
import 'package:nexago_app/features/arena/presentation/arena_slot_detail_page.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_booking_detail_actions.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot_block_reason.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';

/// Overrides das duas fontes-folha: nenhuma ida ao Firestore.
///
/// Copiado de `arena_settings_access_test.dart` (Task 8) / `arena_dashboard_money_test.dart`
/// (Task 9) — mesmo padrão, sem importar do outro arquivo de teste.
List<Override> overridesForRole(ArenaStaffRole? role, {bool owner = false}) {
  final membership = ArenaMembership(
    arenaId: 'a1',
    name: 'Vegeton',
    isOwner: owner,
    role: role,
  );
  return [
    ownedArenaMembershipsProvider.overrideWith(
      (ref) => Stream.value(owner ? [membership] : const <ArenaMembership>[]),
    ),
    staffArenaMembershipsProvider.overrideWith(
      (ref) => Stream.value(owner ? const <ArenaMembership>[] : [membership]),
    ),
  ];
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  final availableSlot = ArenaSlot.virtual(
    arenaId: 'a1',
    courtId: 'c1',
    date: DateTime(2026, 9, 24),
    startTime: '08:00',
    endTime: '09:00',
    priceReais: 120,
  );

  // Achado da varredura (fora dos 4 anchors do brief): "Desbloquear" em
  // `_BlockedDetails` também grava na agenda — mesmo gate.
  final blockedSlot = ArenaSlot(
    id: 'v_blocked',
    arenaId: 'a1',
    courtId: 'c1',
    date: DateTime(2026, 9, 24),
    startTime: '08:00',
    endTime: '09:00',
    rawStatus: 'blocked',
    isVirtual: true,
    blockReason: ArenaSlotBlockReason.manutencao,
  );

  Future<void> pumpSlotDetail(
    WidgetTester tester,
    List<Override> overrides, {
    ArenaSlot? slot,
  }) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...overrides,
          // Slot virtual: `arenaSlotLiveProvider` já devolve `null` sem tocar
          // Firestore para ids `v_...` — não precisa de override.
          // Histórico da grade: fixado vazio, não é o que este teste cobre.
          arenaManagerBookingsStreamProvider.overrideWith(
            (ref) => Stream.value(const []),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: ArenaSlotDetailPage(
            args: ArenaSlotDetailArgs(
              slot: slot ?? availableSlot,
              courtName: 'Quadra 1',
            ),
          ),
        ),
      ),
    );
    // Sem pumpAndSettle: telas do painel tem indicador "AO VIVO" cuja
    // animacao nunca assenta e trava o teste no timeout.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('manutencao nao ve as acoes do slot', (tester) async {
    await pumpSlotDetail(tester, overridesForRole(ArenaStaffRole.manutencao));
    expect(find.text('Criar reserva'), findsNothing);
    expect(find.text('Bloquear'), findsNothing);
    expect(find.text('Ajustar preço'), findsNothing);
    expect(find.text('Horário fixo'), findsNothing);
  });

  testWidgets('recepcao ve as acoes do slot', (tester) async {
    await pumpSlotDetail(tester, overridesForRole(ArenaStaffRole.recepcao));
    expect(find.text('Criar reserva'), findsOneWidget);
    expect(find.text('Bloquear'), findsOneWidget);
  });

  testWidgets('manutencao nao ve Desbloquear no slot bloqueado', (tester) async {
    await pumpSlotDetail(
      tester,
      overridesForRole(ArenaStaffRole.manutencao),
      slot: blockedSlot,
    );
    // O card de bloqueio fica abaixo do histórico semanal, fora do viewport
    // inicial do ListView — rola até o fim para o Sliver construí-lo. Depois
    // do drag, mais um pump com duração > 0: o `FadeSlideIn` recém-montado
    // agenda um Future imediato (Timer de duração zero) que precisa de uma
    // volta de clock pra assentar antes do fim do teste.
    await tester.drag(find.byType(ListView), const Offset(0, -600));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('Desbloquear'), findsNothing);
  });

  testWidgets('recepcao ve Desbloquear no slot bloqueado', (tester) async {
    await pumpSlotDetail(
      tester,
      overridesForRole(ArenaStaffRole.recepcao),
      slot: blockedSlot,
    );
    await tester.drag(find.byType(ListView), const Offset(0, -600));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('Desbloquear'), findsOneWidget);
  });

  // --- arena_bookings_page.dart: atalhos "Horários fixos" e "Clubinho" ---
  // Ambos levam a telas cuja única ação é criar (não há visão "só leitura"),
  // então o atalho inteiro some para quem não escreve agenda.

  Future<void> pumpBookings(
    WidgetTester tester,
    List<Override> overrides,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...overrides,
          arenaBookingsTodayProvider.overrideWith(
            (ref) => const AsyncValue<List<ArenaManagerBooking>>.data(
              <ArenaManagerBooking>[],
            ),
          ),
          arenaBookingsTodayInsightProvider.overrideWith((ref) => null),
          arenaActiveRecurringSeriesProvider.overrideWith(
            (ref) => Stream.value(const <ArenaRecurringBooking>[]),
          ),
          managedArenaClubsProvider.overrideWith(
            (ref) => Stream.value(const <ArenaClub>[]),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const ArenaBookingsPage(),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets(
      'manutencao nao ve atalhos de horarios fixos nem clubinho',
      (tester) async {
    await pumpBookings(tester, overridesForRole(ArenaStaffRole.manutencao));
    expect(find.text('Horários fixos (mensalistas)'), findsNothing);
    expect(find.text('Clubinho (jogo aberto)'), findsNothing);
  });

  testWidgets('recepcao ve atalhos de horarios fixos e clubinho',
      (tester) async {
    await pumpBookings(tester, overridesForRole(ArenaStaffRole.recepcao));
    expect(find.text('Horários fixos (mensalistas)'), findsOneWidget);
    expect(find.text('Clubinho (jogo aberto)'), findsOneWidget);
  });

  // --- arena_recurring_list_page.dart: botão "Novo" ---
  // Rota liberada por LEITURA de agenda (Task 6) — alcançável direto mesmo
  // com o atalho acima escondido, então o botão precisa do próprio gate.

  Future<void> pumpRecurringList(
    WidgetTester tester,
    List<Override> overrides,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...overrides,
          arenaActiveRecurringSeriesProvider.overrideWith(
            (ref) => Stream.value(const <ArenaRecurringBooking>[]),
          ),
          managedArenaPlanStatusProvider.overrideWith(
            (ref) => Stream.value(ArenaPlanStatus.none),
          ),
          managedArenaDetailProvider.overrideWith((ref) => Stream.value(null)),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const ArenaRecurringListPage(),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('manutencao nao ve Novo em horarios fixos', (tester) async {
    await pumpRecurringList(
      tester,
      overridesForRole(ArenaStaffRole.manutencao),
    );
    expect(find.text('Novo'), findsNothing);
  });

  testWidgets('recepcao ve Novo em horarios fixos', (tester) async {
    await pumpRecurringList(tester, overridesForRole(ArenaStaffRole.recepcao));
    expect(find.text('Novo'), findsOneWidget);
  });

  // --- arena_clubs_page.dart: botão "Novo" (achado da varredura) ---
  // Mesmo raciocínio do recorrente: rota liberada por leitura, alcançável
  // direto; o gate garante que quem só lê não encontra o botão que cria.

  Future<void> pumpClubs(
    WidgetTester tester,
    List<Override> overrides,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...overrides,
          managedArenaClubsProvider.overrideWith(
            (ref) => Stream.value(const <ArenaClub>[]),
          ),
          managedArenaPlanStatusProvider.overrideWith(
            (ref) => Stream.value(ArenaPlanStatus.none),
          ),
          managedArenaDetailProvider.overrideWith((ref) => Stream.value(null)),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const ArenaClubsPage(),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('manutencao nao ve Novo em clubinho', (tester) async {
    await pumpClubs(tester, overridesForRole(ArenaStaffRole.manutencao));
    expect(find.text('Novo'), findsNothing);
  });

  testWidgets('recepcao ve Novo em clubinho', (tester) async {
    await pumpClubs(tester, overridesForRole(ArenaStaffRole.recepcao));
    expect(find.text('Novo'), findsOneWidget);
  });

  // --- arena_booking_details_page.dart: cancelar / bloquear / desbloquear ---
  // Diferente das demais telas, aqui o padrão já estabelecido no arquivo é
  // DESABILITAR a ação (callback nulo) por regra de negócio (reserva já
  // concluída, atleta sem id) — não escondê-la. `&& canWrite` segue o mesmo
  // idioma local em vez de reestruturar `ArenaBookingDetailActions` (fora do
  // escopo do brief). Testamos o estado do callback, não o texto na tela.

  Future<void> pumpBookingDetails(
    WidgetTester tester,
    List<Override> overrides,
  ) async {
    const athleteId = 'ath1';
    const booking = ArenaManagerBooking(
      id: 'b1',
      athleteId: athleteId,
      courtId: 'c1',
      courtName: 'Quadra 1',
      dateKey: '2026-09-24',
      startTime: '08:00',
      endTime: '09:00',
      data: {'status': 'confirmed', 'amountReais': 100.0},
    );
    const historyArgs = AthleteArenaHistoryArgs(
      athleteId: athleteId,
      arenaId: 'a1',
    );
    final router = GoRouter(
      routes: [
        GoRoute(
          path: '/',
          builder: (_, __) => ArenaBookingDetailsPage(
            bookingId: booking.id,
            initialBooking: booking,
          ),
        ),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...overrides,
          arenaBookingDetailMapProvider(booking.id).overrideWith(
            (ref) => Stream.value(null),
          ),
          arenaManagedCourtsProvider.overrideWith(
            (ref) => Stream.value(const []),
          ),
          athleteDisplayLabelProvider(athleteId).overrideWith(
            (ref) async => 'Atleta Teste',
          ),
          athleteProfileByIdProvider(athleteId).overrideWith(
            (ref) => Stream.value(null),
          ),
          athleteArenaHistoryProvider(historyArgs).overrideWith(
            (ref) => Stream.value(const <ArenaManagerBooking>[]),
          ),
          arenaAthleteBlockProvider(historyArgs).overrideWith(
            (ref) => Stream.value(const ArenaAthleteBlockInfo(isBlocked: false)),
          ),
        ],
        child: MaterialApp.router(
          theme: AppTheme.dark,
          routerConfig: router,
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets(
      'manutencao nao pode cancelar nem bloquear/desbloquear a reserva',
      (tester) async {
    await pumpBookingDetails(
      tester,
      overridesForRole(ArenaStaffRole.manutencao),
    );
    final actions = tester.widget<ArenaBookingDetailActions>(
      find.byType(ArenaBookingDetailActions),
    );
    expect(actions.onCancel, isNull);
    expect(actions.onBlock, isNull);
    expect(actions.onUnblock, isNull);
  });

  testWidgets('recepcao pode cancelar e bloquear a reserva', (tester) async {
    await pumpBookingDetails(tester, overridesForRole(ArenaStaffRole.recepcao));
    final actions = tester.widget<ArenaBookingDetailActions>(
      find.byType(ArenaBookingDetailActions),
    );
    expect(actions.onCancel, isNotNull);
    expect(actions.onBlock, isNotNull);
  });
}
