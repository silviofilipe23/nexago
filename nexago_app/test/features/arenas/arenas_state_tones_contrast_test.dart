import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/features/arenas/data/arena_clubs_repository.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_waitlist_entry.dart';
import 'package:nexago_app/features/arenas/domain/arena_club_providers.dart';
import 'package:nexago_app/features/arenas/domain/arena_club_session.dart';
import 'package:nexago_app/features/arenas/domain/arena_court.dart';
import 'package:nexago_app/features/arenas/domain/arena_detail_logic.dart';
import 'package:nexago_app/features/arenas/domain/arena_list_item.dart';
import 'package:nexago_app/features/arenas/domain/arena_search_providers.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';
import 'package:nexago_app/features/arenas/domain/booking_result_record_providers.dart';
import 'package:nexago_app/features/arenas/domain/booking_story.dart';
import 'package:nexago_app/features/arenas/domain/booking_story_providers.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_confirmed_athlete.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_guests_providers.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_item.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_payment.dart';
import 'package:nexago_app/features/arenas/domain/slots_page_logic.dart';
import 'package:nexago_app/features/arenas/domain/slots_page_providers.dart';
import 'package:nexago_app/features/arenas/domain/waitlist_providers.dart';
import 'package:nexago_app/features/arenas/presentation/booking_result_page.dart';
import 'package:nexago_app/features/arenas/presentation/booking_result_score_page.dart';
import 'package:nexago_app/features/arenas/presentation/club_session_detail_page.dart';
import 'package:nexago_app/features/arenas/presentation/club_session_pix_page.dart';
import 'package:nexago_app/features/arenas/presentation/my_bookings/my_bookings_details_sheet.dart';
import 'package:nexago_app/features/arenas/presentation/my_bookings/my_bookings_status.dart';
import 'package:nexago_app/features/arenas/presentation/my_bookings/widgets/my_bookings_booking_card.dart';
import 'package:nexago_app/features/arenas/presentation/my_bookings/widgets/my_bookings_nearby_arena_card.dart';
import 'package:nexago_app/features/arenas/presentation/my_bookings/widgets/my_bookings_payment_chip.dart';
import 'package:nexago_app/features/arenas/presentation/my_bookings/widgets/my_bookings_waitlist_section.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/arena_detail/arena_detail_club_section.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/arena_detail/arena_detail_court_card.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/booking_confirm/booking_confirm_cancellation_card.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/booking_confirm/booking_confirm_coupon_field.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/booking_pix/booking_pix_method_card.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/booking_pix/booking_pix_waiting_card.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/booking_success/booking_success_header.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/slots/slots_day_strip.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/slots/slots_fully_booked_banner.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/slots/slots_notify_when_available_card.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/slots/slots_slot_tile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/cashback/application/cashback_providers.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';

import '../../core/theme/state_tone_contrast.dart';
import 'fake_booking_result_repository.dart';

// Texto e ícone em verde, vermelho e âmbar nas telas de reserva do atleta
// (Minhas reservas, Clubinho, horários, confirmação, PIX, sucesso, detalhe
// da arena, placar da reserva), conferidos contra o fundo real nos dois
// temas. No claro os crus do AppColors reprovam: são ~1,6–3,5:1 no branco.

/// Uma tela (ou o pedaço dela que pinta um tom de estado) aberta com os
/// dados que acendem o tom.
class _Screen {
  const _Screen(this.name, this.open, this.root, this.expected);

  final String name;
  final Future<void> Function(WidgetTester tester, ThemeData theme) open;
  final Finder root;

  /// O que tem de ter sido conferido: texto, [IconData] ou `'marca'`.
  final List<Object> expected;
}

const _piece = Key('piece');
final _pieceFinder = find.byKey(_piece);

final _today = DateTime.now();
final _todayKey = DateFormat('yyyy-MM-dd').format(_today);

/// Monta [child] numa tela do tema, opcionalmente sobre um card (onde ela
/// mora no app de verdade).
Future<void> _pumpPiece(
  WidgetTester tester,
  ThemeData theme,
  Widget child, {
  bool onCard = false,
  List<Override> overrides = const [],
}) async {
  tester.view.physicalSize = const Size(402, 1400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides,
      child: MaterialApp(
        theme: theme,
        home: Builder(
          builder: (context) => Scaffold(
            backgroundColor: context.themeColors.canvas,
            body: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: KeyedSubtree(
                key: _piece,
                child: onCard
                    ? Material(
                        color: context.themeColors.surfaceCard,
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: child,
                        ),
                      )
                    : child,
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 800));
}

Future<void> _pumpPage(
  WidgetTester tester,
  ThemeData theme,
  Widget page,
  List<Override> overrides,
) async {
  tester.view.physicalSize = const Size(402, 1400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides,
      child: MaterialApp(theme: theme, home: page),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 800));
}

// ── Fixtures ────────────────────────────────────────────────────────────

const _arena = ArenaListItem(
  id: 'a1',
  name: 'Arena Sol',
  locationLabel: 'Centro · Recife',
  pricePerHourReais: 120,
);

final _freeSlot = ArenaSlot(
  id: 'sl1',
  arenaId: 'a1',
  courtId: 'q1',
  date: _today,
  startTime: '18:00',
  endTime: '19:00',
  rawStatus: 'available',
);

final _bookingItem = MyBookingItem(
  id: 'b1',
  arenaName: 'Arena Sol',
  courtName: 'Quadra 1',
  dateRaw: _todayKey,
  startTime: '18:00',
  endTime: '19:00',
  rawStatus: 'active',
  paymentDisplay: const MyBookingPaymentDisplay(
    label: 'PIX · 100% pago',
    accentColor: AppColors.win,
  ),
  confirmedAthletes: const [
    MyBookingConfirmedAthlete(userId: 'u2', displayName: 'Enzo Lima'),
  ],
);

ArenaClubSession _clubSession(
    {String status = 'scheduled', int confirmed = 2}) {
  return ArenaClubSession(
    id: 's1',
    clubId: 'c1',
    arenaId: 'a1',
    arenaName: 'Arena Sol',
    clubName: 'Clubinho da Manhã',
    date: _todayKey,
    startTime: '08:00',
    endTime: '10:00',
    courtIds: const ['q1'],
    courtNames: const ['Quadra 1'],
    capacity: 12,
    priceReais: 30,
    cancelWindowHours: 12,
    allowOnsitePayment: true,
    confirmedCount: confirmed,
    pendingCount: 0,
    status: status,
    source: 'manual',
  );
}

final _me = ClubParticipant(
  sessionId: 's1',
  athleteId: 'u1',
  athleteName: 'Maria Alves',
  clubId: 'c1',
  arenaId: 'a1',
  arenaName: 'Arena Sol',
  clubName: 'Clubinho da Manhã',
  date: _todayKey,
  startTime: '08:00',
  endTime: '10:00',
  status: 'confirmed',
  paymentMethod: 'pix',
  amountReais: 30,
  refundStatus: 'none',
);

List<Override> _clubOverrides(
  ArenaClubSession session, {
  ClubParticipant? me,
}) =>
    [
      authProvider.overrideWith((ref) => Stream.value(null)),
      clubSessionProvider('s1').overrideWith((ref) => Stream.value(session)),
      myClubParticipantProvider('s1').overrideWith((ref) => Stream.value(me)),
      clubSessionParticipantsProvider('s1').overrideWith(
        (ref) => Stream.value([if (me != null) me]),
      ),
      athleteProfileProvider.overrideWith((ref) => Stream.value(null)),
      cashbackConfigProvider.overrideWith(
        (ref) => Stream.value(CashbackConfig.fallback),
      ),
      cashbackWalletProvider.overrideWith(
        (ref) => Stream.value(const CashbackWallet(availableCents: 0)),
      ),
    ];

/// Linha da sessão cheia no detalhe da arena: data · horário · lotação.
String _clubFullLine() {
  final s = _clubSession(confirmed: 12);
  return '${s.dateShortLabel} · ${s.timeRangeLabel} · Lista cheia';
}

const _storyArgs = BookingStoryArgs(
  bookingId: 'b1',
  arenaName: 'Arena CFC',
  courtName: 'Quadra 1',
  dateKey: '2026-05-22',
  startTime: '09:00',
  endTime: '10:30',
);

List<Override> _resultOverrides() => [
      athleteProfileProvider.overrideWith(
        (ref) => Stream.value(
          const AthleteProfile(
            id: 'u1',
            name: 'Maria Alves',
            sport: '',
            level: '',
            city: '',
          ),
        ),
      ),
      bookingStorySourceProvider('b1').overrideWith(
        (ref) => const BookingStorySource(
          sport: 'beachVolleyball',
          ownerUid: 'u1',
          confirmed: [
            MyBookingConfirmedAthlete(userId: 'u2', displayName: 'Enzo Lima'),
            MyBookingConfirmedAthlete(
              userId: 'u3',
              displayName: 'Rafael Souza',
            ),
            MyBookingConfirmedAthlete(userId: 'u4', displayName: 'Lia Martins'),
          ],
        ),
      ),
      bookingResultPlayerSearchProvider.overrideWith(
        (ref, query) async => const [],
      ),
      bookingResultRepositoryProvider.overrideWithValue(
        FakeBookingResultRepository([savedResult()]),
      ),
      bookingResultUidProvider.overrideWithValue('u1'),
    ];

final _screens = <_Screen>[
  _Screen(
    'Minhas reservas: card da reserva',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      MyBookingsBookingCard(
        item: _bookingItem,
        sportLabel: 'Beach tennis',
        onTap: () {},
      ),
      overrides: [
        myBookingGuestDisplaysProvider(_bookingItem).overrideWith(
          (ref) async => const [
            MyBookingGuestDisplay(displayName: 'Enzo Lima', shortLabel: 'Enzo'),
          ],
        ),
      ],
    ),
    find.byType(MyBookingsBookingCard),
    ['AGENDADA', 'PIX · 100% PAGO', 'EL', 'marca'],
  ),
  _Screen(
    'Minhas reservas: selos de status e de pagamento',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final raw in ['active', 'canceled', 'pending'])
            MyBookingStatusBadge(ui: myBookingStatusUi(raw)),
          for (final data in [
            {'status': 'pending_payment'},
            {'paymentChannel': 'pix', 'paymentStatus': 'rejected'},
            {'paymentChannel': 'card', 'paymentStatus': 'paid'},
          ])
            MyBookingsPaymentChip(
              payment: myBookingPaymentDisplayFromData(data),
            ),
        ],
      ),
      onCard: true,
    ),
    _pieceFinder,
    [
      'AGENDADA',
      'CANCELADA',
      'PENDENTE',
      'PIX · AGUARDANDO PAGAMENTO',
      'PIX · NÃO CONCLUÍDO',
      'CARTÃO · 100% PAGO',
    ],
  ),
  _Screen(
    'Minhas reservas: arenas por perto',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      Column(
        children: [
          MyBookingsNearbyArenaCard(
            result: ArenaSearchResult(
              arena: _arena,
              selectedSlot: _freeSlot,
              courtName: 'Quadra 1',
              isExactMatch: true,
              minutesDistance: 5,
              displayPricePerHourReais: 120,
              availableCourtsCount: 2,
            ),
            onTap: () {},
          ),
          const SizedBox(height: 12),
          MyBookingsNearbyArenaCard(
            result: const ArenaSearchResult(
              arena: _arena,
              selectedSlot: null,
              courtName: null,
              isExactMatch: false,
              minutesDistance: 5,
              displayPricePerHourReais: 120,
            ),
            onTap: () {},
          ),
        ],
      ),
    ),
    _pieceFinder,
    ['• 2 QUADRAS LIVRES', 'VER HORÁRIOS'],
  ),
  _Screen(
    'Minhas reservas: vaga liberada na lista de espera',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      const MyBookingsWaitlistSection(),
      overrides: [
        myWaitlistStreamProvider.overrideWith(
          (ref) => Stream.value([
            ArenaBookingWaitlistEntry(
              id: 'w1',
              arenaId: 'a1',
              courtId: 'q1',
              dateKey: _todayKey,
              startTime: '18:00',
              endTime: '19:00',
              athleteId: 'u1',
              status: ArenaBookingWaitlistStatus.notified,
              arenaName: 'Arena Sol',
              courtName: 'Quadra 1',
              notifiedAt: _today,
              expiresAt: _today.add(const Duration(minutes: 40)),
            ),
          ]),
        ),
      ],
    ),
    find.byType(MyBookingsWaitlistSection),
    [Icons.notifications_active_rounded],
  ),
  _Screen(
    'Minhas reservas: reserva em andamento',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      BookingLiveStatus(
        dateRaw: _todayKey,
        startTime: '00:00',
        endTime: '23:59',
      ),
      onCard: true,
    ),
    find.byType(BookingLiveStatus),
    ['Em andamento'],
  ),
  _Screen(
    'Clubinho: você está na lista',
    (tester, theme) => _pumpPage(
      tester,
      theme,
      const ClubSessionDetailPage(sessionId: 's1'),
      _clubOverrides(_clubSession(), me: _me),
    ),
    find.byType(ClubSessionDetailPage),
    [Icons.check_circle_rounded, 'Você está na lista', 'Sair da lista'],
  ),
  _Screen(
    'Clubinho: sessão cancelada e lista cheia',
    (tester, theme) => _pumpPage(
      tester,
      theme,
      const ClubSessionDetailPage(sessionId: 's1'),
      _clubOverrides(_clubSession(status: 'canceled', confirmed: 12)),
    ),
    find.byType(ClubSessionDetailPage),
    [Icons.event_busy_rounded, 'Lista cheia'],
  ),
  _Screen(
    'Clubinho: PIX antecipado no seletor',
    (tester, theme) => _pumpPage(
      tester,
      theme,
      const ClubSessionPixPage(sessionId: 's1'),
      [
        arenaClubsRepositoryProvider.overrideWithValue(_NoClubsRepository()),
        ..._clubOverrides(_clubSession()),
      ],
    ),
    find.byType(ClubSessionPixPage),
    [Icons.pix_rounded],
  ),
  _Screen(
    'Horários: dias com e sem vaga',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      SlotsDayStrip(
        startDay: DateTime(2026, 10, 20),
        selectedDay: DateTime(2026, 10, 20),
        daysCount: 3,
        calendarDays: [
          SlotsCalendarDayStatus(
            date: DateTime(2026, 10, 21),
            availability: const SlotDayAvailability(
              hasAnyFree: true,
              allPastOrFull: false,
            ),
          ),
          SlotsCalendarDayStatus(
            date: DateTime(2026, 10, 22),
            availability: const SlotDayAvailability(
              hasAnyFree: false,
              allPastOrFull: true,
            ),
          ),
        ],
        onSelect: (_) {},
        sameDay: DateUtils.isSameDay,
        dateOnly: DateUtils.dateOnly,
      ),
    ),
    find.byType(SlotsDayStrip),
    ['marca', 'marca'],
  ),
  _Screen(
    'Horários: último slot livre',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      SlotsSlotTile(
        slot: _freeSlot,
        selected: false,
        onTap: () {},
        isLastSlot: true,
        priceLabel: 'R\$ 120',
      ),
    ),
    find.byType(SlotsSlotTile),
    ['ÚLTIMO SLOT', Icons.schedule_rounded],
  ),
  _Screen(
    'Horários: dia lotado',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      const SlotsFullyBookedBanner(
        title: 'Dia lotado',
        subtitle: 'Todos os horários já foram reservados.',
      ),
    ),
    find.byType(SlotsFullyBookedBanner),
    [Icons.remove_rounded],
  ),
  _Screen(
    'Horários: aviso de vaga ativo',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      SlotsNotifyWhenAvailableCard(
        courtName: 'Quadra 1',
        weekdayLabel: 'terça',
        isActive: true,
        isLoading: false,
        onToggle: () {},
      ),
    ),
    find.byType(SlotsNotifyWhenAvailableCard),
    ['Ativo'],
  ),
  _Screen(
    'Confirmação: cupom inválido',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      BookingConfirmCouponField(
        controller: TextEditingController(text: 'XPTO'),
        applying: false,
        appliedCode: null,
        discountReais: 0,
        errorText: 'Cupom inválido ou expirado.',
        enabled: true,
        onApply: () {},
        onRemove: () {},
      ),
    ),
    find.byType(BookingConfirmCouponField),
    ['Cupom inválido ou expirado.'],
  ),
  _Screen(
    'Confirmação: política de cancelamento',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      const BookingConfirmCancellationCard(
        title: 'Cancelamento grátis',
        subtitle: 'Até 24h antes do horário.',
      ),
    ),
    find.byType(BookingConfirmCancellationCard),
    [Icons.shield_outlined],
  ),
  _Screen(
    'Sucesso: reserva confirmada',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      const BookingSuccessHeader(paymentSubtitle: 'PIX · 100% pago'),
    ),
    find.byType(BookingSuccessHeader),
    ['RESERVA CONFIRMADA'],
  ),
  _Screen(
    'PIX: método e espera do pagamento',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      const Column(
        children: [
          BookingPixMethodCard(amountLabel: 'R\$ 120,00'),
          SizedBox(height: 12),
          BookingPixWaitingCard(),
        ],
      ),
    ),
    _pieceFinder,
    [Icons.pix_rounded, Icons.radio_button_checked_rounded],
  ),
  _Screen(
    'Detalhe da arena: quadra com horários livres',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      ArenaDetailCourtCard(
        arena: _arena,
        summary: const ArenaCourtDaySummary(
          court: ArenaCourt(id: 'q1', name: 'Quadra 1'),
          freeSlotsToday: 3,
        ),
        arenaFallbackPricePerHour: 120,
        onTap: () {},
      ),
    ),
    find.byType(ArenaDetailCourtCard),
    ['3 horários livres hoje', 'marca'],
  ),
  _Screen(
    'Detalhe da arena: clubinho com lista cheia',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      const ArenaDetailClubSection(arenaId: 'a1'),
      overrides: [
        arenaUpcomingClubSessionsProvider('a1').overrideWith(
          (ref) => Stream.value([_clubSession(confirmed: 12)]),
        ),
      ],
    ),
    find.byType(ArenaDetailClubSection),
    [_clubFullLine()],
  ),
  _Screen(
    'Placar da reserva: resultado gravado e pendente',
    (tester, theme) async {
      await _pumpPage(
        tester,
        theme,
        const BookingResultPage(args: _storyArgs),
        _resultOverrides(),
      );
      await tester.pump();
    },
    find.byType(BookingResultPage),
    [Icons.schedule_rounded],
  ),
  _Screen(
    'Placar da reserva: lançar o placar',
    (tester, theme) async {
      await _pumpPage(
        tester,
        theme,
        const BookingResultPage(args: _storyArgs),
        _resultOverrides(),
      );
      await tester.pump();
      await tester.tap(find.byKey(const Key('booking-result-edit')));
      await tester.pumpAndSettle();
    },
    find.byType(BookingResultScorePage),
    [Icons.schedule_rounded],
  ),
];

/// O PIX do clubinho só lê o repositório ao gerar a cobrança.
class _NoClubsRepository implements ArenaClubsRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  for (final (label, theme) in [
    ('claro', AppTheme.light),
    ('escuro', AppTheme.dark),
  ]) {
    group('tema $label', () {
      for (final screen in _screens) {
        testWidgets('${screen.name}: tons de estado legíveis', (tester) async {
          await screen.open(tester, theme);
          final checked = expectStateTonesLegible(tester, screen.root);
          expect(checked, containsAll(screen.expected));
        });
      }
    });
  }

  testWidgets('placar gravado: VITÓRIA ou DERROTA entra na conta', (
    tester,
  ) async {
    await _screens
        .firstWhere((s) => s.name.startsWith('Placar da reserva: resultado'))
        .open(tester, AppTheme.light);
    final checked = expectStateTonesLegible(
      tester,
      find.byType(BookingResultPage),
    );
    expect(
      checked.where((t) => t == 'VITÓRIA' || t == 'DERROTA'),
      hasLength(1),
    );
  });
}
