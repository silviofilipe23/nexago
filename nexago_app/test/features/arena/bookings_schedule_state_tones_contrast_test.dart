// Texto, ícone e marca em verde, vermelho e âmbar nas telas de reservas,
// agenda e quadras do gestor da arena (card da reserva, detalhe: cabeçalho,
// anel, etapas, conta da quadra, atletas, ações, histórico; cancelar; horário da
// agenda; linha da quadra na agenda; horário fixo; quadras), conferidos
// contra o fundo real nos dois temas. No claro os crus do AppColors reprovam:
// são ~1,6–3,5:1 no branco.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/features/arena/domain/arena_booking_journey.dart';
import 'package:nexago_app/features/arena/domain/arena_bookings_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_court_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_manager_booking.dart';
import 'package:nexago_app/features/arena/domain/arena_plan.dart';
import 'package:nexago_app/features/arena/domain/arena_plan_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_recurring_booking.dart';
import 'package:nexago_app/features/arena/domain/arena_recurring_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_schedule_models.dart';
import 'package:nexago_app/features/arena/domain/arena_schedule_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_slot_detail_args.dart';
import 'package:nexago_app/features/arena/domain/arena_slot_detail_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/presentation/arena_courts_page.dart';
import 'package:nexago_app/features/arena/presentation/arena_recurring_details_page.dart';
import 'package:nexago_app/features/arena/presentation/arena_slot_detail_page.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_booking_cancel_sheet.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_booking_card.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_booking_detail_actions.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_booking_detail_athletes.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_booking_detail_header.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_booking_detail_history_full_page.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_booking_court_bill.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_booking_journey_steps.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_booking_live_hero.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_schedule_court_row.dart';
import 'package:nexago_app/features/arenas/domain/arena_court.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot_block_reason.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';

import '../../core/theme/state_tone_contrast.dart';
import '../../core/theme/state_tone_screens.dart';
import 'aulas/fake_arena_class_repository.dart';

// ── Fixtures ────────────────────────────────────────────────────────────
// Datas fixas e no passado: o cabeçalho do detalhe e a linha do tempo
// escrevem "em andamento" para o que já começou, sem relógio no texto.

List<Override> _athleteOverrides() => [
      for (final id in ['', 'ath1']) ...[
        athleteDisplayLabelProvider(id).overrideWith(
          (ref) async => 'Rafael Cunha',
        ),
        athleteProfileByIdProvider(id).overrideWith(
          (ref) => Stream.value(null),
        ),
      ],
    ];

/// [pumpTonePiece] numa tela mais larga: a fonte dos testes é mais larga que
/// a Sora, e o horário grande e o valor da reserva estouram os 402 px.
Future<void> _pumpWidePiece(
  WidgetTester tester,
  ThemeData theme,
  Widget child,
) =>
    pumpTonePage(
      tester,
      theme,
      Builder(
        builder: (context) => Scaffold(
          backgroundColor: context.themeColors.canvas,
          body: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: KeyedSubtree(key: tonePieceKey, child: child),
          ),
        ),
      ),
      size: _wide,
    );

const _wide = Size(640, 1400);

ArenaManagerBooking _booking(Map<String, dynamic> data, {String id = 'b1'}) =>
    ArenaManagerBooking(
      id: id,
      athleteId: 'ath1',
      courtId: 'q1',
      courtName: 'Quadra 1',
      dateKey: '2025-01-10',
      startTime: '18:00',
      endTime: '19:00',
      data: data,
    );

final _activeBooking = _booking(const {
  'status': 'active',
  'attendanceStatus': 'pending',
  'confirmedParticipants': 2,
  'amountReais': 120,
});

// Sinal pago: selo âmbar "Sinal pago" e "falta R$ 60,00".
final _depositBooking = _booking(const {
  'status': 'active',
  'attendanceStatus': 'checked_in',
  'paymentChannel': 'pix',
  'paymentStatus': 'partial',
  'amountReais': 120,
  'amountPaidOnlineReais': 60,
}, id: 'b3');

final _canceledBooking = _booking(const {
  'status': 'canceled',
  'attendanceStatus': 'pending',
  'amountReais': 120,
}, id: 'b2');

// Jornada ao vivo: quarta 18/11 às 17:42, reserva das 17:00 às 18:00.
final _journeyNow = DateTime(2026, 11, 18, 17, 42);

ArenaManagerBooking _journeyBooking(Map<String, dynamic> data) =>
    ArenaManagerBooking(
      id: 'b9',
      athleteId: 'ath1',
      courtId: 'c1',
      courtName: 'Quadra 1',
      dateKey: '2026-11-18',
      startTime: '17:00',
      endTime: '18:00',
      data: {
        'status': 'active',
        'paymentChannel': 'onsite',
        'amountReais': 120,
        ...data,
      },
    );

ArenaBookingJourney _journey(Map<String, dynamic> data) =>
    buildArenaBookingJourney(_journeyBooking(data), now: _journeyNow);

ArenaBookingCourtBill _bill(Map<String, dynamic> data) {
  final booking = _journeyBooking(data);
  return ArenaBookingCourtBill(
    bill: arenaBookingBill(booking),
    bookingData: booking.data,
    timeRange: '17:00–18:00',
    onAddConsumption: () {},
  );
}

ArenaRecurringBooking _series(String status) => ArenaRecurringBooking(
      id: 'series1',
      arenaId: 'a1',
      arenaName: 'Vegeton',
      courtId: 'q1',
      courtName: 'Quadra 1',
      weekday: 4,
      startTime: '18:00',
      endTime: '19:00',
      amountReais: 80,
      status: status,
      startDate: '2026-01-01',
      skippedDates: const [],
    );

Future<void> _openRecurring(
  WidgetTester tester,
  ThemeData theme,
  String status,
) =>
    pumpTonePage(
      tester,
      theme,
      const ArenaRecurringDetailsPage(seriesId: 'series1'),
      overrides: [
        ...arenaAccessOverrides(ArenaStaffRole.recepcao),
        arenaRecurringSeriesProvider('series1').overrideWith(
          (ref) => Stream.value(_series(status)),
        ),
        arenaRecurringOccurrencesProvider('series1').overrideWith(
          (ref) => Stream.value(const <ArenaManagerBooking>[]),
        ),
      ],
    );

final _availableSlot = ArenaSlot(
  id: 'v_free',
  arenaId: 'a1',
  courtId: 'q1',
  date: DateTime(2025, 1, 10),
  startTime: '18:00',
  endTime: '19:00',
  rawStatus: 'available',
  isVirtual: true,
  priceReais: 120,
);

final _bookedSlot = ArenaSlot(
  id: 'v_booked',
  arenaId: 'a1',
  courtId: 'q1',
  date: DateTime(2025, 1, 10),
  startTime: '18:00',
  endTime: '19:00',
  rawStatus: 'booked',
  isVirtual: true,
  bookingId: 'b1',
  bookingAthleteId: 'ath1',
);

final _classSlot = ArenaSlot(
  id: 'v_class',
  arenaId: 'a1',
  courtId: 'q3',
  date: DateTime(2025, 1, 10),
  startTime: '18:00',
  endTime: '19:00',
  rawStatus: 'blocked',
  isVirtual: true,
  blockReason: ArenaSlotBlockReason.aula,
);

Future<void> _openSlotDetail(
  WidgetTester tester,
  ThemeData theme,
  ArenaSlot slot,
) =>
    pumpTonePage(
      tester,
      theme,
      ArenaSlotDetailPage(
        args: ArenaSlotDetailArgs(slot: slot, courtName: 'Quadra 1'),
      ),
      overrides: [
        ...arenaAccessOverrides(ArenaStaffRole.recepcao),
        ..._athleteOverrides(),
        arenaManagerBookingsStreamProvider.overrideWith(
          (ref) => Stream.value(const <ArenaManagerBooking>[]),
        ),
        arenaBookingDetailMapProvider('b1').overrideWith(
          (ref) => Stream.value(_activeBooking.data),
        ),
      ],
      size: _wide,
    );

// ── Telas ───────────────────────────────────────────────────────────────

final _courtsScreen = ToneScreen(
  'Quadras: ativa, em manutenção e excluir',
  (tester, theme) => pumpTonePage(
    tester,
    theme,
    const ArenaCourtsPage(),
    overrides: [
      managedArenaIdProvider.overrideWithValue(const AsyncValue.data('a1')),
      arenaManagedCourtsProvider.overrideWith(
        (ref) => Stream.value(const [
          ArenaCourt(id: 'q1', name: 'Quadra 1'),
          ArenaCourt(
            id: 'q2',
            name: 'Quadra 2',
            status: ArenaCourtStatus.maintenance,
          ),
        ]),
      ),
      arenaCourtMonthlyBookingsProvider('a1').overrideWith(
        (ref) => Stream.value(const <String, int>{}),
      ),
      managedArenaPlanStatusProvider.overrideWith(
        (ref) => Stream.value(ArenaPlanStatus.none),
      ),
    ],
  ),
  find.byType(ArenaCourtsPage),
  [Icons.delete_outline_rounded],
);

final _cancelSheetScreen = ToneScreen(
  'Cancelar reserva: pagamento direto',
  (tester, theme) => pumpTonePiece(
    tester,
    theme,
    ArenaBookingCancelSheet(
      booking: _booking(const {'status': 'active', 'amountReais': 120}),
      arenaId: 'a1',
      athleteName: 'Rafael Cunha',
    ),
    onSheet: true,
  ),
  find.byType(ArenaBookingCancelSheet),
  [Icons.warning_amber_rounded],
);

final _historyScreen = ToneScreen(
  'Histórico completo: reserva ativa',
  (tester, theme) => pumpTonePage(
    tester,
    theme,
    const ArenaBookingDetailHistoryFullPage(athleteId: 'ath1', arenaId: 'a1'),
    overrides: [
      athleteArenaHistoryProvider(
        const AthleteArenaHistoryArgs(athleteId: 'ath1', arenaId: 'a1'),
      ).overrideWith((ref) => Stream.value([_activeBooking])),
    ],
  ),
  find.byType(ArenaBookingDetailHistoryFullPage),
  // Só o selo, com o tom a 95%: ver `_translucentInk`.
  const [],
);

final List<ToneScreen> arenaBookingsToneScreens = [
  ToneScreen(
    'Reservas: card ativo, com sinal pago e cancelado',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      Column(
        children: [
          ArenaBookingCard(booking: _activeBooking),
          const SizedBox(height: 12),
          ArenaBookingCard(booking: _depositBooking),
          const SizedBox(height: 12),
          ArenaBookingCard(booking: _canceledBooking),
        ],
      ),
      onCard: true,
      overrides: _athleteOverrides(),
    ),
    tonePiece,
    [
      // Card novo: tom só onde há estado (pagamento, presença, cancelada).
      // "ATIVA" saiu e o "+1" de jogadores é neutro.
      'Sinal pago',
      'falta ${formatBRL(60)}',
      'Check-in feito',
      'Cancelada',
      Icons.payments_rounded,
      Icons.how_to_reg_rounded,
      Icons.cancel_rounded,
    ],
  ),
  ToneScreen(
    'Detalhe da reserva: cabeçalho ativo',
    (tester, theme) => _pumpWidePiece(
      tester,
      theme,
      ArenaBookingDetailHeader(
        booking: _activeBooking,
        bookingId: 'b1',
        courtName: 'Quadra 1',
        statusLabel: 'Ativa',
        athleteName: 'Rafael Cunha',
      ),
    ),
    find.byType(ArenaBookingDetailHeader),
    ['ATIVA', 'marca'],
  ),
  ToneScreen(
    'Detalhe da reserva: anel de reserva cancelada',
    (tester, theme) => _pumpWidePiece(
      tester,
      theme,
      ArenaBookingLiveHero(
        booking: _journeyBooking(const {'status': 'canceled'}),
        journey: _journey(const {'status': 'canceled'}),
        whoLabel: 'Rafael Cunha',
      ),
    ),
    find.byType(ArenaBookingLiveHero),
    ['Cancelada', Icons.close_rounded],
  ),
  ToneScreen(
    'Detalhe da reserva: etapas com check-in atrasado e pagamento pendente',
    (tester, theme) => _pumpWidePiece(
      tester,
      theme,
      ArenaBookingJourneySteps(
        journey: _journey(const {}),
        onCheckIn: () {},
        onReceive: () {},
      ),
    ),
    find.byType(ArenaBookingJourneySteps),
    ['Atrasado · 42 min', 'Falta ${formatBRL(120)}'],
  ),
  ToneScreen(
    'Detalhe da reserva: etapas com falta e check-in feito',
    (tester, theme) => _pumpWidePiece(
      tester,
      theme,
      Column(
        children: [
          ArenaBookingJourneySteps(
            journey: _journey(const {'attendanceStatus': 'no_show'}),
          ),
          const SizedBox(height: 12),
          ArenaBookingJourneySteps(
            journey: _journey(const {
              'attendanceStatus': 'checked_in',
              'paymentChannel': 'pix',
              'paymentStatus': 'paid',
            }),
          ),
        ],
      ),
    ),
    tonePiece,
    ['Não compareceu', Icons.priority_high_rounded, Icons.check_rounded],
  ),
  ToneScreen(
    'Detalhe da reserva: conta da quadra a receber',
    (tester, theme) => _pumpWidePiece(
      tester,
      theme,
      _bill(const {
        'paymentChannel': 'pix',
        'paymentStatus': 'partial',
        'amountPaidOnlineReais': 40,
      }),
    ),
    find.byType(ArenaBookingCourtBill),
    ['Falta receber', 'Pago online (PIX)'],
  ),
  ToneScreen(
    'Detalhe da reserva: conta da quadra paga',
    (tester, theme) => _pumpWidePiece(
      tester,
      theme,
      _bill(const {'paymentChannel': 'pix', 'paymentStatus': 'paid'}),
    ),
    find.byType(ArenaBookingCourtBill),
    ['Tudo pago'],
  ),
  ToneScreen(
    'Detalhe da reserva: atleta convidado',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const ArenaBookingDetailAthletes(
        arenaId: '',
        primaryAthleteId: 'ath1',
        participants: 2,
      ),
      overrides: _athleteOverrides(),
    ),
    find.byType(ArenaBookingDetailAthletes),
    ['+1'],
  ),
  ToneScreen(
    'Detalhe da reserva: ações (falar, bloquear)',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      ArenaBookingDetailActions(
        onContact: () {},
        onBlock: () {},
        onUnblock: () {},
        blockInfo: null,
        onCancel: () {},
      ),
    ),
    find.byType(ArenaBookingDetailActions),
    [Icons.chat_bubble_outline_rounded, Icons.block_rounded],
  ),
  ToneScreen(
    'Detalhe da reserva: ações com atleta bloqueado',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      ArenaBookingDetailActions(
        onContact: () {},
        onBlock: () {},
        onUnblock: () {},
        blockInfo: const ArenaAthleteBlockInfo(
          isBlocked: true,
          reason: 'Faltou sem avisar',
        ),
        onCancel: () {},
      ),
    ),
    find.byType(ArenaBookingDetailActions),
    [Icons.lock_open_rounded],
  ),
  _historyScreen,
  _cancelSheetScreen,
  ToneScreen(
    'Horário da agenda: disponível',
    (tester, theme) => _openSlotDetail(tester, theme, _availableSlot),
    find.byType(ArenaSlotDetailPage),
    ['DISPONÍVEL', 'marca'],
  ),
  ToneScreen(
    'Horário da agenda: reservado',
    (tester, theme) => _openSlotDetail(tester, theme, _bookedSlot),
    find.byType(ArenaSlotDetailPage),
    ['RESERVADO', 'marca'],
  ),
  ToneScreen(
    'Agenda: quadra disponível, reservada e com aula',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      Column(
        children: [
          for (final row in [
            ArenaScheduleCourtRow(slot: _availableSlot, courtName: 'Quadra 1'),
            ArenaScheduleCourtRow(
              slot: _bookedSlot,
              courtName: 'Quadra 2',
              booking: const ArenaScheduleBookingSummary(
                athleteId: 'ath1',
                paymentShortLabel: 'PIX',
                amountReais: 120,
              ),
            ),
            ArenaScheduleCourtRow(slot: _classSlot, courtName: 'Quadra 3'),
          ]) ...[
            ArenaScheduleCourtTile(
              row: row,
              onTap: () {},
              onLongPress: () {},
            ),
            const SizedBox(height: 10),
          ],
        ],
      ),
      onCard: true,
      overrides: _athleteOverrides(),
    ),
    tonePiece,
    ['DISPONÍVEL', 'RESERVADO', 'AULA'],
  ),
  ToneScreen(
    'Horário fixo: ativo',
    (tester, theme) => _openRecurring(tester, theme, 'active'),
    find.byType(ArenaRecurringDetailsPage),
    [
      'ATIVO',
      'marca',
      'Encerrar horário fixo',
      Icons.event_busy_rounded,
    ],
  ),
  ToneScreen(
    'Horário fixo: pausado',
    (tester, theme) => _openRecurring(tester, theme, 'paused'),
    find.byType(ArenaRecurringDetailsPage),
    ['PAUSADO', 'marca', 'Encerrar horário fixo'],
  ),
  _courtsScreen,
];

// ── Tom a 95% ───────────────────────────────────────────────────────────
// Alguns selos e avisos pintam o texto com o tom a 95% de opacidade (no
// claro, onde 95% não chega a 4,5:1, ele vai opaco). O
// `expectStateTonesLegible` só reconhece o tom opaco; aqui a mesma régua
// (texto 4,5:1, ícone 3:1 contra o fundo real) vale para o tom com qualquer
// opacidade.

final _translucentInk = <(ToneScreen, List<Object>)>[
  (_courtsScreen, ['ATIVA', 'MANUTENÇÃO']),
  (
    _cancelSheetScreen,
    [Icons.info_outline_rounded, 'Resolva com o atleta presencialmente.'],
  ),
  (_historyScreen, ['Ativa']),
];

List<Object> _expectTranslucentTonesLegible(
  WidgetTester tester,
  Finder within,
) {
  final tones = stateTonesOf(themeColorsOf(tester, within));
  final checked = <Object>[];

  for (final rich in find
      .descendant(of: within, matching: find.byType(RichText))
      .evaluate()) {
    final bg = backdropOf(rich);
    final icon = rich.findAncestorWidgetOfExactType<Icon>();
    void visit(InlineSpan span, Color? inherited) {
      final color = span.style?.color ?? inherited;
      if (span is! TextSpan) return;
      final text = span.text ?? '';
      final tone = color?.withValues(alpha: 1);
      if (text.trim().isNotEmpty && color != null && tones.containsKey(tone)) {
        expect(
          contrastRatio(color, bg),
          greaterThanOrEqualTo(icon != null ? 3.0 : 4.5),
          reason: '${icon?.icon ?? '"$text"'} (${tones[tone]} a '
              '${(color.a * 100).round()}%) sobre $bg',
        );
        checked.add(icon?.icon ?? text);
      }
      for (final child in span.children ?? const <InlineSpan>[]) {
        visit(child, color);
      }
    }

    visit((rich.widget as RichText).text, null);
  }
  return checked;
}

void main() {
  stateToneScreensTests(arenaBookingsToneScreens);

  for (final (label, theme) in [
    ('claro', AppTheme.light),
    ('escuro', AppTheme.dark),
  ]) {
    group('tom a 95%, tema $label', () {
      for (final (screen, expected) in _translucentInk) {
        testWidgets('${screen.name}: legível', (tester) async {
          await screen.open(tester, theme);
          final checked = _expectTranslucentTonesLegible(tester, screen.root);
          expect(checked, containsAll(expected));
        });
      }
    });
  }
}
