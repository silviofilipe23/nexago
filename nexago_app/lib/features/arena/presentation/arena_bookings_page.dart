import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexago_app/core/errors/friendly_error_message.dart';
import 'package:nexago_app/core/layout/nexa_page_header.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/formatting/app_currency_format.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../domain/arena_access_providers.dart';
import '../domain/arena_booking_day_timeline.dart';
import '../domain/arena_bookings_day_providers.dart';
import '../domain/arena_providers.dart';
import '../domain/arena_shell_providers.dart';
import '../domain/arena_staff_role.dart';
import 'widgets/arena_async_state.dart';
import 'widgets/arena_booking_card.dart';
import 'widgets/arena_bookings_day_timeline.dart';
import 'widgets/arena_bookings_header.dart';
import 'widgets/arena_bookings_insight_card.dart';
import 'widgets/arena_bookings_mode_chips.dart';
import 'widgets/arena_bookings_section_header.dart';
import 'widgets/arena_bookings_shortcuts.dart';
import 'widgets/arena_dashboard_tokens.dart';

/// Aba Reservas do gestor: linha do dia (Hoje), atalhos de Aulas, Horários
/// fixos e Clubinho, e o botão "Nova reserva" para quem escreve na agenda.
class ArenaBookingsPage extends ConsumerWidget {
  const ArenaBookingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final managed = ref.watch(managedArenaIdProvider);
    final canWrite = ref.watch(arenaCanWriteProvider(ArenaArea.agenda));
    final hasArena = managed.valueOrNull?.isNotEmpty ?? false;

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      floatingActionButton: canWrite && hasArena
          ? Padding(
              padding: EdgeInsets.only(
                bottom: ArenaDashboardTokens.shellFabLift(context),
              ),
              child: const _NewBookingButton(),
            )
          : null,
      body: SafeArea(
        bottom: false,
        child: managed.when(
          data: (arenaId) {
            if (arenaId == null || arenaId.isEmpty) {
              return const ArenaEmptyState(
                title: 'Arena não encontrada',
                message: 'Nenhuma arena vinculada ao seu usuário como gestor.',
                icon: Icons.store_mall_directory_outlined,
              );
            }
            return const _BookingsScrollBody();
          },
          loading: () => const ArenaLoadingState(label: 'Carregando arena...'),
          error: (e, _) => ArenaErrorState(
            message: friendlyErrorMessage(
              e,
              action: 'Não foi possível carregar a arena',
              logReason: 'arena_bookings:arena',
            ),
            onRetry: () => ref.invalidate(managedArenaIdProvider),
          ),
        ),
      ),
    );
  }
}

/// "Nova reserva": abre a agenda, onde o gestor escolhe quadra e horário
/// (mesmo caminho do "+" do Painel).
class _NewBookingButton extends StatelessWidget {
  const _NewBookingButton();

  @override
  Widget build(BuildContext context) {
    return FloatingActionButton.extended(
      key: const Key('arena-bookings-new'),
      heroTag: 'arena-bookings-new',
      onPressed: () => context.go(AppRoutes.arenaSchedule),
      backgroundColor: AppColors.brand,
      foregroundColor: AppColors.black,
      elevation: 2,
      icon: const Icon(Icons.add_rounded),
      label: const Text(
        'Nova reserva',
        style: TextStyle(fontWeight: FontWeight.w800),
      ),
    );
  }
}

class _BookingsScrollBody extends ConsumerWidget {
  const _BookingsScrollBody();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(bookingViewModeProvider);
    final canWrite = ref.watch(arenaCanWriteProvider(ArenaArea.agenda));
    final bottomPadding = canWrite
        ? ArenaDashboardTokens.shellFabScrollBottomPadding(context)
        : ArenaDashboardTokens.shellScrollBottomPadding(context);

    return NexaPageHeader(
      topGap: 8,
      padding: const EdgeInsets.symmetric(
        horizontal: ArenaDashboardTokens.horizontalPadding,
      ),
      header: const FadeSlideIn(
        duration: Duration(milliseconds: 420),
        offsetY: 14,
        child: ArenaBookingsHeader(),
      ),
      child: CustomScrollView(
        controller:
            ref.watch(arenaShellScrollRegistryProvider).controllerFor(3),
        key: const PageStorageKey<String>('arena-bookings-scroll'),
        physics: ArenaDashboardTokens.shellScrollPhysics,
        slivers: [
          const SliverPadding(
            padding: EdgeInsets.fromLTRB(
              ArenaDashboardTokens.horizontalPadding,
              14,
              ArenaDashboardTokens.horizontalPadding,
              0,
            ),
            sliver: SliverToBoxAdapter(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  ArenaBookingsShortcuts(),
                  SizedBox(height: 12),
                  ArenaBookingsModeChips(),
                  SizedBox(height: 12),
                ],
              ),
            ),
          ),
          ..._BookingsBody.sliversFor(
            ref: ref,
            mode: mode,
            bottomPadding: bottomPadding,
          ),
        ],
      ),
    );
  }
}

class _BookingsBody {
  const _BookingsBody._();

  static List<Widget> sliversFor({
    required WidgetRef ref,
    required BookingViewMode mode,
    required double bottomPadding,
  }) {
    switch (mode) {
      case BookingViewMode.today:
        return _TodayTimeline.sliversFor(
          ref: ref,
          bottomPadding: bottomPadding,
        );
      case BookingViewMode.tomorrow:
        return _FlatList.sliversFor(
          async: ref.watch(arenaBookingsTomorrowProvider),
          emptyTitle: 'Nenhuma reserva amanhã',
          emptyMessage: 'Não há reservas ativas para amanhã.',
          bottomPadding: bottomPadding,
        );
      case BookingViewMode.upcoming:
        return _GroupedList.sliversFor(
          async: ref.watch(arenaFutureBookingsGroupedProvider),
          emptyTitle: 'Nenhuma reserva futura',
          emptyMessage: 'Não há reservas nos próximos 60 dias.',
          bottomPadding: bottomPadding,
        );
      case BookingViewMode.past:
        return _GroupedList.sliversFor(
          async: ref.watch(arenaPastBookingsGroupedProvider),
          emptyTitle: 'Nenhuma reserva passada',
          emptyMessage: 'Não há reservas nos últimos 30 dias.',
          bottomPadding: bottomPadding,
        );
    }
  }
}

EdgeInsets _listPadding(double bottom, {double top = 4}) => EdgeInsets.fromLTRB(
      ArenaDashboardTokens.horizontalPadding,
      top,
      ArenaDashboardTokens.horizontalPadding,
      bottom,
    );

List<Widget> _loadingSlivers() => const [
      SliverFillRemaining(
        hasScrollBody: false,
        child: ArenaLoadingState(label: 'Carregando reservas...'),
      ),
    ];

List<Widget> _errorSlivers(Object e) => [
      SliverFillRemaining(
        hasScrollBody: false,
        child: ArenaErrorState(message: _loadErrorMessage(e)),
      ),
    ];

/// Hoje: resumo do dia, aviso de dia vazio e a linha do dia.
class _TodayTimeline {
  const _TodayTimeline._();

  static List<Widget> sliversFor({
    required WidgetRef ref,
    required double bottomPadding,
  }) {
    final async = ref.watch(arenaBookingsTodayTimelineProvider);
    final summary = ref.watch(arenaBookingsTodaySummaryProvider);
    final insight = ref.watch(arenaBookingsTodayInsightProvider);
    final seesMoney = ref.watch(arenaCanReadProvider(ArenaArea.financeiro));

    return async.when(
      data: (entries) {
        final hasBookings = entries.any((e) => e is ArenaTimelineBookingEntry);
        final now = entries
            .whereType<ArenaTimelineNowEntry>()
            .map((e) => e.now)
            .firstOrNull;
        return [
          SliverPadding(
            padding: _listPadding(0, top: 0),
            sliver: SliverToBoxAdapter(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (summary != null) ...[
                    ArenaBookingsDayStats(
                      summary: summary,
                      seesMoney: seesMoney,
                    ),
                    const SizedBox(height: 14),
                  ],
                  if (insight != null) ...[
                    ArenaBookingsInsightCard(insight: insight),
                    const SizedBox(height: 14),
                  ],
                ],
              ),
            ),
          ),
          if (!hasBookings && insight == null)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: ArenaEmptyState(
                title: 'Nenhuma reserva hoje',
                message: 'Quando alguém reservar, a reserva aparece aqui.',
                icon: Icons.event_busy_outlined,
              ),
            )
          else
            SliverPadding(
              padding: _listPadding(bottomPadding, top: 0),
              sliver: ArenaBookingsDayTimelineSliver(
                entries: entries,
                now: now ?? DateTime.now(),
              ),
            ),
        ];
      },
      loading: _loadingSlivers,
      error: (e, _) => _errorSlivers(e),
    );
  }
}

/// Linha "5 reservas · R$ 600" das abas sem linha do dia. O R$ só para quem
/// lê o financeiro (mesma regra do Painel).
class _ModeSummary extends ConsumerWidget {
  const _ModeSummary();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(bookingViewModeProvider);
    final count = ref.watch(arenaBookingsTabCountsProvider).forMode(mode);
    final seesMoney = ref.watch(arenaCanReadProvider(ArenaArea.financeiro));
    final reservas = count == 1 ? '1 reserva' : '$count reservas';
    final text = seesMoney
        ? '$reservas · ${formatBRL(ref.watch(arenaBookingsTabSummaryProvider))}'
        : reservas;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Text(
        text,
        style: Theme.of(context).textTheme.labelLarge?.copyWith(
              color: context.themeColors.onSurfaceMuted,
              fontWeight: FontWeight.w700,
            ),
      ),
    );
  }
}

class _FlatList {
  const _FlatList._();

  static List<Widget> sliversFor({
    required AsyncValue<List<ArenaManagerBooking>> async,
    required String emptyTitle,
    required String emptyMessage,
    required double bottomPadding,
  }) {
    return async.when(
      data: (bookings) {
        if (bookings.isEmpty) {
          return [
            SliverFillRemaining(
              hasScrollBody: false,
              child: ArenaEmptyState(
                title: emptyTitle,
                message: emptyMessage,
                icon: Icons.event_busy_outlined,
              ),
            ),
          ];
        }
        return [
          SliverPadding(
            padding: _listPadding(bottomPadding),
            sliver: SliverList(
              delegate: SliverChildBuilderDelegate(
                (context, index) {
                  if (index == 0) return const _ModeSummary();
                  final i = index - 1;
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: FadeSlideIn(
                      delay: Duration(milliseconds: 20 * i.clamp(0, 5)),
                      child: ArenaBookingCard(booking: bookings[i]),
                    ),
                  );
                },
                childCount: bookings.length + 1,
              ),
            ),
          ),
        ];
      },
      loading: _loadingSlivers,
      error: (e, _) => _errorSlivers(e),
    );
  }
}

class _GroupedList {
  const _GroupedList._();

  static List<Widget> sliversFor({
    required AsyncValue<List<ArenaBookingDaySection>> async,
    required String emptyTitle,
    required String emptyMessage,
    required double bottomPadding,
  }) {
    return async.when(
      data: (sections) {
        if (sections.isEmpty) {
          return [
            SliverFillRemaining(
              hasScrollBody: false,
              child: ArenaEmptyState(
                title: emptyTitle,
                message: emptyMessage,
                icon: Icons.event_note_outlined,
              ),
            ),
          ];
        }
        return [
          SliverPadding(
            padding: _listPadding(bottomPadding),
            sliver: SliverList(
              delegate: SliverChildBuilderDelegate(
                (context, index) {
                  if (index == 0) return const _ModeSummary();
                  final flat = _groupedFlatIndex(sections, index - 1);
                  if (flat.isHeader) {
                    return Padding(
                      padding:
                          EdgeInsets.only(top: flat.sectionIndex > 0 ? 16 : 0),
                      child: ArenaBookingsSectionHeader(
                        title: flat.headerTitle!,
                        subtitle: flat.subtitle,
                      ),
                    );
                  }
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: ArenaBookingCard(booking: flat.booking!),
                  );
                },
                childCount: _groupedItemCount(sections) + 1,
              ),
            ),
          ),
        ];
      },
      loading: _loadingSlivers,
      error: (e, _) => _errorSlivers(e),
    );
  }
}

class _GroupedFlatIndex {
  const _GroupedFlatIndex.header(
    this.sectionIndex,
    this.headerTitle,
    this.subtitle,
  )   : booking = null,
        isHeader = true;

  const _GroupedFlatIndex.card(this.sectionIndex, this.booking)
      : headerTitle = null,
        subtitle = null,
        isHeader = false;

  final int sectionIndex;
  final bool isHeader;
  final String? headerTitle;
  final String? subtitle;
  final ArenaManagerBooking? booking;
}

int _groupedItemCount(List<ArenaBookingDaySection> sections) {
  var n = 0;
  for (final s in sections) {
    n += 1 + s.bookings.length;
  }
  return n;
}

_GroupedFlatIndex _groupedFlatIndex(
  List<ArenaBookingDaySection> sections,
  int index,
) {
  var i = index;
  for (var s = 0; s < sections.length; s++) {
    final sec = sections[s];
    if (i == 0) {
      return _GroupedFlatIndex.header(s, sec.title, sec.subtitle);
    }
    i -= 1;
    if (i < sec.bookings.length) {
      return _GroupedFlatIndex.card(s, sec.bookings[i]);
    }
    i -= sec.bookings.length;
  }
  return _GroupedFlatIndex.header(0, '', null);
}

String _loadErrorMessage(Object error) => friendlyErrorMessage(
      error,
      action: 'Não foi possível carregar as reservas',
      logReason: 'arena_bookings:list',
    );
