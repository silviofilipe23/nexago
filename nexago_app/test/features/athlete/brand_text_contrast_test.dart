import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/location/location_permission_status.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_waitlist_entry.dart';
import 'package:nexago_app/features/arenas/domain/arena_list_item.dart';
import 'package:nexago_app/features/arenas/domain/arena_search_filter_logic.dart';
import 'package:nexago_app/features/arenas/domain/arena_search_providers.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';
import 'package:nexago_app/features/arenas/domain/booking_result_record.dart';
import 'package:nexago_app/features/arenas/domain/booking_result_record_providers.dart';
import 'package:nexago_app/features/arenas/domain/booking_story_providers.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_guests_providers.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_item.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_payment.dart';
import 'package:nexago_app/features/arenas/domain/waitlist_providers.dart';
import 'package:nexago_app/features/arenas/presentation/my_bookings/widgets/my_bookings_booking_card.dart';
import 'package:nexago_app/features/arenas/presentation/my_bookings/widgets/my_bookings_empty_hero.dart';
import 'package:nexago_app/features/arenas/presentation/my_bookings/widgets/my_bookings_nearby_arena_card.dart';
import 'package:nexago_app/features/arenas/presentation/my_bookings/widgets/my_bookings_streak_banner.dart';
import 'package:nexago_app/features/arenas/presentation/my_bookings/widgets/my_bookings_waitlist_section.dart';
import 'package:nexago_app/features/arenas/presentation/pelada_detail_page.dart';
import 'package:nexago_app/features/athlete/domain/athlete_home_dashboard_logic.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_stats_logic.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_stats_providers.dart';
import 'package:nexago_app/features/athlete/domain/booking_invite_model.dart';
import 'package:nexago_app/features/athlete/domain/booking_invite_providers.dart';
import 'package:nexago_app/features/athlete/domain/gamification_models.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_history_models.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_history_providers.dart';
import 'package:nexago_app/features/athlete/domain/profile_completion_models.dart';
import 'package:nexago_app/features/athlete/domain/sand_rank/sand_rank_providers.dart';
import 'package:nexago_app/features/athlete/presentation/athlete_match_history_page.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/arena_search/arena_location_permission_banner.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/arena_search/arena_search_arena_card.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/arena_search/arena_search_date_time_row.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/arena_search/arena_search_section_header.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/arena_search/arena_search_unclaimed_card.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_home/athlete_home_kpi_grid.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_home/athlete_home_next_reservation_card.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_home/athlete_home_registration_tracker.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_home/athlete_home_section_header.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_profile_main_view.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/pending_booking_invites_section.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/tournament_access_banner.dart';
import 'package:nexago_app/features/ranking/domain/ranking_providers.dart';
import 'package:nexago_app/features/squad/application/squad_providers.dart';
import 'package:nexago_app/features/squad/domain/squad_models.dart';
import 'package:nexago_app/features/store/application/store_providers.dart';
import 'package:nexago_app/features/store/presentation/widgets/store_home_entry.dart';
import 'package:nexago_app/features/tournaments/domain/compete_hub_models.dart';
import 'package:nexago_app/features/tournaments/domain/registration_progress_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_providers.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/compete_hub/compete_hub_ranking_card.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/compete_hub/compete_hub_ranking_row.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/compete_hub/compete_hub_section_header.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/compete_hub/compete_hub_wide_card.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/pending_tournament_reviews_section.dart';

import '../../core/theme/state_tone_contrast.dart';
import '../arenas/fake_booking_result_repository.dart';

// Laranja da marca como texto e ícone em Meu perfil, Home, Competir,
// Reservas e Peladas, conferido contra o fundo real nos dois temas. No claro
// o brand cru reprova (2,9:1 no branco); o brandText passa.

/// Uma tela (ou o pedaço dela que pinta o laranja) aberta com os dados que
/// acendem o laranja.
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

final _now = DateTime(2026, 10, 20, 15);
final _year = DateTime.now().year;

/// Monta [child] no canvas do tema. A tela é larga porque a fonte de teste
/// (Ahem) é mais larga que a Sora e estouraria as linhas dos cards.
Future<void> _pump(
  WidgetTester tester,
  ThemeData theme,
  Widget child, {
  List<Override> overrides = const [],
  bool scroll = true,
}) async {
  tester.view.physicalSize = const Size(600, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides,
      child: MaterialApp(
        theme: theme,
        home: Builder(
          builder: (context) => scroll
              ? Scaffold(
                  backgroundColor: context.themeColors.canvas,
                  body: SingleChildScrollView(
                    padding: const EdgeInsets.all(16),
                    child: KeyedSubtree(key: _piece, child: child),
                  ),
                )
              : child,
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 500));
}

// --- Meu perfil -------------------------------------------------------------

const _profile = AthleteProfile(
  id: 'u1',
  name: 'Maria Alves',
  nickname: 'Mari',
  sport: 'Vôlei de praia',
  level: 'Intermediário',
  city: 'Goiânia',
  state: 'GO',
  onboardingCompleted: true,
);

final _completion = ProfileCompletionState(
  profile: _profile,
  steps: [
    for (final step in ProfileCompletionStep.values)
      ProfileCompletionStepStatus(
        step: step,
        isDone: step != ProfileCompletionStep.photo,
        subtitle: '',
      ),
  ],
);

MyBookingItem _booking(String status, {String? recurring}) => MyBookingItem(
      id: 'b-$status',
      arenaName: 'Arena Sol',
      courtName: 'Quadra 2',
      sport: 'beachVolleyball',
      dateRaw: '2026-10-21',
      startTime: '18:00',
      endTime: '19:00',
      rawStatus: status,
      amountReais: 120,
      paymentDisplay: const MyBookingPaymentDisplay(label: 'PIX · Pago'),
      recurringBookingId: recurring,
    );

final _profileOverrides = <Override>[
  sandRankEnabledProvider.overrideWith((ref) => Stream.value(false)),
  athleteProfileStatsProvider.overrideWith(
    (ref) async => AthleteProfileStats.empty,
  ),
  athleteProfilePartnerMatchCountsProvider
      .overrideWith((ref) async => const {}),
  currentAthletePlayPartnersProvider.overrideWith((ref) async => const []),
  competeHubUserRankingProvider.overrideWith((ref) async => null),
  squadEntryProvider.overrideWithValue(MySquad.none),
  currentAthleteMatchHistoryBundleProvider.overrideWith(
    (ref) async => const AthleteMatchHistoryBundle(
      matches: [],
      tournaments: [],
      seasonSummary: AthleteSeasonSummary(
        year: 2026,
        winRatePercent: 0,
        wins: 0,
        losses: 0,
      ),
    ),
  ),
];

Future<void> _pumpProfile(
  WidgetTester tester,
  ThemeData theme, {
  MyBookingItem? nextBooking,
}) =>
    _pump(
      tester,
      theme,
      Scaffold(
        body: AthleteProfileMainView(
          profile: _profile,
          embedded: true,
          readOnly: false,
          totalBookings: 0,
          nextBooking: nextBooking,
          gamificationSummary: const GamificationSummary(
            xp: 340,
            level: 3,
            streak: 2,
            totalGames: 12,
            lastGameDate: null,
            updatedAt: null,
          ),
          profileCompletion: _completion,
          badges: [
            UserBadgeProgress(
              achievementId: 'first_game',
              title: 'Primeiro jogo',
              unlockedAt: DateTime(2026, 10, 1),
            ),
          ],
          onEdit: () {},
          onShare: () {},
          onOpenSettings: () {},
          onCompleteProfile: () {},
          onOpenAgenda: () {},
          onOpenAchievements: () {},
          onOpenMatchHistory: () {},
          onOpenPartner: (_) {},
        ),
      ),
      overrides: _profileOverrides,
      scroll: false,
    );

// --- Reservas ---------------------------------------------------------------

const _arena = ArenaListItem(
  id: 'a1',
  name: 'Arena Sol',
  locationLabel: 'Boa Viagem · Recife',
  city: 'Recife',
  state: 'PE',
  pricePerHourReais: 120,
  ratingAverage: 4.7,
  reviewsCount: 32,
  reputationScore: 92,
);

ArenaSearchResult get _result => ArenaSearchResult(
      arena: _arena,
      selectedSlot: ArenaSlot(
        id: 'sl1',
        arenaId: 'a1',
        courtId: 'q1',
        date: _now,
        startTime: '18:00',
        endTime: '19:00',
        rawStatus: 'available',
      ),
      courtName: 'Quadra 1',
      isExactMatch: true,
      minutesDistance: 5,
      displayPricePerHourReais: 120,
      availableCourtsCount: 2,
    );

final _recurring = _booking('confirmed', recurring: 'r1');

// --- Peladas ----------------------------------------------------------------

List<SavedBookingResult> _peladas() => [
      savedResult(
        bookingId: 'k1',
        status: BookingResultStatus.confirmed,
        result: kingOfCourtResult(),
        dateKey: '$_year-10-18',
      ),
      savedResult(
        bookingId: 'b2',
        status: BookingResultStatus.confirmed,
        dateKey: '$_year-09-27',
        arenaName: 'Beach Point',
      ),
    ];

List<Override> _peladaOverrides() => [
      bookingResultRepositoryProvider.overrideWithValue(
        FakeBookingResultRepository(_peladas()),
      ),
      bookingResultUidProvider.overrideWithValue('u1'),
      athleteProfileProvider.overrideWith((ref) => Stream.value(null)),
      for (final id in ['k1', 'b2'])
        bookingStorySourceProvider(id).overrideWith((ref) => null),
      currentAthleteMatchHistoryBundleProvider.overrideWith(
        (ref) async => AthleteMatchHistoryBundle(
          matches: const [],
          tournaments: const [],
          seasonSummary: AthleteSeasonSummary(
            year: _year,
            winRatePercent: 0,
            wins: 0,
            losses: 0,
          ),
        ),
      ),
      matchHistoryTabProvider.overrideWith((ref) => MatchHistoryTab.peladas),
    ];

final _screens = <_Screen>[
  // Meu perfil
  _Screen(
    'Meu perfil: sem reserva, perfil incompleto',
    (tester, theme) => _pumpProfile(tester, theme),
    find.byType(AthleteProfileMainView),
    [
      '+30 XP',
      'PRÓXIMA RESERVA',
      'Reserve uma quadra agora',
      'NÍVEL 4',
      'Vôlei de praia',
      Icons.bolt_rounded,
      Icons.hexagon,
      Icons.chevron_right_rounded,
      Icons.local_fire_department_rounded,
      Icons.military_tech_outlined,
      'marca',
    ],
  ),
  _Screen(
    'Meu perfil: com reserva',
    (tester, theme) => _pumpProfile(
      tester,
      theme,
      nextBooking: _booking('confirmed'),
    ),
    find.byType(AthleteProfileMainView),
    ['PRÓXIMA RESERVA'],
  ),
  // Home
  _Screen(
    'Home: cabeçalhos de seção',
    (tester, theme) => _pump(
      tester,
      theme,
      Column(
        children: [
          const AthleteHomeSectionHeader(title: 'Missões', trailingAccent: '2/3'),
          CompeteHubSectionHeader(
            title: 'Competições',
            actionLabel: 'VER COMPLETO',
            onActionTap: () {},
          ),
        ],
      ),
    ),
    _pieceFinder,
    ['2/3', 'VER COMPLETO', Icons.chevron_right_rounded],
  ),
  _Screen(
    'Home: KPIs',
    (tester, theme) => _pump(
      tester,
      theme,
      const AthleteHomeKpiGrid(
        kpis: [
          AthleteHomeKpi(
            label: 'JOGOS',
            value: '12',
            delta: '-2',
            note: 'vs set',
            tone: AthleteHomeKpiTone.orange,
            arrow: true,
          ),
          AthleteHomeKpi(
            label: 'SEQUÊNCIA',
            value: '3',
            delta: 'em jogo',
            note: 'semanas',
            tone: AthleteHomeKpiTone.orange,
            flame: true,
          ),
        ],
      ),
    ),
    _pieceFinder,
    [
      '-2',
      'em jogo',
      Icons.arrow_downward_rounded,
      Icons.local_fire_department_rounded,
    ],
  ),
  for (final (status, label) in [
    ('CHECKIN_OPEN', 'Check-in aberto'),
    ('PENDING', 'Em processamento'),
  ])
    _Screen(
      'Home: próxima reserva, $label',
      (tester, theme) => _pump(
        tester,
        theme,
        AthleteHomeNextReservationCard(
          booking: _booking(status),
          onDetailsTap: () {},
          onReserveTap: () {},
          onStoryTap: () {},
          now: _now,
        ),
      ),
      _pieceFinder,
      ['AMANHÃ', label, 'Story', Icons.amp_stories_outlined],
    ),
  _Screen(
    'Home: inscrição em andamento',
    (tester, theme) => _pump(
      tester,
      theme,
      AthleteHomeRegistrationTracker(
        items: const [
          RegistrationProgress(
            registrationId: 'r1',
            tournamentId: 't1',
            categoryId: 'c1',
            tournamentName: 'Copa Verão',
            categoryName: 'Dupla Mista B',
            waitlist: false,
            steps: [
              RegistrationProgressStep(
                label: 'Dupla',
                caption: 'Convite aceito',
                state: RegistrationStepState.done,
              ),
              RegistrationProgressStep(
                label: 'Pagamento',
                caption: 'PIX pendente',
                state: RegistrationStepState.current,
              ),
            ],
            pendingLabel: 'Falta pagar',
            currentStep: 2,
            totalSteps: 3,
            paymentPending: true,
            canCancel: true,
          ),
        ],
        onContinue: (_) {},
        onCancel: (_) {},
      ),
    ),
    _pieceFinder,
    ['PASSO 2/3'],
  ),
  _Screen(
    'Home: convite para jogar, avaliação e loja',
    (tester, theme) => _pump(
      tester,
      theme,
      const Column(
        children: [
          PendingBookingInvitesSection(),
          PendingTournamentReviewsSection(),
          StoreHomeEntry(),
        ],
      ),
      overrides: [
        storeEnabledProvider.overrideWithValue(true),
        pendingBookingInvitesProvider.overrideWith(
          (ref) => Stream.value([
            BookingInvite(
              id: 'i1',
              bookingId: 'b1',
              arenaId: 'a1',
              arenaName: 'Arena Sol',
              courtName: 'Quadra 1',
              date: '2026-10-21',
              startTime: '18:00',
              endTime: '19:00',
              invitedByUid: 'u2',
              invitedByName: 'Enzo Lima',
              status: 'pending',
              createdAt: _now,
              expiresAt: _now.add(const Duration(days: 1)),
            ),
          ]),
        ),
        pendingTournamentReviewsProvider.overrideWith(
          (ref) => Stream.value([
            TournamentReviewInvite(
              tournamentId: 't1',
              tournamentName: 'Copa Verão',
              closesAt: DateTime.now().add(const Duration(days: 3)),
              status: TournamentReviewInviteStatus.pending,
            ),
          ]),
        ),
      ],
    ),
    _pieceFinder,
    [
      Icons.sports_volleyball_outlined,
      Icons.chevron_right_rounded,
      Icons.star_rounded,
      Icons.shopping_bag_outlined,
    ],
  ),
  // Competir
  _Screen(
    'Competir: acesso bloqueado e card largo',
    (tester, theme) => _pump(
      tester,
      theme,
      Column(
        children: [
          const TournamentAccessBanner(
            onboardingCompleted: false,
            blockMessage: 'Complete seu perfil para se inscrever.',
            missingStepTitles: ['Foto de perfil', 'Cidade'],
          ),
          CompeteHubWideCard(
            icon: Icons.groups_rounded,
            title: 'Organizadores',
            description: 'Conheça quem faz os torneios.',
            onTap: () {},
          ),
        ],
      ),
    ),
    _pieceFinder,
    [Icons.circle, Icons.groups_rounded],
  ),
  _Screen(
    'Competir: ranking (perfil) e linhas (comunidade)',
    (tester, theme) => _pump(
      tester,
      theme,
      Column(
        children: [
          const CompeteHubRankingCard(
            ranking: CompeteHubUserRanking(
              rank: 7,
              seasonLabel: 'Temporada 2026',
              subtitle: 'Vôlei de praia · Intermediário',
              points: 420,
              tournamentsCount: 5,
              promotionPointsRemaining: 80,
              promotionProgress: 0.6,
            ),
          ),
          for (final (rank, me) in [(1, false), (3, true)])
            CompeteHubRankingRow(
              entry: CompeteHubRankingEntry(
                rank: rank,
                initials: 'MA',
                name: me ? 'Maria Alves' : 'Atleta $rank',
                points: 900 - rank * 100,
                tournamentsCount: 6,
                avatarColor: const Color(0xFF3A6FF8),
                isCurrentUser: me,
              ),
            ),
        ],
      ),
    ),
    _pieceFinder,
    ['420', '80 pts', '#1', '#3', '800'],
  ),
  // Reservas
  _Screen(
    'Reservar: cabeçalho, data, localização e cards de arena',
    (tester, theme) => _pump(
      tester,
      theme,
      Column(
        children: [
          ArenaSearchSectionHeader(
            title: 'Arenas',
            trailingLabel: 'ordenar',
            onTrailingTap: () {},
          ),
          ArenaSearchDateTimeRow(
            date: DateTime.now(),
            timeLabel: '18:00',
            flexibleTime: false,
            onDateTap: () {},
            onTimeTap: () {},
          ),
          ArenaLocationPermissionBanner(
            nudge: const LocationSettingsNudge(
              message: 'Ative a localização para ver arenas perto.',
              opensAppSettings: true,
            ),
            onOpenSettings: () {},
          ),
          ArenaSearchArenaCard(
            item: FilteredArenaSearchResult(result: _result, kmDistance: 2.4),
            searchQuery: 'sol',
            isFavorite: false,
            isFavoritePending: false,
            isBestPrice: false,
            selectedSportChip: ArenaSportChip.all,
            onOpenArena: () {},
            onToggleFavorite: () {},
            onReserve: () {},
          ),
          ArenaSearchUnclaimedCard(
            arena: _arena,
            searchQuery: '',
            kmDistance: 3.1,
            onContact: () {},
          ),
        ],
      ),
    ),
    _pieceFinder,
    [
      'HOJE',
      'ATIVAR',
      'Sol',
      '92',
      Icons.emoji_events_outlined,
      Icons.chat_rounded,
    ],
  ),
  _Screen(
    'Minhas reservas: horário fixo, sequência, espera, perto e vazio',
    (tester, theme) => _pump(
      tester,
      theme,
      Column(
        children: [
          MyBookingsBookingCard(
            item: _recurring,
            sportLabel: 'Vôlei de praia',
            onTap: () {},
          ),
          const MyBookingsStreakBanner(consecutiveWeeks: 3),
          const MyBookingsWaitlistSection(),
          MyBookingsNearbyArenaCard(result: _result, onTap: () {}),
          const MyBookingsEmptyHero(
            nearbyCountToday: 4,
            firstBookingXp: 50,
            proximityPhrase: 'a 5 min de você',
          ),
        ],
      ),
      overrides: [
        myBookingGuestDisplaysProvider(_recurring)
            .overrideWith((ref) async => const []),
        myWaitlistStreamProvider.overrideWith(
          (ref) => Stream.value([
            const ArenaBookingWaitlistEntry(
              id: 'w1',
              arenaId: 'a1',
              courtId: 'q1',
              dateKey: '2026-10-21',
              startTime: '18:00',
              endTime: '19:00',
              athleteId: 'u1',
              status: ArenaBookingWaitlistStatus.waiting,
              arenaName: 'Arena Sol',
              courtName: 'Quadra 1',
            ),
          ]),
        ),
      ],
    ),
    _pieceFinder,
    [
      'Horário fixo',
      'SUA PRIMEIRA RESERVA',
      '+50 XP.',
      Icons.event_repeat_rounded,
      Icons.local_fire_department_rounded,
      Icons.hourglass_top_rounded,
    ],
  ),
  // Peladas
  _Screen(
    'Peladas: lista do histórico',
    (tester, theme) => _pump(
      tester,
      theme,
      const AthleteMatchHistoryPage(),
      overrides: _peladaOverrides(),
      scroll: false,
    ),
    find.byType(AthleteMatchHistoryPage),
    ['PELADAS · $_year', 'Todas', 'º', Icons.place_rounded],
  ),
  _Screen(
    'Peladas: detalhe com sets',
    (tester, theme) => _pump(
      tester,
      theme,
      const PeladaDetailPage(bookingId: 'b2'),
      overrides: _peladaOverrides(),
      scroll: false,
    ),
    find.byType(PeladaDetailPage),
    ['2 – 1', 'º'],
  ),
  _Screen(
    'Peladas: detalhe do rei da quadra',
    (tester, theme) => _pump(
      tester,
      theme,
      const PeladaDetailPage(bookingId: 'k1'),
      overrides: _peladaOverrides(),
      scroll: false,
    ),
    find.byType(PeladaDetailPage),
    ['º', '4'],
  ),
];

void main() {
  setUpAll(() async {
    initializeNexagoEventTimezone();
    await initializeDateFormatting('pt_BR');
  });

  for (final (label, theme) in [
    ('claro', AppTheme.light),
    ('escuro', AppTheme.dark),
  ]) {
    group('tema $label', () {
      for (final screen in _screens) {
        testWidgets('${screen.name}: laranja legível', (tester) async {
          await screen.open(tester, theme);
          final checked = expectBrandTextLegible(tester, screen.root);
          expect(checked, containsAll(screen.expected));
        });
      }

      // Onde o laranja dividia a variável com verde ou âmbar, o tom de estado
      // passou a vir do tema também.
      testWidgets('tons de estado ao lado do laranja legíveis', (
        tester,
      ) async {
        await _pump(
          tester,
          theme,
          Column(
            children: [
              const AthleteHomeKpiGrid(
                kpis: [
                  AthleteHomeKpi(
                    label: 'VITÓRIAS',
                    value: '8',
                    delta: '+2',
                    note: 'vs set',
                    tone: AthleteHomeKpiTone.green,
                    arrow: true,
                  ),
                ],
              ),
              AthleteHomeNextReservationCard(
                booking: _booking('confirmed'),
                onDetailsTap: () {},
                onReserveTap: () {},
                now: _now,
              ),
              const CompeteHubRankingCard(
                ranking: CompeteHubUserRanking(
                  rank: 7,
                  seasonLabel: 'Temporada 2026',
                  subtitle: 'Vôlei de praia · Intermediário',
                  points: 420,
                  tournamentsCount: 5,
                ),
              ),
            ],
          ),
        );
        final checked = expectStateTonesLegible(tester, _pieceFinder);
        expect(
          checked,
          containsAll(<Object>['+2', 'Confirmada', '5', Icons.arrow_upward_rounded]),
        );
      });
    });
  }
}
