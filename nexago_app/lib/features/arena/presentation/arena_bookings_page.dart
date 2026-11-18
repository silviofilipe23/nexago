import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexago_app/core/errors/friendly_error_message.dart';
import 'package:nexago_app/core/layout/nexa_page_header.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../../../core/ui/nexa_skeleton.dart';
import '../domain/arena_access_providers.dart';
import '../domain/arena_booking_day_timeline.dart';
import '../domain/arena_bookings_day_providers.dart';
import '../domain/arena_bookings_filter.dart';
import '../domain/arena_bookings_tasks.dart';
import '../domain/arena_providers.dart';
import '../domain/arena_shell_providers.dart';
import '../domain/arena_staff_role.dart';
import 'widgets/arena_async_state.dart';
import 'widgets/arena_booking_card.dart';
import 'widgets/arena_bookings_day_strip.dart';
import 'widgets/arena_bookings_day_timeline.dart';
import 'widgets/arena_bookings_header.dart';
import 'widgets/arena_bookings_insight_card.dart';
import 'widgets/arena_bookings_shortcuts.dart';
import 'widgets/arena_bookings_tasks_strip.dart';
import 'widgets/arena_dashboard_tokens.dart';

/// Aba Reservas do gestor (modelo A, "Linha do dia"): faixa de 7 dias, linha
/// do dia com horários livres, busca e filtros, atalhos de Aulas, Horários
/// fixos e Clubinho. "Nova reserva" fica no header (ArenaBookingsHeader).
class ArenaBookingsPage extends ConsumerWidget {
  const ArenaBookingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final managed = ref.watch(managedArenaIdProvider);
    return Scaffold(
      backgroundColor: context.themeColors.canvas,
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

class _BookingsScrollBody extends ConsumerWidget {
  const _BookingsScrollBody();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final searching = ref.watch(arenaBookingsSearchProvider) != null;
    final results = ref.watch(arenaBookingsSearchResultsProvider);
    final bottomPadding =
        ArenaDashboardTokens.shellScrollBottomPadding(context);

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
          SliverPadding(
            padding: _listPadding(0, top: 14),
            sliver: SliverToBoxAdapter(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (searching) ...[
                    const ArenaBookingsSearchField(),
                    const SizedBox(height: 12),
                  ],
                  if (results == null) ...[
                    const ArenaBookingsShortcuts(),
                    const SizedBox(height: 12),
                    const ArenaBookingsDayStrip(),
                    const SizedBox(height: 12),
                  ],
                ],
              ),
            ),
          ),
          if (results != null)
            ..._SearchResults.sliversFor(
              ref: ref,
              async: results,
              bottomPadding: bottomPadding,
            )
          else
            ..._DayTimeline.sliversFor(ref: ref, bottomPadding: bottomPadding),
        ],
      ),
    );
  }
}

EdgeInsets _listPadding(double bottom, {double top = 4}) => EdgeInsets.fromLTRB(
      ArenaDashboardTokens.horizontalPadding,
      top,
      ArenaDashboardTokens.horizontalPadding,
      bottom,
    );

/// Esqueleto com a forma dos cards: carrega sem "pular" a tela.
List<Widget> _loadingSlivers() => const [
      SliverToBoxAdapter(
        child: NexaListSkeleton.cards(
          key: Key('arena-bookings-skeleton'),
          count: 4,
          cardHeight: 132,
          padding: EdgeInsets.symmetric(
            horizontal: ArenaDashboardTokens.horizontalPadding,
          ),
        ),
      ),
    ];

List<Widget> _errorSlivers(Object e) => [
      SliverFillRemaining(
        hasScrollBody: false,
        child: ArenaErrorState(message: _loadErrorMessage(e)),
      ),
    ];

/// Dia aberto: resumo, aviso de dia vazio (hoje) e a linha do dia.
class _DayTimeline {
  const _DayTimeline._();

  static List<Widget> sliversFor({
    required WidgetRef ref,
    required double bottomPadding,
  }) {
    final async = ref.watch(arenaBookingsDayTimelineProvider);
    final summary = ref.watch(arenaBookingsDaySummaryProvider);
    final day = ref.watch(arenaBookingsSelectedDayProvider);
    final isToday = arenaDateKey(day) == arenaDateKey(arenaTodayDateOnly());
    final insight =
        isToday ? ref.watch(arenaBookingsTodayInsightProvider) : null;
    final seesMoney = ref.watch(arenaCanReadProvider(ArenaArea.financeiro));
    final filter = ref.watch(arenaBookingsFilterProvider);
    final tasks = isToday
        ? ref.watch(arenaBookingsTasksProvider)
        : const <ArenaBookingTask>[];

    return async.when(
      data: (entries) {
        final hasItems = entries.any((e) => e is! ArenaTimelineNowEntry);
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
                  if (tasks.isNotEmpty) ...[
                    ArenaBookingsTasksStrip(tasks: tasks),
                    const SizedBox(height: 14),
                  ],
                  if (summary != null) ...[
                    ArenaBookingsDayStats(
                      summary: summary,
                      seesMoney: seesMoney,
                      isToday: isToday,
                    ),
                    const SizedBox(height: 14),
                  ],
                  if (insight != null && filter.isEmpty) ...[
                    ArenaBookingsInsightCard(insight: insight),
                    const SizedBox(height: 14),
                  ],
                ],
              ),
            ),
          ),
          if (!hasItems)
            SliverFillRemaining(
              hasScrollBody: false,
              child: filter.isEmpty
                  ? ArenaEmptyState(
                      title: isToday
                          ? 'Nenhuma reserva hoje'
                          : 'Nenhuma reserva neste dia',
                      message:
                          'Quando alguém reservar, a reserva aparece aqui.',
                      icon: Icons.event_busy_outlined,
                    )
                  : const _FilteredEmpty(),
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

/// Filtro sem resultado: diz por quê e oferece limpar.
class _FilteredEmpty extends ConsumerWidget {
  const _FilteredEmpty();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ArenaEmptyState(
      title: 'Nenhuma reserva com esses filtros',
      message: 'Tire um filtro para ver mais reservas.',
      icon: Icons.filter_alt_off_outlined,
      action: OutlinedButton(
        key: const Key('arena-bookings-clear-filters'),
        onPressed: () => ref.read(arenaBookingsFilterProvider.notifier).state =
            const ArenaBookingsFilter(),
        child: const Text('Limpar filtros'),
      ),
    );
  }
}

/// Resultado da busca, agrupado por dia.
class _SearchResults {
  const _SearchResults._();

  static List<Widget> sliversFor({
    required WidgetRef ref,
    required AsyncValue<List<ArenaBookingDaySection>> async,
    required double bottomPadding,
  }) {
    return async.when(
      data: (sections) {
        if (sections.isEmpty) {
          return const [
            SliverFillRemaining(
              hasScrollBody: false,
              child: ArenaEmptyState(
                title: 'Nenhuma reserva encontrada',
                message: 'A busca olha os últimos 30 dias e os próximos 60. '
                    'Confira o nome ou o código da reserva.',
                icon: Icons.search_off_rounded,
              ),
            ),
          ];
        }
        return [
          for (var s = 0; s < sections.length; s++)
            SliverMainAxisGroup(
              slivers: [
                // Cabeçalho do dia fixo ao rolar: não se perde de que dia é.
                SliverPersistentHeader(
                  pinned: true,
                  delegate: _DayHeaderDelegate(sections[s].title),
                ),
                SliverPadding(
                  padding: _listPadding(
                    s == sections.length - 1 ? bottomPadding : 4,
                  ),
                  sliver: SliverList(
                    delegate: SliverChildBuilderDelegate(
                      (context, i) => Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: ArenaBookingCard(
                          booking: sections[s].bookings[i],
                        ),
                      ),
                      childCount: sections[s].bookings.length,
                    ),
                  ),
                ),
              ],
            ),
        ];
      },
      loading: _loadingSlivers,
      error: (e, _) => _errorSlivers(e),
    );
  }
}

class _DayHeaderDelegate extends SliverPersistentHeaderDelegate {
  _DayHeaderDelegate(this.title);

  final String title;

  static const double _height = 44;

  @override
  double get minExtent => _height;

  @override
  double get maxExtent => _height;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    return ColoredBox(
      color: context.themeColors.canvas,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: ArenaDashboardTokens.horizontalPadding,
        ),
        child: Align(
          alignment: Alignment.centerLeft,
          child: Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                ),
          ),
        ),
      ),
    );
  }

  @override
  bool shouldRebuild(_DayHeaderDelegate oldDelegate) =>
      oldDelegate.title != title;
}

String _loadErrorMessage(Object error) => friendlyErrorMessage(
      error,
      action: 'Não foi possível carregar as reservas',
      logReason: 'arena_bookings:list',
    );
