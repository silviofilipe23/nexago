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
import 'package:nexago_app/features/arena/domain/arena_schedule_models.dart';
import 'package:nexago_app/features/arena/domain/arena_schedule_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_settings_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_settings_schedule.dart';
import 'package:nexago_app/features/arena/domain/arena_slot_detail_args.dart';
import 'package:nexago_app/features/arena/domain/arena_slot_detail_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/presentation/arena_availability_settings_page.dart';
import 'package:nexago_app/features/arena/presentation/arena_booking_details_page.dart';
import 'package:nexago_app/features/arena/presentation/arena_bookings_page.dart';
import 'package:nexago_app/features/arena/presentation/arena_club_details_page.dart';
import 'package:nexago_app/features/arena/presentation/arena_club_form_page.dart';
import 'package:nexago_app/features/arena/presentation/arena_club_session_page.dart';
import 'package:nexago_app/features/arena/presentation/arena_clubs_page.dart';
import 'package:nexago_app/features/arena/presentation/arena_recurring_details_page.dart';
import 'package:nexago_app/features/arena/presentation/arena_recurring_form_page.dart';
import 'package:nexago_app/features/arena/presentation/arena_recurring_list_page.dart';
import 'package:nexago_app/features/arena/presentation/arena_schedule_page.dart';
import 'package:nexago_app/features/arena/presentation/arena_slot_detail_page.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_booking_detail_actions.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_schedule_block_sheet.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_schedule_court_row.dart';
import 'package:nexago_app/features/arenas/domain/arena_club_session.dart';
import 'package:nexago_app/features/arenas/domain/slots_providers.dart';
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

  // --- Fechamento (ruling do coordenador) ---
  // A varredura achou 3 telas fora dos anchors originais do brief que também
  // gravam agenda: detalhe/formulário de clubinho e detalhe de horário fixo.
  // O route guard da Task 6 libera as 3 rotas por LEITURA de `agenda`
  // (`/arena/clubs/**` e `/arena/bookings/recurring/**`), então manutenção
  // alcança as 3 mesmo sem os atalhos já escondidos — sem gate próprio, ela
  // encontraria lá o botão que grava.

  // --- arena_recurring_details_page.dart: "Encerrar horário fixo" ---
  // Idioma já usado na tela: esconder via collection-if (igual ao resto do
  // arquivo), não desabilitar.

  final activeSeries = ArenaRecurringBooking(
    id: 'series1',
    arenaId: 'a1',
    arenaName: 'Vegeton',
    courtId: 'c1',
    courtName: 'Quadra 1',
    weekday: 4,
    startTime: '18:00',
    endTime: '19:00',
    amountReais: 80,
    status: 'active',
    startDate: '2026-01-01',
    skippedDates: const [],
  );

  Future<void> pumpRecurringDetails(
    WidgetTester tester,
    List<Override> overrides,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...overrides,
          arenaRecurringSeriesProvider('series1').overrideWith(
            (ref) => Stream.value(activeSeries),
          ),
          arenaRecurringOccurrencesProvider('series1').overrideWith(
            (ref) => Stream.value(const <ArenaManagerBooking>[]),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const ArenaRecurringDetailsPage(seriesId: 'series1'),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('manutencao nao ve Encerrar horario fixo', (tester) async {
    await pumpRecurringDetails(
      tester,
      overridesForRole(ArenaStaffRole.manutencao),
    );
    expect(find.text('Encerrar horário fixo'), findsNothing);
  });

  testWidgets('recepcao ve Encerrar horario fixo', (tester) async {
    await pumpRecurringDetails(
      tester,
      overridesForRole(ArenaStaffRole.recepcao),
    );
    expect(find.text('Encerrar horário fixo'), findsOneWidget);
  });

  // --- arena_club_details_page.dart: "Criar sessão avulsa" e editar ---
  // Idioma já usado na tela: esconder (callback nulo → placeholder do mesmo
  // tamanho no header; collection-if no corpo), não desabilitar.

  const activeClub = ArenaClub(
    id: 'club1',
    arenaId: 'a1',
    arenaName: 'Vegeton',
    name: 'Clubinho de sexta',
    startTime: '18:00',
    endTime: '21:00',
    courtIds: ['c1'],
    courtNames: ['Quadra 1'],
    capacity: 16,
    priceReais: 20,
    cancelWindowHours: 24,
    allowOnsitePayment: true,
    status: 'active',
    startDate: '2026-01-01',
    skippedDates: [],
  );

  Future<void> pumpClubDetails(
    WidgetTester tester,
    List<Override> overrides,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...overrides,
          arenaClubProvider('club1').overrideWith(
            (ref) => Stream.value(activeClub),
          ),
          arenaClubSessionsProvider('club1').overrideWith(
            (ref) => Stream.value(const []),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const ArenaClubDetailsPage(clubId: 'club1'),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('manutencao nao ve acoes de escrita do clubinho', (tester) async {
    await pumpClubDetails(tester, overridesForRole(ArenaStaffRole.manutencao));
    expect(find.text('Criar sessão avulsa'), findsNothing);
    expect(find.byIcon(Icons.edit_outlined), findsNothing);
  });

  testWidgets('recepcao ve acoes de escrita do clubinho', (tester) async {
    await pumpClubDetails(tester, overridesForRole(ArenaStaffRole.recepcao));
    expect(find.text('Criar sessão avulsa'), findsOneWidget);
    expect(find.byIcon(Icons.edit_outlined), findsOneWidget);
  });

  // --- arena_club_form_page.dart: tela inteira ---
  // Sem idioma local de "ação indisponível" pra mimetizar (a única ação é o
  // botão final de salvar) — seguimos o idioma que a PRÓPRIA tela já usa pra
  // bloqueio total: trocar o corpo por `ArenaEmptyState` (mesmo padrão do
  // caso "Arena não encontrada" já existente ali).

  Future<void> pumpClubForm(
    WidgetTester tester,
    List<Override> overrides,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...overrides,
          courtsStreamProvider('a1').overrideWith((ref) => Stream.value(const [])),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const ArenaClubFormPage(),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('manutencao nao alcanca o formulario de clubinho', (tester) async {
    await pumpClubForm(tester, overridesForRole(ArenaStaffRole.manutencao));
    expect(find.text('Sem permissão'), findsOneWidget);
    expect(find.text('Criar clubinho'), findsNothing);
  });

  testWidgets('recepcao alcanca o formulario de clubinho', (tester) async {
    await pumpClubForm(tester, overridesForRole(ArenaStaffRole.recepcao));
    expect(find.text('Sem permissão'), findsNothing);
    // O botão "Criar clubinho" fica no fim de um formulário longo, fora do
    // viewport inicial do ListView — mesma armadilha do "Desbloquear" no
    // slot detail (o Sliver só constrói o que cai no viewport + cache
    // extent, mesmo com uma lista fixa de children).
    await tester.drag(find.byType(ListView), const Offset(0, -2000));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('Criar clubinho'), findsOneWidget);
  });

  // --- Fix round 2 (ruling do coordenador) ---
  // "Cada rodada descobre mais um ponto de escrita no mesmo canto do app" —
  // varredura completa da área `agenda` inteira (mapa rota→área da Task 5/6):
  // `/arena/schedule`, `/arena/bookings/**`, `/arena/clubs/**` e
  // `/arena/settings/availability`. Ver a tabela completa no relatório.

  // --- arena_schedule_page.dart: long-press pra bloquear (achado que a
  // leitura de texto não pega — grep por "Service." não vê `.show()` de
  // sheet, só a leitura de build() achou) ---
  // Sem diferença visual entre papéis (o gesto não renderiza nada); testamos
  // o comportamento: o long-press abre ou não abre o sheet de bloqueio.

  Future<void> pumpSchedule(
    WidgetTester tester,
    List<Override> overrides,
  ) async {
    final row = ArenaScheduleCourtRow(
      slot: ArenaSlot.virtual(
        arenaId: 'a1',
        courtId: 'c1',
        date: DateTime(2026, 9, 24),
        startTime: '08:00',
        endTime: '09:00',
      ),
      courtName: 'Quadra 1',
    );
    final group = ArenaScheduleHourGroup(
      hour: 8,
      timeRange: '08:00 – 09:00',
      courtCount: 1,
      reservedCount: 0,
      rows: [row],
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...overrides,
          arenaScheduleGroupedSlotsProvider.overrideWith(
            (ref) => AsyncValue.data([group]),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const ArenaSchedulePage(),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('manutencao: long-press na agenda nao abre bloquear',
      (tester) async {
    await pumpSchedule(tester, overridesForRole(ArenaStaffRole.manutencao));
    await tester.longPress(find.byType(ArenaScheduleCourtTile));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.byType(ArenaScheduleBlockSheet), findsNothing);
  });

  testWidgets('recepcao: long-press na agenda abre bloquear', (tester) async {
    await pumpSchedule(tester, overridesForRole(ArenaStaffRole.recepcao));
    await tester.longPress(find.byType(ArenaScheduleCourtTile));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.byType(ArenaScheduleBlockSheet), findsOneWidget);
  });

  // --- arena_recurring_form_page.dart: tela inteira (achado: rota
  // `/arena/bookings/recurring/new` aceita `extra` nulo, então é alcançável
  // direto sem passar pelos atalhos já escondidos) ---

  Future<void> pumpRecurringForm(
    WidgetTester tester,
    List<Override> overrides,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...overrides,
          courtsStreamProvider('a1').overrideWith((ref) => Stream.value(const [])),
          managedArenaCanAddRecurringBookingProvider.overrideWith((ref) => true),
          managedArenaMaxRecurringBookingsProvider.overrideWith((ref) => null),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const ArenaRecurringFormPage(),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('manutencao nao alcanca o formulario de horario fixo',
      (tester) async {
    await pumpRecurringForm(
      tester,
      overridesForRole(ArenaStaffRole.manutencao),
    );
    expect(find.text('Sem permissão'), findsOneWidget);
    expect(find.text('Criar horário fixo'), findsNothing);
  });

  testWidgets('recepcao alcanca o formulario de horario fixo', (tester) async {
    await pumpRecurringForm(tester, overridesForRole(ArenaStaffRole.recepcao));
    expect(find.text('Sem permissão'), findsNothing);
    await tester.drag(find.byType(ListView), const Offset(0, -2000));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('Criar horário fixo'), findsOneWidget);
  });

  // --- arena_availability_settings_page.dart: tela inteira (achado: o menu
  // de Ajustes já esconde a entrada — Task 8 — mas a rota
  // `/arena/settings/availability` é liberada por leitura e não exige
  // `extra`, alcançável direto) ---

  Future<void> pumpAvailabilitySettings(
    WidgetTester tester,
    List<Override> overrides,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...overrides,
          arenaSettingsTemplateProvider.overrideWith(
            (ref) async => ArenaSettingsScheduleState.initial(),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const ArenaAvailabilitySettingsPage(),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('manutencao nao alcanca disponibilidade da agenda',
      (tester) async {
    await pumpAvailabilitySettings(
      tester,
      overridesForRole(ArenaStaffRole.manutencao),
    );
    expect(find.text('Sem permissão'), findsOneWidget);
  });

  testWidgets('recepcao alcanca disponibilidade da agenda', (tester) async {
    await pumpAvailabilitySettings(
      tester,
      overridesForRole(ArenaStaffRole.recepcao),
    );
    expect(find.text('Sem permissão'), findsNothing);
    await tester.drag(find.byType(SingleChildScrollView), const Offset(0, -2000));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('Salvar alterações'), findsOneWidget);
  });

  // --- arena_club_session_page.dart: adicionar/remover participante e
  // cancelar sessão (o alvo explícito desta rodada) ---

  final scheduledSession = ArenaClubSession(
    id: 'session1',
    clubId: 'club1',
    arenaId: 'a1',
    arenaName: 'Vegeton',
    clubName: 'Clubinho de sexta',
    date: '2026-10-02',
    startTime: '18:00',
    endTime: '21:00',
    courtIds: const ['c1'],
    courtNames: const ['Quadra 1'],
    capacity: 16,
    priceReais: 20,
    cancelWindowHours: 24,
    allowOnsitePayment: true,
    confirmedCount: 0,
    pendingCount: 0,
    status: 'scheduled',
    source: 'manual',
  );

  Future<void> pumpClubSession(
    WidgetTester tester,
    List<Override> overrides,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...overrides,
          arenaClubSessionDocProvider('session1').overrideWith(
            (ref) => Stream.value(scheduledSession),
          ),
          arenaClubSessionParticipantsProvider('session1').overrideWith(
            (ref) => Stream.value(const []),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const ArenaClubSessionPage(sessionId: 'session1'),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('manutencao nao ve acoes de escrita da sessao de clubinho',
      (tester) async {
    await pumpClubSession(
      tester,
      overridesForRole(ArenaStaffRole.manutencao),
    );
    expect(find.text('Adicionar'), findsNothing);
    expect(find.text('Cancelar sessão'), findsNothing);
  });

  testWidgets('recepcao ve acoes de escrita da sessao de clubinho',
      (tester) async {
    await pumpClubSession(tester, overridesForRole(ArenaStaffRole.recepcao));
    expect(find.text('Adicionar'), findsOneWidget);
    expect(find.text('Cancelar sessão'), findsOneWidget);
  });
}
